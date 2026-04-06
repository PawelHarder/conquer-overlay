const { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { ProfileStore } = require('./profile-store');
const { AutomationHelperClient } = require('./automation-helper-client');
const { AutomationService } = require('./automation-service');
const { createHudWindow } = require('./hud-window');
const { requestMarket } = require('./main/market-client');

// Full path to powershell.exe — avoids shell:true which breaks paths containing spaces
// when individual args are joined without quoting (e.g. 'C:\Program Files\...').
// process.env.SystemRoot is reliable now that cwd is pinned to process.resourcesPath.
const POWERSHELL_EXE = process.platform === 'win32'
  ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : null;

const CMD_EXE = process.platform === 'win32'
  ? (process.env.ComSpec || 'cmd.exe')
  : null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let overlayWindow = null;
let isCollapsed = false;
let isInteractive = false;
let overlayState = null;
let automationService = null;
let isShuttingDown = false;
let automationHudWindow = null;
let automationBuffWindow = null;

// ── DB access (read-only) for history/watch queries ──────────────────────────
let db = null;
const DB_RUNNER_PATH = path.join(__dirname, '../collector/db_query_runner.js');
const DB_FILE_PATH = path.join(__dirname, '../collector/market.db');

function getDb() {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_FILE_PATH, { readonly: true, fileMustExist: true });
  } catch (_) { /* DB not created yet — poller not started */ }
  return db;
}

function queryDbExternally(mode, filters) {
  const stdout = execFileSync('node', [DB_RUNNER_PATH, DB_FILE_PATH, JSON.stringify({ mode, filters })], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return JSON.parse(stdout || 'null');
}

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

function buildDbConditions(filters = {}) {
  const conditions = ['1=1'];
  const params = {};

  const {
    itemName,
    majorClass,
    minorClass,
    quality,
    plusLevel,
    sockets,
    server,
    days,
  } = filters;

  if (itemName) {
    conditions.push("attribute_name LIKE '%' || @itemName || '%'");
    params.itemName = itemName;
  }
  if (majorClass) {
    conditions.push('major_class = @majorClass');
    params.majorClass = majorClass;
  }
  if (minorClass) {
    conditions.push('minor_class = @minorClass');
    params.minorClass = minorClass;
  }
  if (quality) {
    conditions.push('quality_name = @quality');
    params.quality = quality;
  }
  if (plusLevel != null) {
    conditions.push('addition_level = @plusLevel');
    params.plusLevel = plusLevel;
  }
  if (sockets != null) {
    if (sockets === 0) conditions.push("gem1 = 'None'");
    else if (sockets === 1) conditions.push("gem1 != 'None' AND gem2 = 'None'");
    else if (sockets === 2) conditions.push("gem1 != 'None' AND gem2 != 'None'");
  }
  if (server) {
    conditions.push('server_name = @server');
    params.server = server;
  }

  params.cutoff = Math.floor(Date.now() / 1000) - (days ?? 7) * 86400;
  conditions.push('snapshot_at >= @cutoff');
  return { conditions, params };
}

function queryPriceHistoryData(filters = {}) {
  const database = getDb();
  if (database) {
    const { conditions, params } = buildDbConditions(filters);
    const sql = `
      SELECT
        (snapshot_at / 1800) * 1800 AS bucket,
        MIN(price) AS lowest,
        CAST(AVG(price) AS INTEGER) AS avg,
        MAX(price) AS highest
      FROM price_snapshots
      WHERE ${conditions.join(' AND ')}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return database.prepare(sql).all(params);
  }

  return queryDbExternally('history', filters);
}

function queryWatchBaselineData(filters = {}) {
  const baselineFilters = { ...filters, days: 30 };
  const database = getDb();
  if (database) {
    const { conditions, params } = buildDbConditions(baselineFilters);
    const sql = `
      SELECT
        MIN(price) AS lowest,
        CAST(AVG(price) AS INTEGER) AS avg,
        MAX(price) AS highest
      FROM price_snapshots
      WHERE ${conditions.join(' AND ')}
    `;
    return database.prepare(sql).get(params) ?? null;
  }

  return queryDbExternally('baseline', filters);
}

// ── Overlay state / window helpers ──────────────────────────────────────────

function getOverlayStatePath() {
  return path.join(app.getPath('userData'), 'overlay-state.json');
}

// ── App hotkeys persistence ──────────────────────────────────────────────────

const DEFAULT_APP_HOTKEYS = Object.freeze({
  interact: 'F8',
  collapse: 'Alt+C',
  hide: 'Alt+H',
  quit: 'Alt+Q',
});

let appHotkeysCache = null;

function getAppHotkeysPath() {
  return path.join(app.getPath('userData'), 'app-hotkeys.json');
}

function loadAppHotkeys() {
  if (appHotkeysCache) return appHotkeysCache;
  try {
    const raw = JSON.parse(fs.readFileSync(getAppHotkeysPath(), 'utf8'));
    appHotkeysCache = { ...DEFAULT_APP_HOTKEYS, ...raw };
  } catch (_) {
    appHotkeysCache = { ...DEFAULT_APP_HOTKEYS };
  }
  return appHotkeysCache;
}

function saveAppHotkeys(hotkeys) {
  appHotkeysCache = { ...DEFAULT_APP_HOTKEYS, ...hotkeys };
  try {
    fs.writeFileSync(getAppHotkeysPath(), JSON.stringify(appHotkeysCache, null, 2));
  } catch (_) { /* ignore */ }
}

function loadOverlayState() {
  if (overlayState) return overlayState;

  try {
    overlayState = JSON.parse(fs.readFileSync(getOverlayStatePath(), 'utf8'));
  } catch (_) {
    overlayState = {};
  }

  return overlayState;
}

function saveOverlayState(patch = {}) {
  overlayState = { ...loadOverlayState(), ...patch };
  try {
    fs.writeFileSync(getOverlayStatePath(), JSON.stringify(overlayState, null, 2));
  } catch (_) { /* ignore persistence failures */ }
}

function getInitialBounds() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const saved = loadOverlayState();
  return {
    width: 420,
    height: 600,
    x: Number.isFinite(saved.x) ? saved.x : width - 440,
    y: Number.isFinite(saved.y) ? saved.y : 20,
  };
}

function persistCurrentWindowPosition() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const [x, y] = overlayWindow.getPosition();
  saveOverlayState({ x, y });
}

function sendRendererEvent(channel, payload) {
  for (const window of getAutomationRendererWindows()) {
    if (!window || window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}

function getAutomationRendererWindows() {
  return [overlayWindow, automationHudWindow, automationBuffWindow].filter(Boolean);
}

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
      return {
        helperPath: packagedHelperExe,
        helperArgs: [],
      };
    }
    if (!isLinux && fs.existsSync(packagedHelperScript)) {
      return {
        helperPath: packagedHelperScript,
        launchCommand: POWERSHELL_EXE,
        launchArgs: ['-NoLogo', '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', packagedHelperScript],
      };
    }
    return {
      helperPath: packagedHelperExe,
      helperArgs: [],
    };
  }

  if (!isLinux) {
    const scriptPath = path.join(__dirname, '../native-helper/conquer-helper-spike.ps1');
    if (fs.existsSync(scriptPath)) {
      return {
        helperPath: scriptPath,
        launchCommand: POWERSHELL_EXE,
        launchArgs: ['-NoLogo', '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      };
    }
  }

  // Dev binary: native-helper/conquer-helper/target/release/conquer-helper (Linux)
  //             native-helper/conquer-helper.exe (Windows fallback)
  const devBinary = isLinux
    ? path.join(__dirname, '../native-helper/conquer-helper/target/release/conquer-helper')
    : path.join(__dirname, '../native-helper/conquer-helper.exe');
  return {
    helperPath: devBinary,
    helperArgs: [],
  };
}

async function setupAutomation() {
  const helperConfig = getAutomationHelperPath();
  const profileStore = new ProfileStore({ userDataPath: app.getPath('userData') });
  const helperClient = new AutomationHelperClient({
    ...helperConfig,
    cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'),
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

function createAutomationOverlayWindows() {
  const preloadPath = path.join(__dirname, 'preload.js');
  automationHudWindow = createHudWindow({
    htmlFile: path.join(__dirname, '../public/automation-hud.html'),
    preloadPath,
    width: 380,
    height: 76,
  });
  automationBuffWindow = createHudWindow({
    htmlFile: path.join(__dirname, '../public/automation-buffs.html'),
    preloadPath,
    width: 190,
    height: 260,
  });
  automationHudWindow.on('closed', () => {
    automationHudWindow = null;
  });
  automationBuffWindow.on('closed', () => {
    automationBuffWindow = null;
  });
}

function updateAutomationOverlayWindows(state) {
  if (isShuttingDown) return;
  if (!automationHudWindow || !automationBuffWindow) return;
  if (automationHudWindow.isDestroyed() || automationBuffWindow.isDestroyed()) return;

  const workArea = screen.getPrimaryDisplay().workArea;
  const overlay = state?.overlayState || {};
  const targetRect = state?.gameAttachmentStatus?.rect;
  const isGameForeground = Boolean(state?.gameAttachmentStatus?.isForeground);
  const configuredBuffs = Object.values(state?.activeProfile?.buffs || {}).filter(buff => buff?.visibleInOverlay);
  const activeBuffCount = Object.values(state?.buffRuntimeState || {}).filter(buff => buff.active).length;
  const buffCardCount = overlay.showOnlyActiveBuffs === false
    ? configuredBuffs.length
    : activeBuffCount;
  const anchorRect = overlay.anchorMode === 'game-relative' && targetRect?.width
    ? targetRect
    : { x: workArea.x || 0, y: workArea.y || 0, width: workArea.width, height: workArea.height };

  const hudX = Math.round(anchorRect.x + (anchorRect.width / 2) - 190 + (overlay.hudOffset?.x || 0));
  const hudY = Math.round(anchorRect.y + 28 + (overlay.hudOffset?.y || 0));
  automationHudWindow.setPosition(hudX, hudY);
  automationHudWindow.setOpacity(Math.max(0.15, Math.min(1, (overlay.hudOpacity ?? 85) / 100)));

  const buffHeight = Math.max(76, (buffCardCount || 1) * 88 + 8);
  const buffX = Math.round(anchorRect.x + anchorRect.width - 210 + (overlay.buffOffset?.x || 0));
  const buffY = Math.round(anchorRect.y + (anchorRect.height * 0.4) - (buffHeight / 2) + (overlay.buffOffset?.y || 0));
  automationBuffWindow.setBounds({ x: buffX, y: buffY, width: 190, height: buffHeight });
  automationBuffWindow.setOpacity(Math.max(0.15, Math.min(1, (overlay.buffOverlayOpacity ?? 90) / 100)));

  const showHud = Boolean(overlay.hudEnabled)
    && (!overlay.hideHudWhenGameUnfocused || isGameForeground);
  const showBuffs = Boolean(overlay.buffOverlayEnabled)
    && buffCardCount > 0
    && (!overlay.hideBuffOverlayWhenGameUnfocused || isGameForeground);

  if (showHud) automationHudWindow.showInactive(); else automationHudWindow.hide();
  if (showBuffs) automationBuffWindow.showInactive(); else automationBuffWindow.hide();
}

async function shutdownApp() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  persistCurrentWindowPosition();
  for (const window of [automationHudWindow, automationBuffWindow, overlayWindow]) {
    if (!window || window.isDestroyed()) continue;
    try {
      window.destroy();
    } catch (_) {
      // Ignore window teardown failures during shutdown.
    }
  }
  automationHudWindow = null;
  automationBuffWindow = null;
  overlayWindow = null;
  if (automationService) {
    try {
      await automationService.dispose();
    } catch (_) {
      // Ignore shutdown failures.
    }
  }

  cleanupOrphanAutomationHelpers();
  releaseInputModifiersAtStartup();

  try { globalShortcut.unregisterAll(); } catch (_) {}
  process.exit(0);
}


// ── Window Creation ──────────────────────────────────────────────────────────

function createOverlay() {
  const bounds = getInitialBounds();

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver'); // highest z-level
  overlayWindow.setIgnoreMouseEvents(true, { forward: true }); // click-through by default
  overlayWindow.setFocusable(false);
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.on('moved', persistCurrentWindowPosition);
  overlayWindow.on('close', persistCurrentWindowPosition);

  overlayWindow.loadFile(path.join(__dirname, '../public/index.html'));

  if (process.argv.includes('--dev')) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── ALT Key Tracking (click-through toggle) ──────────────────────────────────

function broadcastAltState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('alt-toggled', isInteractive);
}

function sendDebugMessage(message) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('debug-message', message);
}

function setInteractiveMode(nextInteractive) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (isInteractive === nextInteractive) return;

  isInteractive = nextInteractive;
  overlayWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
  overlayWindow.setFocusable(isInteractive);

  if (isInteractive) {
    overlayWindow.focus();
  } else {
    overlayWindow.blur();
  }

  broadcastAltState();
}

async function handoffAutomationFocus(state) {
  if (!automationService || !state?.activeProfile?.gameTarget?.requireForegroundForInput) {
    return state;
  }

  const runtimeState = state.runtimeState || {};
  const hasActiveAutomation = Boolean(
    runtimeState.masterEnabled && (
      runtimeState.leftClickerEnabled ||
      runtimeState.rightClickerEnabled ||
      runtimeState.f7Enabled ||
      runtimeState.shiftHeldEnabled ||
      runtimeState.ctrlHeldEnabled
    )
  );

  if (!hasActiveAutomation) {
    return state;
  }

  // Only hand off focus if the overlay is already non-interactive.
  // If the user is browsing the overlay (isInteractive=true), don't steal their session.
  if (!isInteractive) {
    await automationService.focusTarget();
  }
  return automationService.getState();
}

function buildAppShortcutHandlers() {
  // Maps logical hotkey name → action handler (always fixed)
  return {
    interact: () => { sendDebugMessage('interact hotkey detected'); setInteractiveMode(!isInteractive); },
    collapse: () => { sendDebugMessage('collapse hotkey detected'); toggleCollapsed(); },
    hide:     () => { sendDebugMessage('hide hotkey detected'); toggleVisibility(); },
    quit:     () => { sendDebugMessage('quit hotkey detected'); void shutdownApp(); },
  };
}

function reregisterAppShortcuts(hotkeys) {
  try { globalShortcut.unregisterAll(); } catch (_) {}

  const handlers = buildAppShortcutHandlers();
  const registered = new Set();

  for (const [name, accelerator] of Object.entries(hotkeys)) {
    if (!accelerator || registered.has(accelerator)) continue;
    const handler = handlers[name];
    if (!handler) continue;
    try {
      globalShortcut.register(accelerator, handler);
      registered.add(accelerator);
    } catch (error) {
      sendDebugMessage(`Global shortcut registration failed for ${accelerator}: ${error.message}`);
    }
  }

  // Always ensure Alt+I works as interact toggle (secondary binding)
  if (!registered.has('Alt+I')) {
    try {
      globalShortcut.register('Alt+I', handlers.interact);
    } catch (_) {}
  }
}

function setupAltToggleTracking() {
  reregisterAppShortcuts(loadAppHotkeys());
}

// ── Actions ──────────────────────────────────────────────────────────────────

function toggleCollapsed() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  isCollapsed = !isCollapsed;
  overlayWindow.webContents.send('toggle-collapse', isCollapsed);
}

function toggleVisibility() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.on('resize-window', (_, { width, height }) => {
    overlayWindow.setSize(width, height, true);
  });

  ipcMain.on('move-window', (_, { x, y }) => {
    overlayWindow.setPosition(x, y, true);
    saveOverlayState({ x, y });
  });

  ipcMain.on('reset-window-position', () => {
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    const x = width - 440;
    const y = 20;
    saveOverlayState({ x, y });
    overlayWindow.setPosition(x, y, true);
  });

  ipcMain.on('hide-window', () => {
    toggleVisibility();
  });

  ipcMain.on('close-app', () => {
    void shutdownApp();
  });

  ipcMain.handle('get-window-pos', () => {
    return overlayWindow.getPosition();
  });

  ipcMain.handle('market-get-json', (_, { path: requestPath, params } = {}) => {
    return requestMarket(requestPath, params, 'json');
  });

  ipcMain.handle('market-get-text', (_, { path: requestPath, params } = {}) => {
    return requestMarket(requestPath, params, 'text');
  });

  ipcMain.on('set-opacity', (_, opacity) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setOpacity(Math.max(0.1, Math.min(1, opacity)));
    }
  });

  ipcMain.on('set-ui-font', (_, uiCssString) => {
    if (typeof uiCssString !== 'string') return;
    for (const win of [automationHudWindow, automationBuffWindow]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ui-font-changed', uiCssString);
      }
    }
  });

  // ── Price History from DB ──────────────────────────────────────────────────
  ipcMain.handle('query-price-history', (_, filters) => {
    try {
      return queryPriceHistoryData(filters ?? {});
    } catch (error) {
      sendDebugMessage(`History query failed: ${error.message}`);
      return [];
    }
  });

  // ── Watch Baseline from DB ─────────────────────────────────────────────────
  ipcMain.handle('query-watch-baseline', (_, filters) => {
    try {
      return queryWatchBaselineData(filters ?? {});
    } catch (error) {
      sendDebugMessage(`Baseline query failed: ${error.message}`);
      return null;
    }
  });

  // ── Automation ────────────────────────────────────────────────────────────
  ipcMain.handle('automation:get-state', () => automationService?.getState() ?? null);
  ipcMain.handle('automation:list-profiles', () => automationService?.listProfiles() ?? []);
  ipcMain.handle('automation:get-profile', (_, profileId) => automationService?.getProfile(profileId) ?? null);
  ipcMain.handle('automation:create-profile', (_, options) => automationService?.createProfile(options ?? {}) ?? null);
  ipcMain.handle('automation:update-profile', (_, { profileId, changes } = {}) => automationService?.updateProfile(profileId, changes ?? {}) ?? null);
  ipcMain.handle('automation:delete-profile', (_, profileId) => automationService?.deleteProfile(profileId) ?? null);
  ipcMain.handle('automation:set-active-profile', (_, profileId) => automationService?.setActiveProfile(profileId) ?? null);
  ipcMain.handle('automation:export-profile', async (_, { destinationPath, profileIds, appVersion } = {}) => {
    if (!automationService) return null;
    return automationService.profileStore.exportProfiles(destinationPath, profileIds, { appVersion });
  });
  ipcMain.handle('automation:import-profile', async (_, sourcePath) => {
    if (!automationService) return [];
    const imported = automationService.profileStore.importProfiles(sourcePath);
    automationService.reloadDocument();
    automationService.applyProfile(automationService.profileStore.getActiveProfile());
    return imported;
  });
  ipcMain.handle('automation:set-master-enabled', async (_, enabled) => {
    if (!automationService) return null;
    const state = await automationService.setMasterEnabled(enabled);
    return handoffAutomationFocus(state);
  });
  ipcMain.handle('automation:set-runtime-toggle', async (_, { toggleId, enabled } = {}) => {
    if (!automationService) return null;
    const state = await automationService.setRuntimeToggle(toggleId, enabled);
    return handoffAutomationFocus(state);
  });
  ipcMain.handle('automation:test-action', async (_, { action, payload } = {}) => {
    if (!automationService) return null;

    const shouldHandoff = action !== 'releaseModifiers';
    if (shouldHandoff) {
      setInteractiveMode(false);
      await automationService.focusTarget();
    }

    return automationService.testAction(action, payload ?? {});
  });
  ipcMain.handle('automation:bind-hotkey', (_, { hotkeyId, binding } = {}) => automationService?.bindHotkey(hotkeyId, binding) ?? null);
  ipcMain.handle('automation:cancel-bind-hotkey', () => ({ ok: true }));
  ipcMain.handle('automation:restart-helper', () => automationService?.restartHelper() ?? null);
  ipcMain.handle('automation:emergency-stop', () => automationService?.emergencyStop() ?? null);
  ipcMain.handle('automation:set-overlay-preferences', (_, changes) => automationService?.setOverlayPreferences(changes ?? {}) ?? null);
  ipcMain.handle('automation:toggle-buff', (_, buffId) => automationService?.toggleBuff(buffId) ?? null);
  ipcMain.handle('automation:pause-buff', (_, buffId) => automationService?.pauseBuff(buffId) ?? null);

  // ── App Hotkeys ───────────────────────────────────────────────────────────
  ipcMain.handle('get-app-hotkeys', () => loadAppHotkeys());
  ipcMain.handle('set-app-hotkeys', (_, hotkeys) => {
    if (!hotkeys || typeof hotkeys !== 'object') return { ok: false };
    saveAppHotkeys(hotkeys);
    reregisterAppShortcuts(loadAppHotkeys());
    return { ok: true };
  });
  ipcMain.handle('automation:export-profile-dialog', async () => {
    if (!automationService || !overlayWindow) return null;
    const activeProfile = automationService.profileStore.getActiveProfile();
    const result = await dialog.showSaveDialog(overlayWindow, {
      title: 'Export Automation Profile',
      defaultPath: `${activeProfile.name.replace(/[^a-z0-9-_ ]/gi, '_')}.automation-profile.json`,
      filters: [{ name: 'Automation Profiles', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return automationService.profileStore.exportProfiles(result.filePath, [activeProfile.id], { appVersion: app.getVersion() });
  });
  ipcMain.handle('automation:import-profile-dialog', async () => {
    if (!automationService || !overlayWindow) return [];
    const result = await dialog.showOpenDialog(overlayWindow, {
      title: 'Import Automation Profiles',
      filters: [{ name: 'Automation Profiles', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.length) return [];
    const imported = automationService.profileStore.importProfiles(result.filePaths[0]);
    automationService.reloadDocument();
    automationService.applyProfile(automationService.profileStore.getActiveProfile());
    return imported;
  });
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  cleanupOrphanAutomationHelpers();
  releaseInputModifiersAtStartup();
  createOverlay();
  createAutomationOverlayWindows();
  setupAltToggleTracking();
  setupIPC();
  broadcastAltState();
  try {
    await setupAutomation();
  } catch (error) {
    sendRendererEvent('automation:diagnostic-log', {
      message: `automation startup failed: ${error.message}`,
    });
  }
});

app.on('second-instance', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  if (!overlayWindow.isVisible()) {
    overlayWindow.show();
  }

  if (overlayWindow.isMinimized?.()) {
    overlayWindow.restore();
  }

  overlayWindow.focus();
});

app.on('window-all-closed', () => {
  void shutdownApp();
});
