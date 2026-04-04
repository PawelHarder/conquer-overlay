'use strict';

const { EventEmitter } = require('events');
const {
  clone,
  createEmptyBuffRuntimeState,
  createInitialAutomationState,
  HOTKEY_IDS,
  RUNTIME_TOGGLE_IDS,
  validateRuntimeToggleId,
  validateTestAction,
} = require('./automation-contracts');

class AutomationService extends EventEmitter {
  constructor(options = {}) {
    super();
    const { profileStore, helperClient } = options;
    if (!profileStore) {
      throw new Error('AutomationService requires a profileStore');
    }
    if (!helperClient) {
      throw new Error('AutomationService requires a helperClient');
    }

    this.profileStore = profileStore;
    this.helperClient = helperClient;
    this.document = this.profileStore.load();
    this.state = createInitialAutomationState(this.document);
    this.activeProfile = this.profileStore.getActiveProfile();
    this.buffTickTimer = null;
    this.attachHelperEvents();
    this.startBuffTickLoop();
  }

  async init() {
    await this.helperClient.start();
    await this.syncProfileToHelper();
    this.emitStateChanged();
    return this.getState();
  }

  async sendHelperRequest(type, payload, { timeoutMs = 10000, retries = 0 } = {}) {
    let attempt = 0;
    while (true) {
      try {
        if (!this.helperClient.child || this.helperClient.getStatus().lifecycle === 'stopped') {
          await this.helperClient.start();
        }
        return await this.helperClient.sendRequest(type, payload, timeoutMs);
      } catch (error) {
        if (attempt >= retries) {
          throw error;
        }
        attempt += 1;
      }
    }
  }

  async dispose() {
    if (this.buffTickTimer) {
      clearInterval(this.buffTickTimer);
      this.buffTickTimer = null;
    }
    await this.helperClient.stop();
  }

  getState() {
    return clone(this.state);
  }

  listProfiles() {
    return this.profileStore.listProfilesSummary();
  }

  getProfile(profileId) {
    return this.profileStore.getProfile(profileId);
  }

  getActiveHotkeys() {
    return clone(this.profileStore.getActiveProfile().hotkeys);
  }

  createProfile(options) {
    const profile = this.profileStore.createProfile(options);
    this.reloadDocument();
    this.applyProfile(profile);
    return profile;
  }

  async updateProfile(profileId, changes) {
    const profile = this.profileStore.updateProfile(profileId, changes);
    this.reloadDocument();
    if (this.state.activeProfileId === profileId) {
      this.applyProfile(profile, { preserveRuntimeState: true, preserveBuffRuntimeState: true, preserveAttachmentStatus: true });
      await this.syncProfileToHelper();
    } else {
      this.state.profilesSummary = this.profileStore.listProfilesSummary();
      this.emitStateChanged();
    }
    return profile;
  }

  async deleteProfile(profileId) {
    this.profileStore.deleteProfile(profileId);
    this.reloadDocument();
    this.applyProfile(this.profileStore.getActiveProfile());
    await this.syncProfileToHelper();
    return this.getState();
  }

  async setActiveProfile(profileId) {
    const profile = this.profileStore.setActiveProfile(profileId);
    this.reloadDocument();
    this.applyProfile(profile);
    await this.syncProfileToHelper();
    return this.getState();
  }

  async setMasterEnabled(enabled) {
    this.state.runtimeState.masterEnabled = Boolean(enabled);
    this.emitStateChanged();
    await this.syncRuntimeToHelper();
    return this.getState();
  }

  async setRuntimeToggle(toggleId, enabled) {
    validateRuntimeToggleId(toggleId);
    this.state.runtimeState[toggleId] = Boolean(enabled);
    this.emitStateChanged();
    await this.syncRuntimeToHelper();
    return this.getState();
  }

  async focusTarget() {
    try {
      const result = await this.sendHelperRequest('focus-target', {}, { timeoutMs: 5000, retries: 1 });
      if (result?.target) {
        this.state.gameAttachmentStatus = {
          ...this.state.gameAttachmentStatus,
          ...result.target,
          updatedAt: new Date().toISOString(),
        };
      }
      this.state.lastError = null;
      this.emitStateChanged();
      return result;
    } catch (error) {
      this.setLastError(error);
      this.emitStateChanged();
      return { ok: false, error: { code: error.code || 'AUTOMATION_FOCUS_TARGET_FAILED', message: error.message } };
    }
  }

  async testAction(action, payload = {}) {
    validateTestAction(action);
    try {
      const result = await this.sendHelperRequest('perform-test-action', { action, ...payload }, { timeoutMs: 5000, retries: 1 });
      if (result?.target) {
        this.state.gameAttachmentStatus = {
          ...this.state.gameAttachmentStatus,
          ...result.target,
          updatedAt: new Date().toISOString(),
        };
      }
      this.state.lastError = null;
      this.emitStateChanged();
      return { ok: true, result };
    } catch (error) {
      this.setLastError(error);
      this.emitStateChanged();
      return { ok: false, error: { code: error.code || 'AUTOMATION_TEST_ACTION_FAILED', message: error.message } };
    }
  }

  async restartHelper() {
    await this.helperClient.restart();
    await this.syncProfileToHelper();
    return this.getState();
  }

  async emergencyStop() {
    this.state.runtimeState.masterEnabled = false;
    this.state.runtimeState.leftClickerEnabled = false;
    this.state.runtimeState.rightClickerEnabled = false;
    this.state.runtimeState.f7Enabled = false;
    this.state.runtimeState.shiftHeldEnabled = false;
    this.state.runtimeState.ctrlHeldEnabled = false;

    try {
      await this.sendHelperRequest('emergency-stop', {}, { timeoutMs: 3000, retries: 0 });
    } catch (error) {
      this.setLastError(error);
    }

    this.emit('helper-status', this.state.helperStatus);
    this.emitStateChanged();
    return this.getState();
  }

  async bindHotkey(hotkeyId, binding) {
    const profile = this.profileStore.getActiveProfile();
    if (!profile.hotkeys[hotkeyId]) {
      const error = new Error(`Unknown automation hotkey: ${hotkeyId}`);
      error.code = 'AUTOMATION_HOTKEY_NOT_FOUND';
      throw error;
    }

    const updatedProfile = await this.updateProfile(profile.id, {
      hotkeys: {
        ...profile.hotkeys,
        [hotkeyId]: {
          ...profile.hotkeys[hotkeyId],
          binding,
          enabled: Boolean(binding),
        },
      },
    });

    return { hotkeyId, binding: updatedProfile.hotkeys[hotkeyId].binding };
  }

  async triggerHotkey(hotkeyId) {
    switch (hotkeyId) {
      case HOTKEY_IDS.MASTER_TOGGLE:
        return this.setMasterEnabled(!this.state.runtimeState.masterEnabled);
      case HOTKEY_IDS.LEFT_TOGGLE:
        return this.setRuntimeToggle(RUNTIME_TOGGLE_IDS.LEFT, !this.state.runtimeState.leftClickerEnabled);
      case HOTKEY_IDS.RIGHT_TOGGLE:
        return this.setRuntimeToggle(RUNTIME_TOGGLE_IDS.RIGHT, !this.state.runtimeState.rightClickerEnabled);
      case HOTKEY_IDS.F7_TOGGLE:
        return this.setRuntimeToggle(RUNTIME_TOGGLE_IDS.F7, !this.state.runtimeState.f7Enabled);
      case HOTKEY_IDS.SHIFT_TOGGLE:
        return this.setRuntimeToggle(RUNTIME_TOGGLE_IDS.SHIFT, !this.state.runtimeState.shiftHeldEnabled);
      case HOTKEY_IDS.CTRL_TOGGLE:
        return this.setRuntimeToggle(RUNTIME_TOGGLE_IDS.CTRL, !this.state.runtimeState.ctrlHeldEnabled);
      case HOTKEY_IDS.EMERGENCY_STOP:
        return this.emergencyStop();
      case HOTKEY_IDS.STIGMA_ACTIVATE:
        return this.toggleBuff('stigma');
      case HOTKEY_IDS.SHIELD_ACTIVATE:
        return this.toggleBuff('shield');
      case HOTKEY_IDS.INVISIBILITY_ACTIVATE:
        return this.toggleBuff('invisibility');
      case HOTKEY_IDS.STIGMA_PAUSE:
        return this.pauseBuff('stigma');
      case HOTKEY_IDS.SHIELD_PAUSE:
        return this.pauseBuff('shield');
      case HOTKEY_IDS.INVISIBILITY_PAUSE:
        return this.pauseBuff('invisibility');
      default:
        this.emit('helper-message', {
          type: 'log',
          payload: { message: `Hotkey ${hotkeyId} triggered, but no action is implemented yet.` },
        });
        return this.getState();
    }
  }

  async setOverlayPreferences(changes = {}) {
    const activeProfile = this.profileStore.getActiveProfile();
    const profile = await this.updateProfile(activeProfile.id, {
      overlays: {
        ...activeProfile.overlays,
        ...changes,
      },
    });
    this.state.overlayState = clone(profile.overlays);
    this.emitStateChanged();
    return this.getState();
  }

  toggleBuff(buffId) {
    const config = this.activeProfile?.buffs?.[buffId];
    if (!config) {
      throw this.createAutomationError('AUTOMATION_BUFF_NOT_FOUND', `Unknown buff: ${buffId}`);
    }

    const current = this.state.buffRuntimeState[buffId] || createEmptyBuffRuntimeState({ [buffId]: config })[buffId];
    const now = Date.now();

    if (current.active) {
      this.state.buffRuntimeState[buffId] = {
        ...current,
        active: false,
        paused: false,
        startedAt: null,
        pausedAt: null,
        remainingMs: 0,
        elapsedMs: 0,
        displayText: 'OFF',
        lastAlertStage: '',
      };
    } else {
      this.state.buffRuntimeState[buffId] = {
        ...current,
        active: true,
        paused: false,
        startedAt: now,
        pausedAt: null,
        remainingMs: config.countMode === 'countdown' ? config.durationSec * 1000 : 0,
        elapsedMs: 0,
        displayText: config.countMode === 'countdown' ? `${config.durationSec}s` : '0s',
        lastAlertStage: '',
      };
    }

    this.emit('helper-message', {
      type: 'log',
      payload: { message: `${config.label} ${this.state.buffRuntimeState[buffId].active ? 'started' : 'stopped'}` },
    });
    this.emitStateChanged();
    return this.getState();
  }

  pauseBuff(buffId) {
    const config = this.activeProfile?.buffs?.[buffId];
    const current = this.state.buffRuntimeState[buffId];
    if (!config || !current?.active) {
      return this.getState();
    }

    const now = Date.now();
    if (current.paused) {
      const pausedDuration = now - (current.pausedAt || now);
      const resumedStartedAt = current.startedAt ? current.startedAt + pausedDuration : now;
      this.state.buffRuntimeState[buffId] = {
        ...current,
        paused: false,
        startedAt: resumedStartedAt,
        pausedAt: null,
      };
      this.emit('helper-message', { type: 'log', payload: { message: `${config.label} resumed` } });
    } else {
      this.state.buffRuntimeState[buffId] = {
        ...current,
        paused: true,
        pausedAt: now,
      };
      this.emit('helper-message', { type: 'log', payload: { message: `${config.label} paused` } });
    }

    this.emitStateChanged();
    return this.getState();
  }

  attachHelperEvents() {
    this.helperClient.on('status', status => {
      this.state.helperStatus = clone(status);
      this.emit('helper-status', this.state.helperStatus);
      this.emitStateChanged();
    });

    this.helperClient.on('message', message => {
      if (message.type === 'target-status') {
        this.state.gameAttachmentStatus = {
          ...this.state.gameAttachmentStatus,
          ...(message.payload || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      if (message.type === 'runtime-applied' && message.payload) {
        // Only merge target status from helper; the service owns toggle state.
        // Merging toggle booleans from runtime-applied caused a race where a stale
        // response would overwrite a newer toggle set by the user.
        if (message.payload.target) {
          this.state.gameAttachmentStatus = {
            ...this.state.gameAttachmentStatus,
            ...message.payload.target,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      if (message.type === 'hotkey-triggered' && message.payload?.hotkeyId) {
        void this.triggerHotkey(message.payload.hotkeyId);
      }

      if (message.type === 'error') {
        this.state.lastError = clone(message.payload || { code: 'AUTOMATION_HELPER_ERROR', message: 'Unknown automation helper error.' });
      }

      this.emit('helper-message', clone(message));
      this.emitStateChanged();
    });
  }

  reloadDocument() {
    this.document = this.profileStore.load();
  }

  applyProfile(profile, options = {}) {
    const { preserveRuntimeState = false, preserveBuffRuntimeState = false, preserveAttachmentStatus = false } = options;
    const previousRuntimeState = clone(this.state.runtimeState || {});
    const previousBuffRuntimeState = clone(this.state.buffRuntimeState || {});
    const previousAttachmentStatus = clone(this.state.gameAttachmentStatus || {});
    this.activeProfile = clone(profile);
    this.state.activeProfileId = profile.id;
    this.state.activeProfile = clone(profile);
    this.state.profilesSummary = this.profileStore.listProfilesSummary();
    this.state.runtimeState = preserveRuntimeState
      ? {
          ...clone(profile.runtime),
          masterEnabled: Boolean(previousRuntimeState.masterEnabled),
          leftClickerEnabled: Boolean(previousRuntimeState.leftClickerEnabled),
          rightClickerEnabled: Boolean(previousRuntimeState.rightClickerEnabled),
          f7Enabled: Boolean(previousRuntimeState.f7Enabled),
          shiftHeldEnabled: Boolean(previousRuntimeState.shiftHeldEnabled),
          ctrlHeldEnabled: Boolean(previousRuntimeState.ctrlHeldEnabled),
        }
      : clone(profile.runtime);
    this.state.overlayState = clone(profile.overlays);
    this.state.gameAttachmentStatus = preserveAttachmentStatus
      ? {
          ...previousAttachmentStatus,
          target: clone(profile.gameTarget),
          updatedAt: new Date().toISOString(),
        }
      : {
          attached: false,
          isForeground: false,
          target: clone(profile.gameTarget),
          updatedAt: new Date().toISOString(),
        };
    this.state.buffRuntimeState = preserveBuffRuntimeState
      ? Object.fromEntries(Object.entries(createEmptyBuffRuntimeState(profile.buffs)).map(([buffId, emptyState]) => [
          buffId,
          {
            ...emptyState,
            ...(previousBuffRuntimeState[buffId] || {}),
          },
        ]))
      : createEmptyBuffRuntimeState(profile.buffs);
    this.emitStateChanged();
  }

  async syncProfileToHelper() {
    const profile = this.profileStore.getActiveProfile();
    this.applyProfile(profile, { preserveRuntimeState: true, preserveBuffRuntimeState: true, preserveAttachmentStatus: true });

    try {
      await this.sendHelperRequest('configure-session', {
        profileId: profile.id,
        heartbeatIntervalMs: 10000,
      }, { timeoutMs: 10000, retries: 1 });
      await this.sendHelperRequest('set-target', profile.gameTarget, { timeoutMs: 10000, retries: 1 });
      await this.sendHelperRequest('set-runtime-config', {
        runtime: profile.runtime,
        hotkeys: profile.hotkeys,
      }, { timeoutMs: 10000, retries: 1 });
      await this.sendHelperRequest('register-hotkeys', { hotkeys: profile.hotkeys }, { timeoutMs: 10000, retries: 1 });
      await this.sendHelperRequest('set-toggle-state', {
        runtime: this.state.runtimeState,
      }, { timeoutMs: 10000, retries: 1 });
      this.state.lastError = null;
    } catch (error) {
      this.setLastError(error);
    }

    this.emitStateChanged();
  }

  async syncRuntimeToHelper() {
    try {
      await this.sendHelperRequest('set-toggle-state', {
        runtime: this.state.runtimeState,
      }, { timeoutMs: 5000, retries: 1 });
      this.state.lastError = null;
    } catch (error) {
      this.setLastError(error);
    }
  }

  setLastError(error) {
    this.state.lastError = {
      code: error.code || 'AUTOMATION_ERROR',
      message: error.message,
    };
  }

  startBuffTickLoop() {
    if (this.buffTickTimer) return;
    this.buffTickTimer = setInterval(() => this.tickBuffs(), 250);
    this.buffTickTimer.unref?.();
  }

  tickBuffs() {
    const buffs = this.activeProfile?.buffs || {};
    let changed = false;
    const now = Date.now();

    for (const [buffId, config] of Object.entries(buffs)) {
      const current = this.state.buffRuntimeState[buffId];
      if (!current?.active) continue;

      const next = { ...current };
      const referenceTime = next.paused ? (next.pausedAt || now) : now;
      const elapsedMs = Math.max(0, referenceTime - (next.startedAt || referenceTime));
      next.elapsedMs = elapsedMs;

      if (config.countMode === 'countup') {
        next.remainingMs = 0;
        next.displayText = `${Math.round(elapsedMs / 1000)}s`;
      } else {
        const remainingMs = Math.max(0, config.durationSec * 1000 - elapsedMs);
        next.remainingMs = remainingMs;
        next.displayText = next.paused ? 'PAUSED' : `${Math.round(remainingMs / 1000)}s`;

        const remainingSec = remainingMs / 1000;
        let alertStage = '';
        if (remainingMs <= 0) alertStage = 'expired';
        else if (remainingSec <= config.warn2Sec) alertStage = 'warn2';
        else if (remainingSec <= config.warn1Sec) alertStage = 'warn1';

        if (alertStage && alertStage !== next.lastAlertStage) {
          this.emit('helper-message', {
            type: 'log',
            payload: { message: `${config.label} ${alertStage === 'expired' ? 'expired' : `${alertStage} threshold`}` },
          });
          next.lastAlertStage = alertStage;
        }

        if (alertStage === 'expired') {
          next.active = false;
          next.paused = false;
          next.startedAt = null;
          next.pausedAt = null;
          next.displayText = 'OFF';
        }
      }

      if (JSON.stringify(next) !== JSON.stringify(current)) {
        this.state.buffRuntimeState[buffId] = next;
        changed = true;
      }
    }

    if (changed) {
      this.emitStateChanged();
    }
  }

  createAutomationError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  emitStateChanged() {
    this.emit('state-changed', this.getState());
  }
}

module.exports = {
  AutomationService,
  HOTKEY_IDS,
  RUNTIME_TOGGLE_IDS,
};
