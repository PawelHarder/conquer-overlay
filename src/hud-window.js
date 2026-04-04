'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

function createHudWindow({ htmlFile, preloadPath, width, height, x = 0, y = 0 }) {
  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: true,
    },
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  window.setIgnoreMouseEvents(true, { forward: true });
  window.setFocusable(false);
  window.setVisibleOnAllWorkspaces(true);
  window.loadFile(path.resolve(htmlFile));
  return window;
}

module.exports = {
  createHudWindow,
};
