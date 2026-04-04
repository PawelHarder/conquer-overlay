const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { ProfileStore } = require('./profile-store');
const { AutomationHelperClient } = require('./automation-helper-client');
const { AutomationService } = require('./automation-service');
const { createHudWindow } = require('./hud-window');

const MARKET_BASE_URL = 'https://conqueronline.net';
const MARKET_REQUEST_TIMEOUT_MS = 10000;

let overlayWindow = null;
let isCollapsed = false;
let isInteractive = false;
let altPressed = false;
let altUsedAsModifier = false;
let overlayState = null;
let automationService = null;
let isShuttingDown = false;
const automationHotkeysDown = new Set();
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

function sendRendererEvent(channel, payload) {
  for (const window of getAutomationRendererWindows()) {
    if (!window || window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}

function getAutomationRendererWindows() {
  return [overlayWindow, automationHudWindow, automationBuffWindow].filter(Boolean);
}

function matchesAutomationHotkeyBinding(binding, event) {
  if (!binding) return false;
  if (binding === 'MouseMiddle') {
    return event?.kind === 'mouse' && Number(event.button) === 3;
  }

  const keycode = UiohookKey[binding];
  return Number.isFinite(keycode) && event?.kind === 'key' && event.keycode === keycode;
}

function shouldHandleAutomationHotkey(entry) {
  const capabilities = automationService?.getState?.()?.helperStatus?.capabilities || [];
  if (capabilities.includes('hotkeyRegistration')) return false;
  if (!entry?.enabled) return false;
  if (entry.scope !== 'game-focused') return true;
  const runtimeState = automationService?.getState?.();
  return Boolean(runtimeState?.gameAttachmentStatus?.isForeground);
}

async function handleAutomationHotkeyEvent(event) {
  if (!automationService) return;

  const hotkeys = automationService.getActiveHotkeys();
  for (const [hotkeyId, entry] of Object.entries(hotkeys)) {
    if (!matchesAutomationHotkeyBinding(entry.binding, event)) continue;
    if (!shouldHandleAutomationHotkey(entry)) return;

    const dedupeKey = `${event.kind}:${entry.binding}`;
    if (automationHotkeysDown.has(dedupeKey)) return;
    automationHotkeysDown.add(dedupeKey);

    try {
      await automationService.triggerHotkey(hotkeyId);
    } catch (error) {
      sendDebugMessage(`Automation hotkey failed: ${error.message}`);
    }
    return;
  }
}

function releaseAutomationHotkeyEvent(event) {
  if (!event?.kind) return;
  if (event.kind === 'mouse' && Number(event.button) === 3) {
    automationHotkeysDown.delete('mouse:MouseMiddle');
    return;
  }

  for (const binding of Object.keys(UiohookKey)) {
    if (UiohookKey[binding] === event.keycode) {
      automationHotkeysDown.delete(`key:${binding}`);
    }
  }
}

function getAutomationHelperPath() {
  if (process.env.CONQUER_AUTOMATION_HELPER_PATH) {
    return {
      helperPath: process.env.CONQUER_AUTOMATION_HELPER_PATH,
      helperArgs: [],
    };
  }

  if (app.isPackaged) {
    const packagedHelperExe = path.join(process.resourcesPath, 'native-helper', 'conquer-helper.exe');
    const packagedHelperScript = path.join(process.resourcesPath, 'native-helper', 'conquer-helper-spike.ps1');
    if (fs.existsSync(packagedHelperExe)) {
      return {
        helperPath: packagedHelperExe,
        helperArgs: [],
      };
    }
    if (fs.existsSync(packagedHelperScript)) {
      return {
        helperPath: packagedHelperScript,
        launchCommand: 'powershell.exe',
        launchArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', packagedHelperScript],
      };
    }
    return {
      helperPath: packagedHelperExe,
      helperArgs: [],
    };
  }

  const scriptPath = path.join(__dirname, '../native-helper/conquer-helper-spike.ps1');
  if (fs.existsSync(scriptPath)) {
    return {
      helperPath: scriptPath,
      launchCommand: 'powershell.exe',
      launchArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    };
  }

  return {
    helperPath: path.join(__dirname, '../native-helper/conquer-helper.exe'),
    helperArgs: [],
  };
}

async function setupAutomation() {
  const helperConfig = getAutomationHelperPath();
  const profileStore = new ProfileStore({ userDataPath: app.getPath('userData') });
  const helperClient = new AutomationHelperClient({
    ...helperConfig,
    cwd: path.join(__dirname, '..'),
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
}

function updateAutomationOverlayWindows(state) {
  if (!automationHudWindow || !automationBuffWindow) return;

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
  if (automationService) {
    try {
      await automationService.dispose();
    } catch (_) {
      // Ignore shutdown failures.
    }
  }

  try { uIOhook.stop(); } catch (_) {}
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
    void handleAutomationHotkeyEvent({ kind: 'key', keycode: event.keycode });

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
    releaseAutomationHotkeyEvent({ kind: 'key', keycode: event.keycode });

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

  uIOhook.on('mousedown', event => {
    void handleAutomationHotkeyEvent({ kind: 'mouse', button: event.button });
  });

  uIOhook.on('mouseup', event => {
    releaseAutomationHotkeyEvent({ kind: 'mouse', button: event.button });
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
  ipcMain.handle('automation:set-master-enabled', (_, enabled) => automationService?.setMasterEnabled(enabled) ?? null);
  ipcMain.handle('automation:set-runtime-toggle', (_, { toggleId, enabled } = {}) => automationService?.setRuntimeToggle(toggleId, enabled) ?? null);
  ipcMain.handle('automation:test-action', (_, { action, payload } = {}) => automationService?.testAction(action, payload ?? {}) ?? null);
  ipcMain.handle('automation:bind-hotkey', (_, { hotkeyId, binding } = {}) => automationService?.bindHotkey(hotkeyId, binding) ?? null);
  ipcMain.handle('automation:cancel-bind-hotkey', () => ({ ok: true }));
  ipcMain.handle('automation:restart-helper', () => automationService?.restartHelper() ?? null);
  ipcMain.handle('automation:emergency-stop', () => automationService?.emergencyStop() ?? null);
  ipcMain.handle('automation:set-overlay-preferences', (_, changes) => automationService?.setOverlayPreferences(changes ?? {}) ?? null);
  ipcMain.handle('automation:toggle-buff', (_, buffId) => automationService?.toggleBuff(buffId) ?? null);
  ipcMain.handle('automation:pause-buff', (_, buffId) => automationService?.pauseBuff(buffId) ?? null);
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
  createOverlay();
  createAutomationOverlayWindows();
  setupAltToggleTracking();
  await setupAutomation();
  setupIPC();
  broadcastAltState();
});

app.on('window-all-closed', () => {
  void shutdownApp();
});
