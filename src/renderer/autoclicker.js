import { state } from './state.js';
import { dom } from './dom-refs.js';
import { escHtml, setStatus, pushAutomationLog, setControlValueIfIdle, setNestedControlValues,
  formatAutomationDetailSummary, formatAutomationTargetSummary } from './utils.js';
import { setupHotkeyCapture } from './hotkey-capture.js';

export function renderAutomationState(nextState) {
  state.automationState = nextState;
  if (!nextState) {
    dom.automationHelperStatus.textContent = 'Unavailable';
    dom.automationTargetStatus.textContent = 'Unavailable';
    dom.automationMasterStatus.textContent = 'Unavailable';
    return;
  }

  const helperStatus  = nextState.helperStatus         || {};
  const targetStatus  = nextState.gameAttachmentStatus || {};
  const runtimeState  = nextState.runtimeState         || {};
  const overlayState  = nextState.overlayState         || {};
  const activeProfile = nextState.activeProfile        || {};
  const gameTarget    = activeProfile.gameTarget       || {};
  const buffs         = activeProfile.buffs            || {};
  const hotkeys       = activeProfile.hotkeys          || {};

  dom.automationHelperStatus.textContent = helperStatus.lastError?.code
    ? `${helperStatus.lifecycle || 'unknown'} · ${helperStatus.lastError.code}`
    : (helperStatus.lifecycle || 'unknown');

  dom.automationTargetStatus.textContent = targetStatus.attached
    ? `${targetStatus.isForeground ? 'Attached · foreground' : 'Attached · background'}${targetStatus.matchedPattern ? ` · ${targetStatus.matchedPattern}` : ''}${targetStatus.title ? ` · ${targetStatus.title}` : ''}`
    : `Not attached${targetStatus.windowTitlePattern ? ` · looking for ${targetStatus.windowTitlePattern}` : ''}`;

  dom.automationMasterStatus.textContent = runtimeState.masterEnabled ? 'ON' : 'OFF';

  setControlValueIfIdle(dom.automationProfileName, activeProfile.name || '');
  setControlValueIfIdle(dom.automationProfileDescription, activeProfile.description || '');
  setControlValueIfIdle(dom.automationTargetTitle, gameTarget.windowTitlePattern || '');
  setControlValueIfIdle(dom.automationTargetMatchMode, gameTarget.matchMode || 'process-first');
  setControlValueIfIdle(dom.automationTargetProcessName, gameTarget.processName || '');
  setControlValueIfIdle(dom.automationTargetRequireForeground, Boolean(gameTarget.requireForegroundForInput), 'checked');
  setControlValueIfIdle(dom.automationTargetPollInterval, gameTarget.windowPollIntervalMs ?? 500);
  setControlValueIfIdle(dom.automationFkeyCode, runtimeState.fKeyCode ?? 'F7');
  setControlValueIfIdle(dom.automationLeftInterval, runtimeState.leftClickIntervalMs ?? 80);
  setControlValueIfIdle(dom.automationRightInterval, runtimeState.rightClickIntervalMs ?? 120);
  setControlValueIfIdle(dom.automationF7Interval, runtimeState.f7IntervalMs ?? 500);
  setControlValueIfIdle(dom.automationJitter, runtimeState.jitterPercent ?? 15);
  setControlValueIfIdle(dom.automationHudEnabled, Boolean(overlayState.hudEnabled), 'checked');
  setControlValueIfIdle(dom.automationBuffsEnabled, Boolean(overlayState.buffOverlayEnabled), 'checked');
  setControlValueIfIdle(dom.automationCompactHud, Boolean(overlayState.compactHud), 'checked');
  setControlValueIfIdle(dom.automationShowActiveBuffsOnly, Boolean(overlayState.showOnlyActiveBuffs), 'checked');
  setControlValueIfIdle(dom.automationHideHudUnfocused, Boolean(overlayState.hideHudWhenGameUnfocused), 'checked');
  setControlValueIfIdle(dom.automationHideBuffsUnfocused, Boolean(overlayState.hideBuffOverlayWhenGameUnfocused), 'checked');
  setControlValueIfIdle(dom.automationAnchorMode, overlayState.anchorMode || 'game-relative');

  setNestedControlValues({
    label: dom.automationBuffStigmaLabel, durationSec: dom.automationBuffStigmaDuration,
    warn1Sec: dom.automationBuffStigmaWarn1, warn2Sec: dom.automationBuffStigmaWarn2,
  }, buffs.stigma || {});
  setNestedControlValues({
    label: dom.automationBuffShieldLabel, durationSec: dom.automationBuffShieldDuration,
    warn1Sec: dom.automationBuffShieldWarn1, warn2Sec: dom.automationBuffShieldWarn2,
  }, buffs.shield || {});
  setNestedControlValues({
    label: dom.automationBuffInvisibilityLabel, durationSec: dom.automationBuffInvisibilityDuration,
    warn1Sec: dom.automationBuffInvisibilityWarn1, warn2Sec: dom.automationBuffInvisibilityWarn2,
  }, buffs.invisibility || {});

  setControlValueIfIdle(dom.automationBuffStigmaVisible, Boolean(buffs.stigma?.visibleInOverlay), 'checked');
  setControlValueIfIdle(dom.automationBuffShieldVisible, Boolean(buffs.shield?.visibleInOverlay), 'checked');
  setControlValueIfIdle(dom.automationBuffInvisibilityVisible, Boolean(buffs.invisibility?.visibleInOverlay), 'checked');
  setControlValueIfIdle(dom.automationBuffStigmaMode, buffs.stigma?.countMode || 'countdown');
  setControlValueIfIdle(dom.automationBuffShieldMode, buffs.shield?.countMode || 'countdown');
  setControlValueIfIdle(dom.automationBuffInvisibilityMode, buffs.invisibility?.countMode || 'countdown');

  setControlValueIfIdle(dom.automationHotkeyMaster, hotkeys.masterToggle?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyEmergency, hotkeys.emergencyStop?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyLeft, hotkeys.leftToggle?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyRight, hotkeys.rightToggle?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyF7, hotkeys.f7Toggle?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyShift, hotkeys.shiftToggle?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyCtrl, hotkeys.ctrlToggle?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyStigma, hotkeys.stigmaActivate?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyShield, hotkeys.shieldActivate?.binding || '');
  setControlValueIfIdle(dom.automationHotkeyInvisibility, hotkeys.invisibilityActivate?.binding || '');

  if (dom.automationToggleLeft)  dom.automationToggleLeft.textContent  = `Left ${runtimeState.leftClickerEnabled  ? 'ON' : 'OFF'}`;
  if (dom.automationToggleRight) dom.automationToggleRight.textContent = `Right ${runtimeState.rightClickerEnabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleF7)    dom.automationToggleF7.textContent    = `F-Key ${runtimeState.f7Enabled           ? 'ON' : 'OFF'}`;
  if (dom.automationToggleShift) dom.automationToggleShift.textContent = `Shift ${runtimeState.shiftHeldEnabled    ? 'ON' : 'OFF'}`;
  if (dom.automationToggleCtrl)  dom.automationToggleCtrl.textContent  = `Ctrl ${runtimeState.ctrlHeldEnabled      ? 'ON' : 'OFF'}`;

  if (dom.automationProfile) {
    const profiles = nextState.profilesSummary || [];
    const previous = dom.automationProfile.value;
    dom.automationProfile.innerHTML = profiles
      .map(p => `<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`)
      .join('');
    dom.automationProfile.value = nextState.activeProfileId || previous;
  }

  if (dom.automationBuffList) {
    const configuredBuffs = activeProfile.buffs || {};
    const runtimeBuffs    = nextState.buffRuntimeState || {};
    dom.automationBuffList.innerHTML = Object.keys(configuredBuffs).map(buffId => {
      const config  = configuredBuffs[buffId];
      const runtime = runtimeBuffs[buffId] || {};
      return `
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-bottom:8px;">
          <div>
            <div style="font-size:11px;color:var(--text);">${escHtml(config.label)}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-dim);">${escHtml(runtime.displayText || 'OFF')}</div>
          </div>
          <button class="btn-primary automation-buff-toggle" data-buff-id="${escHtml(buffId)}" style="padding:6px 8px;">${runtime.active ? 'Stop' : 'Start'}</button>
          <button class="btn-clear automation-buff-pause" data-buff-id="${escHtml(buffId)}" style="padding:6px 8px;">${runtime.paused ? 'Resume' : 'Pause'}</button>
        </div>
      `;
    }).join('');

    dom.automationBuffList.querySelectorAll('.automation-buff-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.electronAPI?.automation?.toggleBuff?.(btn.dataset.buffId);
        pushAutomationLog(`buff ${btn.dataset.buffId} toggled`);
        void refreshAutomationState();
      });
    });
    dom.automationBuffList.querySelectorAll('.automation-buff-pause').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.electronAPI?.automation?.pauseBuff?.(btn.dataset.buffId);
        pushAutomationLog(`buff ${btn.dataset.buffId} pause toggled`);
        void refreshAutomationState();
      });
    });
  }

  if (nextState.lastError?.message) pushAutomationLog(`error: ${nextState.lastError.message}`);
}

export async function refreshAutomationState() {
  if (!window.electronAPI?.automation?.getState) return;
  try {
    renderAutomationState(await window.electronAPI.automation.getState());
  } catch (err) {
    pushAutomationLog(`refresh failed: ${err.message}`);
  }
}

async function runAutomationTest(action) {
  try {
    const result = await window.electronAPI?.automation?.testAction?.(action, {});
    if (result?.ok) {
      const parts = [];
      if (result.result?.focusAttempted) parts.push(`focus=${result.result?.focusResult?.activated ? 'ok' : 'failed'}`);
      const detailSummary = formatAutomationDetailSummary(result.result?.details);
      if (detailSummary) {
        parts.push(detailSummary);
      } else {
        const targetSummary = formatAutomationTargetSummary(result.result?.target);
        if (targetSummary) parts.push(targetSummary);
      }
      pushAutomationLog(`test ${action}: ok${parts.length ? ` | ${parts.join(' | ')}` : ''}`);
      setStatus(`Automation test ${action} sent`, 'ok');
    } else {
      pushAutomationLog(`test ${action}: ${result?.error?.message || 'failed'}`);
      setStatus(`Automation test ${action} failed`, 'warn');
    }
  } catch (err) {
    pushAutomationLog(`test ${action}: ${err.message}`);
    setStatus(`Automation test ${action} error`, 'error');
  }
}

async function toggleAutomationRuntime(toggleId, currentValue) {
  try {
    if (state.automationState?.runtimeState) {
      state.automationState.runtimeState[toggleId] = !currentValue;
      renderAutomationState(state.automationState);
    }
    await window.electronAPI?.automation?.setRuntimeToggle?.(toggleId, !currentValue);
    pushAutomationLog(`${toggleId} set to ${!currentValue ? 'on' : 'off'}`);
  } catch (err) {
    pushAutomationLog(`${toggleId} failed: ${err.message}`);
    setStatus(`Automation toggle ${toggleId} failed`, 'error');
    void refreshAutomationState();
  }
}

export function setup() {
  // Automation hotkey capture fields
  setupHotkeyCapture(dom.automationHotkeyMaster,       'automation');
  setupHotkeyCapture(dom.automationHotkeyEmergency,    'automation');
  setupHotkeyCapture(dom.automationHotkeyLeft,         'automation');
  setupHotkeyCapture(dom.automationHotkeyRight,        'automation');
  setupHotkeyCapture(dom.automationHotkeyF7,           'automation');
  setupHotkeyCapture(dom.automationHotkeyShift,        'automation');
  setupHotkeyCapture(dom.automationHotkeyCtrl,         'automation');
  setupHotkeyCapture(dom.automationHotkeyStigma,       'automation');
  setupHotkeyCapture(dom.automationHotkeyShield,       'automation');
  setupHotkeyCapture(dom.automationHotkeyInvisibility, 'automation');

  dom.automationRefreshBtn?.addEventListener('click', () => { void refreshAutomationState(); });

  dom.automationRestartBtn?.addEventListener('click', async () => {
    await window.electronAPI?.automation?.restartHelper?.();
    pushAutomationLog('helper restart requested');
    void refreshAutomationState();
  });

  dom.automationMasterBtn?.addEventListener('click', async () => {
    const next = !state.automationState?.runtimeState?.masterEnabled;
    await window.electronAPI?.automation?.setMasterEnabled?.(next);
    pushAutomationLog(`master set to ${next ? 'on' : 'off'}`);
    void refreshAutomationState();
  });

  dom.automationStopBtn?.addEventListener('click', async () => {
    await window.electronAPI?.automation?.emergencyStop?.();
    pushAutomationLog('emergency stop requested');
    void refreshAutomationState();
  });

  dom.automationToggleLeft?.addEventListener('click',  () => void toggleAutomationRuntime('leftClickerEnabled',  Boolean(state.automationState?.runtimeState?.leftClickerEnabled)));
  dom.automationToggleRight?.addEventListener('click', () => void toggleAutomationRuntime('rightClickerEnabled', Boolean(state.automationState?.runtimeState?.rightClickerEnabled)));
  dom.automationToggleF7?.addEventListener('click',    () => void toggleAutomationRuntime('f7Enabled',           Boolean(state.automationState?.runtimeState?.f7Enabled)));
  dom.automationToggleShift?.addEventListener('click', () => void toggleAutomationRuntime('shiftHeldEnabled',    Boolean(state.automationState?.runtimeState?.shiftHeldEnabled)));
  dom.automationToggleCtrl?.addEventListener('click',  () => void toggleAutomationRuntime('ctrlHeldEnabled',     Boolean(state.automationState?.runtimeState?.ctrlHeldEnabled)));

  dom.automationTestLeft?.addEventListener('click',    () => void runAutomationTest('left'));
  dom.automationTestRight?.addEventListener('click',   () => void runAutomationTest('right'));
  dom.automationTestF7?.addEventListener('click',      () => void runAutomationTest('f7'));
  dom.automationTestRelease?.addEventListener('click', () => void runAutomationTest('release'));

  dom.automationCopyLog?.addEventListener('click', () => {
    navigator.clipboard?.writeText(state.automationLog.join('\n')).catch(() => {});
  });

  dom.automationProfile?.addEventListener('change', async () => {
    if (!dom.automationProfile.value) return;
    await window.electronAPI?.automation?.setActiveProfile?.(dom.automationProfile.value);
    pushAutomationLog(`active profile set to ${dom.automationProfile.selectedOptions[0]?.textContent || dom.automationProfile.value}`);
    void refreshAutomationState();
  });

  dom.automationProfileNew?.addEventListener('click', async () => {
    await window.electronAPI?.automation?.createProfile?.({ name: `Profile ${new Date().toLocaleTimeString()}` });
    pushAutomationLog('profile created');
    void refreshAutomationState();
  });

  dom.automationProfileDelete?.addEventListener('click', async () => {
    if (!state.automationState?.activeProfileId) return;
    try {
      await window.electronAPI?.automation?.deleteProfile?.(state.automationState.activeProfileId);
      pushAutomationLog('profile deleted');
      void refreshAutomationState();
    } catch (err) {
      pushAutomationLog(`delete profile failed: ${err.message}`);
    }
  });

  dom.automationProfileExport?.addEventListener('click', async () => {
    const filePath = await window.electronAPI?.automation?.exportProfileDialog?.();
    if (filePath) {
      pushAutomationLog(`profile exported to ${filePath}`);
      setStatus('Automation profile exported', 'ok');
    }
  });

  dom.automationProfileImport?.addEventListener('click', async () => {
    const imported = await window.electronAPI?.automation?.importProfileDialog?.();
    if (Array.isArray(imported) && imported.length) {
      pushAutomationLog(`imported ${imported.length} profile(s)`);
      setStatus('Automation profiles imported', 'ok');
      void refreshAutomationState();
    }
  });

  dom.automationSaveRuntime?.addEventListener('click', async () => {
    const profileId = state.automationState?.activeProfileId;
    const profile   = state.automationState?.activeProfile;
    const runtime   = state.automationState?.runtimeState;
    if (!profileId || !profile) return;
    await window.electronAPI?.automation?.updateProfile?.(profileId, {
      runtime: {
        ...profile.runtime, ...runtime,
        fKeyCode:            dom.automationFkeyCode?.value         || runtime?.fKeyCode            || profile.runtime.fKeyCode,
        leftClickIntervalMs: parseInt(dom.automationLeftInterval.value,  10) || runtime?.leftClickIntervalMs  || profile.runtime.leftClickIntervalMs,
        rightClickIntervalMs:parseInt(dom.automationRightInterval.value, 10) || runtime?.rightClickIntervalMs || profile.runtime.rightClickIntervalMs,
        f7IntervalMs:        parseInt(dom.automationF7Interval.value,    10) || runtime?.f7IntervalMs         || profile.runtime.f7IntervalMs,
        jitterPercent:       parseInt(dom.automationJitter.value,        10) || runtime?.jitterPercent        || profile.runtime.jitterPercent,
      },
    });
    pushAutomationLog('runtime settings saved');
    void refreshAutomationState();
  });

  dom.automationSaveProfileTarget?.addEventListener('click', async () => {
    const profileId = state.automationState?.activeProfileId;
    const profile   = state.automationState?.activeProfile;
    if (!profileId || !profile) return;
    await window.electronAPI?.automation?.updateProfile?.(profileId, {
      name:        dom.automationProfileName.value.trim() || profile.name,
      description: dom.automationProfileDescription.value.trim(),
      gameTarget: {
        ...profile.gameTarget,
        windowTitlePattern: dom.automationTargetTitle.value.trim() || profile.gameTarget.windowTitlePattern,
        matchMode:          dom.automationTargetMatchMode.value,
        processName:        dom.automationTargetProcessName.value.trim(),
        requireForegroundForInput: Boolean(dom.automationTargetRequireForeground.checked),
        windowPollIntervalMs: parseInt(dom.automationTargetPollInterval.value, 10) || profile.gameTarget.windowPollIntervalMs,
      },
    });
    pushAutomationLog('profile target saved');
    void refreshAutomationState();
  });

  dom.automationSaveBuffs?.addEventListener('click', async () => {
    const profileId = state.automationState?.activeProfileId;
    const profile   = state.automationState?.activeProfile;
    if (!profileId || !profile) return;
    await window.electronAPI?.automation?.updateProfile?.(profileId, {
      buffs: {
        ...profile.buffs,
        stigma: {
          ...profile.buffs.stigma,
          label:           dom.automationBuffStigmaLabel.value.trim()         || profile.buffs.stigma.label,
          durationSec:     parseInt(dom.automationBuffStigmaDuration.value,   10) || profile.buffs.stigma.durationSec,
          warn1Sec:        parseInt(dom.automationBuffStigmaWarn1.value,      10) || profile.buffs.stigma.warn1Sec,
          warn2Sec:        parseInt(dom.automationBuffStigmaWarn2.value,      10) || profile.buffs.stigma.warn2Sec,
          visibleInOverlay:Boolean(dom.automationBuffStigmaVisible.checked),
          countMode:       dom.automationBuffStigmaMode?.value               || profile.buffs.stigma.countMode || 'countdown',
        },
        shield: {
          ...profile.buffs.shield,
          label:           dom.automationBuffShieldLabel.value.trim()         || profile.buffs.shield.label,
          durationSec:     parseInt(dom.automationBuffShieldDuration.value,   10) || profile.buffs.shield.durationSec,
          warn1Sec:        parseInt(dom.automationBuffShieldWarn1.value,      10) || profile.buffs.shield.warn1Sec,
          warn2Sec:        parseInt(dom.automationBuffShieldWarn2.value,      10) || profile.buffs.shield.warn2Sec,
          visibleInOverlay:Boolean(dom.automationBuffShieldVisible.checked),
          countMode:       dom.automationBuffShieldMode?.value               || profile.buffs.shield.countMode || 'countdown',
        },
        invisibility: {
          ...profile.buffs.invisibility,
          label:           dom.automationBuffInvisibilityLabel.value.trim()   || profile.buffs.invisibility.label,
          durationSec:     parseInt(dom.automationBuffInvisibilityDuration.value, 10) || profile.buffs.invisibility.durationSec,
          warn1Sec:        parseInt(dom.automationBuffInvisibilityWarn1.value, 10) || profile.buffs.invisibility.warn1Sec,
          warn2Sec:        parseInt(dom.automationBuffInvisibilityWarn2.value, 10) || profile.buffs.invisibility.warn2Sec,
          visibleInOverlay:Boolean(dom.automationBuffInvisibilityVisible.checked),
          countMode:       dom.automationBuffInvisibilityMode?.value         || profile.buffs.invisibility.countMode || 'countdown',
        },
      },
    });
    pushAutomationLog('buff configuration saved');
    void refreshAutomationState();
  });

  dom.automationSaveHotkeys?.addEventListener('click', async () => {
    const profileId = state.automationState?.activeProfileId;
    const profile   = state.automationState?.activeProfile;
    if (!profileId || !profile) return;
    const withBinding = (entry, binding) => ({ ...entry, binding, enabled: Boolean(binding) });
    await window.electronAPI?.automation?.updateProfile?.(profileId, {
      hotkeys: {
        ...profile.hotkeys,
        masterToggle:         withBinding(profile.hotkeys.masterToggle,         dom.automationHotkeyMaster.value),
        emergencyStop:        withBinding(profile.hotkeys.emergencyStop,        dom.automationHotkeyEmergency.value),
        leftToggle:           withBinding(profile.hotkeys.leftToggle,           dom.automationHotkeyLeft.value),
        rightToggle:          withBinding(profile.hotkeys.rightToggle,          dom.automationHotkeyRight.value),
        f7Toggle:             withBinding(profile.hotkeys.f7Toggle,             dom.automationHotkeyF7.value),
        shiftToggle:          withBinding(profile.hotkeys.shiftToggle,          dom.automationHotkeyShift.value),
        ctrlToggle:           withBinding(profile.hotkeys.ctrlToggle,           dom.automationHotkeyCtrl.value),
        stigmaActivate:       withBinding(profile.hotkeys.stigmaActivate,       dom.automationHotkeyStigma.value),
        shieldActivate:       withBinding(profile.hotkeys.shieldActivate,       dom.automationHotkeyShield.value),
        invisibilityActivate: withBinding(profile.hotkeys.invisibilityActivate, dom.automationHotkeyInvisibility.value),
      },
    });
    pushAutomationLog('hotkeys saved');
    void refreshAutomationState();
  });

  dom.automationSaveOverlays?.addEventListener('click', async () => {
    const profileId = state.automationState?.activeProfileId;
    const profile   = state.automationState?.activeProfile;
    if (!profileId || !profile) return;
    await window.electronAPI?.automation?.updateProfile?.(profileId, {
      overlays: {
        ...profile.overlays,
        hudEnabled:                     Boolean(dom.automationHudEnabled.checked),
        buffOverlayEnabled:             Boolean(dom.automationBuffsEnabled.checked),
        compactHud:                     Boolean(dom.automationCompactHud.checked),
        showOnlyActiveBuffs:            Boolean(dom.automationShowActiveBuffsOnly.checked),
        hideHudWhenGameUnfocused:       Boolean(dom.automationHideHudUnfocused.checked),
        hideBuffOverlayWhenGameUnfocused:Boolean(dom.automationHideBuffsUnfocused.checked),
        anchorMode:                     dom.automationAnchorMode.value,
      },
    });
    pushAutomationLog('overlay preferences saved');
    void refreshAutomationState();
  });

  // Subscribe to live state updates from the main process
  window.electronAPI?.automation?.onStateChanged?.(nextState => renderAutomationState(nextState));
}
