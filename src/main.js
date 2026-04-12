const { app } = require('electron');
const { createOverlay, createAutomationOverlayWindows, createWatchOverlay, sendRendererEvent, getOverlayWindow, shutdownApp, broadcastAltState, registerShutdownCleanup } = require('./main/window-manager');
const { setupAltToggleTracking } = require('./main/hotkey-manager');
const { setupIPC } = require('./main/ipc-handlers');
const { setupAutomation, releaseInputModifiersAtStartup, cleanupOrphanAutomationHelpers, getAutomationService } = require('./main/automation-setup');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  cleanupOrphanAutomationHelpers();
  releaseInputModifiersAtStartup();
  registerShutdownCleanup(() => {
    cleanupOrphanAutomationHelpers();
    releaseInputModifiersAtStartup();
  });
  createOverlay();
  createAutomationOverlayWindows();
  createWatchOverlay();
  setupAltToggleTracking();
  setupIPC();
  broadcastAltState(false);
  try {
    await setupAutomation();
  } catch (error) {
    sendRendererEvent('automation:diagnostic-log', {
      message: `automation startup failed: ${error.message}`,
    });
  }
});

app.on('second-instance', () => {
  const overlayWindow = getOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (!overlayWindow.isVisible()) overlayWindow.show();
  if (overlayWindow.isMinimized?.()) overlayWindow.restore();
  overlayWindow.focus();
});

app.on('window-all-closed', () => {
  void shutdownApp(getAutomationService());
});
