const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  onToggleCollapse: (cb) => ipcRenderer.on('toggle-collapse', (_, val) => cb(val)),
  onAltToggle: (cb) => ipcRenderer.on('alt-toggled', (_, val) => cb(val)),
  onDebugMessage: (cb) => ipcRenderer.on('debug-message', (_, msg) => cb(msg)),
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  moveWindow: (pos) => ipcRenderer.send('move-window', pos),
  resetWindowPosition: () => ipcRenderer.send('reset-window-position'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  closeApp: () => ipcRenderer.send('close-app'),
  getWindowPos: () => ipcRenderer.invoke('get-window-pos'),

  // Market API proxy
  getMarketJson: (path, params) => ipcRenderer.invoke('market-get-json', { path, params }),
  getMarketText: (path, params) => ipcRenderer.invoke('market-get-text', { path, params }),

  // Settings
  setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),

  // Price history DB queries
  queryPriceHistory: (filters) => ipcRenderer.invoke('query-price-history', filters),
  queryWatchBaseline: (filters) => ipcRenderer.invoke('query-watch-baseline', filters),

  // Automation
  automation: {
    getState: () => ipcRenderer.invoke('automation:get-state'),
    listProfiles: () => ipcRenderer.invoke('automation:list-profiles'),
    getProfile: (profileId) => ipcRenderer.invoke('automation:get-profile', profileId),
    createProfile: (options) => ipcRenderer.invoke('automation:create-profile', options),
    updateProfile: (profileId, changes) => ipcRenderer.invoke('automation:update-profile', { profileId, changes }),
    deleteProfile: (profileId) => ipcRenderer.invoke('automation:delete-profile', profileId),
    setActiveProfile: (profileId) => ipcRenderer.invoke('automation:set-active-profile', profileId),
    exportProfile: (destinationPath, profileIds, appVersion) => ipcRenderer.invoke('automation:export-profile', { destinationPath, profileIds, appVersion }),
    importProfile: (sourcePath) => ipcRenderer.invoke('automation:import-profile', sourcePath),
    exportProfileDialog: () => ipcRenderer.invoke('automation:export-profile-dialog'),
    importProfileDialog: () => ipcRenderer.invoke('automation:import-profile-dialog'),
    setMasterEnabled: (enabled) => ipcRenderer.invoke('automation:set-master-enabled', enabled),
    setRuntimeToggle: (toggleId, enabled) => ipcRenderer.invoke('automation:set-runtime-toggle', { toggleId, enabled }),
    testAction: (action, payload) => ipcRenderer.invoke('automation:test-action', { action, payload }),
    bindHotkey: (hotkeyId, binding) => ipcRenderer.invoke('automation:bind-hotkey', { hotkeyId, binding }),
    cancelBindHotkey: () => ipcRenderer.invoke('automation:cancel-bind-hotkey'),
    restartHelper: () => ipcRenderer.invoke('automation:restart-helper'),
    emergencyStop: () => ipcRenderer.invoke('automation:emergency-stop'),
    setOverlayPreferences: (changes) => ipcRenderer.invoke('automation:set-overlay-preferences', changes),
    toggleBuff: (buffId) => ipcRenderer.invoke('automation:toggle-buff', buffId),
    pauseBuff: (buffId) => ipcRenderer.invoke('automation:pause-buff', buffId),
    onStateChanged: (cb) => ipcRenderer.on('automation:state-changed', (_, state) => cb(state)),
    onHelperStatus: (cb) => ipcRenderer.on('automation:helper-status', (_, status) => cb(status)),
    onOverlayStatus: (cb) => ipcRenderer.on('automation:overlay-status', (_, status) => cb(status)),
    onDiagnosticLog: (cb) => ipcRenderer.on('automation:diagnostic-log', (_, entry) => cb(entry)),
  },
});
