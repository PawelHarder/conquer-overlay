const path = require('path');
const fs = require('fs');
const { app, screen } = require('electron');

const DEFAULT_APP_HOTKEYS = Object.freeze({
  interact: 'F8',
  collapse: 'Alt+C',
  hide: 'Alt+H',
  quit: 'Alt+Q',
});

let overlayState = null;
let appHotkeysCache = null;
let positionSaveTimer = null;

// ── Overlay state ─────────────────────────────────────────────────────────────

function getOverlayStatePath() {
  return path.join(app.getPath('userData'), 'overlay-state.json');
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

// The window reference is injected by window-manager to avoid circular dependency.
let _getOverlayWindow = () => null;

function setOverlayWindowAccessor(fn) {
  _getOverlayWindow = fn;
}

function persistCurrentWindowPosition() {
  const win = _getOverlayWindow();
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  saveOverlayState({ x, y });
}

function debouncePersistPosition() {
  clearTimeout(positionSaveTimer);
  positionSaveTimer = setTimeout(persistCurrentWindowPosition, 300);
}

// ── App hotkeys persistence ───────────────────────────────────────────────────

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

module.exports = {
  DEFAULT_APP_HOTKEYS,
  getOverlayStatePath,
  loadOverlayState,
  saveOverlayState,
  getInitialBounds,
  setOverlayWindowAccessor,
  persistCurrentWindowPosition,
  debouncePersistPosition,
  getAppHotkeysPath,
  loadAppHotkeys,
  saveAppHotkeys,
};
