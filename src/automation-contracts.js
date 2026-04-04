'use strict';

const { randomUUID } = require('crypto');

const AUTOMATION_SCHEMA_VERSION = 1;

const HOTKEY_IDS = Object.freeze({
  MASTER_TOGGLE: 'masterToggle',
  LEFT_TOGGLE: 'leftToggle',
  RIGHT_TOGGLE: 'rightToggle',
  F7_TOGGLE: 'f7Toggle',
  SHIFT_TOGGLE: 'shiftToggle',
  CTRL_TOGGLE: 'ctrlToggle',
  EMERGENCY_STOP: 'emergencyStop',
  STIGMA_ACTIVATE: 'stigmaActivate',
  SHIELD_ACTIVATE: 'shieldActivate',
  INVISIBILITY_ACTIVATE: 'invisibilityActivate',
  STIGMA_PAUSE: 'stigmaPause',
  SHIELD_PAUSE: 'shieldPause',
  INVISIBILITY_PAUSE: 'invisibilityPause',
});

const RUNTIME_TOGGLE_IDS = Object.freeze({
  MASTER: 'masterEnabled',
  LEFT: 'leftClickerEnabled',
  RIGHT: 'rightClickerEnabled',
  F7: 'f7Enabled',
  SHIFT: 'shiftHeldEnabled',
  CTRL: 'ctrlHeldEnabled',
});

const HELPER_CAPABILITIES = Object.freeze({
  TARGET_LOOKUP: 'targetLookup',
  FOREGROUND_CHECK: 'foregroundCheck',
  LEFT_CLICK: 'leftClick',
  RIGHT_CLICK: 'rightClick',
  F7_PRESS: 'f7Press',
  SHIFT_HOLD: 'shiftHold',
  CTRL_HOLD: 'ctrlHold',
  HOTKEY_REGISTRATION: 'hotkeyRegistration',
});

const TEST_ACTIONS = new Set([
  'leftClick',
  'rightClick',
  'f7Press',
  'shiftDown',
  'shiftUp',
  'ctrlDown',
  'ctrlUp',
  'releaseModifiers',
]);

const DEFAULT_BUFFS = Object.freeze({
  stigma: Object.freeze({
    id: 'stigma',
    label: 'STIGMA',
    durationSec: 80,
    countMode: 'countdown',
    warn1Sec: 10,
    warn2Sec: 5,
    iconPath: '',
    visibleInOverlay: true,
    activationHotkeyId: HOTKEY_IDS.STIGMA_ACTIVATE,
    pauseHotkeyId: HOTKEY_IDS.STIGMA_PAUSE,
  }),
  shield: Object.freeze({
    id: 'shield',
    label: 'SHIELD',
    durationSec: 80,
    countMode: 'countdown',
    warn1Sec: 10,
    warn2Sec: 5,
    iconPath: '',
    visibleInOverlay: true,
    activationHotkeyId: HOTKEY_IDS.SHIELD_ACTIVATE,
    pauseHotkeyId: HOTKEY_IDS.SHIELD_PAUSE,
  }),
  invisibility: Object.freeze({
    id: 'invisibility',
    label: 'INVISIBILITY',
    durationSec: 80,
    countMode: 'countdown',
    warn1Sec: 10,
    warn2Sec: 5,
    iconPath: '',
    visibleInOverlay: true,
    activationHotkeyId: HOTKEY_IDS.INVISIBILITY_ACTIVATE,
    pauseHotkeyId: HOTKEY_IDS.INVISIBILITY_PAUSE,
  }),
});

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInteger(value, fallback, min = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.trunc(number));
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeWindowTitlePattern(value, fallback = 'ClassicConquer') {
  const raw = normalizeString(value, fallback).trim();
  if (!raw) {
    return fallback;
  }

  if (/classicconquer/i.test(raw)) {
    return 'ClassicConquer';
  }

  return raw;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function createDefaultHotkeys() {
  return {
    [HOTKEY_IDS.MASTER_TOGGLE]: { binding: 'MouseMiddle', enabled: false, passThrough: true, scope: 'global', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.LEFT_TOGGLE]: { binding: 'Semicolon', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.RIGHT_TOGGLE]: { binding: 'Quote', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.F7_TOGGLE]: { binding: 'Comma', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.SHIFT_TOGGLE]: { binding: 'BracketLeft', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.CTRL_TOGGLE]: { binding: 'BracketRight', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.EMERGENCY_STOP]: { binding: 'Escape', enabled: false, passThrough: false, scope: 'global', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.STIGMA_ACTIVATE]: { binding: 'F1', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.SHIELD_ACTIVATE]: { binding: 'F2', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.INVISIBILITY_ACTIVATE]: { binding: 'F3', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.STIGMA_PAUSE]: { binding: '', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.SHIELD_PAUSE]: { binding: '', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
    [HOTKEY_IDS.INVISIBILITY_PAUSE]: { binding: '', enabled: false, passThrough: true, scope: 'game-focused', repeatPolicy: 'single-fire' },
  };
}

function normalizeHotkeyEntry(entry, fallback) {
  const source = isPlainObject(entry) ? entry : {};
  return {
    binding: normalizeString(source.binding, fallback.binding),
    enabled: normalizeBoolean(source.enabled, fallback.enabled),
    passThrough: normalizeBoolean(source.passThrough, fallback.passThrough),
    scope: source.scope === 'global' || source.scope === 'game-focused' ? source.scope : fallback.scope,
    repeatPolicy: source.repeatPolicy === 'single-fire' || source.repeatPolicy === 'repeat-while-held'
      ? source.repeatPolicy
      : fallback.repeatPolicy,
  };
}

function normalizeHotkeys(hotkeys = {}) {
  const defaults = createDefaultHotkeys();
  const normalized = {};
  for (const [hotkeyId, fallback] of Object.entries(defaults)) {
    normalized[hotkeyId] = normalizeHotkeyEntry(hotkeys[hotkeyId], fallback);
  }
  return normalized;
}

function normalizeGameTarget(gameTarget = {}) {
  const source = isPlainObject(gameTarget) ? gameTarget : {};
  return {
    matchMode: ['process-first', 'title-only', 'manual-window-select'].includes(source.matchMode)
      ? source.matchMode
      : 'process-first',
    processName: normalizeString(source.processName, ''),
    windowTitlePattern: normalizeWindowTitlePattern(source.windowTitlePattern, 'ClassicConquer'),
    requireForegroundForInput: normalizeBoolean(source.requireForegroundForInput, true),
    windowPollIntervalMs: clampInteger(source.windowPollIntervalMs, 500, 50),
    foregroundPollMode: source.foregroundPollMode === 'fast' ? 'fast' : 'fast',
  };
}

function normalizeRuntime(runtime = {}) {
  const source = isPlainObject(runtime) ? runtime : {};
  return {
    masterEnabled: normalizeBoolean(source.masterEnabled, false),
    leftClickerEnabled: normalizeBoolean(source.leftClickerEnabled, false),
    rightClickerEnabled: normalizeBoolean(source.rightClickerEnabled, false),
    f7Enabled: normalizeBoolean(source.f7Enabled, false),
    leftClickIntervalMs: clampInteger(source.leftClickIntervalMs, 80, 1),
    rightClickIntervalMs: clampInteger(source.rightClickIntervalMs, 120, 1),
    f7IntervalMs: clampInteger(source.f7IntervalMs, 500, 1),
    jitterPercent: clampInteger(source.jitterPercent, 15, 0),
    shiftHeldEnabled: normalizeBoolean(source.shiftHeldEnabled, false),
    ctrlHeldEnabled: normalizeBoolean(source.ctrlHeldEnabled, false),
    safeStopReleasesModifiers: normalizeBoolean(source.safeStopReleasesModifiers, true),
    clickMode: normalizeString(source.clickMode, 'send-input'),
  };
}

function normalizeBuff(buffId, buff = {}) {
  const fallback = DEFAULT_BUFFS[buffId] || {
    id: buffId,
    label: buffId.toUpperCase(),
    durationSec: 80,
    countMode: 'countdown',
    warn1Sec: 10,
    warn2Sec: 5,
    iconPath: '',
    visibleInOverlay: true,
    activationHotkeyId: '',
    pauseHotkeyId: '',
  };
  const source = isPlainObject(buff) ? buff : {};
  return {
    id: fallback.id,
    label: normalizeString(source.label, fallback.label),
    durationSec: clampInteger(source.durationSec, fallback.durationSec, 1),
    countMode: source.countMode === 'countup' ? 'countup' : fallback.countMode,
    warn1Sec: clampInteger(source.warn1Sec, fallback.warn1Sec, 1),
    warn2Sec: clampInteger(source.warn2Sec, fallback.warn2Sec, 1),
    iconPath: normalizeString(source.iconPath, fallback.iconPath),
    visibleInOverlay: normalizeBoolean(source.visibleInOverlay, fallback.visibleInOverlay),
    activationHotkeyId: normalizeString(source.activationHotkeyId, fallback.activationHotkeyId),
    pauseHotkeyId: normalizeString(source.pauseHotkeyId, fallback.pauseHotkeyId),
  };
}

function normalizeBuffs(buffs = {}) {
  const normalized = {};
  for (const buffId of Object.keys(DEFAULT_BUFFS)) {
    normalized[buffId] = normalizeBuff(buffId, buffs[buffId]);
  }
  return normalized;
}

function normalizeOverlays(overlays = {}) {
  const source = isPlainObject(overlays) ? overlays : {};
  const normalizeOffset = value => {
    const input = isPlainObject(value) ? value : {};
    return {
      x: clampInteger(input.x, 0),
      y: clampInteger(input.y, 0),
    };
  };
  return {
    hudEnabled: normalizeBoolean(source.hudEnabled, true),
    buffOverlayEnabled: normalizeBoolean(source.buffOverlayEnabled, true),
    hideHudWhenGameUnfocused: normalizeBoolean(source.hideHudWhenGameUnfocused, false),
    hideBuffOverlayWhenGameUnfocused: normalizeBoolean(source.hideBuffOverlayWhenGameUnfocused, false),
    hudOpacity: clampInteger(source.hudOpacity, 85, 0),
    buffOverlayOpacity: clampInteger(source.buffOverlayOpacity, 90, 0),
    anchorMode: source.anchorMode === 'screen-relative' ? 'screen-relative' : 'game-relative',
    hudOffset: normalizeOffset(source.hudOffset),
    buffOffset: normalizeOffset(source.buffOffset),
    showOnlyActiveBuffs: normalizeBoolean(source.showOnlyActiveBuffs, true),
    compactHud: normalizeBoolean(source.compactHud, true),
  };
}

function createDefaultProfile(overrides = {}) {
  const source = isPlainObject(overrides) ? overrides : {};
  const now = new Date().toISOString();
  return {
    id: normalizeString(source.id, randomUUID()),
    name: normalizeString(source.name, 'Default Automation Profile'),
    description: normalizeString(source.description, ''),
    createdAt: normalizeString(source.createdAt, now),
    updatedAt: now,
    enabled: normalizeBoolean(source.enabled, true),
    gameTarget: normalizeGameTarget(source.gameTarget),
    runtime: normalizeRuntime(source.runtime),
    hotkeys: normalizeHotkeys(source.hotkeys),
    buffs: normalizeBuffs(source.buffs),
    overlays: normalizeOverlays(source.overlays),
    diagnostics: isPlainObject(source.diagnostics) ? clone(source.diagnostics) : {},
  };
}

function normalizeProfile(profile = {}) {
  return createDefaultProfile(profile);
}

function createDefaultDocument(overrides = {}) {
  const source = isPlainObject(overrides) ? overrides : {};
  const profiles = Array.isArray(source.profiles) && source.profiles.length > 0
    ? source.profiles.map(normalizeProfile)
    : [createDefaultProfile()];
  const activeProfileId = profiles.some(profile => profile.id === source.activeProfileId)
    ? source.activeProfileId
    : profiles[0].id;

  return {
    schemaVersion: clampInteger(source.schemaVersion, AUTOMATION_SCHEMA_VERSION, 1),
    exportedAt: normalizeString(source.exportedAt, ''),
    appVersion: normalizeString(source.appVersion, ''),
    globalPreferences: {
      helperLaunchMode: source.globalPreferences?.helperLaunchMode === 'elevated-preferred'
        ? 'elevated-preferred'
        : 'normal',
      logLevel: ['error', 'warn', 'info', 'debug'].includes(source.globalPreferences?.logLevel)
        ? source.globalPreferences.logLevel
        : 'info',
      helperRestartOnCrash: normalizeBoolean(source.globalPreferences?.helperRestartOnCrash, true),
      helperHeartbeatTimeoutMs: clampInteger(source.globalPreferences?.helperHeartbeatTimeoutMs, 10000, 1000),
      defaultGameTargetId: normalizeString(source.globalPreferences?.defaultGameTargetId, ''),
      hideHudWhenGameUnfocused: normalizeBoolean(source.globalPreferences?.hideHudWhenGameUnfocused, false),
      hideBuffOverlayWhenGameUnfocused: normalizeBoolean(source.globalPreferences?.hideBuffOverlayWhenGameUnfocused, false),
      profileExportIncludesAbsoluteIconPaths: normalizeBoolean(source.globalPreferences?.profileExportIncludesAbsoluteIconPaths, false),
    },
    profiles,
    activeProfileId,
  };
}

function normalizeDocument(document = {}) {
  return createDefaultDocument(document);
}

function validateTestAction(action) {
  if (!TEST_ACTIONS.has(action)) {
    const error = new Error(`Unknown automation test action: ${action}`);
    error.code = 'AUTOMATION_INVALID_TEST_ACTION';
    throw error;
  }
}

function validateRuntimeToggleId(toggleId) {
  if (!Object.values(RUNTIME_TOGGLE_IDS).includes(toggleId)) {
    const error = new Error(`Unknown automation runtime toggle: ${toggleId}`);
    error.code = 'AUTOMATION_INVALID_TOGGLE';
    throw error;
  }
}

function createEmptyBuffRuntimeState(buffs = DEFAULT_BUFFS) {
  return Object.fromEntries(Object.keys(buffs).map(buffId => [buffId, {
    active: false,
    paused: false,
    startedAt: null,
    pausedAt: null,
    remainingMs: 0,
    elapsedMs: 0,
    displayText: 'OFF',
    lastAlertStage: '',
  }]));
}

function createInitialAutomationState(document) {
  const activeProfile = document.profiles.find(profile => profile.id === document.activeProfileId) || document.profiles[0];
  return {
    activeProfileId: activeProfile.id,
    profilesSummary: document.profiles.map(profile => ({ id: profile.id, name: profile.name, enabled: profile.enabled, updatedAt: profile.updatedAt })),
    helperStatus: {
      lifecycle: 'idle',
      isRunning: false,
      pid: null,
      transport: 'stdio-json',
      capabilities: [],
      lastHeartbeatAt: null,
      lastError: null,
    },
    gameAttachmentStatus: {
      attached: false,
      isForeground: false,
      target: clone(activeProfile.gameTarget),
      updatedAt: null,
    },
    runtimeState: clone(activeProfile.runtime),
    buffRuntimeState: createEmptyBuffRuntimeState(activeProfile.buffs),
    overlayState: clone(activeProfile.overlays),
    lastError: null,
  };
}

module.exports = {
  AUTOMATION_SCHEMA_VERSION,
  HOTKEY_IDS,
  RUNTIME_TOGGLE_IDS,
  HELPER_CAPABILITIES,
  TEST_ACTIONS,
  DEFAULT_BUFFS,
  clone,
  createDefaultDocument,
  createDefaultHotkeys,
  createDefaultProfile,
  createEmptyBuffRuntimeState,
  createInitialAutomationState,
  isPlainObject,
  normalizeDocument,
  normalizeProfile,
  validateRuntimeToggleId,
  validateTestAction,
};
