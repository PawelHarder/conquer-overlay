/**
 * Conquer Market Overlay — Renderer Process
 */

import { getListings, getFilters, watchForDeal, loadMarketSnapshot } from './api.js';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  activeTab:        'search',
  server:           '',
  historyDays:      7,
  watchCancel:      null,
  isCollapsed:      false,
  altHeld:          false,
  searchItems:      [],
  watchItems:       [],
  searchSort:       { key: 'Price', dir: 'asc' },
  watchSort:        { key: 'Price', dir: 'asc' },
  itemNamePool:     [],
  poolLoaded:       false,
  filterMetaLoaded: false,
  mapImage:         null,
  minimapSide:      'right',
  minimapPinned:    null,
  automationState:  null,
  automationLog:    [],
};

const MINIMAP_POPUP_WIDTH = 336;
const AUTOMATION_HOTKEY_OPTIONS = [
  ['', 'Disabled'],
  ['MouseMiddle', 'Mouse Middle'],
  ['Escape', 'Escape'],
  ['F1', 'F1'],
  ['F2', 'F2'],
  ['F3', 'F3'],
  ['F7', 'F7'],
  ['Semicolon', 'Semicolon'],
  ['Quote', 'Quote'],
  ['Comma', 'Comma'],
  ['BracketLeft', 'Bracket Left'],
  ['BracketRight', 'Bracket Right'],
];

// ── DOM Refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const dom = {
  titlebar:            $('titlebar'),
  btnCollapse:         $('btn-collapse'),
  btnClose:            $('btn-close'),
  tabs:                document.querySelectorAll('.tab'),
  tabPanels:           document.querySelectorAll('.tab-panel'),
  serverBtns:          document.querySelectorAll('.server-btn'),

  searchInput:         $('search-input'),
  searchAutocomplete:  $('search-autocomplete'),
  searchMajor:         $('search-major'),
  searchMinor:         $('search-minor'),
  searchQuality:       $('search-quality'),
  searchPlus:          $('search-plus'),
  searchSockets:       $('search-sockets'),
  searchMinPrice:      $('search-minprice'),
  searchMaxPrice:      $('search-maxprice'),
  searchBtn:           $('search-btn'),
  searchClear:         $('search-clear'),
  searchResults:       $('search-results'),
  searchCount:         $('search-count'),
  priceLow:            $('price-low'),
  priceAvg:            $('price-avg'),
  priceHigh:           $('price-high'),
  minimapPopup:        $('minimap-popup'),
  minimapCanvas:       $('minimap-popup-canvas'),
  minimapCaption:      $('minimap-popup-caption'),

  historyItemName:     $('history-item-name'),
  historyAutocomplete: $('history-autocomplete'),
  historyMinor:        $('history-minor'),
  historyQuality:      $('history-quality'),
  historyPlus:         $('history-plus'),
  historySockets:      $('history-sockets'),
  historySearchBtn:    $('history-search-btn'),
  historyClear:        $('history-clear'),
  dayBtns:             document.querySelectorAll('.day-btn'),
  chartCanvas:         $('chart-canvas'),
  chartPlaceholder:    $('chart-placeholder'),
  histLow:             $('hist-low'),
  histMed:             $('hist-med'),
  histHigh:            $('hist-high'),

  watchItem:           $('watch-item'),
  watchAutocomplete:   $('watch-autocomplete'),
  watchMinor:          $('watch-minor'),
  watchQuality:        $('watch-quality'),
  watchPlus:           $('watch-plus'),
  watchSockets:        $('watch-sockets'),
  watchInterval:       $('watch-interval'),
  watchPriceBasis:     $('watch-price-basis'),
  watchPricePct:       $('watch-price-pct'),
  watchUseHistoryBtn:  $('watch-use-history-btn'),
  watchPrice:          $('watch-price'),
  watchStartBtn:       $('watch-start-btn'),
  watchClear:          $('watch-clear'),
  watchDot:            $('watch-dot'),
  watchText:           $('watch-text'),
  watchMatches:        $('watch-matches'),

  opacitySlider:       $('opacity-slider'),
  opacityInput:        $('opacity-input'),
  resetPositionBtn:    $('reset-position-btn'),
  automationProfile:   $('automation-profile-select'),
  automationProfileNew:$('automation-profile-new'),
  automationProfileDelete:$('automation-profile-delete'),
  automationProfileExport:$('automation-profile-export'),
  automationProfileImport:$('automation-profile-import'),
  automationHelperStatus:$('automation-helper-status'),
  automationTargetStatus:$('automation-target-status'),
  automationMasterStatus:$('automation-master-status'),
  automationLeftInterval:$('automation-left-interval'),
  automationRightInterval:$('automation-right-interval'),
  automationF7Interval: $('automation-f7-interval'),
  automationJitter:     $('automation-jitter'),
  automationSaveRuntime:$('automation-save-runtime'),
  automationProfileName:$('automation-profile-name'),
  automationProfileDescription:$('automation-profile-description'),
  automationTargetTitle:$('automation-target-title'),
  automationTargetMatchMode:$('automation-target-match-mode'),
  automationTargetProcessName:$('automation-target-process-name'),
  automationTargetRequireForeground:$('automation-target-require-foreground'),
  automationTargetPollInterval:$('automation-target-poll-interval'),
  automationSaveProfileTarget:$('automation-save-profile-target'),
  automationBuffStigmaLabel:$('automation-buff-stigma-label'),
  automationBuffStigmaDuration:$('automation-buff-stigma-duration'),
  automationBuffStigmaWarn1:$('automation-buff-stigma-warn1'),
  automationBuffStigmaWarn2:$('automation-buff-stigma-warn2'),
  automationBuffStigmaVisible:$('automation-buff-stigma-visible'),
  automationBuffShieldLabel:$('automation-buff-shield-label'),
  automationBuffShieldDuration:$('automation-buff-shield-duration'),
  automationBuffShieldWarn1:$('automation-buff-shield-warn1'),
  automationBuffShieldWarn2:$('automation-buff-shield-warn2'),
  automationBuffShieldVisible:$('automation-buff-shield-visible'),
  automationBuffInvisibilityLabel:$('automation-buff-invisibility-label'),
  automationBuffInvisibilityDuration:$('automation-buff-invisibility-duration'),
  automationBuffInvisibilityWarn1:$('automation-buff-invisibility-warn1'),
  automationBuffInvisibilityWarn2:$('automation-buff-invisibility-warn2'),
  automationBuffInvisibilityVisible:$('automation-buff-invisibility-visible'),
  automationSaveBuffs:$('automation-save-buffs'),
  automationHotkeyMaster:$('automation-hotkey-master'),
  automationHotkeyEmergency:$('automation-hotkey-emergency'),
  automationHotkeyLeft:$('automation-hotkey-left'),
  automationHotkeyRight:$('automation-hotkey-right'),
  automationHotkeyF7:$('automation-hotkey-f7'),
  automationHotkeyShift:$('automation-hotkey-shift'),
  automationHotkeyCtrl:$('automation-hotkey-ctrl'),
  automationHotkeyStigma:$('automation-hotkey-stigma'),
  automationHotkeyShield:$('automation-hotkey-shield'),
  automationHotkeyInvisibility:$('automation-hotkey-invisibility'),
  automationSaveHotkeys:$('automation-save-hotkeys'),
  automationHudEnabled: $('automation-hud-enabled'),
  automationBuffsEnabled:$('automation-buffs-enabled'),
  automationCompactHud:$('automation-compact-hud'),
  automationShowActiveBuffsOnly:$('automation-show-active-buffs-only'),
  automationHideHudUnfocused:$('automation-hide-hud-unfocused'),
  automationHideBuffsUnfocused:$('automation-hide-buffs-unfocused'),
  automationAnchorMode: $('automation-anchor-mode'),
  automationSaveOverlays:$('automation-save-overlays'),
  automationRefreshBtn:$('automation-refresh-btn'),
  automationRestartBtn:$('automation-restart-btn'),
  automationMasterBtn: $('automation-master-btn'),
  automationStopBtn:   $('automation-stop-btn'),
  automationToggleLeft:$('automation-toggle-left'),
  automationToggleRight:$('automation-toggle-right'),
  automationToggleF7:  $('automation-toggle-f7'),
  automationToggleShift:$('automation-toggle-shift'),
  automationToggleCtrl:$('automation-toggle-ctrl'),
  automationTestLeft:  $('automation-test-left'),
  automationTestRight: $('automation-test-right'),
  automationTestF7:    $('automation-test-f7'),
  automationTestRelease:$('automation-test-release'),
  automationLog:       $('automation-log'),
  automationBuffList:  $('automation-buff-list'),

  alertPopup:          $('alert-popup'),
  alertItemName:       $('alert-item-name'),
  alertSeller:         $('alert-seller'),
  alertPrice:          $('alert-price'),

  altIndicator:        $('alt-indicator'),
  statusText:          $('status-text'),
  statusDot:           $('status-dot'),
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatPrice(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

function setStatus(msg, type = 'ok') {
  dom.statusText.textContent = msg;
  dom.statusDot.className = 'status-dot' + (type === 'error' ? ' error' : type === 'warn' ? ' warn' : '');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pushAutomationLog(message) {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  state.automationLog.unshift(text);
  state.automationLog = state.automationLog.slice(0, 10);
  if (dom.automationLog) {
    dom.automationLog.textContent = state.automationLog.join('\n');
  }
}

function setControlValueIfIdle(control, value, property = 'value') {
  if (!control) return;
  if (document.activeElement === control) return;
  control[property] = value;
}

function setNestedControlValues(controlMap, values, property = 'value') {
  Object.entries(controlMap).forEach(([key, control]) => {
    setControlValueIfIdle(control, values?.[key], property);
  });
}

function populateAutomationHotkeySelects() {
  const markup = AUTOMATION_HOTKEY_OPTIONS
    .map(([value, label]) => `<option value="${escHtml(value)}">${escHtml(label)}</option>`)
    .join('');
  [
    dom.automationHotkeyMaster,
    dom.automationHotkeyEmergency,
    dom.automationHotkeyLeft,
    dom.automationHotkeyRight,
    dom.automationHotkeyF7,
    dom.automationHotkeyShift,
    dom.automationHotkeyCtrl,
    dom.automationHotkeyStigma,
    dom.automationHotkeyShield,
    dom.automationHotkeyInvisibility,
  ].forEach(select => {
    if (select && !select.dataset.optionsReady) {
      select.innerHTML = markup;
      select.dataset.optionsReady = 'true';
    }
  });
}

// ── Locale-aware Price Inputs ─────────────────────────────────────────────────

const priceFormatter = new Intl.NumberFormat(navigator.language);

function setupPriceInput(input) {
  input.dataset.raw = '';
  input.addEventListener('blur', () => {
    const raw = parseRawPrice(input.value);
    if (raw != null) {
      input.dataset.raw = String(raw);
      input.value = priceFormatter.format(raw);
    } else {
      input.dataset.raw = '';
    }
  });
  input.addEventListener('focus', () => {
    if (input.dataset.raw) input.value = input.dataset.raw;
  });
}

function parseRawPrice(str) {
  const n = parseInt(str.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function getRawPrice(input) {
  return parseRawPrice(input.dataset.raw || input.value);
}

setupPriceInput(dom.searchMinPrice);
setupPriceInput(dom.searchMaxPrice);
setupPriceInput(dom.watchPrice);

function populateSelect(select, values, placeholder) {
  const previous = select.value;
  select.innerHTML = [`<option value="">${escHtml(placeholder)}</option>`,
    ...values.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`)].join('');
  if (previous && values.includes(previous)) select.value = previous;
}

function populatePlusSelect(select, placeholder) {
  const previous = select.value;
  select.innerHTML = [`<option value="">${escHtml(placeholder)}</option>`,
    ...Array.from({ length: 13 }, (_, i) => `<option value="${i}">+${i}</option>`)].join('');
  if (previous) select.value = previous;
}

async function ensureFilterMeta() {
  if (state.filterMetaLoaded) return;
  try {
    const filters = await getFilters();
    populateSelect(dom.searchMajor,   filters.majorCategories ?? [], 'All Categories');
    populateSelect(dom.searchMinor,   filters.minorCategories ?? [], 'All Minor Classes');
    populateSelect(dom.searchQuality, filters.qualities ?? [],       'All Qualities');
    populateSelect(dom.historyMinor,  filters.minorCategories ?? [], 'Any Minor Class');
    populateSelect(dom.historyQuality,filters.qualities ?? [],       'Any Quality');
    populateSelect(dom.watchMinor,    filters.minorCategories ?? [], 'Any Minor Class');
    populateSelect(dom.watchQuality,  filters.qualities ?? [],       'Any Quality');
    populatePlusSelect(dom.searchPlus,  'Any Plus');
    populatePlusSelect(dom.historyPlus, 'Any Plus');
    populatePlusSelect(dom.watchPlus,   'Any Plus');
    state.filterMetaLoaded = true;
  } catch (_) { /* keep fallback markup */ }
}

async function ensureMapImage() {
  if (state.mapImage !== null) return state.mapImage;
  state.mapImage = await new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = new URL('../public/assets/street.jpg', import.meta.url).href;
  });
  return state.mapImage;
}

async function updateMinimapSide() {
  if (!window.electronAPI?.getWindowPos) return;
  try {
    const [x] = await window.electronAPI.getWindowPos();
    state.minimapSide = x + 420 + MINIMAP_POPUP_WIDTH <= (window.screen?.availWidth || 1920) ? 'right' : 'left';
    dom.minimapPopup.classList.toggle('side-left',  state.minimapSide === 'left');
    dom.minimapPopup.classList.toggle('side-right', state.minimapSide === 'right');
  } catch (_) { /* ignore */ }
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

async function ensurePool() {
  if (state.poolLoaded) return;
  try {
    const items = await loadMarketSnapshot();
    state.itemNamePool = [...new Set(items.map(i => i.AttributeName).filter(Boolean))].sort();
    state.poolLoaded = true;
  } catch (_) { /* network not available yet */ }
}

function setupAutocomplete(input, listEl) {
  let focusedIndex = -1;

  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { listEl.classList.remove('open'); return; }
    await ensurePool();
    const matches = state.itemNamePool.filter(n => n.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { listEl.classList.remove('open'); return; }
    listEl.innerHTML = matches.map(m => `<div class="autocomplete-item">${escHtml(m)}</div>`).join('');
    listEl.classList.add('open');
    focusedIndex = -1;
    listEl.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = item.textContent;
        listEl.classList.remove('open');
      });
    });
  });

  input.addEventListener('keydown', e => {
    const items = listEl.querySelectorAll('.autocomplete-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); focusedIndex = Math.min(focusedIndex + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIndex = Math.max(focusedIndex - 1, -1); }
    else if (e.key === 'Enter' && focusedIndex >= 0) { e.preventDefault(); input.value = items[focusedIndex].textContent; listEl.classList.remove('open'); return; }
    else if (e.key === 'Escape') { listEl.classList.remove('open'); return; }
    items.forEach((item, i) => item.classList.toggle('focused', i === focusedIndex));
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !listEl.contains(e.target)) listEl.classList.remove('open');
  });
}

setupAutocomplete(dom.searchInput,      dom.searchAutocomplete);
setupAutocomplete(dom.historyItemName,  dom.historyAutocomplete);
setupAutocomplete(dom.watchItem,        dom.watchAutocomplete);

// ── Server Selector ───────────────────────────────────────────────────────────

dom.serverBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dom.serverBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.server = btn.dataset.server;
  });
});

// ── Tab Switching ─────────────────────────────────────────────────────────────

function switchTab(tabId) {
  state.activeTab = tabId;
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
  hideMinimapPopup();
  if (tabId === 'history') loadHistory();
}

dom.tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

// ── Collapse / Expand ─────────────────────────────────────────────────────────

function setCollapsed(val) {
  state.isCollapsed = val;
  document.body.classList.toggle('collapsed', val);
  dom.btnCollapse.textContent = val ? '▼' : '▲';
  if (window.electronAPI) window.electronAPI.resizeWindow({ width: 420, height: val ? 38 : 600 });
}

dom.btnCollapse.addEventListener('click', () => setCollapsed(!state.isCollapsed));
dom.btnClose.addEventListener('click', () => { if (window.electronAPI) window.electronAPI.closeApp(); });
if (window.electronAPI) window.electronAPI.onToggleCollapse(val => setCollapsed(val));

// ── ALT Key Tracking ──────────────────────────────────────────────────────────

function setAltToggleState(isEnabled) {
  state.altHeld = isEnabled;
  dom.altIndicator.classList.toggle('active', isEnabled);
  dom.altIndicator.textContent = isEnabled ? 'ALT: click enabled' : 'ALT: click-through';
}

if (window.electronAPI) {
  window.electronAPI.onAltToggle(isEnabled => setAltToggleState(isEnabled));
  window.electronAPI.onDebugMessage(message => setStatus(message, 'warn'));
}

document.addEventListener('click', e => {
  if (!state.minimapPinned) return;
  if (e.target.closest('.listing-row')) return;
  clearPinnedMinimap();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.minimapPinned) clearPinnedMinimap();
});

// ── Drag to Move ──────────────────────────────────────────────────────────────

let dragStart = null;
let winPosStart = null;

dom.titlebar.addEventListener('mousedown', async e => {
  if (e.button !== 0 || e.target.closest('button') || !state.altHeld) return;
  dragStart = { x: e.screenX, y: e.screenY };
  if (window.electronAPI) winPosStart = await window.electronAPI.getWindowPos();
});

document.addEventListener('mousemove', e => {
  if (!dragStart || !winPosStart) return;
  window.electronAPI?.moveWindow({ x: winPosStart[0] + e.screenX - dragStart.x, y: winPosStart[1] + e.screenY - dragStart.y });
});

document.addEventListener('mouseup', () => {
  if (dragStart) updateMinimapSide();
  dragStart = null;
  winPosStart = null;
});

// ── Sortable Listings ─────────────────────────────────────────────────────────

function setupSortableHeader(headerEl, containerEl, getSortState, setSortState, getItems, renderFn) {
  headerEl.querySelectorAll('span[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const s = getSortState();
      const dir = (s.key === key && s.dir === 'asc') ? 'desc' : 'asc';
      setSortState({ key, dir });
      headerEl.querySelectorAll('span').forEach(el => el.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderFn(sortItems(getItems(), key, dir), containerEl);
    });
  });
}

function sortItems(items, key, dir) {
  return [...items].sort((a, b) => {
    if (key === 'pos') {
      const xd = (a.PositionX ?? 0) - (b.PositionX ?? 0);
      if (xd !== 0) return dir === 'asc' ? xd : -xd;
      const yd = (a.PositionY ?? 0) - (b.PositionY ?? 0);
      return dir === 'asc' ? yd : -yd;
    }
    const av = a[key] ?? '', bv = b[key] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
    return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
}

// ── Listings Render ───────────────────────────────────────────────────────────

function renderListings(items, container) {
  if (!items.length) {
    container.innerHTML = '<div class="placeholder-text">No listings found</div>';
    if (state.minimapPinned?.containerId === container.id) clearPinnedMinimap();
    else hideMinimapPopup();
    return;
  }
  container.innerHTML = items.map((item, idx) => `
    <div class="listing-row${isPinnedListing(container.id, item) ? ' pinned' : ''}" data-idx="${idx}" data-item-key="${escHtml(getListingKey(item))}">
      <span class="listing-seller">${escHtml(item.SellerName ?? '—')}</span>
      <span class="listing-quality">${escHtml(item.QualityName ?? '—')}</span>
      <span class="listing-pos">${item.PositionX != null ? item.PositionX + ',' + item.PositionY : '—'}</span>
      <span class="listing-price">${formatPrice(item.Price ?? item.price)}</span>
    </div>
  `).join('');
  container.querySelectorAll('.listing-row').forEach(row => {
    const idx = parseInt(row.dataset.idx, 10);
    row.addEventListener('mouseenter', () => {
      if (!state.minimapPinned) showMinimapPopup(items, idx);
    });
    row.addEventListener('mouseleave', () => {
      if (!state.minimapPinned) hideMinimapPopup();
    });
    row.addEventListener('click', e => {
      if (e.button !== 0) return;
      togglePinnedMinimap(container.id, items, idx);
    });
  });

  if (state.minimapPinned?.containerId === container.id) {
    const pinnedIdx = items.findIndex(item => isPinnedListing(container.id, item));
    if (pinnedIdx >= 0) showMinimapPopup(items, pinnedIdx, true);
    else clearPinnedMinimap();
  }
}

// ── Price Summary ─────────────────────────────────────────────────────────────

function updatePriceSummary(items) {
  const prices = items.map(i => Number(i.Price)).filter(Number.isFinite);
  if (!prices.length) {
    dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
    return;
  }
  const total = prices.reduce((s, p) => s + p, 0);
  dom.priceLow.textContent  = formatPrice(Math.min(...prices));
  dom.priceAvg.textContent  = formatPrice(Math.round(total / prices.length));
  dom.priceHigh.textContent = formatPrice(Math.max(...prices));
}

// ── Market Minimap ────────────────────────────────────────────────────────────
//
// Isometric projection calibrated 2026-04-04 via least-squares fit across 8 field samples:
//   NW1 (120,217)  NW2 (152,217)
//   NE1 (168,152)  NE2 (200,152)
//   SE1 (232,217)  SE2 (264,218)
//   SW1 (180,268)  SW2 (212,268)
//
// Formula coefficients were fitted in a 1600×1600 working space generated from
// the street.jpg asset. Keep FIT_W/FIT_H aligned with future recalibration runs.
//   img_x = (worldX - worldY) × A + OX
//   img_y = (worldX + worldY) × B + OY
//
// Fit residuals: X ≈ 3.2 px,  Y ≈ 1.9 px  (at 1600×1600 resolution)
//
const ISO = { A: 6.2291, B: 3.0624, OX: 796.68, OY: -355.47, FIT_W: 1600, FIT_H: 1600 };

// ── Stall Grid ────────────────────────────────────────────────────────────────
//
// Stall coordinates derived from ISO calibration + user-supplied spacing rules:
//
//   NW / SE sectors:  12 stalls per row,  sibling Δy = −4,  row Δx = +7,  4 rows
//   NE / SW sectors:   6 stalls per row,  sibling Δy = −5,  row Δx = +32, 2 rows
//
// "First stall" anchor positions confirmed from screenshots:
//   NW origin: (120, 217)    SE origin: (232, 217)
//   NE origin: (168, 152)    SW origin: (180, 268)
//
function buildStallGrid() {
  const stalls = [];
  const twoRowDisplay = row => (row % 2) + 1;

  // NW — 4 rows × 12 stalls, row step x+7, sibling step y−4
  for (let row = 0; row < 4; row++) {
    for (let s = 0; s < 12; s++) {
      stalls.push({
        sector: 'NW',
        row,
        subsection: Math.floor(row / 2) + 1,
        displayRow: twoRowDisplay(row),
        stall: s,
        wx: 120 + row * 7,
        wy: 217 - s * 4,
      });
    }
  }

  // SE — 4 rows × 12 stalls, row step x+7, sibling step y−4
  for (let row = 0; row < 4; row++) {
    for (let s = 0; s < 12; s++) {
      stalls.push({
        sector: 'SE',
        row,
        subsection: Math.floor(row / 2) + 1,
        displayRow: twoRowDisplay(row),
        stall: s,
        wx: 232 + row * 7,
        wy: 217 - s * 4,
      });
    }
  }

  // NE — 2 rows × 6 stalls, row step x+32, sibling step y−5
  for (let row = 0; row < 2; row++) {
    for (let s = 0; s < 6; s++) {
      stalls.push({
        sector: 'NE',
        row,
        subsection: 1,
        displayRow: twoRowDisplay(row),
        stall: s,
        wx: 168 + row * 32,
        wy: 152 - s * 5,
      });
    }
  }

  // SW — 2 rows × 6 stalls, row step x+32, sibling step y−5
  for (let row = 0; row < 2; row++) {
    for (let s = 0; s < 6; s++) {
      stalls.push({
        sector: 'SW',
        row,
        subsection: 1,
        displayRow: twoRowDisplay(row),
        stall: s,
        wx: 180 + row * 32,
        wy: 268 - s * 5,
      });
    }
  }

  return stalls;
}

const STALL_GRID = buildStallGrid(); // 120 stalls total

// ── Projection helpers ────────────────────────────────────────────────────────

function isoProject(wx, wy, W, H) {
  return {
    x: ((wx - wy) * ISO.A + ISO.OX) / ISO.FIT_W * W,
    y: ((wx + wy) * ISO.B + ISO.OY) / ISO.FIT_H * H,
  };
}

function isoProjectFit(wx, wy) {
  return {
    x: (wx - wy) * ISO.A + ISO.OX,
    y: (wx + wy) * ISO.B + ISO.OY,
  };
}

// Find the nearest stall to a given world position (for snapping seller dots)
function nearestStall(wx, wy) {
  const target = isoProjectFit(wx, wy);
  let best = null, bestD = Infinity;
  for (const s of STALL_GRID) {
    const projected = isoProjectFit(s.wx, s.wy);
    const dx = projected.x - target.x;
    const dy = projected.y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function getListingKey(item) {
  return [
    item.AttributeName ?? '',
    item.SellerName ?? '',
    item.PositionX ?? '',
    item.PositionY ?? '',
    item.Price ?? item.price ?? '',
  ].join('|');
}

function isPinnedListing(containerId, item) {
  return state.minimapPinned?.containerId === containerId
    && state.minimapPinned?.itemKey === getListingKey(item);
}

function refreshPinnedListingStyles() {
  document.querySelectorAll('.listing-row[data-item-key]').forEach(row => {
    const containerId = row.parentElement?.id;
    row.classList.toggle(
      'pinned',
      Boolean(state.minimapPinned)
        && state.minimapPinned.containerId === containerId
        && state.minimapPinned.itemKey === row.dataset.itemKey,
    );
  });
}

function togglePinnedMinimap(containerId, items, highlightIdx) {
  const item = items[highlightIdx];
  if (!item) return;
  const itemKey = getListingKey(item);
  if (state.minimapPinned?.containerId === containerId && state.minimapPinned?.itemKey === itemKey) {
    clearPinnedMinimap();
    return;
  }
  state.minimapPinned = { containerId, itemKey };
  refreshPinnedListingStyles();
  showMinimapPopup(items, highlightIdx, true);
}

function clearPinnedMinimap() {
  state.minimapPinned = null;
  refreshPinnedListingStyles();
  hideMinimapPopup();
}

function formatSnapLabel(stall) {
  if (!stall) return '';
  const base = `${stall.sector} row ${stall.displayRow} stall ${stall.stall + 1}`;
  return (stall.sector === 'NW' || stall.sector === 'SE')
    ? `${stall.sector} subsection ${stall.subsection} row ${stall.displayRow} stall ${stall.stall + 1}`
    : base;
}

// ── Minimap Draw ──────────────────────────────────────────────────────────────

function drawMinimap(canvas, items, highlightIdx, pinned = false) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Background map image
  if (state.mapImage) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(state.mapImage, 0, 0, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle = '#0f0f16';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Stall grid slots ──────────────────────────────────────────────────────
  for (const s of STALL_GRID) {
    const { x, y } = isoProject(s.wx, s.wy, W, H);
    ctx.beginPath();
    ctx.rect(x - 2, y - 1.5, 4, 3);

    // Colour-code by sector
    const colors = { NW: 'rgba(100,140,200,0.25)', SE: 'rgba(200,140,100,0.25)',
                     NE: 'rgba(140,200,100,0.25)', SW: 'rgba(200,100,140,0.25)' };
    ctx.fillStyle = colors[s.sector] ?? 'rgba(150,150,150,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // ── Listing dots ──────────────────────────────────────────────────────────
  items.forEach((item, idx) => {
    if (item.PositionX == null) return;
    if (idx === highlightIdx) return;
    const { x, y } = isoProject(item.PositionX, item.PositionY, W, H);

    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = pinned ? 'rgba(164,164,176,0.68)' : 'rgba(200,168,75,0.62)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.strokeStyle = pinned ? 'rgba(36,36,48,0.42)' : 'rgba(90,72,24,0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  const highlightedItem = items[highlightIdx];
  if (highlightedItem?.PositionX != null) {
    const { x, y } = isoProject(highlightedItem.PositionX, highlightedItem.PositionY, W, H);

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f0cb6a';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(240,203,106,0.50)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const label = `${highlightedItem.SellerName ?? ''} (${highlightedItem.PositionX},${highlightedItem.PositionY})`;
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.textAlign = x > W / 2 ? 'right' : 'left';
    ctx.fillStyle = '#f0cb6a';
    ctx.fillText(label, x + (x > W / 2 ? -10 : 10), y - 8);

    const snap = nearestStall(highlightedItem.PositionX, highlightedItem.PositionY);
    const snapLabel = snap
      ? `${formatSnapLabel(snap)}  (${highlightedItem.PositionX},${highlightedItem.PositionY})`
      : `(${highlightedItem.PositionX},${highlightedItem.PositionY})`;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8c8d8';
    ctx.fillText(snapLabel, 8, H - 8);
  }

  // ── Header bar ────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(10,10,14,0.60)';
  ctx.fillRect(0, 0, W, 16);
  ctx.font = '10px Share Tech Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8c8d8';
  ctx.fillText(state.minimapPinned ? 'Market map (pinned)' : 'Market map', 8, 11);

  // Frame border
  ctx.beginPath();
  ctx.rect(0.5, 0.5, W - 1, H - 1);
  ctx.strokeStyle = '#2a2a40';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function showMinimapPopup(items, highlightIdx, pinned = false) {
  if (!items.length) return;
  dom.minimapPopup.classList.add('open');
  dom.minimapPopup.classList.toggle('pinned', pinned);
  drawMinimap(dom.minimapCanvas, items, highlightIdx, pinned);
  const item = items[highlightIdx];
  if (item?.PositionX != null) {
    const snap = nearestStall(item.PositionX, item.PositionY);
    dom.minimapCaption.textContent = snap
      ? `${item.SellerName ?? 'Seller'} · ${formatSnapLabel(snap)}${pinned ? ' · left-click row to unpin' : ' · left-click row to pin'}`
      : `${item.SellerName ?? 'Seller'} at ${item.PositionX},${item.PositionY}${pinned ? ' · left-click row to unpin' : ' · left-click row to pin'}`;
  } else {
    dom.minimapCaption.textContent = `Location unavailable${pinned ? ' · left-click row to unpin' : ''}`;
  }
}

function hideMinimapPopup() {
  dom.minimapPopup.classList.remove('open');
  dom.minimapPopup.classList.remove('pinned');
  const ctx = dom.minimapCanvas.getContext('2d');
  ctx.clearRect(0, 0, dom.minimapCanvas.width, dom.minimapCanvas.height);
  dom.minimapCaption.textContent = 'Hover a listing to preview its position';
}

// ── Web Audio beep ────────────────────────────────────────────────────────────

function playAlertSound() {
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

// ── Manual Search ─────────────────────────────────────────────────────────────

setupSortableHeader(
  document.querySelector('#tab-search .listings-header'),
  dom.searchResults,
  () => state.searchSort,
  s => { state.searchSort = s; },
  () => state.searchItems,
  (items, container) => renderListings(items, container),
);

async function doSearch() {
  const query     = dom.searchInput.value.trim();
  const major     = dom.searchMajor.value;
  const minor     = dom.searchMinor.value;
  const quality   = dom.searchQuality.value;
  const plusLevel = dom.searchPlus.value !== '' ? parseInt(dom.searchPlus.value, 10) : undefined;
  const sockets   = dom.searchSockets.value !== '' ? parseInt(dom.searchSockets.value, 10) : undefined;
  const minPrice  = getRawPrice(dom.searchMinPrice) ?? undefined;
  const maxPrice  = getRawPrice(dom.searchMaxPrice) ?? undefined;

  if (!query && !major && !minor) { setStatus('Enter search terms', 'warn'); return; }

  dom.searchResults.innerHTML = '<div class="placeholder-text"><span class="spinner"></span></div>';
  dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
  setStatus('Searching…', 'warn');

  try {
    const data = await getListings({ search: query, majorType: major, minorType: minor,
      quality, plusLevel, sockets, minPrice, maxPrice, server: state.server });
    const items = Array.isArray(data) ? data : (data?.listings ?? data?.items ?? []);
    state.searchItems = sortItems(items, state.searchSort.key, state.searchSort.dir);
    dom.searchCount.textContent = `(${items.length})`;
    renderListings(state.searchItems, dom.searchResults);
    updatePriceSummary(items);
    setStatus(`${items.length} results`, 'ok');
  } catch (err) {
    dom.searchResults.innerHTML = `<div class="placeholder-text" style="color:var(--red)">Search failed: ${escHtml(err.message)}</div>`;
    setStatus('Search error', 'error');
  }
}

dom.searchBtn.addEventListener('click', doSearch);
dom.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

dom.searchClear.addEventListener('click', () => {
  dom.searchInput.value = dom.searchMajor.value = dom.searchMinor.value =
  dom.searchQuality.value = dom.searchPlus.value = dom.searchSockets.value = '';
  dom.searchMinPrice.value = dom.searchMinPrice.dataset.raw = '';
  dom.searchMaxPrice.value = dom.searchMaxPrice.dataset.raw = '';
  dom.searchResults.innerHTML = '<div class="placeholder-text">Enter search terms above</div>';
  dom.searchCount.textContent = '';
  dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
  state.searchItems = [];
  clearPinnedMinimap();
  setStatus('Ready', 'ok');
});

// ── History Tab ───────────────────────────────────────────────────────────────

dom.dayBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dom.dayBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.historyDays = parseInt(btn.dataset.days);
    loadHistory();
  });
});

async function loadHistory() {
  if (!window.electronAPI?.queryPriceHistory) {
    dom.chartPlaceholder.textContent = 'DB query unavailable — start the poller first';
    dom.chartPlaceholder.style.display = 'flex';
    return;
  }

  const filters = {
    itemName:   dom.historyItemName.value.trim(),
    minorClass: dom.historyMinor.value,
    quality:    dom.historyQuality.value,
    plusLevel:  dom.historyPlus.value !== '' ? parseInt(dom.historyPlus.value) : null,
    sockets:    dom.historySockets.value !== '' ? parseInt(dom.historySockets.value) : null,
    server:     state.server,
    days:       state.historyDays,
  };

  dom.chartPlaceholder.textContent = 'Loading…';
  dom.chartPlaceholder.style.display = 'flex';

  try {
    const points = await window.electronAPI.queryPriceHistory(filters);
    if (!points.length) {
      dom.chartPlaceholder.textContent = 'No history data for the current filters';
      dom.histLow.textContent = dom.histMed.textContent = dom.histHigh.textContent = '—';
      setStatus('No history rows matched', 'warn');
      return;
    }
    dom.chartPlaceholder.style.display = 'none';
    drawChart(points);

    const lows  = points.map(p => p.lowest).filter(Number.isFinite).sort((a, b) => a - b);
    const avgs  = points.map(p => p.avg).filter(Number.isFinite).sort((a, b) => a - b);
    const highs = points.map(p => p.highest).filter(Number.isFinite).sort((a, b) => a - b);
    dom.histLow.textContent  = formatPrice(lows[0] ?? null);
    dom.histMed.textContent  = formatPrice(avgs[Math.floor(avgs.length / 2)] ?? null);
    dom.histHigh.textContent = formatPrice(highs[highs.length - 1] ?? null);
    setStatus(`History loaded (${points.length} buckets)`, 'ok');
  } catch (err) {
    dom.chartPlaceholder.textContent = `Failed to load history: ${err.message}`;
    setStatus('History error', 'error');
  }
}

dom.historySearchBtn.addEventListener('click', loadHistory);
dom.historyItemName.addEventListener('keydown', e => { if (e.key === 'Enter') loadHistory(); });

dom.historyClear.addEventListener('click', () => {
  dom.historyItemName.value = dom.historyMinor.value = dom.historyQuality.value =
  dom.historyPlus.value = dom.historySockets.value = '';
  dom.histLow.textContent = dom.histMed.textContent = dom.histHigh.textContent = '—';
  dom.chartPlaceholder.textContent = 'Set filters and click Load';
  dom.chartPlaceholder.style.display = 'flex';
  dom.chartCanvas.getContext('2d').clearRect(0, 0, dom.chartCanvas.width, dom.chartCanvas.height);
});

// ── Chart ─────────────────────────────────────────────────────────────────────

function drawChart(points) {
  const canvas = dom.chartCanvas;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth;
  const H = canvas.parentElement.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const prices = points.map(p => p.avg ?? p.lowest ?? 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const PAD = { top: 10, right: 10, bottom: 20, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  ctx.strokeStyle = '#1e1e2e';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
    ctx.fillStyle = '#444466';
    ctx.font = '9px Share Tech Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatPrice(max - (range / 4) * i), PAD.left - 4, y + 3);
  }

  const pts = prices.map((p, i) => ({
    x: PAD.left + (i / Math.max(prices.length - 1, 1)) * plotW,
    y: PAD.top + plotH - ((p - min) / range) * plotH,
  }));

  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
  grad.addColorStop(0, 'rgba(200,168,75,0.3)');
  grad.addColorStop(1, 'rgba(200,168,75,0.0)');

  ctx.beginPath();
  pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(pts[pts.length - 1].x, PAD.top + plotH);
  ctx.lineTo(pts[0].x, PAD.top + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
  ctx.strokeStyle = '#c8a84b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  pts.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0cb6a';
    ctx.fill();
  });
}

// ── Watch Tab ─────────────────────────────────────────────────────────────────

setupSortableHeader(
  document.querySelector('#tab-watch .listings-header'),
  dom.watchMatches,
  () => state.watchSort,
  s => { state.watchSort = s; },
  () => state.watchItems,
  (items, container) => renderListings(items, container),
);

dom.watchUseHistoryBtn.addEventListener('click', async () => {
  if (!window.electronAPI?.queryWatchBaseline) { setStatus('DB unavailable — start the poller', 'warn'); return; }
  const basis = dom.watchPriceBasis.value;
  const pct   = parseFloat(dom.watchPricePct.value);
  if (!basis) { setStatus('Select a basis (lowest / average)', 'warn'); return; }
  if (isNaN(pct) || pct < 0) { setStatus('Enter a valid percentage', 'warn'); return; }
  try {
    const baseline = await window.electronAPI.queryWatchBaseline({
      itemName:   dom.watchItem.value.trim(),
      minorClass: dom.watchMinor.value,
      quality:    dom.watchQuality.value,
      plusLevel:  dom.watchPlus.value !== '' ? parseInt(dom.watchPlus.value) : null,
      sockets:    dom.watchSockets.value !== '' ? parseInt(dom.watchSockets.value) : null,
      server:     state.server,
    });
    if (!baseline) { setStatus('No history data for these filters', 'warn'); return; }
    const base = basis === 'lowest' ? baseline.lowest : baseline.avg;
    if (base == null) { setStatus('Baseline unavailable', 'warn'); return; }
    const maxPrice = Math.floor(base * (1 - pct / 100));
    dom.watchPrice.dataset.raw = String(maxPrice);
    dom.watchPrice.value = priceFormatter.format(maxPrice);
    setStatus(`Price set: ${formatPrice(maxPrice)} gold`, 'ok');
  } catch (_) { setStatus('Baseline query failed', 'error'); }
});

function buildWatchFilters() {
  return {
    search:    dom.watchItem.value.trim(),
    minorType: dom.watchMinor.value,
    quality:   dom.watchQuality.value,
    plusLevel: dom.watchPlus.value !== '' ? parseInt(dom.watchPlus.value, 10) : undefined,
    sockets:   dom.watchSockets.value !== '' ? parseInt(dom.watchSockets.value, 10) : undefined,
    maxPrice:  getRawPrice(dom.watchPrice) ?? undefined,
    server:    state.server,
  };
}

function startWatch() {
  const filters  = buildWatchFilters();
  const interval = parseInt(dom.watchInterval.value);
  if (!filters.search && !filters.minorType) { setStatus('Enter an item name or category to watch', 'warn'); return; }
  if (!filters.maxPrice) { setStatus('Enter a max price', 'warn'); return; }
  if (state.watchCancel) { state.watchCancel(); state.watchCancel = null; }
  dom.watchDot.classList.add('active');
  dom.watchText.innerHTML = `Watching <strong>${escHtml(filters.search || filters.minorType)}</strong> ≤ <strong>${formatPrice(filters.maxPrice)}</strong>`;
  dom.watchStartBtn.textContent = '■ Stop';
  dom.watchStartBtn.style.background = 'var(--red-dim)';
  dom.watchStartBtn.style.borderColor = 'var(--red)';
  setStatus('Watching…', 'ok');
  state.watchCancel = watchForDeal(filters, matches => {
    matches.forEach(match => { showDealAlert(match); state.watchItems.unshift(match); });
    renderListings(sortItems(state.watchItems, state.watchSort.key, state.watchSort.dir), dom.watchMatches);
  }, interval);
}

function stopWatch() {
  if (state.watchCancel) { state.watchCancel(); state.watchCancel = null; }
  dom.watchDot.classList.remove('active');
  dom.watchText.textContent = 'No active watch';
  dom.watchStartBtn.textContent = '▶ Watch';
  dom.watchStartBtn.style.background = dom.watchStartBtn.style.borderColor = '';
  setStatus('Watch stopped', 'ok');
}

dom.watchStartBtn.addEventListener('click', () => { if (state.watchCancel) stopWatch(); else startWatch(); });

dom.watchClear.addEventListener('click', () => {
  stopWatch();
  dom.watchItem.value = dom.watchMinor.value = dom.watchQuality.value =
  dom.watchPlus.value = dom.watchSockets.value = '';
  dom.watchPrice.value = dom.watchPrice.dataset.raw = '';
  dom.watchPriceBasis.value = dom.watchPricePct.value = '';
  state.watchItems = [];
  dom.watchMatches.innerHTML = '<div class="placeholder-text">Matches will appear here</div>';
  clearPinnedMinimap();
});

function showDealAlert(listing) {
  playAlertSound();
  dom.alertItemName.textContent = listing.AttributeName ?? '—';
  dom.alertSeller.textContent   = 'Seller: ' + (listing.SellerName ?? '—');
  dom.alertPrice.textContent    = formatPrice(listing.Price ?? listing.price) + ' gold';
  dom.alertPopup.classList.add('show');
  setTimeout(() => dom.alertPopup.classList.remove('show'), 5000);
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function applyOpacity(pct) {
  const clamped = Math.max(10, Math.min(100, pct));
  dom.opacitySlider.value = clamped;
  dom.opacityInput.value  = clamped;
  window.electronAPI?.setOpacity?.(clamped / 100);
  localStorage.setItem('opacity', String(clamped));
}

dom.opacitySlider.addEventListener('input',  () => applyOpacity(parseInt(dom.opacitySlider.value)));
dom.opacityInput.addEventListener('change',  () => applyOpacity(parseInt(dom.opacityInput.value)));
dom.resetPositionBtn.addEventListener('click', () => {
  window.electronAPI?.resetWindowPosition?.();
  setStatus('Position reset', 'ok');
});

function renderAutomationState(nextState) {
  state.automationState = nextState;
  if (!nextState) {
    dom.automationHelperStatus.textContent = 'Unavailable';
    dom.automationTargetStatus.textContent = 'Unavailable';
    dom.automationMasterStatus.textContent = 'Unavailable';
    return;
  }

  const helperStatus = nextState.helperStatus || {};
  const targetStatus = nextState.gameAttachmentStatus || {};
  const runtimeState = nextState.runtimeState || {};
  const overlayState = nextState.overlayState || {};
  const activeProfile = nextState.activeProfile || {};
  const gameTarget = activeProfile.gameTarget || {};
  const buffs = activeProfile.buffs || {};
  const hotkeys = activeProfile.hotkeys || {};

  populateAutomationHotkeySelects();

  dom.automationHelperStatus.textContent = helperStatus.lastError?.code
    ? `${helperStatus.lifecycle || 'unknown'} · ${helperStatus.lastError.code}`
    : (helperStatus.lifecycle || 'unknown');
  dom.automationTargetStatus.textContent = targetStatus.attached
    ? (targetStatus.isForeground ? 'Attached · foreground' : 'Attached · background')
    : 'Not attached';
  dom.automationMasterStatus.textContent = runtimeState.masterEnabled ? 'ON' : 'OFF';
  setControlValueIfIdle(dom.automationProfileName, activeProfile.name || '');
  setControlValueIfIdle(dom.automationProfileDescription, activeProfile.description || '');
  setControlValueIfIdle(dom.automationTargetTitle, gameTarget.windowTitlePattern || '');
  setControlValueIfIdle(dom.automationTargetMatchMode, gameTarget.matchMode || 'process-first');
  setControlValueIfIdle(dom.automationTargetProcessName, gameTarget.processName || '');
  setControlValueIfIdle(dom.automationTargetRequireForeground, Boolean(gameTarget.requireForegroundForInput), 'checked');
  setControlValueIfIdle(dom.automationTargetPollInterval, gameTarget.windowPollIntervalMs ?? 500);
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
    label: dom.automationBuffStigmaLabel,
    durationSec: dom.automationBuffStigmaDuration,
    warn1Sec: dom.automationBuffStigmaWarn1,
    warn2Sec: dom.automationBuffStigmaWarn2,
  }, buffs.stigma || {});
  setNestedControlValues({
    label: dom.automationBuffShieldLabel,
    durationSec: dom.automationBuffShieldDuration,
    warn1Sec: dom.automationBuffShieldWarn1,
    warn2Sec: dom.automationBuffShieldWarn2,
  }, buffs.shield || {});
  setNestedControlValues({
    label: dom.automationBuffInvisibilityLabel,
    durationSec: dom.automationBuffInvisibilityDuration,
    warn1Sec: dom.automationBuffInvisibilityWarn1,
    warn2Sec: dom.automationBuffInvisibilityWarn2,
  }, buffs.invisibility || {});
  setControlValueIfIdle(dom.automationBuffStigmaVisible, Boolean(buffs.stigma?.visibleInOverlay), 'checked');
  setControlValueIfIdle(dom.automationBuffShieldVisible, Boolean(buffs.shield?.visibleInOverlay), 'checked');
  setControlValueIfIdle(dom.automationBuffInvisibilityVisible, Boolean(buffs.invisibility?.visibleInOverlay), 'checked');
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
  if (dom.automationToggleLeft) dom.automationToggleLeft.textContent = `Left ${runtimeState.leftClickerEnabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleRight) dom.automationToggleRight.textContent = `Right ${runtimeState.rightClickerEnabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleF7) dom.automationToggleF7.textContent = `F7 ${runtimeState.f7Enabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleShift) dom.automationToggleShift.textContent = `Shift ${runtimeState.shiftHeldEnabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleCtrl) dom.automationToggleCtrl.textContent = `Ctrl ${runtimeState.ctrlHeldEnabled ? 'ON' : 'OFF'}`;

  if (dom.automationProfile) {
    const profiles = nextState.profilesSummary || [];
    const previous = dom.automationProfile.value;
    dom.automationProfile.innerHTML = profiles
      .map(profile => `<option value="${escHtml(profile.id)}">${escHtml(profile.name)}</option>`)
      .join('');
    dom.automationProfile.value = nextState.activeProfileId || previous;
  }

  if (dom.automationBuffList) {
    const activeProfile = nextState.activeProfile || {};
    const configuredBuffs = activeProfile.buffs || {};
    const runtimeBuffs = nextState.buffRuntimeState || {};
    dom.automationBuffList.innerHTML = Object.keys(configuredBuffs).map(buffId => {
      const config = configuredBuffs[buffId];
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

    dom.automationBuffList.querySelectorAll('.automation-buff-toggle').forEach(button => {
      button.addEventListener('click', async () => {
        const buffId = button.dataset.buffId;
        await window.electronAPI?.automation?.toggleBuff?.(buffId);
        pushAutomationLog(`buff ${buffId} toggled`);
        void refreshAutomationState();
      });
    });

    dom.automationBuffList.querySelectorAll('.automation-buff-pause').forEach(button => {
      button.addEventListener('click', async () => {
        const buffId = button.dataset.buffId;
        await window.electronAPI?.automation?.pauseBuff?.(buffId);
        pushAutomationLog(`buff ${buffId} pause toggled`);
        void refreshAutomationState();
      });
    });
  }

  if (nextState.lastError?.message) {
    pushAutomationLog(`error: ${nextState.lastError.message}`);
  }
}

async function refreshAutomationState() {
  if (!window.electronAPI?.automation?.getState) return;
  try {
    const currentState = await window.electronAPI.automation.getState();
    renderAutomationState(currentState);
  } catch (error) {
    pushAutomationLog(`refresh failed: ${error.message}`);
  }
}

async function runAutomationTest(action) {
  try {
    const result = await window.electronAPI?.automation?.testAction?.(action, {});
    if (result?.ok) {
      pushAutomationLog(`test ${action}: ok`);
      setStatus(`Automation test ${action} sent`, 'ok');
    } else {
      pushAutomationLog(`test ${action}: ${result?.error?.message || 'failed'}`);
      setStatus(`Automation test ${action} failed`, 'warn');
    }
  } catch (error) {
    pushAutomationLog(`test ${action}: ${error.message}`);
    setStatus(`Automation test ${action} error`, 'error');
  }
}

async function toggleAutomationRuntime(toggleId, currentValue) {
  try {
    await window.electronAPI?.automation?.setRuntimeToggle?.(toggleId, !currentValue);
    pushAutomationLog(`${toggleId} set to ${!currentValue ? 'on' : 'off'}`);
    void refreshAutomationState();
  } catch (error) {
    pushAutomationLog(`${toggleId} failed: ${error.message}`);
    setStatus(`Automation toggle ${toggleId} failed`, 'error');
  }
}

dom.automationRefreshBtn?.addEventListener('click', () => { void refreshAutomationState(); });
dom.automationRestartBtn?.addEventListener('click', async () => {
  await window.electronAPI?.automation?.restartHelper?.();
  pushAutomationLog('helper restart requested');
  void refreshAutomationState();
});
dom.automationMasterBtn?.addEventListener('click', async () => {
  const nextValue = !state.automationState?.runtimeState?.masterEnabled;
  await window.electronAPI?.automation?.setMasterEnabled?.(nextValue);
  pushAutomationLog(`master set to ${nextValue ? 'on' : 'off'}`);
  void refreshAutomationState();
});
dom.automationStopBtn?.addEventListener('click', async () => {
  await window.electronAPI?.automation?.emergencyStop?.();
  pushAutomationLog('emergency stop requested');
  void refreshAutomationState();
});
dom.automationToggleLeft?.addEventListener('click', () => {
  void toggleAutomationRuntime('leftClickerEnabled', Boolean(state.automationState?.runtimeState?.leftClickerEnabled));
});
dom.automationToggleRight?.addEventListener('click', () => {
  void toggleAutomationRuntime('rightClickerEnabled', Boolean(state.automationState?.runtimeState?.rightClickerEnabled));
});
dom.automationToggleF7?.addEventListener('click', () => {
  void toggleAutomationRuntime('f7Enabled', Boolean(state.automationState?.runtimeState?.f7Enabled));
});
dom.automationToggleShift?.addEventListener('click', () => {
  void toggleAutomationRuntime('shiftHeldEnabled', Boolean(state.automationState?.runtimeState?.shiftHeldEnabled));
});
dom.automationToggleCtrl?.addEventListener('click', () => {
  void toggleAutomationRuntime('ctrlHeldEnabled', Boolean(state.automationState?.runtimeState?.ctrlHeldEnabled));
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
  } catch (error) {
    pushAutomationLog(`delete profile failed: ${error.message}`);
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
  const activeProfileId = state.automationState?.activeProfileId;
  const activeProfile = state.automationState?.activeProfile;
  if (!activeProfileId || !activeProfile) return;
  await window.electronAPI?.automation?.updateProfile?.(activeProfileId, {
    runtime: {
      ...activeProfile.runtime,
      leftClickIntervalMs: parseInt(dom.automationLeftInterval.value, 10) || activeProfile.runtime.leftClickIntervalMs,
      rightClickIntervalMs: parseInt(dom.automationRightInterval.value, 10) || activeProfile.runtime.rightClickIntervalMs,
      f7IntervalMs: parseInt(dom.automationF7Interval.value, 10) || activeProfile.runtime.f7IntervalMs,
      jitterPercent: parseInt(dom.automationJitter.value, 10) || activeProfile.runtime.jitterPercent,
    },
  });
  pushAutomationLog('runtime settings saved');
  void refreshAutomationState();
});
dom.automationSaveProfileTarget?.addEventListener('click', async () => {
  const activeProfileId = state.automationState?.activeProfileId;
  const activeProfile = state.automationState?.activeProfile;
  if (!activeProfileId || !activeProfile) return;
  await window.electronAPI?.automation?.updateProfile?.(activeProfileId, {
    name: dom.automationProfileName.value.trim() || activeProfile.name,
    description: dom.automationProfileDescription.value.trim(),
    gameTarget: {
      ...activeProfile.gameTarget,
      windowTitlePattern: dom.automationTargetTitle.value.trim() || activeProfile.gameTarget.windowTitlePattern,
      matchMode: dom.automationTargetMatchMode.value,
      processName: dom.automationTargetProcessName.value.trim(),
      requireForegroundForInput: Boolean(dom.automationTargetRequireForeground.checked),
      windowPollIntervalMs: parseInt(dom.automationTargetPollInterval.value, 10) || activeProfile.gameTarget.windowPollIntervalMs,
    },
  });
  pushAutomationLog('profile target saved');
  void refreshAutomationState();
});
dom.automationSaveBuffs?.addEventListener('click', async () => {
  const activeProfileId = state.automationState?.activeProfileId;
  const activeProfile = state.automationState?.activeProfile;
  if (!activeProfileId || !activeProfile) return;
  await window.electronAPI?.automation?.updateProfile?.(activeProfileId, {
    buffs: {
      ...activeProfile.buffs,
      stigma: {
        ...activeProfile.buffs.stigma,
        label: dom.automationBuffStigmaLabel.value.trim() || activeProfile.buffs.stigma.label,
        durationSec: parseInt(dom.automationBuffStigmaDuration.value, 10) || activeProfile.buffs.stigma.durationSec,
        warn1Sec: parseInt(dom.automationBuffStigmaWarn1.value, 10) || activeProfile.buffs.stigma.warn1Sec,
        warn2Sec: parseInt(dom.automationBuffStigmaWarn2.value, 10) || activeProfile.buffs.stigma.warn2Sec,
        visibleInOverlay: Boolean(dom.automationBuffStigmaVisible.checked),
      },
      shield: {
        ...activeProfile.buffs.shield,
        label: dom.automationBuffShieldLabel.value.trim() || activeProfile.buffs.shield.label,
        durationSec: parseInt(dom.automationBuffShieldDuration.value, 10) || activeProfile.buffs.shield.durationSec,
        warn1Sec: parseInt(dom.automationBuffShieldWarn1.value, 10) || activeProfile.buffs.shield.warn1Sec,
        warn2Sec: parseInt(dom.automationBuffShieldWarn2.value, 10) || activeProfile.buffs.shield.warn2Sec,
        visibleInOverlay: Boolean(dom.automationBuffShieldVisible.checked),
      },
      invisibility: {
        ...activeProfile.buffs.invisibility,
        label: dom.automationBuffInvisibilityLabel.value.trim() || activeProfile.buffs.invisibility.label,
        durationSec: parseInt(dom.automationBuffInvisibilityDuration.value, 10) || activeProfile.buffs.invisibility.durationSec,
        warn1Sec: parseInt(dom.automationBuffInvisibilityWarn1.value, 10) || activeProfile.buffs.invisibility.warn1Sec,
        warn2Sec: parseInt(dom.automationBuffInvisibilityWarn2.value, 10) || activeProfile.buffs.invisibility.warn2Sec,
        visibleInOverlay: Boolean(dom.automationBuffInvisibilityVisible.checked),
      },
    },
  });
  pushAutomationLog('buff configuration saved');
  void refreshAutomationState();
});
dom.automationSaveHotkeys?.addEventListener('click', async () => {
  const activeProfileId = state.automationState?.activeProfileId;
  const activeProfile = state.automationState?.activeProfile;
  if (!activeProfileId || !activeProfile) return;
  const withBinding = (entry, binding) => ({
    ...entry,
    binding,
    enabled: Boolean(binding),
  });
  await window.electronAPI?.automation?.updateProfile?.(activeProfileId, {
    hotkeys: {
      ...activeProfile.hotkeys,
      masterToggle: withBinding(activeProfile.hotkeys.masterToggle, dom.automationHotkeyMaster.value),
      emergencyStop: withBinding(activeProfile.hotkeys.emergencyStop, dom.automationHotkeyEmergency.value),
      leftToggle: withBinding(activeProfile.hotkeys.leftToggle, dom.automationHotkeyLeft.value),
      rightToggle: withBinding(activeProfile.hotkeys.rightToggle, dom.automationHotkeyRight.value),
      f7Toggle: withBinding(activeProfile.hotkeys.f7Toggle, dom.automationHotkeyF7.value),
      shiftToggle: withBinding(activeProfile.hotkeys.shiftToggle, dom.automationHotkeyShift.value),
      ctrlToggle: withBinding(activeProfile.hotkeys.ctrlToggle, dom.automationHotkeyCtrl.value),
      stigmaActivate: withBinding(activeProfile.hotkeys.stigmaActivate, dom.automationHotkeyStigma.value),
      shieldActivate: withBinding(activeProfile.hotkeys.shieldActivate, dom.automationHotkeyShield.value),
      invisibilityActivate: withBinding(activeProfile.hotkeys.invisibilityActivate, dom.automationHotkeyInvisibility.value),
    },
  });
  pushAutomationLog('hotkeys saved');
  void refreshAutomationState();
});
dom.automationSaveOverlays?.addEventListener('click', async () => {
  const activeProfileId = state.automationState?.activeProfileId;
  const activeProfile = state.automationState?.activeProfile;
  if (!activeProfileId || !activeProfile) return;
  await window.electronAPI?.automation?.updateProfile?.(activeProfileId, {
    overlays: {
      ...activeProfile.overlays,
      hudEnabled: Boolean(dom.automationHudEnabled.checked),
      buffOverlayEnabled: Boolean(dom.automationBuffsEnabled.checked),
      compactHud: Boolean(dom.automationCompactHud.checked),
      showOnlyActiveBuffs: Boolean(dom.automationShowActiveBuffsOnly.checked),
      hideHudWhenGameUnfocused: Boolean(dom.automationHideHudUnfocused.checked),
      hideBuffOverlayWhenGameUnfocused: Boolean(dom.automationHideBuffsUnfocused.checked),
      anchorMode: dom.automationAnchorMode.value,
    },
  });
  pushAutomationLog('overlay preferences saved');
  void refreshAutomationState();
});
dom.automationTestLeft?.addEventListener('click', () => { void runAutomationTest('leftClick'); });
dom.automationTestRight?.addEventListener('click', () => { void runAutomationTest('rightClick'); });
dom.automationTestF7?.addEventListener('click', () => { void runAutomationTest('f7Press'); });
dom.automationTestRelease?.addEventListener('click', () => { void runAutomationTest('releaseModifiers'); });

if (window.electronAPI?.automation) {
  window.electronAPI.automation.onStateChanged(nextState => renderAutomationState(nextState));
  window.electronAPI.automation.onHelperStatus(status => {
    pushAutomationLog(`helper ${status.lifecycle}${status.lastError?.code ? ` (${status.lastError.code})` : ''}`);
    if (state.automationState) {
      renderAutomationState({ ...state.automationState, helperStatus: status });
    }
  });
  window.electronAPI.automation.onDiagnosticLog(entry => {
    pushAutomationLog(typeof entry?.message === 'string' ? entry.message : JSON.stringify(entry));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
  setAltToggleState(false);
  setStatus('Ready — Press ALT to interact', 'ok');
  const savedOpacity = localStorage.getItem('opacity');
  if (savedOpacity) applyOpacity(parseInt(savedOpacity));
  await Promise.allSettled([ensureFilterMeta(), ensureMapImage(), ensurePool(), updateMinimapSide()]);
  await refreshAutomationState();
})();
