import { state } from './state.js';
import { dom } from './dom-refs.js';
import { setStatus, escHtml } from './utils.js';
import { getListings } from '../api.js';
import { sortItems, renderListings, updatePriceSummary, setupSortableHeader } from './listings.js';
import { clearPinnedMinimap } from './minimap.js';
import { getRawPrice } from './price-inputs.js';

export async function doSearch() {
  const query     = dom.searchInput.value.trim();
  const major     = dom.searchMajor.value;
  const minor     = dom.searchMinor.value;
  const quality   = dom.searchQuality.value;
  const plusAny   = dom.searchPlusAny?.checked ?? false;
  const plusLevel = !plusAny && dom.searchPlus.value !== '' ? parseInt(dom.searchPlus.value, 10) : undefined;
  const sockets   = dom.searchSockets.value !== '' ? parseInt(dom.searchSockets.value, 10) : undefined;
  const maxPrice  = getRawPrice(dom.searchMaxPrice) ?? undefined;

  if (!query && !major && !minor) { setStatus('Enter search terms', 'warn'); return; }

  dom.searchResults.innerHTML = '<div class="placeholder-text"><span class="spinner"></span></div>';
  dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
  setStatus('Searching…', 'warn');

  try {
    const data = await getListings({ search: query, majorType: major, minorType: minor,
      quality, plusLevel, plusAny, sockets, maxPrice, server: state.server });
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

export function setup() {
  setupSortableHeader(
    document.querySelector('#tab-search .listings-header'),
    dom.searchResults,
    () => state.searchSort,
    s => { state.searchSort = s; },
    () => state.searchItems,
    (items, container) => renderListings(items, container),
  );

  dom.searchBtn.addEventListener('click', doSearch);
  dom.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  dom.searchClearListings.addEventListener('click', () => {
    state.searchItems = [];
    dom.searchResults.innerHTML = '<div class="placeholder-text">Enter search terms above</div>';
    dom.searchCount.textContent = '';
    dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
    clearPinnedMinimap();
  });

  dom.searchClear.addEventListener('click', () => {
    dom.searchInput.value = dom.searchMajor.value = dom.searchMinor.value =
    dom.searchQuality.value = dom.searchPlus.value = dom.searchSockets.value = '';
    dom.searchMaxPrice.value = dom.searchMaxPrice.dataset.raw = '';
    if (dom.searchPlusAny) { dom.searchPlusAny.checked = false; dom.searchPlus.disabled = false; }
    dom.searchResults.innerHTML = '<div class="placeholder-text">Enter search terms above</div>';
    dom.searchCount.textContent = '';
    dom.priceLow.textContent = dom.priceAvg.textContent = dom.priceHigh.textContent = '—';
    state.searchItems = [];
    clearPinnedMinimap();
    setStatus('Ready', 'ok');
  });

  dom.searchPlusAny?.addEventListener('change', () => {
    dom.searchPlus.disabled = dom.searchPlusAny.checked;
  });
}
