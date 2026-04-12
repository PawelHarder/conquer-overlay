'use strict';

const header      = document.getElementById('header');
const notifList   = document.getElementById('notif-list');
const clearAllBtn = document.getElementById('clear-all-btn');

let notifications = [];
let nextId        = 0;
const shownIds    = new Set();   // dedup: prevents same listing appearing twice per session

// Mirrors renderer.js PLUS_DIVISOR for per-plus price
const PLUS_DIVISOR = [0, 1, 3, 9, 27, 81, 243, 729, 2187, 6561];

// Mirrors renderer.js THEMES — only the vars used by this overlay
const THEMES = {
  'original-dark': { gold:'#c8a84b', goldDim:'42,34,12',  green:'#4caf72', bgCard:'21,21,32',   border:'42,42,64',   text:'200,200,216', textDim:'180,180,210' },
  'midnight-blue': { gold:'#c8a84b', goldDim:'38,30,8',   green:'#3dba70', bgCard:'12,20,44',   border:'28,48,90',   text:'190,210,240', textDim:'160,185,220' },
  'obsidian':      { gold:'#d4924a', goldDim:'54,36,12',  green:'#52b36a', bgCard:'26,20,14',   border:'54,42,26',   text:'220,210,195', textDim:'195,185,170' },
  'smokey':        { gold:'#b8a060', goldDim:'56,50,26',  green:'#4aab6a', bgCard:'48,48,56',   border:'80,80,94',   text:'210,210,218', textDim:'185,185,198' },
  'parchment':     { gold:'#9a7230', goldDim:'120,100,60',green:'#4a8a4a', bgCard:'220,206,180',border:'190,170,130',text:'52,36,18',    textDim:'90,68,40'    },
  'light':         { gold:'#a07828', goldDim:'140,120,60',green:'#3a8a50', bgCard:'240,240,246',border:'210,210,222',text:'30,28,50',    textDim:'90,88,120'   },
};

function applyTheme(key) {
  const t = THEMES[key] || THEMES['original-dark'];
  const r = document.documentElement;
  r.style.setProperty('--gold',     t.gold);
  r.style.setProperty('--gold-dim', `rgba(${t.goldDim}, 0.28)`);
  r.style.setProperty('--green',    t.green);
  r.style.setProperty('--bg',       `rgba(${t.bgCard}, 0.93)`);
  r.style.setProperty('--border',   `rgba(${t.border}, 0.7)`);
  r.style.setProperty('--text',     `rgb(${t.text})`);
  r.style.setProperty('--text-dim', `rgb(${t.textDim})`);
}

// Apply saved theme on load, and react to changes made in the main window
applyTheme(localStorage.getItem('theme') || 'original-dark');
window.addEventListener('storage', e => {
  if (e.key === 'theme') applyTheme(e.newValue || 'original-dark');
});

function getItemId(item) {
  return item.ItemId || item.id
    || `${item.SellerName ?? ''}-${item.AttributeName ?? ''}-${item.Price ?? ''}`;
}

function formatPrice(val) {
  if (val == null || val === '') return '\u2014';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g, '&quot;');
}

function updateHeader() {
  header.classList.toggle('visible', notifications.length > 0);
}

function removeOne(id) {
  const el = document.querySelector(`.notif-card[data-id="${id}"]`);
  if (el) {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
  notifications = notifications.filter(n => n.id !== id);
  updateHeader();
  // If all gone, hide the overlay window
  if (notifications.length === 0) {
    window.electronAPI?.dismissWatchOverlay?.();
  }
}

function clearAll() {
  notifList.innerHTML = '';
  notifications = [];
  shownIds.clear();
  updateHeader();
}

function addNotification(item, isNew) {
  const itemId = getItemId(item);
  if (shownIds.has(itemId)) return;   // skip duplicate
  shownIds.add(itemId);

  const id = nextId++;
  notifications.unshift({ id, itemId });

  // Row 1: item name + NEW badge
  const name = escHtml(item.AttributeName || item.name || '\u2014');

  // Row 2: seller · location
  const seller = escHtml(item.SellerName || item.seller || '\u2014');
  const hasPos = item.PositionX != null && item.PositionY != null;
  const pos = hasPos ? escHtml(item.PositionX + ',' + item.PositionY) : '';

  // Row 3: quality/plus tags + price [+ per-plus]
  const tags = [];
  if (item.QualityName)  tags.push(item.QualityName);
  const plusLvl = Number(item.AdditionLevel);
  if (plusLvl > 0)       tags.push('+' + plusLvl);
  if (Number(item.SocketCount) > 0) tags.push(item.SocketCount + 's');

  const price = Number(item.Price ?? item.price);
  const priceStr = formatPrice(price);
  let perPlusHtml = '';
  if (plusLvl >= 2 && plusLvl <= 9 && Number.isFinite(price) && price > 0) {
    perPlusHtml = `<span class="notif-per-plus">${formatPrice(Math.round(price / PLUS_DIVISOR[plusLvl]))}/+1</span>`;
  }

  // Build right-side meta: seller · pos · price [/+1]
  const rightParts = [];
  rightParts.push(`<span class="notif-seller">${seller}</span>`);
  if (pos) {
    rightParts.push(`<span class="notif-dot">·</span><span class="notif-pos">${pos}</span>`);
  }
  rightParts.push(`<span class="notif-dot">·</span><span class="notif-price">${priceStr}</span>`);
  if (perPlusHtml) rightParts.push(perPlusHtml);

  const card = document.createElement('div');
  card.className  = 'notif-card';
  card.dataset.id = String(id);
  card.innerHTML  = `
    <span class="notif-name">${name}${isNew ? '<span class="new-badge">NEW</span>' : ''}</span>
    <span class="notif-right">${rightParts.join('')}</span>
    <button class="notif-close" title="Dismiss">&#x2715;</button>
  `;

  card.querySelector('.notif-close').addEventListener('click', () => removeOne(id));

  // Newest at top
  notifList.prepend(card);
  updateHeader();
}

clearAllBtn.addEventListener('click', () => {
  // Tell main to hide the window; main sends overlay-clear back which calls clearAll()
  window.electronAPI?.dismissWatchOverlay?.();
});

if (window.electronAPI) {
  window.electronAPI.onWatchOverlayMatches(items => {
    if (!Array.isArray(items)) return;
    items.forEach((item, i) => addNotification(item, i === 0));
  });

  window.electronAPI.onWatchOverlayClear(() => {
    clearAll();
  });
}
