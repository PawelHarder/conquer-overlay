import { dom } from './dom-refs.js';
import { applyTheme, applyUiScale, applyFontPairing, applyOpacity, applyTextOpacity } from './themes.js';
import { setupHotkeyCapture } from './hotkey-capture.js';
import { setStatus } from './utils.js';

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
