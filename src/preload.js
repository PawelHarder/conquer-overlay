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
});
