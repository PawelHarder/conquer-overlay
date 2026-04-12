import { state } from './state.js';
import { dom } from './dom-refs.js';

export const PLUS_DIVISOR = [0, 1, 3, 9, 27, 81, 243, 729, 2187, 6561];

export function perPlusHtml(item) {
  const lvl = Number(item.AdditionLevel);
  if (!lvl || lvl < 2 || lvl > 9) return '';
  const price = Number(item.Price ?? item.price);
  if (!Number.isFinite(price) || price <= 0) return '';
  const divisor = PLUS_DIVISOR[lvl];
  return `<span class="listing-per-plus">+${lvl}, ${divisor}x ${formatPrice(Math.round(price / divisor))}/+1</span>`;
}

export function formatPrice(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return parseFloat((n / 1_000).toFixed(3)) + 'K';
  return String(n);
}

export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function setStatus(msg, type = 'ok') {
  dom.statusText.textContent = msg;
  dom.statusDot.className = 'status-dot' + (type === 'error' ? ' error' : type === 'warn' ? ' warn' : '');
}

export function pushAutomationLog(message) {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  state.automationLog.unshift(text);
  state.automationLog = state.automationLog.slice(0, 25);
  if (dom.automationLog) {
    dom.automationLog.textContent = state.automationLog.join('\n');
  }
}

export function formatAutomationTargetSummary(target) {
  if (!target) return '';
  const parts = [];
  if (typeof target.isForeground === 'boolean') {
    parts.push(`foreground=${target.isForeground ? 'yes' : 'no'}`);
  }
  if (target.matchedPattern) parts.push(`pattern=${target.matchedPattern}`);
  if (target.title)           parts.push(`title=${target.title}`);
  return parts.join(' | ');
}

export function formatAutomationDetailSummary(details) {
  if (!details || typeof details !== 'object') return '';
  const parts = [];
  if (details.runtime && typeof details.runtime === 'object') {
    const r = details.runtime;
    parts.push([
      `master=${r.masterEnabled ? 'on' : 'off'}`,
      `left=${r.leftClickerEnabled ? 'on' : 'off'}`,
      `right=${r.rightClickerEnabled ? 'on' : 'off'}`,
      `f7=${r.f7Enabled ? 'on' : 'off'}`,
      `shift=${r.shiftHeldEnabled ? 'on' : 'off'}`,
      `ctrl=${r.ctrlHeldEnabled ? 'on' : 'off'}`,
    ].join(','));
  }
  if (details.delivery) parts.push(`delivery=${details.delivery}`);
  if (details.cursor && Number.isFinite(details.cursor.x) && Number.isFinite(details.cursor.y)) {
    parts.push(`cursor=${details.cursor.x},${details.cursor.y}`);
  }
  if (typeof details.isForeground === 'boolean') {
    parts.push(`foreground=${details.isForeground ? 'yes' : 'no'}`);
  }
  if (details.title)          parts.push(`title=${details.title}`);
  if (details.matchedPattern) parts.push(`pattern=${details.matchedPattern}`);
  if (details.hotkeyId)       parts.push(`hotkey=${details.hotkeyId}`);
  if (details.binding)        parts.push(`binding=${details.binding}`);
  if (typeof details.activated === 'boolean') {
    parts.push(`activated=${details.activated ? 'yes' : 'no'}`);
  }
  return parts.join(' | ');
}

export function formatAutomationDiagnosticEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return typeof entry === 'string' ? entry : JSON.stringify(entry);
  }
  const baseMessage = typeof entry.message === 'string' ? entry.message : JSON.stringify(entry);
  const parts = [];
  if (entry.focusAttempted) {
    parts.push(`focus=${entry.focusResult?.activated ? 'ok' : 'failed'}`);
  }
  const detailSummary = formatAutomationDetailSummary(entry.details);
  if (detailSummary) parts.push(detailSummary);
  const targetSummary = formatAutomationTargetSummary(entry.target);
  if (targetSummary)  parts.push(targetSummary);
  return parts.length ? `${baseMessage} | ${parts.join(' | ')}` : baseMessage;
}

export function setControlValueIfIdle(control, value, property = 'value') {
  if (!control) return;
  if (document.activeElement === control) return;
  control[property] = value;
}

export function setNestedControlValues(controlMap, values, property = 'value') {
  Object.entries(controlMap).forEach(([key, control]) => {
    setControlValueIfIdle(control, values?.[key], property);
  });
}

export function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) { /* silence */ }
}
