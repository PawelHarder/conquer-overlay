import { state } from './state.js';
import { dom } from './dom-refs.js';
import { formatPrice, escHtml, perPlusHtml } from './utils.js';
import {
  isPinnedListing, getListingKey,
  showMinimapPopup, hideMinimapPopup,
  togglePinnedMinimap, clearPinnedMinimap,
} from './minimap.js';

export function sortItems(items, key, dir) {
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

export function renderListings(items, container) {
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

export function updatePriceSummary(items) {
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

export function setupSortableHeader(headerEl, containerEl, getSortState, setSortState, getItems, renderFn) {
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
