/**
 * Conquer Market Overlay — Renderer Process
 */

import { getListings, getFilters, watchForDeal, loadMarketSnapshot, WEAPON_1H_CLASSES, WEAPON_2H_CLASSES } from './api.js';
import {
  init as initMinimap, MINIMAP_POPUP_WIDTH,
  ensureMapImage, updateMinimapSide,
  showMinimapPopup, hideMinimapPopup,
  togglePinnedMinimap, clearPinnedMinimap,
  isPinnedListing, getListingKey, refreshPinnedListingStyles,
} from './renderer/minimap.js';
import { drawChart } from './renderer/chart.js';

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
  filterMeta:       null,
  mapImage:         null,
  minimapSide:      'right',
  minimapPinned:    null,
  automationState:  null,
  automationLog:    [],
  automationHelperLifecycle: '',
  automationHelperErrorCode: '',
  historyPoints:    [],
  chartPts:         null,
};


// ── DOM Refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const dom = {
  titlebar:            $('titlebar'),
  btnCollapse:         $('btn-collapse'),
  btnClose:            $('btn-close'),
  tabs:                document.querySelectorAll('.tab'),
  tabPanels:           document.querySelectorAll('.tab-panel'),
  btnSettingsTab:      $('btn-settings-tab'),
  serverBtns:          document.querySelectorAll('.server-btn'),

  searchInput:         $('search-input'),
  searchAutocomplete:  $('search-autocomplete'),
  searchMajor:         $('search-major'),
  searchMinor:         $('search-minor'),
  searchQuality:       $('search-quality'),
  searchPlus:          $('search-plus'),
  searchSockets:       $('search-sockets'),
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
  historyMajor:        $('history-major'),
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
  watchMajor:          $('watch-major'),
  watchMinor:          $('watch-minor'),
  watchQuality:        $('watch-quality'),
  watchPlus:           $('watch-plus'),
  watchSockets:        $('watch-sockets'),
  watchInterval:       $('watch-interval'),
  watchPriceBasis:     $('watch-price-basis'),
  watchPricePct:       $('watch-price-pct'),
  watchUseHistoryBtn:  $('watch-use-history-btn'),
  watchPrice:          $('watch-price'),
  watchMinCount:       $('watch-mincount'),
  watchStartBtn:       $('watch-start-btn'),
  watchClear:          $('watch-clear'),
  watchDot:            $('watch-dot'),
  watchText:           $('watch-text'),
  watchMatches:        $('watch-matches'),

  themeSelect:         $('theme-select'),
  uiScaleSelect:       $('ui-scale-select'),
  fontPairingSelect:   $('font-pairing-select'),
  opacitySlider:       $('opacity-slider'),
  opacityInput:        $('opacity-input'),
  textOpacitySlider:   $('text-opacity-slider'),
  textOpacityInput:    $('text-opacity-input'),
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
  automationCopyLog:   $('automation-copy-log'),
  automationLog:       $('automation-log'),
  automationBuffList:  $('automation-buff-list'),

  alertPopup:          $('alert-popup'),
  alertItemName:       $('alert-item-name'),
  alertSeller:         $('alert-seller'),
  alertPrice:          $('alert-price'),

  altIndicator:        $('alt-indicator'),
  statusText:          $('status-text'),
  statusDot:           $('status-dot'),

  // New additions
  automationFkeyCode:              $('automation-fkey-code'),
  automationBuffStigmaMode:        $('automation-buff-stigma-mode'),
  automationBuffShieldMode:        $('automation-buff-shield-mode'),
  automationBuffInvisibilityMode:  $('automation-buff-invisibility-mode'),
  filterRememberServer:            $('filter-remember-server'),
  chartExpandBtn:                  $('chart-expand-btn'),
  chartTooltip:                    $('chart-tooltip'),
  chartModal:                      $('chart-modal'),
  chartModalCanvas:                $('chart-modal-canvas'),
  chartModalClose:                 $('chart-modal-close'),
  appHotkeyInteract:               $('app-hotkey-interact'),
  appHotkeyCollapse:               $('app-hotkey-collapse'),
  appHotkeyHide:                   $('app-hotkey-hide'),
  appHotkeyQuit:                   $('app-hotkey-quit'),
  appSaveHotkeys:                  $('app-save-hotkeys'),
};

initMinimap(dom, state);

// ── Utilities ─────────────────────────────────────────────────────────────────

const PLUS_DIVISOR = [0, 1, 3, 9, 27, 81, 243, 729, 2187, 6561];

function perPlusHtml(item) {
  const lvl = Number(item.AdditionLevel);
  if (!lvl || lvl < 2 || lvl > 9) return '';
  const price = Number(item.Price ?? item.price);
  if (!Number.isFinite(price) || price <= 0) return '';
  return `<span class="listing-per-plus">${formatPrice(Math.round(price / PLUS_DIVISOR[lvl]))}/+1</span>`;
}

function formatPrice(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return parseFloat((n / 1_000).toFixed(3)) + 'K';
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
  state.automationLog = state.automationLog.slice(0, 25);
  if (dom.automationLog) {
    dom.automationLog.textContent = state.automationLog.join('\n');
  }
}

function formatAutomationTargetSummary(target) {
  if (!target) return '';
  const parts = [];
  if (typeof target.isForeground === 'boolean') {
    parts.push(`foreground=${target.isForeground ? 'yes' : 'no'}`);
  }
  if (target.matchedPattern) {
    parts.push(`pattern=${target.matchedPattern}`);
  }
  if (target.title) {
    parts.push(`title=${target.title}`);
  }
  return parts.join(' | ');
}

function formatAutomationDetailSummary(details) {
  if (!details || typeof details !== 'object') return '';
  const parts = [];
  if (details.runtime && typeof details.runtime === 'object') {
    const runtime = details.runtime;
    const flags = [
      `master=${runtime.masterEnabled ? 'on' : 'off'}`,
      `left=${runtime.leftClickerEnabled ? 'on' : 'off'}`,
      `right=${runtime.rightClickerEnabled ? 'on' : 'off'}`,
      `f7=${runtime.f7Enabled ? 'on' : 'off'}`,
      `shift=${runtime.shiftHeldEnabled ? 'on' : 'off'}`,
      `ctrl=${runtime.ctrlHeldEnabled ? 'on' : 'off'}`,
    ];
    parts.push(flags.join(','));
  }
  if (details.delivery) {
    parts.push(`delivery=${details.delivery}`);
  }
  if (details.cursor && Number.isFinite(details.cursor.x) && Number.isFinite(details.cursor.y)) {
    parts.push(`cursor=${details.cursor.x},${details.cursor.y}`);
  }
  if (typeof details.isForeground === 'boolean') {
    parts.push(`foreground=${details.isForeground ? 'yes' : 'no'}`);
  }
  if (details.title) {
    parts.push(`title=${details.title}`);
  }
  if (details.matchedPattern) {
    parts.push(`pattern=${details.matchedPattern}`);
  }
  if (details.hotkeyId) {
    parts.push(`hotkey=${details.hotkeyId}`);
  }
  if (details.binding) {
    parts.push(`binding=${details.binding}`);
  }
  if (typeof details.activated === 'boolean') {
    parts.push(`activated=${details.activated ? 'yes' : 'no'}`);
  }
  return parts.join(' | ');
}

function formatAutomationDiagnosticEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return typeof entry === 'string' ? entry : JSON.stringify(entry);
  }

  const baseMessage = typeof entry.message === 'string' ? entry.message : JSON.stringify(entry);
  const parts = [];

  if (entry.focusAttempted) {
    parts.push(`focus=${entry.focusResult?.activated ? 'ok' : 'failed'}`);
  }

  const detailSummary = formatAutomationDetailSummary(entry.details);
  if (detailSummary) {
    parts.push(detailSummary);
  }

  const targetSummary = formatAutomationTargetSummary(entry.target);
  if (targetSummary) {
    parts.push(targetSummary);
  }

  return parts.length ? `${baseMessage} | ${parts.join(' | ')}` : baseMessage;
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

// ── Gold Shorthand Parser ─────────────────────────────────────────────────────

function parseGoldShorthand(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase().replace(/,/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(k{1,3}|m|b)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2] || '';
  if (suffix === 'k')   return Math.round(num * 1_000);
  if (suffix === 'kk' || suffix === 'm') return Math.round(num * 1_000_000);
  if (suffix === 'kkk' || suffix === 'b') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function setupGoldShorthandInput(input) {
  input.dataset.raw = '';
  input.addEventListener('focus', () => {
    if (input.dataset.raw) input.value = input.dataset.raw;
  });
  input.addEventListener('blur', () => {
    const result = parseGoldShorthand(input.value);
    if (result != null) {
      input.dataset.raw = String(result);
      input.value = priceFormatter.format(result);
    } else {
      input.dataset.raw = '';
    }
  });
}

setupGoldShorthandInput(dom.searchMaxPrice);
setupGoldShorthandInput(dom.watchPrice);

function populateMinorForMajor(majorSelect, minorSelect, placeholder) {
  const major = majorSelect.value;
  const minors = (state.filterMeta?.minorByMajor?.[major]) ?? state.filterMeta?.minorCategories ?? [];
  const prev = minorSelect.value;
  const isWeapon = major.toLowerCase() === 'weapon';
  const groups = isWeapon
    ? [
        `<option value="__weapon_1h__">⚔ 1-Handed (all)</option>`,
        `<option value="__weapon_2h__">🗡 2-Handed (all)</option>`,
      ]
    : [];
  minorSelect.innerHTML = [
    `<option value="">${escHtml(placeholder)}</option>`,
    ...groups,
    ...minors.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`),
  ].join('');
  if (prev && [...minorSelect.options].some(o => o.value === prev)) minorSelect.value = prev;
}

function populateSelect(select, values, placeholder) {
  const previous = select.value;
  select.innerHTML = [`<option value="">${escHtml(placeholder)}</option>`,
    ...values.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`)].join('');
  if (previous && values.includes(previous)) select.value = previous;
}

function populatePlusSelect(select, placeholder) {
  const previous = select.value;
  select.innerHTML = [`<option value="">${escHtml(placeholder)}</option>`,
    ...Array.from({ length: 10 }, (_, i) => `<option value="${i}">+${i}</option>`)].join('');
  if (previous) select.value = previous;
}

const QUALITY_ORDER = ['Fixed', 'Normal', 'Refined', 'Unique', 'Elite', 'Super', 'Legendary'];

function sortQualities(qualities) {
  return [...qualities].sort((a, b) => {
    const ai = QUALITY_ORDER.indexOf(a);
    const bi = QUALITY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

async function ensureFilterMeta() {
  if (state.filterMetaLoaded) return;
  try {
    const filters = await getFilters();
    state.filterMeta = filters;
    const qualities = sortQualities(filters.qualities ?? []);
    populateSelect(dom.searchMajor,   filters.majorCategories ?? [], 'All Categories');
    populateSelect(dom.searchMinor,   filters.minorCategories ?? [], 'All Minor Classes');
    populateSelect(dom.searchQuality, qualities,                     'All Qualities');
    populateSelect(dom.historyMajor,  filters.majorCategories ?? [], 'Any Category');
    populateSelect(dom.historyMinor,  filters.minorCategories ?? [], 'Any Minor Class');
    populateSelect(dom.historyQuality, qualities,                    'Any Quality');
    populateSelect(dom.watchMajor,    filters.majorCategories ?? [], 'Any Category');
    populateSelect(dom.watchMinor,    filters.minorCategories ?? [], 'Any Minor Class');
    populateSelect(dom.watchQuality,  qualities,                     'Any Quality');
    populatePlusSelect(dom.searchPlus,  'Any Plus');
    populatePlusSelect(dom.historyPlus, 'Any Plus');
    populatePlusSelect(dom.watchPlus,   'Any Plus');
    // Wire cascaded minor dropdowns
    dom.searchMajor.addEventListener('change',  () => populateMinorForMajor(dom.searchMajor,  dom.searchMinor,  'All Minor Classes'));
    dom.historyMajor.addEventListener('change', () => populateMinorForMajor(dom.historyMajor, dom.historyMinor, 'Any Minor Class'));
    dom.watchMajor.addEventListener('change',   () => populateMinorForMajor(dom.watchMajor,   dom.watchMinor,   'Any Minor Class'));
    state.filterMetaLoaded = true;
  } catch (_) { /* keep fallback markup */ }
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

// ── Hotkey Capture ────────────────────────────────────────────────────────────

// Symbols that should be expressed as code names in automation (native helper) format
const AUTOMATION_CODE_MAP = {
  ';': 'Semicolon', "'": 'Quote', ',': 'Comma',
  '[': 'BracketLeft', ']': 'BracketRight', '.': 'Period',
  '/': 'Slash', '\\': 'Backslash', '=': 'Equal', '-': 'Minus',
  '`': 'Backquote',
};

function setupHotkeyCapture(inputEl, mode) {
  if (!inputEl) return;

  inputEl.addEventListener('focus', () => {
    if (!inputEl.value) {
      inputEl.placeholder = 'Press a key…';
      inputEl.classList.add('listening');
    }
  });

  inputEl.addEventListener('keydown', e => {
    // Allow Tab to move focus naturally
    if (e.key === 'Tab') return;

    e.preventDefault();
    e.stopPropagation();

    // Backspace with empty value = clear / keep empty
    if (e.key === 'Backspace' && !inputEl.value) {
      inputEl.placeholder = 'Click to bind…';
      inputEl.classList.remove('listening');
      inputEl.blur();
      return;
    }

    // Pure modifier keypress — don't capture yet
    const pureMod = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
    if (pureMod) return;

    const parts = [];
    if (e.ctrlKey)  parts.push(mode === 'app' ? 'Ctrl'    : 'Ctrl');
    if (e.altKey)   parts.push(mode === 'app' ? 'Alt'     : 'Alt');
    if (e.shiftKey) parts.push(mode === 'app' ? 'Shift'   : 'Shift');

    let keyPart;
    if (mode === 'automation') {
      // Native helper format: function keys by name, symbols by code name, letters uppercase
      if (/^F\d+$/.test(e.key)) {
        keyPart = e.key;
      } else if (AUTOMATION_CODE_MAP[e.key]) {
        keyPart = AUTOMATION_CODE_MAP[e.key];
      } else if (e.key === 'Escape') {
        keyPart = 'Escape';
      } else if (e.key === 'Mouse3' || e.code === 'Mouse3') {
        keyPart = 'MouseMiddle';
      } else if (e.key.length === 1) {
        keyPart = e.key.toUpperCase();
      } else {
        keyPart = e.code || e.key;
      }
    } else {
      // Electron accelerator format: function keys, letters uppercase, Escape
      if (/^F\d+$/.test(e.key)) {
        keyPart = e.key;
      } else if (e.key === 'Escape') {
        keyPart = 'Escape';
      } else if (e.key.length === 1) {
        keyPart = e.key.toUpperCase();
      } else {
        keyPart = e.key;
      }
    }

    parts.push(keyPart);
    inputEl.value = parts.join('+');
    inputEl.placeholder = 'Click to bind…';
    inputEl.classList.remove('listening');
    inputEl.blur();
  });

  inputEl.addEventListener('blur', () => {
    inputEl.placeholder = 'Click to bind…';
    inputEl.classList.remove('listening');
  });
}

// ── Server Selector ───────────────────────────────────────────────────────────

dom.serverBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dom.serverBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.server = btn.dataset.server;
    // Persist if "remember server" is checked
    if (dom.filterRememberServer?.checked) {
      localStorage.setItem('savedServer', state.server);
    }
  });
});

// ── Tab Switching ─────────────────────────────────────────────────────────────

function switchTab(tabId) {
  state.activeTab = tabId;
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.btnSettingsTab.classList.toggle('active', tabId === 'settings');
  dom.tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
  hideMinimapPopup();
  if (tabId === 'history') loadHistory();
}

dom.tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
dom.btnSettingsTab.addEventListener('click', () => switchTab('settings'));

// ── Collapse / Expand ─────────────────────────────────────────────────────────

function setCollapsed(val) {
  state.isCollapsed = val;
  document.body.classList.toggle('collapsed', val);
  dom.btnCollapse.textContent = val ? '▼' : '▲';
  const scale = Math.max(0.9, Math.min(1.2, parseFloat(localStorage.getItem('uiScale') || '1')));
  window.electronAPI?.resizeWindow?.({
    width:  Math.round(420 * scale),
    height: val ? Math.round(38 * scale) : Math.round(600 * scale),
  });
}

dom.btnCollapse.addEventListener('click', () => setCollapsed(!state.isCollapsed));
dom.btnClose.addEventListener('click', () => { if (window.electronAPI) window.electronAPI.closeApp(); });
if (window.electronAPI) window.electronAPI.onToggleCollapse(val => setCollapsed(val));

// ── ALT Key Tracking ──────────────────────────────────────────────────────────

function setAltToggleState(isEnabled) {
  state.altHeld = isEnabled;
  dom.altIndicator.classList.toggle('active', isEnabled);
  dom.altIndicator.textContent = isEnabled ? 'Alt+I/F8: click enabled' : 'Alt+I/F8: click-through';
  const baseFraction = Math.max(0.1, Math.min(1, parseFloat(localStorage.getItem('opacity') ?? '100') / 100));
  applyEffectiveBgAlpha(baseFraction);
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
      <span class="listing-name">${escHtml(item.AttributeName ?? '—')}</span>
      <span class="listing-seller">${escHtml(item.SellerName ?? '—')}</span>
      <span class="listing-quality">${escHtml(item.QualityName ?? '—')}</span>
      <span class="listing-pos">${item.PositionX != null ? item.PositionX + ',' + item.PositionY : '—'}</span>
      <span class="listing-price">${formatPrice(item.Price ?? item.price)}${perPlusHtml(item)}</span>
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

// ── Web Audio beep ────────────────────────────────────────────────────────────
// (Minimap, stall grid, projection, listing-key and popup functions live in
//  src/renderer/minimap.js — imported above.)

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
  const maxPrice  = getRawPrice(dom.searchMaxPrice) ?? undefined;

  if (!query && !major && !minor) { setStatus('Enter search terms', 'warn'); return; }

  dom.searchResults.innerHTML = '<div class="placeholder-text"><span class="spinner"></span></div>';
  dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
  setStatus('Searching…', 'warn');

  try {
    const data = await getListings({ search: query, majorType: major, minorType: minor,
      quality, plusLevel, sockets, maxPrice, server: state.server });
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
    majorClass: dom.historyMajor.value,
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
    state.historyPoints = points;
    const { pts } = drawChart(dom.chartCanvas, points, formatPrice);
    state.chartPts = pts;

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
  dom.historyItemName.value = dom.historyMajor.value = dom.historyMinor.value =
  dom.historyQuality.value = dom.historyPlus.value = dom.historySockets.value = '';
  dom.histLow.textContent = dom.histMed.textContent = dom.histHigh.textContent = '—';
  dom.chartPlaceholder.textContent = 'Set filters and click Load';
  dom.chartPlaceholder.style.display = 'flex';
  dom.chartCanvas.getContext('2d').clearRect(0, 0, dom.chartCanvas.width, dom.chartCanvas.height);
});

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
      majorClass: dom.watchMajor.value,
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
    majorType: dom.watchMajor.value,
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
  const minCount = parseInt(dom.watchMinCount.value) || 1;
  if (!filters.search && !filters.majorType && !filters.minorType) { setStatus('Enter an item name or category to watch', 'warn'); return; }
  if (!filters.maxPrice) { setStatus('Enter a max price', 'warn'); return; }
  if (state.watchCancel) { state.watchCancel(); state.watchCancel = null; }
  dom.watchDot.classList.add('active');
  dom.watchText.innerHTML = `Watching <strong>${escHtml(filters.search || filters.majorType || filters.minorType)}</strong> ≤ <strong>${formatPrice(filters.maxPrice)}</strong>`;
  dom.watchStartBtn.textContent = '■ Stop';
  dom.watchStartBtn.style.background = 'var(--red-dim)';
  dom.watchStartBtn.style.borderColor = 'var(--red)';
  setStatus('Watching…', 'ok');
  state.watchCancel = watchForDeal(filters, matches => {
    if (matches.length < minCount) return;
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
  dom.watchItem.value = dom.watchMajor.value = dom.watchMinor.value =
  dom.watchQuality.value = dom.watchPlus.value = dom.watchSockets.value = '';
  dom.watchMinCount.value = '';
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

// ── Chart Tooltip + Modal ─────────────────────────────────────────────────────

function chartHitTest(pts, canvasEl, mouseX) {
  if (!pts || !pts.length) return null;
  const rect = canvasEl.getBoundingClientRect();
  const relX = mouseX - rect.left;
  let best = null;
  let bestDx = Infinity;
  pts.forEach(pt => {
    const dx = Math.abs(pt.x - relX);
    if (dx < bestDx) { bestDx = dx; best = pt; }
  });
  return bestDx < 32 ? best : null;
}

function showChartTooltip(pt, e) {
  if (!pt) { dom.chartTooltip.style.display = 'none'; return; }
  const d = new Date(pt.bucket * 1000);
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dom.chartTooltip.innerHTML = `<span style="color:var(--gold-dim)">${dateStr} ${timeStr}</span><br><strong style="color:var(--gold)">${formatPrice(pt.price)} gold</strong>`;
  dom.chartTooltip.style.display = 'block';
  const tipW = dom.chartTooltip.offsetWidth;
  const left = e.clientX + tipW + 25 > window.innerWidth ? e.clientX - tipW - 25 : e.clientX - 25;
  dom.chartTooltip.style.left = left + 'px';
  dom.chartTooltip.style.top  = (e.clientY - 10) + 'px';
}

dom.chartCanvas?.addEventListener('mousemove', e => {
  const pt = chartHitTest(state.chartPts, dom.chartCanvas, e.clientX);
  showChartTooltip(pt, e);
});
dom.chartCanvas?.addEventListener('mouseleave', () => {
  dom.chartTooltip.style.display = 'none';
});

dom.chartExpandBtn?.addEventListener('click', () => {
  if (!state.historyPoints.length) return;
  dom.chartModal.style.display = 'flex';
  // Defer draw so the modal canvas is visible and has dimensions
  requestAnimationFrame(() => {
    const { pts } = drawChart(dom.chartModalCanvas, state.historyPoints, formatPrice);
    dom.chartModalCanvas._pts = pts;
  });
});

dom.chartModalCanvas?.addEventListener('mousemove', e => {
  const pts = dom.chartModalCanvas._pts;
  const pt = chartHitTest(pts, dom.chartModalCanvas, e.clientX);
  showChartTooltip(pt, e);
});
dom.chartModalCanvas?.addEventListener('mouseleave', () => {
  dom.chartTooltip.style.display = 'none';
});

dom.chartModalClose?.addEventListener('click', () => {
  dom.chartModal.style.display = 'none';
  dom.chartTooltip.style.display = 'none';
});
dom.chartModal?.addEventListener('click', e => {
  if (e.target === dom.chartModal) {
    dom.chartModal.style.display = 'none';
    dom.chartTooltip.style.display = 'none';
  }
});

// ── Settings Tab ──────────────────────────────────────────────────────────────

const THEMES = {
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

function applyTheme(key) {
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

const FONT_PAIRINGS = {
  classic:  { ui: "'Segoe UI', Tahoma, sans-serif",             display: "'Palatino Linotype', Georgia, serif" },
  scholar:  { ui: "Cambria, Georgia, serif",                     display: "Garamond, 'Book Antiqua', serif" },
  terminal: { ui: "Consolas, 'Courier New', monospace",          display: "'Courier New', monospace" },
  modern:   { ui: "Calibri, 'Trebuchet MS', sans-serif",         display: "Georgia, Cambria, serif" },
  oldeng:   { ui: "'Trebuchet MS', Verdana, sans-serif",         display: "'Book Antiqua', 'Palatino Linotype', serif" },
  humanist: { ui: "'Gill Sans MT', Calibri, sans-serif",         display: "Perpetua, Georgia, serif" },
  sharp:    { ui: "'Franklin Gothic Medium', Arial, sans-serif", display: "Constantia, Georgia, serif" },
};

function applyUiScale(val) {
  const scale = Math.max(0.9, Math.min(1.2, parseFloat(val) || 1));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  dom.uiScaleSelect.value = String(scale);
  localStorage.setItem('uiScale', String(scale));
  window.electronAPI?.resizeWindow?.({ width: Math.round(420 * scale), height: Math.round(600 * scale) });
}

function applyFontPairing(key) {
  const resolved = FONT_PAIRINGS[key] ? key : 'classic';
  const pairing  = FONT_PAIRINGS[resolved];
  document.documentElement.style.setProperty('--ui',      pairing.ui);
  document.documentElement.style.setProperty('--display', pairing.display);
  dom.fontPairingSelect.value = resolved;
  localStorage.setItem('fontPairing', resolved);
  window.electronAPI?.setUiFont?.(pairing.ui);
}

dom.themeSelect.addEventListener('change',       () => applyTheme(dom.themeSelect.value));
dom.uiScaleSelect.addEventListener('change',     () => applyUiScale(dom.uiScaleSelect.value));
dom.fontPairingSelect.addEventListener('change', () => applyFontPairing(dom.fontPairingSelect.value));

function applyOpacity(pct) {
  const clamped = Math.max(10, Math.min(100, pct));
  dom.opacitySlider.value = clamped;
  dom.opacityInput.value  = clamped;
  localStorage.setItem('opacity', String(clamped));
  applyEffectiveBgAlpha(clamped / 100);
}

function applyEffectiveBgAlpha(baseFraction) {
  const effective = state.altHeld ? baseFraction : Math.max(0.05, baseFraction - 0.12);
  document.documentElement.style.setProperty('--bg-alpha', String(effective));
}

dom.opacitySlider.addEventListener('input',  () => applyOpacity(parseInt(dom.opacitySlider.value)));
dom.opacityInput.addEventListener('change',  () => applyOpacity(parseInt(dom.opacityInput.value)));

function applyTextOpacity(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  dom.textOpacitySlider.value = clamped;
  dom.textOpacityInput.value  = clamped;
  document.documentElement.style.setProperty('--text-alpha', String(clamped / 100));
  localStorage.setItem('textOpacity', String(clamped));
}

dom.textOpacitySlider.addEventListener('input',  () => applyTextOpacity(parseInt(dom.textOpacitySlider.value)));
dom.textOpacityInput.addEventListener('change',  () => applyTextOpacity(parseInt(dom.textOpacityInput.value)));

const debugToggleBtn = document.getElementById('debug-toggle');
const debugBody = document.getElementById('debug-body');
if (debugToggleBtn && debugBody) {
  debugToggleBtn.addEventListener('click', () => {
    const open = debugBody.style.display !== 'none';
    debugBody.style.display = open ? 'none' : 'block';
    debugToggleBtn.textContent = open ? '\u25b6' : '\u25bc';
  });
}
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
  if (dom.automationToggleLeft) dom.automationToggleLeft.textContent = `Left ${runtimeState.leftClickerEnabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleRight) dom.automationToggleRight.textContent = `Right ${runtimeState.rightClickerEnabled ? 'ON' : 'OFF'}`;
  if (dom.automationToggleF7) dom.automationToggleF7.textContent = `F-Key ${runtimeState.f7Enabled ? 'ON' : 'OFF'}`;
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
      const detailParts = [];
      if (result.result?.focusAttempted) {
        detailParts.push(`focus=${result.result?.focusResult?.activated ? 'ok' : 'failed'}`);
      }
      const detailSummary = formatAutomationDetailSummary(result.result?.details);
      if (detailSummary) {
        detailParts.push(detailSummary);
      } else {
        const targetSummary = formatAutomationTargetSummary(result.result?.target);
        if (targetSummary) {
          detailParts.push(targetSummary);
        }
      }
      pushAutomationLog(`test ${action}: ok${detailParts.length ? ` | ${detailParts.join(' | ')}` : ''}`);
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
    if (state.automationState?.runtimeState) {
      state.automationState.runtimeState[toggleId] = !currentValue;
      renderAutomationState(state.automationState);
    }
    await window.electronAPI?.automation?.setRuntimeToggle?.(toggleId, !currentValue);
    pushAutomationLog(`${toggleId} set to ${!currentValue ? 'on' : 'off'}`);
  } catch (error) {
    pushAutomationLog(`${toggleId} failed: ${error.message}`);
    setStatus(`Automation toggle ${toggleId} failed`, 'error');
    void refreshAutomationState();
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
  const runtimeState = state.automationState?.runtimeState;
  if (!activeProfileId || !activeProfile) return;
  await window.electronAPI?.automation?.updateProfile?.(activeProfileId, {
    runtime: {
      ...activeProfile.runtime,
      ...runtimeState,
      fKeyCode: dom.automationFkeyCode?.value || runtimeState?.fKeyCode || activeProfile.runtime.fKeyCode || 'F7',
      leftClickIntervalMs: parseInt(dom.automationLeftInterval.value, 10) || runtimeState?.leftClickIntervalMs || activeProfile.runtime.leftClickIntervalMs,
      rightClickIntervalMs: parseInt(dom.automationRightInterval.value, 10) || runtimeState?.rightClickIntervalMs || activeProfile.runtime.rightClickIntervalMs,
      f7IntervalMs: parseInt(dom.automationF7Interval.value, 10) || runtimeState?.f7IntervalMs || activeProfile.runtime.f7IntervalMs,
      jitterPercent: parseInt(dom.automationJitter.value, 10) || runtimeState?.jitterPercent || activeProfile.runtime.jitterPercent,
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
        countMode: dom.automationBuffStigmaMode?.value || activeProfile.buffs.stigma.countMode || 'countdown',
      },
      shield: {
        ...activeProfile.buffs.shield,
        label: dom.automationBuffShieldLabel.value.trim() || activeProfile.buffs.shield.label,
        durationSec: parseInt(dom.automationBuffShieldDuration.value, 10) || activeProfile.buffs.shield.durationSec,
        warn1Sec: parseInt(dom.automationBuffShieldWarn1.value, 10) || activeProfile.buffs.shield.warn1Sec,
        warn2Sec: parseInt(dom.automationBuffShieldWarn2.value, 10) || activeProfile.buffs.shield.warn2Sec,
        visibleInOverlay: Boolean(dom.automationBuffShieldVisible.checked),
        countMode: dom.automationBuffShieldMode?.value || activeProfile.buffs.shield.countMode || 'countdown',
      },
      invisibility: {
        ...activeProfile.buffs.invisibility,
        label: dom.automationBuffInvisibilityLabel.value.trim() || activeProfile.buffs.invisibility.label,
        durationSec: parseInt(dom.automationBuffInvisibilityDuration.value, 10) || activeProfile.buffs.invisibility.durationSec,
        warn1Sec: parseInt(dom.automationBuffInvisibilityWarn1.value, 10) || activeProfile.buffs.invisibility.warn1Sec,
        warn2Sec: parseInt(dom.automationBuffInvisibilityWarn2.value, 10) || activeProfile.buffs.invisibility.warn2Sec,
        visibleInOverlay: Boolean(dom.automationBuffInvisibilityVisible.checked),
        countMode: dom.automationBuffInvisibilityMode?.value || activeProfile.buffs.invisibility.countMode || 'countdown',
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
dom.automationCopyLog?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.automationLog.join('\n'));
    setStatus('Diagnostics copied', 'ok');
  } catch (error) {
    pushAutomationLog(`copy failed: ${error.message}`);
    setStatus('Diagnostics copy failed', 'error');
  }
});

if (window.electronAPI?.automation) {
  window.electronAPI.automation.onStateChanged(nextState => renderAutomationState(nextState));
  window.electronAPI.automation.onHelperStatus(status => {
    const nextLifecycle = status?.lifecycle || '';
    const nextErrorCode = status?.lastError?.code || '';
    if (state.automationHelperLifecycle !== nextLifecycle || state.automationHelperErrorCode !== nextErrorCode) {
      state.automationHelperLifecycle = nextLifecycle;
      state.automationHelperErrorCode = nextErrorCode;
      pushAutomationLog(`helper ${nextLifecycle}${nextErrorCode ? ` (${nextErrorCode})` : ''}`);
    }
    if (state.automationState) {
      renderAutomationState({ ...state.automationState, helperStatus: status });
    }
  });
  window.electronAPI.automation.onOverlayStatus(status => {
    if (!state.automationState) {
      return;
    }
    renderAutomationState({
      ...state.automationState,
      gameAttachmentStatus: {
        ...(state.automationState.gameAttachmentStatus || {}),
        ...(status || {}),
      },
    });
  });
  window.electronAPI.automation.onDiagnosticLog(entry => {
    pushAutomationLog(formatAutomationDiagnosticEntry(entry));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Setup hotkey capture for all automation hotkey inputs (native helper format)
[
  dom.automationHotkeyMaster, dom.automationHotkeyEmergency, dom.automationHotkeyLeft,
  dom.automationHotkeyRight,  dom.automationHotkeyF7,       dom.automationHotkeyShift,
  dom.automationHotkeyCtrl,   dom.automationHotkeyStigma,   dom.automationHotkeyShield,
  dom.automationHotkeyInvisibility,
].forEach(el => setupHotkeyCapture(el, 'automation'));

// Setup hotkey capture for app hotkey inputs (Electron accelerator format)
[
  dom.appHotkeyInteract, dom.appHotkeyCollapse,
  dom.appHotkeyHide,     dom.appHotkeyQuit,
].forEach(el => setupHotkeyCapture(el, 'app'));

// App hotkeys save
dom.appSaveHotkeys?.addEventListener('click', async () => {
  const hotkeys = {
    interact: dom.appHotkeyInteract?.value || '',
    collapse: dom.appHotkeyCollapse?.value || '',
    hide:     dom.appHotkeyHide?.value     || '',
    quit:     dom.appHotkeyQuit?.value     || '',
  };
  try {
    await window.electronAPI?.setAppHotkeys?.(hotkeys);
    setStatus('App hotkeys saved', 'ok');
  } catch (err) {
    setStatus('Failed to save app hotkeys', 'error');
  }
});

// "Remember server" checkbox persistence
dom.filterRememberServer?.addEventListener('change', () => {
  localStorage.setItem('filterRememberServer', dom.filterRememberServer.checked ? '1' : '');
});

(async function init() {
  setAltToggleState(false);
  setStatus('Ready — Press Alt+I or F8 to interact', 'ok');
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) applyTheme(savedTheme);
  const savedUiScale = localStorage.getItem('uiScale');
  if (savedUiScale) applyUiScale(savedUiScale);
  const savedFontPairing = localStorage.getItem('fontPairing');
  if (savedFontPairing) applyFontPairing(savedFontPairing);
  const savedOpacity = localStorage.getItem('opacity');
  if (savedOpacity) applyOpacity(parseInt(savedOpacity));
  const savedTextOpacity = localStorage.getItem('textOpacity');
  if (savedTextOpacity) applyTextOpacity(parseInt(savedTextOpacity));

  // Restore "remember server" setting and select saved server
  const rememberServer = localStorage.getItem('filterRememberServer') === '1';
  if (dom.filterRememberServer) dom.filterRememberServer.checked = rememberServer;
  if (rememberServer) {
    const savedServer = localStorage.getItem('savedServer');
    if (savedServer) {
      const btn = [...dom.serverBtns].find(b => b.dataset.server === savedServer);
      if (btn) btn.click();
    }
  }

  // Load app hotkeys from main process
  try {
    const appHotkeys = await window.electronAPI?.getAppHotkeys?.();
    if (appHotkeys) {
      if (dom.appHotkeyInteract) dom.appHotkeyInteract.value = appHotkeys.interact || '';
      if (dom.appHotkeyCollapse) dom.appHotkeyCollapse.value = appHotkeys.collapse || '';
      if (dom.appHotkeyHide)     dom.appHotkeyHide.value     = appHotkeys.hide     || '';
      if (dom.appHotkeyQuit)     dom.appHotkeyQuit.value     = appHotkeys.quit     || '';
    }
  } catch (_) { /* not critical */ }

  await Promise.allSettled([ensureFilterMeta(), ensureMapImage(), ensurePool(), updateMinimapSide()]);
  await refreshAutomationState();
})();
