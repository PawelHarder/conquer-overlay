const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { createHudWindow } = require('../hud-window');
const { getInitialBounds, persistCurrentWindowPosition, debouncePersistPosition, setOverlayWindowAccessor } = require('./state-store');

let overlayWindow = null;
let automationHudWindow = null;
let automationBuffWindow = null;
let watchOverlayWindow = null;
let pendingWatchData = null;
let isShuttingDown = false;
let _shutdownCleanupFn = null;

function registerShutdownCleanup(fn) {
  _shutdownCleanupFn = fn;
}

// ── Accessors ─────────────────────────────────────────────────────────────────

function getOverlayWindow() { return overlayWindow; }
function getAutomationHudWindow() { return automationHudWindow; }
function getAutomationBuffWindow() { return automationBuffWindow; }
function getWatchOverlayWindow() { return watchOverlayWindow; }
function getPendingWatchData() { return pendingWatchData; }
function setPendingWatchData(data) { pendingWatchData = data; }
function getIsShuttingDown() { return isShuttingDown; }

function getAutomationRendererWindows() {
  return [overlayWindow, automationHudWindow, automationBuffWindow].filter(Boolean);
}

function sendRendererEvent(channel, payload) {
  for (const win of getAutomationRendererWindows()) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

function broadcastAltState(isInteractive) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('alt-toggled', isInteractive);
}

function sendDebugMessage(message) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('debug-message', message);
}

// ── Window creation ───────────────────────────────────────────────────────────

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
    movable: true,
    thickFrame: false,
    hasShadow: false,
    focusable: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setFocusable(false);
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.on('moved', debouncePersistPosition);
  overlayWindow.on('close', persistCurrentWindowPosition);

  overlayWindow.loadFile(path.join(__dirname, '../../public/index.html'));

  if (process.argv.includes('--dev')) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Give state-store a way to read the window's position without a circular import.
  setOverlayWindowAccessor(() => overlayWindow);
}

function createAutomationOverlayWindows() {
  const preloadPath = path.join(__dirname, '../preload.js');
  automationHudWindow = createHudWindow({
    htmlFile: path.join(__dirname, '../../public/automation-hud.html'),
    preloadPath,
    width: 380,
    height: 76,
  });
  automationBuffWindow = createHudWindow({
    htmlFile: path.join(__dirname, '../../public/automation-buffs.html'),
    preloadPath,
    width: 190,
    height: 260,
  });
  automationHudWindow.on('closed', () => { automationHudWindow = null; });
  automationBuffWindow.on('closed', () => { automationBuffWindow = null; });
}

function createWatchOverlay() {
  const preloadPath = path.join(__dirname, '../preload.js');
  watchOverlayWindow = createHudWindow({
    htmlFile: path.join(__dirname, '../../public/watch-overlay.html'),
    preloadPath,
    width: 340,
    height: 580,
  });

  // The watch overlay must always receive mouse events so the dismiss button works.
  watchOverlayWindow.setIgnoreMouseEvents(false);
  watchOverlayWindow.setFocusable(true);
  watchOverlayWindow.setMovable(true);

  watchOverlayWindow.on('show', () => {
    try {
      const wa = screen.getPrimaryDisplay().workArea;
      watchOverlayWindow.setPosition(wa.x + 8, wa.y + 38);
    } catch (_) { /* ignore position errors */ }
    if (pendingWatchData) {
      watchOverlayWindow.webContents.send('overlay-show-matches', pendingWatchData);
    }
  });

  watchOverlayWindow.on('closed', () => { watchOverlayWindow = null; });
}

// ── Automation overlay layout ─────────────────────────────────────────────────

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

// ── Shutdown ──────────────────────────────────────────────────────────────────

async function shutdownApp(automationService) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  persistCurrentWindowPosition();
  for (const win of [automationHudWindow, automationBuffWindow, watchOverlayWindow, overlayWindow]) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.destroy();
    } catch (_) {
      // Ignore window teardown failures during shutdown.
    }
  }
  automationHudWindow = null;
  automationBuffWindow = null;
  watchOverlayWindow = null;
  overlayWindow = null;

  if (automationService) {
    try {
      await automationService.dispose();
    } catch (_) {
      // Ignore shutdown failures.
    }
  }

  if (typeof _shutdownCleanupFn === 'function') _shutdownCleanupFn();

  try { require('electron').globalShortcut.unregisterAll(); } catch (_) {}
  process.exit(0);
}

module.exports = {
  registerShutdownCleanup,
  getOverlayWindow,
  getAutomationHudWindow,
  getAutomationBuffWindow,
  getWatchOverlayWindow,
  getPendingWatchData,
  setPendingWatchData,
  getIsShuttingDown,
  getAutomationRendererWindows,
  sendRendererEvent,
  broadcastAltState,
  sendDebugMessage,
  createOverlay,
  createAutomationOverlayWindows,
  createWatchOverlay,
  updateAutomationOverlayWindows,
  shutdownApp,
};
