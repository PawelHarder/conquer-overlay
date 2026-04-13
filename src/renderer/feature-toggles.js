const STORAGE_KEY = 'disabledFeatures';
const TOGGLEABLE = ['watch', 'history', 'autoclicker'];

function getDisabled() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setDisabled(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function stopFeatureIfRunning(tabId) {
  if (tabId === 'watch') {
    import('./watch.js').then(({ stopWatch }) => {
      import('./state.js').then(({ state }) => {
        if (state.watchCancel) stopWatch();
      });
    });
  } else if (tabId === 'autoclicker') {
    import('./state.js').then(({ state }) => {
      if (state.automationState?.runtimeState?.masterEnabled) {
        window.electronAPI?.automation?.setMasterEnabled?.(false);
      }
    });
  }
}

export function applyFeatureToggles() {
  const disabled = getDisabled();
  for (const tabId of TOGGLEABLE) {
    const isDisabled = disabled.includes(tabId);
    const tabEl   = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const panelEl = document.getElementById(`tab-${tabId}`);
    if (tabEl)   tabEl.style.display   = isDisabled ? 'none' : '';
    if (panelEl) panelEl.style.display = isDisabled ? 'none' : '';

    if (isDisabled && panelEl?.classList.contains('active')) {
      import('./ui.js').then(({ switchTab }) => switchTab('search'));
    }
  }
}

export function toggleFeature(tabId, enabled) {
  const disabled = getDisabled().filter(id => id !== tabId);
  if (!enabled) disabled.push(tabId);
  setDisabled(disabled);

  const tabEl   = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const panelEl = document.getElementById(`tab-${tabId}`);
  if (tabEl)   tabEl.style.display   = enabled ? '' : 'none';
  if (panelEl) panelEl.style.display = enabled ? '' : 'none';

  if (!enabled) {
    stopFeatureIfRunning(tabId);
    if (panelEl?.classList.contains('active')) {
      import('./ui.js').then(({ switchTab }) => switchTab('search'));
    }
  }
}

export function getFeatureEnabled(tabId) {
  return !getDisabled().includes(tabId);
}
