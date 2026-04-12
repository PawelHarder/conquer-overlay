import { state } from './state.js';
import { dom } from './dom-refs.js';
import { setStatus } from './utils.js';
import { applyEffectiveBgAlpha } from './themes.js';
import {
  init as initMinimap, updateMinimapSide,
  hideMinimapPopup, clearPinnedMinimap,
} from './minimap.js';

// Loaded lazily to break circular dep with history/watch modules
let _loadHistory = null;
export function registerLoadHistory(fn) { _loadHistory = fn; }

export function switchTab(tabId) {
  const prevTab = state.activeTab;
  state.activeTab = tabId;
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.btnSettingsTab.classList.toggle('active', tabId === 'settings');
  dom.tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
  hideMinimapPopup();
  if (tabId === 'history' && _loadHistory) _loadHistory();
  if (tabId === 'watch') {
    window.electronAPI?.dismissWatchOverlay?.();
  } else if (prevTab === 'watch' && state.watchCancel && state.watchItems.length > 0) {
    window.electronAPI?.sendWatchMatch?.({
      items: state.watchItems.slice(0, 20),
      isCollapsed: state.isCollapsed,
      activeTab: tabId,
    });
  }
}

export function setCollapsed(val) {
  state.isCollapsed = val;
  document.body.classList.toggle('collapsed', val);
  dom.btnCollapse.textContent = val ? '▼' : '▲';
  const scale = Math.max(0.9, Math.min(1.2, parseFloat(localStorage.getItem('uiScale') || '1')));
  window.electronAPI?.resizeWindow?.({
    width:  Math.round(420 * scale),
    height: val ? Math.round(38 * scale) : Math.round(600 * scale),
  });
  if (val) {
    if (state.watchCancel && state.watchItems.length > 0) {
      window.electronAPI?.sendWatchMatch?.({
        items: state.watchItems.slice(0, 20),
        isCollapsed: true,
        activeTab: state.activeTab,
      });
    }
  } else if (state.activeTab === 'watch') {
    window.electronAPI?.dismissWatchOverlay?.();
  }
}

let interactBinding = 'F8';

function updateInteractHintText() {
  if (dom.altHint) dom.altHint.textContent = `${interactBinding} toggles interact`;
}

export function setAltToggleState(isEnabled) {
  state.altHeld = isEnabled;
  dom.altIndicator.classList.toggle('active', isEnabled);
  dom.altIndicator.textContent = isEnabled ? `${interactBinding}: click enabled` : `${interactBinding}: click-through`;
  updateInteractHintText();
  const baseFraction = Math.max(0.1, Math.min(1, parseFloat(localStorage.getItem('opacity') ?? '100') / 100));
  applyEffectiveBgAlpha(baseFraction);
}

export function setup() {
  initMinimap(dom, state);

  // Server selector
  dom.serverBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.serverBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.server = btn.dataset.server;
      if (dom.filterRememberServer?.checked) {
        localStorage.setItem('savedServer', state.server);
      }
    });
  });

  // Tab switching
  dom.tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  dom.btnSettingsTab.addEventListener('click', () => switchTab('settings'));

  // Collapse / expand
  dom.btnCollapse.addEventListener('click', () => setCollapsed(!state.isCollapsed));
  dom.btnClose.addEventListener('click', () => { if (window.electronAPI) window.electronAPI.closeApp(); });
  if (window.electronAPI) window.electronAPI.onToggleCollapse(val => setCollapsed(val));

  // Window became visible
  if (window.electronAPI?.onWindowBecameVisible) {
    window.electronAPI.onWindowBecameVisible(() => {
      if (state.activeTab === 'watch' && !state.isCollapsed) {
        window.electronAPI?.dismissWatchOverlay?.();
      } else if (state.watchCancel && state.watchItems.length > 0) {
        window.electronAPI?.sendWatchMatch?.({
          items: state.watchItems.slice(0, 20),
          isCollapsed: state.isCollapsed,
          activeTab: state.activeTab,
        });
      }
    });
  }

  // ALT tracking
  if (window.electronAPI) {
    window.electronAPI.onAltToggle(isEnabled => setAltToggleState(isEnabled));
    window.electronAPI.onDebugMessage(message => setStatus(message, 'warn'));
    window.electronAPI.getAppHotkeys?.().then(h => {
      if (h?.interact) interactBinding = h.interact;
      updateInteractHintText();
    }).catch(() => {});
    window.electronAPI.onAppHotkeysChanged?.(h => {
      if (h?.interact) interactBinding = h.interact;
      updateInteractHintText();
    });
  }

  // Minimap dismiss on outside click
  document.addEventListener('click', e => {
    if (!state.minimapPinned) return;
    if (e.target.closest('.listing-row')) return;
    clearPinnedMinimap();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.minimapPinned) clearPinnedMinimap();
  });

  // Drag to move
  let dragStart = null;
  let winPosStart = null;

  dom.titlebar.addEventListener('mousedown', async e => {
    if (e.button !== 0 || e.target.closest('button') || !state.altHeld) return;
    dragStart = { x: e.screenX, y: e.screenY };
    if (window.electronAPI) winPosStart = await window.electronAPI.getWindowPos();
  });

  document.addEventListener('mousemove', e => {
    if (!dragStart || !winPosStart) return;
    window.electronAPI?.moveWindow({ x: winPosStart[0] + e.screenX - dragStart.x, y: winPosStart[1] + e.screenY - dragStart.y });
  });

  document.addEventListener('mouseup', () => {
    if (dragStart) updateMinimapSide();
    dragStart = null;
    winPosStart = null;
  });
}
