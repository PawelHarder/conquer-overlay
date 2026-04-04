'use strict';

const fs = require('fs');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');

class AutomationHelperClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.helperPath = options.helperPath || null;
    this.helperArgs = Array.isArray(options.helperArgs) ? options.helperArgs : [];
    this.launchCommand = options.launchCommand || null;
    this.launchArgs = Array.isArray(options.launchArgs) ? options.launchArgs : [];
    this.cwd = options.cwd || undefined;
    this.logger = typeof options.logger === 'function' ? options.logger : () => {};
    this.transport = 'stdio-json';
    this.child = null;
    this.stdoutBuffer = '';
    this.pending = new Map();
    this.nextRequestId = 1;
    this.heartbeatIntervalMs = 10000;
    this.heartbeatTimer = null;
    this.status = {
      lifecycle: 'idle',
      isRunning: false,
      pid: null,
      transport: this.transport,
      capabilities: [],
      lastHeartbeatAt: null,
      lastError: null,
    };
  }

  getStatus() {
    return { ...this.status, capabilities: [...this.status.capabilities] };
  }

  async start() {
    if (this.child) {
      return this.getStatus();
    }

    if (!this.helperPath) {
      this.updateStatus({
        lifecycle: 'disabled',
        lastError: { code: 'AUTOMATION_HELPER_PATH_UNSET', message: 'Automation helper path is not configured.' },
      });
      return this.getStatus();
    }

    if (!fs.existsSync(this.helperPath)) {
      this.updateStatus({
        lifecycle: 'missing',
        lastError: { code: 'AUTOMATION_HELPER_NOT_FOUND', message: `Automation helper not found at ${this.helperPath}` },
      });
      return this.getStatus();
    }

    const command = this.launchCommand || this.helperPath;
    const args = this.launchCommand ? this.launchArgs : this.helperArgs;

    this.child = spawn(command, args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.stdoutBuffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.handleStdout(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', chunk => this.logger('helper-stderr', chunk.trim()));
    this.child.once('exit', (code, signal) => this.handleExit(code, signal));
    this.child.once('error', error => this.handleChildError(error));

    this.updateStatus({
      lifecycle: 'starting',
      isRunning: true,
      pid: this.child.pid,
      lastError: null,
    });

    return this.getStatus();
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  async stop() {
    this.clearHeartbeat();
    if (!this.child) {
      this.updateStatus({ lifecycle: 'stopped', isRunning: false, pid: null });
      return this.getStatus();
    }

    try {
      await this.sendRequest('shutdown', {}, 1500);
    } catch (_) {
      // Ignore and fall through to process termination.
    }

    const child = this.child;
    this.child = null;
    try {
      child.kill();
    } catch (_) {
      // Process already gone.
    }

    this.failAllPending(new Error('Automation helper stopped'));
    this.updateStatus({ lifecycle: 'stopped', isRunning: false, pid: null });
    return this.getStatus();
  }

  send(type, payload = {}) {
    if (!this.child || !this.child.stdin.writable) {
      return false;
    }

    const message = JSON.stringify({ type, payload });
    this.child.stdin.write(`${message}\n`);
    return true;
  }

  sendRequest(type, payload = {}, timeoutMs = 3000) {
    if (!this.child || !this.child.stdin.writable) {
      return Promise.reject(this.createError('AUTOMATION_HELPER_UNAVAILABLE', 'Automation helper is not running.'));
    }

    const requestId = String(this.nextRequestId++);
    const message = JSON.stringify({ type, requestId, payload });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(this.createError('AUTOMATION_HELPER_TIMEOUT', `Automation helper request timed out: ${type}`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timeout });
      this.child.stdin.write(`${message}\n`);
    });
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = this.stdoutBuffer.indexOf('\n');
      if (!line) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        this.updateStatus({
          lastError: { code: 'AUTOMATION_HELPER_BAD_JSON', message: error.message },
        });
        this.emit('message', { type: 'error', payload: { code: 'AUTOMATION_HELPER_BAD_JSON', message: error.message } });
      }
    }
  }

  handleMessage(message) {
    if (message.type === 'hello') {
      this.updateStatus({
        lifecycle: 'ready',
        capabilities: Array.isArray(message.payload?.capabilities) ? message.payload.capabilities : [],
        lastHeartbeatAt: new Date().toISOString(),
        lastError: null,
      });
      this.startHeartbeat();
    }

    if (message.type === 'heartbeat') {
      this.updateStatus({ lastHeartbeatAt: new Date().toISOString() });
    }

    if (message.requestId && this.pending.has(message.requestId)) {
      const pending = this.pending.get(message.requestId);
      clearTimeout(pending.timeout);
      this.pending.delete(message.requestId);
      if (message.type === 'error') {
        pending.reject(this.createError(message.payload?.code || 'AUTOMATION_HELPER_ERROR', message.payload?.message || 'Automation helper request failed.'));
      } else {
        pending.resolve(message.payload ?? null);
      }
    }

    this.emit('message', message);
  }

  handleChildError(error) {
    this.updateStatus({
      lifecycle: 'error',
      isRunning: false,
      lastError: { code: 'AUTOMATION_HELPER_SPAWN_FAILED', message: error.message },
    });
    this.failAllPending(error);
    this.emit('message', { type: 'error', payload: { code: 'AUTOMATION_HELPER_SPAWN_FAILED', message: error.message } });
  }

  handleExit(code, signal) {
    this.clearHeartbeat();
    this.child = null;
    this.failAllPending(this.createError('AUTOMATION_HELPER_EXITED', `Automation helper exited (${code ?? 'null'} / ${signal ?? 'null'})`));
    this.updateStatus({
      lifecycle: 'stopped',
      isRunning: false,
      pid: null,
      capabilities: [],
      lastError: code === 0 ? null : { code: 'AUTOMATION_HELPER_EXITED', message: `Automation helper exited (${code ?? 'null'} / ${signal ?? 'null'})` },
    });
  }

  startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.child && this.child.stdin.writable) {
        this.send('heartbeat', { sentAt: new Date().toISOString() });
      }
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  failAllPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  updateStatus(patch) {
    this.status = {
      ...this.status,
      ...patch,
      transport: this.transport,
    };
    this.emit('status', this.getStatus());
  }

  createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = {
  AutomationHelperClient,
};
