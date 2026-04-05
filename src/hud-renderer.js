const overlayType = document.body.dataset.overlayType || 'hud';

const dom = {
  root: document.getElementById('root'),
};

const state = {
  automation: null,
};

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHud(runtimeState = {}, helperStatus = {}, gameStatus = {}, overlayState = {}) {
  const chips = [
    ['MST', runtimeState.masterEnabled],
    ['LMB', runtimeState.leftClickerEnabled],
    ['RMB', runtimeState.rightClickerEnabled],
    ['F7', runtimeState.f7Enabled],
    ['SHFT', runtimeState.shiftHeldEnabled],
    ['CTRL', runtimeState.ctrlHeldEnabled],
  ];
  const compactHud = Boolean(overlayState.compactHud);
  const visibleChips = compactHud
    ? chips.filter(([label, active]) => label === 'MST' || active)
    : chips;
  const hudChips = visibleChips.length > 0 ? visibleChips : [['IDLE', false]];

  const helperText = helperStatus.lastError?.code
    ? `${helperStatus.lifecycle || 'unknown'} · ${helperStatus.lastError.code}`
    : (helperStatus.lifecycle || 'unknown');
  const targetText = gameStatus.attached ? (gameStatus.isForeground ? 'Game active' : 'Game background') : 'Game missing';
  const metaLeft = compactHud ? helperText : helperText;
  const metaRight = targetText;

  dom.root.innerHTML = `
    <div class="hud-shell${compactHud ? ' compact' : ''}">
      <div class="hud-row hud-row-main">
        ${hudChips.map(([label, active]) => `<div class="hud-chip${active ? ' on' : ''}">${label}:${active ? 'ON' : 'OFF'}</div>`).join('')}
      </div>
      <div class="hud-row hud-row-meta">
        <span>${escHtml(metaLeft)}</span>
        <span>${escHtml(metaRight)}</span>
      </div>
    </div>
  `;
}

function renderBuffs(automationState) {
  const profile = automationState?.activeProfile || null;
  const runtime = automationState?.buffRuntimeState || {};
  const configuredBuffs = profile?.buffs || {};
  const overlayState = automationState?.overlayState || {};
  const entries = Object.keys(configuredBuffs)
    .map(buffId => ({ config: configuredBuffs[buffId], runtime: runtime[buffId] }))
    .filter(entry => entry.config?.visibleInOverlay)
    .filter(entry => overlayState.showOnlyActiveBuffs === false || entry.runtime?.active);

  if (!entries.length) {
    dom.root.innerHTML = '<div class="buff-shell empty">No active buffs</div>';
    return;
  }

  dom.root.innerHTML = `
    <div class="buff-shell">
      ${entries.map(({ config, runtime: buffRuntime }) => {
        const durationMs = Math.max(1, config.durationSec * 1000);
        const safeRuntime = buffRuntime || {};
        const ratio = config.countMode === 'countup'
          ? 1
          : Math.max(0, Math.min(1, (safeRuntime.remainingMs || 0) / durationMs));
        const inactive = !safeRuntime.active;
        return `
          <div class="buff-card${safeRuntime.paused ? ' paused' : ''}${inactive ? ' inactive' : ''}">
            <div class="buff-title">${escHtml(config.label)}</div>
            <div class="buff-time">${escHtml(safeRuntime.displayText || 'OFF')}</div>
            <div class="buff-bar"><span style="width:${Math.round(ratio * 100)}%"></span></div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function render(automationState) {
  state.automation = automationState;
  if (overlayType === 'buffs') {
    renderBuffs(automationState);
    return;
  }
  renderHud(
    automationState?.runtimeState || {},
    automationState?.helperStatus || {},
    automationState?.gameAttachmentStatus || {},
    automationState?.overlayState || {}
  );
}

window.electronAPI?.automation?.onStateChanged?.(render);
window.electronAPI?.automation?.getState?.().then(render).catch(() => {
  dom.root.textContent = 'Automation state unavailable';
});

// Apply font from main renderer settings
function applyUiFont(uiCssString) {
  if (uiCssString) document.documentElement.style.setProperty('--ui', uiCssString);
}
window.electronAPI?.onUiFontChanged?.(applyUiFont);
