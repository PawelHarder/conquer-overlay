const { globalShortcut } = require('electron');
const { getOverlayWindow, broadcastAltState, sendDebugMessage, shutdownApp } = require('./window-manager');
const { loadAppHotkeys } = require('./state-store');
const { getAutomationService } = require('./automation-setup');

let isCollapsed = false;
let isInteractive = false;

function getIsCollapsed() { return isCollapsed; }
function getIsInteractive() { return isInteractive; }

// ── Interactive mode ──────────────────────────────────────────────────────────

function setInteractiveMode(nextInteractive) {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (isInteractive === nextInteractive) return;

  isInteractive = nextInteractive;
  overlayWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
  overlayWindow.setFocusable(isInteractive);

  // NOTE: watchOverlayWindow is intentionally always interactive (never click-through)
  // so its dismiss button always works regardless of the main window's mode.

  if (isInteractive) {
    overlayWindow.focus();
  } else {
    overlayWindow.blur();
  }

  broadcastAltState(isInteractive);
}

// ── Window actions ────────────────────────────────────────────────────────────

function toggleCollapsed() {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  isCollapsed = !isCollapsed;
  overlayWindow.webContents.send('toggle-collapse', isCollapsed);
}

function toggleVisibility() {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
    overlayWindow.webContents.send('window-became-visible');
  }
}

// ── Global shortcut registration ──────────────────────────────────────────────

function buildAppShortcutHandlers() {
  return {
    interact: () => { sendDebugMessage('interact hotkey detected'); setInteractiveMode(!isInteractive); },
    collapse: () => { sendDebugMessage('collapse hotkey detected'); toggleCollapsed(); },
    hide:     () => { sendDebugMessage('hide hotkey detected'); toggleVisibility(); },
    quit:     () => { sendDebugMessage('quit hotkey detected'); void shutdownApp(getAutomationService()); },
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

  if (!registered.has('Alt+I')) {
    try {
      globalShortcut.register('Alt+I', handlers.interact);
    } catch (_) {}
  }
}

function setupAltToggleTracking() {
  reregisterAppShortcuts(loadAppHotkeys());
}

module.exports = {
  getIsCollapsed,
  getIsInteractive,
  setInteractiveMode,
  toggleCollapsed,
  toggleVisibility,
  buildAppShortcutHandlers,
  reregisterAppShortcuts,
  setupAltToggleTracking,
};
