const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { execFileSync } = require('child_process');
const { ProfileStore } = require('../profile-store');
const { AutomationHelperClient } = require('../automation-helper-client');
const { AutomationService } = require('../automation-service');
const { sendRendererEvent, sendDebugMessage, updateAutomationOverlayWindows } = require('./window-manager');

const POWERSHELL_EXE = process.platform === 'win32'
  ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : null;

let automationService = null;

function getAutomationService() { return automationService; }

// ── Startup cleanup ───────────────────────────────────────────────────────────

function releaseInputModifiersAtStartup() {
  if (process.platform !== 'win32') return;
  try {
    const releaseScript = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class StartupKeyRelease {',
      '  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public UInt32 type; public InputUnion U; }',
      '  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; }',
      '  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public UInt16 wVk; public UInt16 wScan; public UInt32 dwFlags; public UInt32 time; public IntPtr dwExtraInfo; }',
      '  [DllImport("user32.dll", SetLastError=true)] public static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, int cbSize);',
      '  const UInt32 INPUT_KEYBOARD = 1;',
      '  const UInt32 KEYEVENTF_KEYUP = 0x0002;',
      '  public static void KeyUp(UInt16 vk) {',
      '    var inputs = new INPUT[] { new INPUT { type = INPUT_KEYBOARD, U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, dwFlags = KEYEVENTF_KEYUP } } } };',
      '    SendInput((UInt32)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));',
      '  }',
      '}',
      '"@;',
      'foreach ($vk in 0x10,0x11,0x12,0xA0,0xA1,0xA2,0xA3,0xA4,0xA5) { [StartupKeyRelease]::KeyUp([uint16]$vk) }',
    ].join('\n');

    execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      releaseScript,
    ], {
      windowsHide: true,
      encoding: 'utf8',
      shell: true,
    });
  } catch (_) {
    // Ignore startup key-release failures.
  }
}

function cleanupOrphanAutomationHelpers() {
  if (process.platform === 'linux') {
    try {
      execFileSync('pkill', ['-f', 'conquer-helper'], { encoding: 'utf8' });
    } catch (_) {
      // pkill exits 1 when no process matched — ignore.
    }
    return;
  }
  try {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'conquer-helper-spike\\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
    ], {
      windowsHide: true,
      encoding: 'utf8',
      shell: true,
    });
  } catch (_) {
    // Ignore cleanup failures.
  }
}

// ── Helper path resolution ────────────────────────────────────────────────────

function getAutomationHelperPath() {
  if (process.env.CONQUER_AUTOMATION_HELPER_PATH) {
    return {
      helperPath: process.env.CONQUER_AUTOMATION_HELPER_PATH,
      helperArgs: [],
    };
  }

  const isLinux = process.platform === 'linux';
  const exeName = isLinux ? 'conquer-helper' : 'conquer-helper.exe';

  if (app.isPackaged) {
    const packagedHelperExe = path.join(process.resourcesPath, 'native-helper', exeName);
    const packagedHelperScript = path.join(process.resourcesPath, 'native-helper', 'conquer-helper-spike.ps1');
    if (fs.existsSync(packagedHelperExe)) {
      return { helperPath: packagedHelperExe, helperArgs: [] };
    }
    if (!isLinux && fs.existsSync(packagedHelperScript)) {
      return {
        helperPath: packagedHelperScript,
        launchCommand: POWERSHELL_EXE,
        launchArgs: ['-NoLogo', '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', packagedHelperScript],
      };
    }
    return { helperPath: packagedHelperExe, helperArgs: [] };
  }

  if (!isLinux) {
    const scriptPath = path.join(__dirname, '../../native-helper/conquer-helper-spike.ps1');
    if (fs.existsSync(scriptPath)) {
      return {
        helperPath: scriptPath,
        launchCommand: POWERSHELL_EXE,
        launchArgs: ['-NoLogo', '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      };
    }
  }

  const devBinary = isLinux
    ? path.join(__dirname, '../../native-helper/conquer-helper/target/release/conquer-helper')
    : path.join(__dirname, '../../native-helper/conquer-helper.exe');
  return { helperPath: devBinary, helperArgs: [] };
}

// ── Automation service init ───────────────────────────────────────────────────

async function setupAutomation() {
  const helperConfig = getAutomationHelperPath();
  const profileStore = new ProfileStore({ userDataPath: app.getPath('userData') });
  const helperClient = new AutomationHelperClient({
    ...helperConfig,
    cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../..'),
    logger: (tag, message) => sendDebugMessage(`[${tag}] ${message}`),
  });

  automationService = new AutomationService({ profileStore, helperClient });
  automationService.on('state-changed', state => {
    sendRendererEvent('automation:state-changed', state);
    updateAutomationOverlayWindows(state);
  });
  automationService.on('helper-status', status => sendRendererEvent('automation:helper-status', status));
  automationService.on('helper-message', message => {
    if (message.type === 'target-status') {
      sendRendererEvent('automation:overlay-status', message.payload ?? null);
      return;
    }

    if (message.type === 'hotkey-triggered') {
      sendRendererEvent('automation:diagnostic-log', {
        message: 'Automation hotkey triggered.',
        details: message.payload ?? null,
      });
      return;
    }

    if (message.type === 'log' || message.type === 'warning' || message.type === 'error') {
      sendRendererEvent('automation:diagnostic-log', message.payload ?? message);
    }
  });

  await automationService.init();
}

module.exports = {
  getAutomationService,
  getAutomationHelperPath,
  releaseInputModifiersAtStartup,
  cleanupOrphanAutomationHelpers,
  setupAutomation,
};
