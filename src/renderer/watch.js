import { state } from './state.js';
import { dom } from './dom-refs.js';
import { setStatus, escHtml, formatPrice, playAlertSound } from './utils.js';
import { watchForDeal } from '../api.js';
import { sortItems, renderListings, setupSortableHeader } from './listings.js';
import { clearPinnedMinimap } from './minimap.js';
import { getRawPrice, priceFormatter } from './price-inputs.js';

function buildWatchFilters() {
  const plusAny = dom.watchPlusAny?.checked ?? false;
  return {
    search:    dom.watchItem.value.trim(),
    majorType: dom.watchMajor.value,
    minorType: dom.watchMinor.value,
    quality:   dom.watchQuality.value,
    plusAny,
    plusLevel: !plusAny && dom.watchPlus.value !== '' ? parseInt(dom.watchPlus.value, 10) : undefined,
    sockets:   dom.watchSockets.value !== '' ? parseInt(dom.watchSockets.value, 10) : undefined,
    maxPrice:  getRawPrice(dom.watchPrice) ?? undefined,
    server:    state.server,
  };
}

export function showDealAlert(listing) {
  playAlertSound();
  dom.alertItemName.textContent = listing.AttributeName ?? '—';
  dom.alertSeller.textContent   = 'Seller: ' + (listing.SellerName ?? '—');
  dom.alertPrice.textContent    = formatPrice(listing.Price ?? listing.price) + ' gold';
  dom.alertPopup.classList.add('show');
  setTimeout(() => dom.alertPopup.classList.remove('show'), 5000);
}

export function startWatch() {
  const filters  = buildWatchFilters();
  const interval = parseInt(dom.watchInterval.value);
  if (!filters.search && !filters.majorType && !filters.minorType) { setStatus('Enter an item name or category to watch', 'warn'); return; }
  if (!filters.maxPrice) { setStatus('Enter a max price', 'warn'); return; }
  if (state.watchCancel) { state.watchCancel.cancel(); state.watchCancel = null; state.watchReset = null; }
  dom.watchDot.classList.add('active');
  dom.watchText.innerHTML = `Watching <strong>${escHtml(filters.search || filters.majorType || filters.minorType)}</strong> ≤ <strong>${formatPrice(filters.maxPrice)}</strong>`;
  dom.watchStartBtn.textContent = '■ Stop';
  dom.watchStartBtn.style.background = 'var(--red-dim)';
  dom.watchStartBtn.style.borderColor = 'var(--red)';
  setStatus('Watching…', 'ok');
  const handle = watchForDeal(filters, matches => {
    matches.forEach(match => { showDealAlert(match); state.watchItems.unshift(match); });
    renderListings(sortItems(state.watchItems, state.watchSort.key, state.watchSort.dir), dom.watchMatches);
    window.electronAPI?.sendWatchMatch?.({
      items: matches,
      isCollapsed: state.isCollapsed,
      activeTab: state.activeTab,
    });
  }, interval);
  state.watchCancel = handle;
  state.watchReset  = handle.reset;
}

export function stopWatch() {
  if (state.watchCancel) { state.watchCancel.cancel(); state.watchCancel = null; state.watchReset = null; }
  dom.watchDot.classList.remove('active');
  dom.watchText.textContent = 'No active watch';
  dom.watchStartBtn.textContent = '▶ Watch';
  dom.watchStartBtn.style.background = dom.watchStartBtn.style.borderColor = '';
  setStatus('Watch stopped', 'ok');
}

export function setup() {
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

  dom.watchStartBtn.addEventListener('click', () => { if (state.watchCancel) stopWatch(); else startWatch(); });

  dom.watchClearListings.addEventListener('click', () => {
    state.watchItems = [];
    state.watchReset?.();
    dom.watchMatches.innerHTML = '<div class="placeholder-text">Matches will appear here</div>';
    clearPinnedMinimap();
    window.electronAPI?.dismissWatchOverlay?.();
  });

  dom.watchClear.addEventListener('click', () => {
    stopWatch();
    dom.watchItem.value = dom.watchMajor.value = dom.watchMinor.value =
    dom.watchQuality.value = dom.watchPlus.value = dom.watchSockets.value = '';
    dom.watchPrice.value = dom.watchPrice.dataset.raw = '';
    dom.watchPriceBasis.value = dom.watchPricePct.value = '';
    if (dom.watchPlusAny) { dom.watchPlusAny.checked = false; dom.watchPlus.disabled = false; }
    state.watchItems = [];
    dom.watchMatches.innerHTML = '<div class="placeholder-text">Matches will appear here</div>';
    clearPinnedMinimap();
    window.electronAPI?.dismissWatchOverlay?.();
  });

  dom.watchPlusAny?.addEventListener('change', () => {
    dom.watchPlus.disabled = dom.watchPlusAny.checked;
  });
}
