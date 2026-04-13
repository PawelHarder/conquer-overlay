import { dom } from './dom-refs.js';
import { applyTheme, applyUiScale, applyFontPairing, applyOpacity, applyTextOpacity } from './themes.js';
import { setupHotkeyCapture } from './hotkey-capture.js';
import { setStatus } from './utils.js';
import { openKeyboardPicker } from './keyboard-picker.js';
import { toggleFeature, getFeatureEnabled } from './feature-toggles.js';

export function setup() {
  dom.themeSelect.addEventListener('change',       () => applyTheme(dom.themeSelect.value));
  dom.uiScaleSelect.addEventListener('change',     () => applyUiScale(dom.uiScaleSelect.value));
  dom.fontPairingSelect.addEventListener('change', () => applyFontPairing(dom.fontPairingSelect.value));
  dom.opacitySlider.addEventListener('input',      () => applyOpacity(parseInt(dom.opacitySlider.value)));
  dom.opacityInput.addEventListener('change',      () => applyOpacity(parseInt(dom.opacityInput.value)));
  dom.textOpacitySlider.addEventListener('input',  () => applyTextOpacity(parseInt(dom.textOpacitySlider.value)));
  dom.textOpacityInput.addEventListener('change',  () => applyTextOpacity(parseInt(dom.textOpacityInput.value)));

  dom.resetPositionBtn.addEventListener('click', () => {
    window.electronAPI?.resetWindowPosition?.();
    setStatus('Position reset', 'ok');
  });

  // Feature toggles — restore states and wire checkboxes
  if (dom.featureWatch)        dom.featureWatch.checked        = getFeatureEnabled('watch');
  if (dom.featureHistory)      dom.featureHistory.checked      = getFeatureEnabled('history');
  if (dom.featureAutoclicker)  dom.featureAutoclicker.checked  = getFeatureEnabled('autoclicker');

  dom.featureWatch?.addEventListener('change',       e => toggleFeature('watch',        e.target.checked));
  dom.featureHistory?.addEventListener('change',     e => toggleFeature('history',      e.target.checked));
  dom.featureAutoclicker?.addEventListener('change', e => toggleFeature('autoclicker',  e.target.checked));

  // Debug card toggle inside settings tab
  const debugToggleBtn = document.getElementById('debug-toggle');
  const debugBody = document.getElementById('debug-body');
  if (debugToggleBtn && debugBody) {
    debugToggleBtn.addEventListener('click', () => {
      const open = debugBody.style.display !== 'none';
      debugBody.style.display = open ? 'none' : 'block';
      debugToggleBtn.textContent = open ? '\u25b6' : '\u25bc';
    });
  }

  // App hotkey capture fields
  setupHotkeyCapture(dom.appHotkeyInteract, 'app');
  setupHotkeyCapture(dom.appHotkeyCollapse, 'app');
  setupHotkeyCapture(dom.appHotkeyHide,    'app');
  setupHotkeyCapture(dom.appHotkeyQuit,    'app');

  // Clear buttons — clicker hotkeys only
  document.querySelectorAll('.hotkey-clear-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (input) input.value = '';
    });
  });

  // Picker buttons — all hotkeys
  document.querySelectorAll('.hotkey-picker-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const mode = input.id.startsWith('automation-') ? 'automation' : 'app';
      const result = await openKeyboardPicker(mode);
      if (result !== null) input.value = result;
    });
  });

  dom.appSaveHotkeys?.addEventListener('click', async () => {
    const hotkeys = {
      interact: dom.appHotkeyInteract.value || undefined,
      collapse: dom.appHotkeyCollapse.value || undefined,
      hide:     dom.appHotkeyHide.value     || undefined,
      quit:     dom.appHotkeyQuit.value     || undefined,
    };
    try {
      await window.electronAPI?.setAppHotkeys?.(hotkeys);
      setStatus('App hotkeys saved', 'ok');
    } catch (err) {
      setStatus('Failed to save hotkeys', 'error');
    }
  });

  // Saved filters — restore persisted server
  if (dom.filterRememberServer) {
    const savedServer = localStorage.getItem('savedServer');
    if (savedServer !== null) {
      dom.filterRememberServer.checked = true;
      // Activate the matching server button
      dom.serverBtns?.forEach(btn => {
        const isMatch = btn.dataset.server === savedServer;
        btn.classList.toggle('active', isMatch);
      });
    }
  }

  // Support button
  const supportBtn = document.getElementById('btn-support-me');
  supportBtn?.addEventListener('click', () => {
    window.electronAPI?.openExternalUrl?.('https://paypal.me/PKHarder');
  });
}
