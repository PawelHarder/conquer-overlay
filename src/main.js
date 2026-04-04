const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { uIOhook, UiohookKey } = require('uiohook-napi');

const MARKET_BASE_URL = 'https://conqueronline.net';
const MARKET_REQUEST_TIMEOUT_MS = 10000;

let overlayWindow = null;
let isCollapsed = false;
let isInteractive = false;
let altPressed = false;
let altUsedAsModifier = false;
let overlayState = null;

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

function buildDbConditions(filters = {}) {
  const conditions = ['1=1'];
  const params = {};

  const {
    itemName,
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

function buildMarketUrl(requestPath, params = {}) {
  if (typeof requestPath !== 'string' || !requestPath.startsWith('/Community/')) {
    throw new Error('Invalid market path');
  }

  const url = new URL(requestPath, MARKET_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

async function requestMarket(requestPath, params = {}, responseType = 'json') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MARKET_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(buildMarketUrl(requestPath, params), {
      headers: {
        Accept: responseType === 'text' ? 'application/json, text/plain, */*' : 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Market API error ${res.status}: ${requestPath}`);
    }

    return responseType === 'text'
      ? (await res.text()).trim()
      : await res.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Market API timeout: ${requestPath}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

function persistCurrentWindowPosition() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const [x, y] = overlayWindow.getPosition();
  saveOverlayState({ x, y });
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
    resizable: true,
    movable: true,
    hasShadow: false,
    focusable: true,
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

function setupAltToggleTracking() {
  uIOhook.on('keydown', event => {
    if (event.keycode === UiohookKey.Alt || event.keycode === UiohookKey.AltRight) {
      altPressed = true;
      altUsedAsModifier = false;
      return;
    }

    if (altPressed) {
      altUsedAsModifier = true;
    }

    const altComboActive = altPressed || event.altKey;
    if (!altComboActive) {
      return;
    }

    if (event.keycode === UiohookKey.C) {
      sendDebugMessage('Alt+C detected');
      toggleCollapsed();
      return;
    }

    if (event.keycode === UiohookKey.H) {
      sendDebugMessage('Alt+H detected');
      toggleVisibility();
      return;
    }

  });

  uIOhook.on('keyup', event => {
    if (event.keycode !== UiohookKey.Alt && event.keycode !== UiohookKey.AltRight) {
      return;
    }

    const shouldToggle = altPressed && !altUsedAsModifier;
    altPressed = false;
    altUsedAsModifier = false;

    if (shouldToggle) {
      setInteractiveMode(!isInteractive);
    }
  });

  uIOhook.start();
}

// ── Actions ──────────────────────────────────────────────────────────────────

function toggleCollapsed() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  isCollapsed = !isCollapsed;
  overlayWindow.webContents.send('toggle-collapse', isCollapsed);
  if (isCollapsed) {
    overlayWindow.setSize(420, 48, true);
  } else {
    overlayWindow.setSize(420, 600, true);
  }
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
    persistCurrentWindowPosition();
    try { uIOhook.stop(); } catch (_) {}
    process.exit(0);
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
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createOverlay();
  setupAltToggleTracking();
  setupIPC();
  broadcastAltState();
});

app.on('window-all-closed', () => {
  // Stop the native hook thread synchronously — uiohook-napi keeps the
  // process alive if not stopped, causing ghost Electron processes after close.
  try { uIOhook.stop(); } catch (_) {}
  process.exit(0);
});
