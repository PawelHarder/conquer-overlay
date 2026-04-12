import { state } from './state.js';
import { dom } from './dom-refs.js';
import { escHtml } from './utils.js';
import { getFilters, loadMarketSnapshot, WEAPON_1H_CLASSES, WEAPON_2H_CLASSES } from '../api.js';

const QUALITY_ORDER = ['Fixed', 'Normal', 'Refined', 'Unique', 'Elite', 'Super', 'Legendary'];

export function populateMinorForMajor(majorSelect, minorSelect, placeholder) {
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

export function populateSelect(select, values, placeholder) {
  const previous = select.value;
  select.innerHTML = [
    `<option value="">${escHtml(placeholder)}</option>`,
    ...values.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`),
  ].join('');
  if (previous && values.includes(previous)) select.value = previous;
}

export function populatePlusSelect(select, placeholder) {
  const previous = select.value;
  select.innerHTML = [
    `<option value="">${escHtml(placeholder)}</option>`,
    ...Array.from({ length: 10 }, (_, i) => `<option value="${i}">+${i}</option>`),
  ].join('');
  if (previous) select.value = previous;
}

export function sortQualities(qualities) {
  return [...qualities].sort((a, b) => {
    const ai = QUALITY_ORDER.indexOf(a);
    const bi = QUALITY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export async function ensureFilterMeta() {
  if (state.filterMetaLoaded) return;
  try {
    const filters = await getFilters();
    state.filterMeta = filters;
    const qualities = sortQualities(filters.qualities ?? []);
    populateSelect(dom.searchMajor,    filters.majorCategories ?? [], 'All Categories');
    populateSelect(dom.searchMinor,    filters.minorCategories ?? [], 'All Minor Classes');
    populateSelect(dom.searchQuality,  qualities,                     'All Qualities');
    populateSelect(dom.historyMajor,   filters.majorCategories ?? [], 'Any Category');
    populateSelect(dom.historyMinor,   filters.minorCategories ?? [], 'Any Minor Class');
    populateSelect(dom.historyQuality, qualities,                     'Any Quality');
    populateSelect(dom.watchMajor,     filters.majorCategories ?? [], 'Any Category');
    populateSelect(dom.watchMinor,     filters.minorCategories ?? [], 'Any Minor Class');
    populateSelect(dom.watchQuality,   qualities,                     'Any Quality');
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

export async function ensurePool() {
  if (state.poolLoaded) return;
  try {
    const items = await loadMarketSnapshot();
    state.itemNamePool = [...new Set(items.map(i => i.AttributeName).filter(Boolean))].sort();
    state.poolLoaded = true;
  } catch (_) { /* network not available yet */ }
}

export function setupAutocomplete(input, listEl) {
  let focusedIndex = -1;

  input.addEventListener('input', async () => {
    const raw = input.value;
    const q = raw.replace(/^~/, '').trim().toLowerCase();
    if (q.length < 2) { listEl.classList.remove('open'); return; }
    await ensurePool();
    const matches = state.itemNamePool.filter(n => n.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { listEl.classList.remove('open'); return; }
    listEl.innerHTML = matches.map(m => `<div class="autocomplete-item">${escHtml(m)}</div>`).join('');
    listEl.classList.add('open');
    focusedIndex = -1;
    const prefix = raw.startsWith('~') ? '~' : '';
    listEl.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = prefix + item.textContent;
        listEl.classList.remove('open');
      });
    });
  });

  input.addEventListener('keydown', e => {
    const items = listEl.querySelectorAll('.autocomplete-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); focusedIndex = Math.min(focusedIndex + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIndex = Math.max(focusedIndex - 1, -1); }
    else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const prefix = input.value.startsWith('~') ? '~' : '';
      input.value = prefix + items[focusedIndex].textContent;
      listEl.classList.remove('open');
      return;
    }
    else if (e.key === 'Escape') { listEl.classList.remove('open'); return; }
    items.forEach((item, i) => item.classList.toggle('focused', i === focusedIndex));
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !listEl.contains(e.target)) listEl.classList.remove('open');
  });
}
