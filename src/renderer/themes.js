import { state } from './state.js';
import { dom } from './dom-refs.js';

export const THEMES = {
  'original-dark': {
    gold: '#c8a84b', goldDim: '#8a6f2a', goldBright: '#f0cb6a',
    red: '#c43c3c', redDim: '#7a2020', green: '#4caf72', greenDim: '#2a6042',
    bgDeep: '10,10,14', bgPanel: '15,15,22', bgCard: '21,21,32', bgHover: '28,28,46',
    border: '42,42,64', borderGold: '58,46,16',
    text: '200,200,216', textDim: '180,180,210', textBright: '232,232,248',
    shadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(200,168,75,0.15)',
    titlebar: 'linear-gradient(180deg,#16141e 0%,#0f0f16 100%)',
  },
  'midnight-blue': {
    gold: '#c8a84b', goldDim: '#7a6030', goldBright: '#f0cb6a',
    red: '#d44c4c', redDim: '#7a2020', green: '#3dba70', greenDim: '#1e5e3a',
    bgDeep: '4,8,20', bgPanel: '8,14,32', bgCard: '12,20,44', bgHover: '18,30,60',
    border: '28,48,90', borderGold: '50,40,12',
    text: '190,210,240', textDim: '160,185,220', textBright: '220,235,255',
    shadow: '0 8px 32px rgba(0,0,0,0.9), 0 0 0 1px rgba(80,120,220,0.2)',
    titlebar: 'linear-gradient(180deg,#060c22 0%,#08102a 100%)',
  },
  'obsidian': {
    gold: '#d4924a', goldDim: '#8a5c28', goldBright: '#f0ae68',
    red: '#c44040', redDim: '#7a2222', green: '#52b36a', greenDim: '#2a5e38',
    bgDeep: '10,8,6', bgPanel: '18,14,10', bgCard: '26,20,14', bgHover: '36,28,18',
    border: '54,42,26', borderGold: '72,52,20',
    text: '220,210,195', textDim: '195,185,170', textBright: '245,238,225',
    shadow: '0 8px 32px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,146,74,0.18)',
    titlebar: 'linear-gradient(180deg,#120e08 0%,#160a04 100%)',
  },
  'smokey': {
    gold: '#b8a060', goldDim: '#7a6a38', goldBright: '#d4bc80',
    red: '#b84040', redDim: '#6e2424', green: '#4aab6a', greenDim: '#266040',
    bgDeep: '28,28,32', bgPanel: '38,38,44', bgCard: '48,48,56', bgHover: '60,60,70',
    border: '80,80,94', borderGold: '70,62,38',
    text: '210,210,218', textDim: '185,185,198', textBright: '238,238,244',
    shadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(184,160,96,0.12)',
    titlebar: 'linear-gradient(180deg,#1e1e24 0%,#26262c 100%)',
  },
  'parchment': {
    gold: '#9a7230', goldDim: '#6e5020', goldBright: '#b8922c',
    red: '#a83030', redDim: '#6e1e1e', green: '#4a8a4a', greenDim: '#286028',
    bgDeep: '238,228,208', bgPanel: '230,218,196', bgCard: '220,206,180', bgHover: '210,194,164',
    border: '190,170,130', borderGold: '180,150,90',
    text: '52,36,18', textDim: '90,68,40', textBright: '30,20,8',
    shadow: '0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(154,114,48,0.25)',
    titlebar: 'linear-gradient(180deg,#d8c8a8 0%,#e6d6b4 100%)',
  },
  'light': {
    gold: '#a07828', goldDim: '#7a5c1a', goldBright: '#c09030',
    red: '#c03030', redDim: '#8a1c1c', green: '#3a8a50', greenDim: '#205e34',
    bgDeep: '245,245,248', bgPanel: '252,252,255', bgCard: '240,240,246', bgHover: '228,228,238',
    border: '210,210,222', borderGold: '200,180,120',
    text: '30,28,50', textDim: '90,88,120', textBright: '10,8,30',
    shadow: '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(160,120,40,0.2)',
    titlebar: 'linear-gradient(180deg,#e8e8f0 0%,#f2f2f8 100%)',
  },
};

export const FONT_PAIRINGS = {
  classic:  { ui: "'Segoe UI', Tahoma, sans-serif",             display: "'Palatino Linotype', Georgia, serif" },
  scholar:  { ui: "Cambria, Georgia, serif",                     display: "Garamond, 'Book Antiqua', serif" },
  terminal: { ui: "Consolas, 'Courier New', monospace",          display: "'Courier New', monospace" },
  modern:   { ui: "Calibri, 'Trebuchet MS', sans-serif",         display: "Georgia, Cambria, serif" },
  oldeng:   { ui: "'Trebuchet MS', Verdana, sans-serif",         display: "'Book Antiqua', 'Palatino Linotype', serif" },
  humanist: { ui: "'Gill Sans MT', Calibri, sans-serif",         display: "Perpetua, Georgia, serif" },
  sharp:    { ui: "'Franklin Gothic Medium', Arial, sans-serif", display: "Constantia, Georgia, serif" },
};

export function applyTheme(key) {
  const t = THEMES[key] || THEMES['original-dark'];
  const r = document.documentElement;
  r.style.setProperty('--gold',            t.gold);
  r.style.setProperty('--gold-dim',        t.goldDim);
  r.style.setProperty('--gold-bright',     t.goldBright);
  r.style.setProperty('--red',             t.red);
  r.style.setProperty('--red-dim',         t.redDim);
  r.style.setProperty('--green',           t.green);
  r.style.setProperty('--green-dim',       t.greenDim);
  r.style.setProperty('--bg-deep-rgb',     t.bgDeep);
  r.style.setProperty('--bg-panel-rgb',    t.bgPanel);
  r.style.setProperty('--bg-card-rgb',     t.bgCard);
  r.style.setProperty('--bg-hover-rgb',    t.bgHover);
  r.style.setProperty('--border-rgb',      t.border);
  r.style.setProperty('--border-gold-rgb', t.borderGold);
  r.style.setProperty('--text',       `rgba(${t.text},        var(--text-alpha))`);
  r.style.setProperty('--text-dim',   `rgba(${t.textDim},     var(--text-alpha))`);
  r.style.setProperty('--text-bright',`rgba(${t.textBright},  var(--text-alpha))`);
  r.style.setProperty('--shadow',          t.shadow);
  const titlebar = document.getElementById('titlebar');
  if (titlebar) titlebar.style.background = t.titlebar;
  if (dom.themeSelect) dom.themeSelect.value = key;
  localStorage.setItem('theme', key);
}

export function applyUiScale(val) {
  const scale = Math.max(0.9, Math.min(1.2, parseFloat(val) || 1));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  dom.uiScaleSelect.value = String(scale);
  localStorage.setItem('uiScale', String(scale));
  window.electronAPI?.resizeWindow?.({ width: Math.round(420 * scale), height: Math.round(600 * scale) });
}

export function applyFontPairing(key) {
  const resolved = FONT_PAIRINGS[key] ? key : 'classic';
  const pairing  = FONT_PAIRINGS[resolved];
  document.documentElement.style.setProperty('--ui',      pairing.ui);
  document.documentElement.style.setProperty('--display', pairing.display);
  dom.fontPairingSelect.value = resolved;
  localStorage.setItem('fontPairing', resolved);
  window.electronAPI?.setUiFont?.(pairing.ui);
}

export function applyEffectiveBgAlpha(baseFraction) {
  const effective = state.altHeld ? baseFraction : Math.max(0.05, baseFraction - 0.12);
  document.documentElement.style.setProperty('--bg-alpha', String(effective));
}

export function applyOpacity(pct) {
  const clamped = Math.max(10, Math.min(100, pct));
  dom.opacitySlider.value = clamped;
  dom.opacityInput.value  = clamped;
  localStorage.setItem('opacity', String(clamped));
  applyEffectiveBgAlpha(clamped / 100);
}

export function applyTextOpacity(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  dom.textOpacitySlider.value = clamped;
  dom.textOpacityInput.value  = clamped;
  document.documentElement.style.setProperty('--text-alpha', String(clamped / 100));
  localStorage.setItem('textOpacity', String(clamped));
}
