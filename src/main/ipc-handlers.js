const { app, dialog, ipcMain, screen, shell } = require('electron');
const { requestMarket } = require('./market-client');
const { queryPriceHistoryData, queryWatchBaselineData } = require('./db-queries');
const { loadAppHotkeys, saveAppHotkeys } = require('./state-store');
const {
  getOverlayWindow,
  getAutomationHudWindow,
  getAutomationBuffWindow,
  getWatchOverlayWindow,
  getPendingWatchData,
  setPendingWatchData,
  sendDebugMessage,
  sendRendererEvent,
  shutdownApp,
} = require('./window-manager');
const { getAutomationService } = require('./automation-setup');
const {
  setInteractiveMode,
  handoffAutomationFocus,
  toggleCollapsed,
  toggleVisibility,
  reregisterAppShortcuts,
} = require('./hotkey-manager');

function setupIPC() {
  // ── Window controls ───────────────────────────────────────────────────────

  ipcMain.on('resize-window', (_, { width, height }) => {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const { getIsInteractive } = require('./hotkey-manager');
      const isInteractive = getIsInteractive();
      overlayWindow.setResizable(true);
      overlayWindow.setSize(width, height, true);
      overlayWindow.setResizable(false);
      overlayWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
      overlayWindow.setFocusable(isInteractive);
    }
  });

  ipcMain.on('move-window', (_, { x, y }) => {
    const { saveOverlayState } = require('./state-store');
    getOverlayWindow()?.setPosition(x, y, true);
    saveOverlayState({ x, y });
  });

  ipcMain.on('reset-window-position', () => {
    const { saveOverlayState } = require('./state-store');
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    const x = width - 440;
    const y = 20;
    saveOverlayState({ x, y });
    getOverlayWindow()?.setPosition(x, y, true);
  });

  ipcMain.on('hide-window', () => { toggleVisibility(); });
  ipcMain.on('close-app', () => { void shutdownApp(getAutomationService()); });

  ipcMain.handle('get-window-pos', () => getOverlayWindow()?.getPosition());

  // ── Market API proxy ──────────────────────────────────────────────────────

  ipcMain.handle('market-get-json', (_, { path: requestPath, params } = {}) => {
    return requestMarket(requestPath, params, 'json');
  });

  ipcMain.handle('market-get-text', (_, { path: requestPath, params } = {}) => {
    return requestMarket(requestPath, params, 'text');
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  ipcMain.on('set-opacity', (_, opacity) => {
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setOpacity(Math.max(0.1, Math.min(1, opacity)));
    }
  });

  ipcMain.on('set-ui-font', (_, uiCssString) => {
    if (typeof uiCssString !== 'string') return;
    for (const win of [getAutomationHudWindow(), getAutomationBuffWindow()]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ui-font-changed', uiCssString);
      }
    }
  });

  // ── Price history DB queries ──────────────────────────────────────────────

  ipcMain.handle('query-price-history', async (_, filters) => {
    try {
      return await queryPriceHistoryData(filters ?? {});
    } catch (error) {
      sendDebugMessage(`History query failed: ${error.message}`);
      return [];
    }
  });

  ipcMain.handle('query-watch-baseline', async (_, filters) => {
    try {
      return await queryWatchBaselineData(filters ?? {});
    } catch (error) {
      sendDebugMessage(`Baseline query failed: ${error.message}`);
      return null;
    }
  });

  // ── Automation ────────────────────────────────────────────────────────────

  ipcMain.handle('automation:get-state', () => getAutomationService()?.getState() ?? null);
  ipcMain.handle('automation:list-profiles', () => getAutomationService()?.listProfiles() ?? []);
  ipcMain.handle('automation:get-profile', (_, profileId) => getAutomationService()?.getProfile(profileId) ?? null);
  ipcMain.handle('automation:create-profile', (_, options) => getAutomationService()?.createProfile(options ?? {}) ?? null);
  ipcMain.handle('automation:update-profile', (_, { profileId, changes } = {}) => getAutomationService()?.updateProfile(profileId, changes ?? {}) ?? null);
  ipcMain.handle('automation:delete-profile', (_, profileId) => getAutomationService()?.deleteProfile(profileId) ?? null);
  ipcMain.handle('automation:set-active-profile', (_, profileId) => getAutomationService()?.setActiveProfile(profileId) ?? null);

  ipcMain.handle('automation:export-profile', async (_, { destinationPath, profileIds, appVersion } = {}) => {
    const svc = getAutomationService();
    if (!svc) return null;
    return svc.profileStore.exportProfiles(destinationPath, profileIds, { appVersion });
  });

  ipcMain.handle('automation:import-profile', async (_, sourcePath) => {
    const svc = getAutomationService();
    if (!svc) return [];
    const imported = svc.profileStore.importProfiles(sourcePath);
    svc.reloadDocument();
    svc.applyProfile(svc.profileStore.getActiveProfile());
    return imported;
  });

  ipcMain.handle('automation:set-master-enabled', async (_, enabled) => {
    const svc = getAutomationService();
    if (!svc) return null;
    const state = await svc.setMasterEnabled(enabled);
    return handoffAutomationFocus(state);
  });

  ipcMain.handle('automation:set-runtime-toggle', async (_, { toggleId, enabled } = {}) => {
    const svc = getAutomationService();
    if (!svc) return null;
    const state = await svc.setRuntimeToggle(toggleId, enabled);
    return handoffAutomationFocus(state);
  });

  ipcMain.handle('automation:test-action', async (_, { action, payload } = {}) => {
    const svc = getAutomationService();
    if (!svc) return null;

    const shouldHandoff = action !== 'releaseModifiers';
    if (shouldHandoff) {
      setInteractiveMode(false);
      await svc.focusTarget();
    }

    return svc.testAction(action, payload ?? {});
  });

  ipcMain.handle('automation:bind-hotkey', (_, { hotkeyId, binding } = {}) => getAutomationService()?.bindHotkey(hotkeyId, binding) ?? null);
  ipcMain.handle('automation:cancel-bind-hotkey', () => ({ ok: true }));
  ipcMain.handle('automation:restart-helper', () => getAutomationService()?.restartHelper() ?? null);
  ipcMain.handle('automation:emergency-stop', () => getAutomationService()?.emergencyStop() ?? null);
  ipcMain.handle('automation:set-overlay-preferences', (_, changes) => getAutomationService()?.setOverlayPreferences(changes ?? {}) ?? null);
  ipcMain.handle('automation:toggle-buff', (_, buffId) => getAutomationService()?.toggleBuff(buffId) ?? null);
  ipcMain.handle('automation:pause-buff', (_, buffId) => getAutomationService()?.pauseBuff(buffId) ?? null);

  // ── App hotkeys ───────────────────────────────────────────────────────────

  ipcMain.handle('get-app-hotkeys', () => loadAppHotkeys());

  ipcMain.handle('set-app-hotkeys', (_, hotkeys) => {
    if (!hotkeys || typeof hotkeys !== 'object') return { ok: false };
    saveAppHotkeys(hotkeys);
    reregisterAppShortcuts(loadAppHotkeys());
    getOverlayWindow()?.webContents.send('app-hotkeys-changed', loadAppHotkeys());
    return { ok: true };
  });

  ipcMain.handle('automation:export-profile-dialog', async () => {
    const svc = getAutomationService();
    const overlayWindow = getOverlayWindow();
    if (!svc || !overlayWindow) return null;
    const activeProfile = svc.profileStore.getActiveProfile();
    const result = await dialog.showSaveDialog(overlayWindow, {
      title: 'Export Automation Profile',
      defaultPath: `${activeProfile.name.replace(/[^a-z0-9-_ ]/gi, '_')}.automation-profile.json`,
      filters: [{ name: 'Automation Profiles', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return svc.profileStore.exportProfiles(result.filePath, [activeProfile.id], { appVersion: app.getVersion() });
  });

  ipcMain.handle('automation:import-profile-dialog', async () => {
    const svc = getAutomationService();
    const overlayWindow = getOverlayWindow();
    if (!svc || !overlayWindow) return [];
    const result = await dialog.showOpenDialog(overlayWindow, {
      title: 'Import Automation Profiles',
      filters: [{ name: 'Automation Profiles', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.length) return [];
    const imported = svc.profileStore.importProfiles(result.filePaths[0]);
    svc.reloadDocument();
    svc.applyProfile(svc.profileStore.getActiveProfile());
    return imported;
  });

  // ── External URL ──────────────────────────────────────────────────────────

  ipcMain.on('open-external-url', (_, url) => {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) return;
    shell.openExternal(url);
  });

  // ── Watch match overlay ───────────────────────────────────────────────────

  ipcMain.on('watch-match-found', (_, payload) => {
    const watchOverlayWindow = getWatchOverlayWindow();
    if (!watchOverlayWindow || watchOverlayWindow.isDestroyed()) return;
    const { items, isCollapsed: payloadCollapsed, activeTab } = payload || {};
    const overlayWindow = getOverlayWindow();
    const shouldShow = payloadCollapsed || !overlayWindow?.isVisible() || activeTab !== 'watch';
    if (!shouldShow) return;

    setPendingWatchData(items);
    try {
      if (watchOverlayWindow.isVisible()) {
        watchOverlayWindow.webContents.send('overlay-show-matches', items);
      } else {
        watchOverlayWindow.show();
      }
    } catch (err) {
      console.error('[WatchOverlay] show/send error:', err.message);
    }
  });

  ipcMain.on('watch-overlay-dismiss', () => {
    setPendingWatchData(null);
    const watchOverlayWindow = getWatchOverlayWindow();
    if (!watchOverlayWindow || watchOverlayWindow.isDestroyed()) return;
    watchOverlayWindow.webContents.send('overlay-clear');
    if (watchOverlayWindow.isVisible()) watchOverlayWindow.hide();
  });
}

module.exports = { setupIPC };
