/**
 * Classic Conquer Market API
 *
 * Confirmed from the live market page on 2026-04-03:
 *   - /Community/GetItems
 *   - /Community/GetLastUpdate
 *
 * The website fetches the full item snapshot and applies filters client-side.
 * No separate price-summary or sales-history endpoint is currently confirmed.
 */

const BASE_URL = 'https://conqueronline.net';
const ITEMS_PATH = '/Community/GetItems';
const LAST_UPDATE_PATH = '/Community/GetLastUpdate';

let cachedItems = null;
let cachedLastUpdate = null;
const REQUEST_TIMEOUT_MS = 10000;

// ── Utility ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`API timeout: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson(path, params = {}) {
  if (window.electronAPI?.getMarketJson) {
    return window.electronAPI.getMarketJson(path, params);
  }

  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function requestText(path, params = {}) {
  if (window.electronAPI?.getMarketText) {
    return window.electronAPI.getMarketText(path, params);
  }

  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  const res = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'application/json, text/plain, */*' },
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return (await res.text()).trim();
}

async function apiFetch(path, params = {}) {
  return requestJson(path, params);
}

// ── Weapon handedness classification (Classic CO) ────────────────────────────
// Bow, Backsword, and Shield are distinct classes, not grouped under 1H or 2H.
export const WEAPON_1H_CLASSES = new Set([
  'Blade', 'Sword', 'Club', 'Whip', 'Scepter', 'Dagger', 'Axe', 'Hammer', 'Hook',
]);
export const WEAPON_2H_CLASSES = new Set([
  'Glaive', 'Halbert', 'Poleaxe', 'Spear', 'Wand',
]);

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function includesText(value, needle) {
  return normalizeText(value).includes(normalizeText(needle));
}

function isNumberLike(value) {
  return value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value));
}

function normalizeListings(items) {
  return Array.isArray(items) ? items : [];
}

function filterListings(items, opts = {}) {
  const searchRaw = normalizeText(opts.search);
  const isPartial = searchRaw.startsWith('~');
  const search = isPartial ? searchRaw.slice(1) : searchRaw;
  const server = normalizeText(opts.server);
  const majorType = normalizeText(opts.majorType);
  const minorType = normalizeText(opts.minorType);
  const quality = normalizeText(opts.quality);
  const seller = normalizeText(opts.seller);
  const gem1 = normalizeText(opts.gem1);
  const gem2 = normalizeText(opts.gem2);
  const sockets = isNumberLike(opts.sockets) ? Number(opts.sockets) : null;
  const minPrice = isNumberLike(opts.minPrice) ? Number(opts.minPrice) : null;
  const maxPrice = isNumberLike(opts.maxPrice) ? Number(opts.maxPrice) : null;
  const plusLevel = isNumberLike(opts.plusLevel) ? Number(opts.plusLevel) : null;
  const plusAny = Boolean(opts.plusAny);

  return normalizeListings(items).filter(item => {
    if (search) {
      const nameNorm = normalizeText(item.AttributeName);
      if (isPartial ? !nameNorm.includes(search) : nameNorm !== search) return false;
    }
    if (server && !includesText(item.ServerName || 'Classic_US', server)) return false;
    if (majorType && normalizeText(item.ItemMajorClass) !== majorType) return false;
    if (minorType === '__weapon_1h__') {
      if (!WEAPON_1H_CLASSES.has(item.ItemMinorClass)) return false;
    } else if (minorType === '__weapon_2h__') {
      if (!WEAPON_2H_CLASSES.has(item.ItemMinorClass)) return false;
    } else if (minorType) {
      if (normalizeText(item.ItemMinorClass) !== minorType) return false;
    }
    if (quality && normalizeText(item.QualityName) !== quality) return false;
    if (seller && !includesText(item.SellerName, seller)) return false;
    if (gem1 && !includesText(item.Gem1, gem1)) return false;
    if (gem2 && !includesText(item.Gem2, gem2)) return false;
    if (sockets === 0 && item.Gem1 !== 'None') return false;
    if (sockets === 1 && !(item.Gem1 !== 'None' && item.Gem2 === 'None')) return false;
    if (sockets === 2 && !(item.Gem1 !== 'None' && item.Gem2 !== 'None')) return false;
    if (plusLevel !== null && Number(item.AdditionLevel) !== plusLevel) return false;
    if (plusAny && Number(item.AdditionLevel) === 0) return false;
    if (minPrice !== null && Number(item.Price) < minPrice) return false;
    if (maxPrice !== null && Number(item.Price) > maxPrice) return false;
    return true;
  });
}

function sortListings(items, sort, order = 'asc') {
  if (!sort) return items;

  const direction = String(order).toLowerCase() === 'desc' ? -1 : 1;
  return [...items].sort((left, right) => {
    const leftValue = left?.[sort];
    const rightValue = right?.[sort];

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction;
    }

    return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * direction;
  });
}

async function getLastUpdateToken() {
  return requestText(LAST_UPDATE_PATH);
}

export async function loadMarketSnapshot(forceRefresh = false) {
  const lastUpdate = await getLastUpdateToken();

  if (!forceRefresh && cachedItems && cachedLastUpdate === lastUpdate) {
    return cachedItems;
  }

  cachedItems = await apiFetch(ITEMS_PATH);
  cachedLastUpdate = lastUpdate;
  return cachedItems;
}

// ── Filter Metadata ───────────────────────────────────────────────────────────

/**
 * Returns available item categories, subcategories and quality filters.
 * Use this to populate dropdowns.
 */
export async function getFilters() {
  const items = await loadMarketSnapshot();

  // Build per-major minor class lists for cascaded dropdowns.
  const minorByMajor = {};
  for (const item of items) {
    if (!item.ItemMajorClass || !item.ItemMinorClass) continue;
    if (!minorByMajor[item.ItemMajorClass]) minorByMajor[item.ItemMajorClass] = new Set();
    minorByMajor[item.ItemMajorClass].add(item.ItemMinorClass);
  }
  for (const key of Object.keys(minorByMajor)) {
    minorByMajor[key] = [...minorByMajor[key]].sort();
  }

  return {
    majorCategories: [...new Set(items.map(item => item.ItemMajorClass).filter(Boolean))].sort(),
    minorCategories: [...new Set(items.map(item => item.ItemMinorClass).filter(Boolean))].sort(),
    minorByMajor,
    qualities: [...new Set(items.map(item => item.QualityName).filter(Boolean))].sort(),
    servers: [...new Set(items.map(item => item.ServerName || 'Classic_US').filter(Boolean))].sort(),
  };
}

// ── Price Listings ────────────────────────────────────────────────────────────

/**
 * Fetch active market listings.
 *
 * @param {Object} opts
 * @param {string}  opts.server      - Server name filter
 * @param {string}  opts.majorType   - Item category (e.g. "Weapon", "Armor")
 * @param {string}  opts.minorType   - Item subcategory
 * @param {string}  opts.quality     - Quality filter (e.g. "Refined", "Normal")
 * @param {string}  opts.search      - Free-text item name search
 * @param {number}  opts.maxPrice    - Maximum price filter
 * @param {string}  opts.sort        - Sort field
 * @param {string}  opts.order       - "asc" or "desc"
 * @param {number}  opts.page        - Page number (if paginated)
 */
export async function getListings(opts = {}) {
  const items = await loadMarketSnapshot();
  const filtered = filterListings(items, opts);
  return sortListings(filtered, opts.sort, opts.order);
}

/**
 * Get price summary (lowest, highest, average) for an item type.
 *
 * @param {Object} opts - Same filters as getListings
 */
export async function getPriceSummary(opts = {}) {
  const listings = await getListings(opts);
  const prices = listings.map(item => Number(item.Price)).filter(Number.isFinite);

  if (!prices.length) {
    return { lowest: null, highest: null, average: null, count: 0 };
  }

  const total = prices.reduce((sum, price) => sum + price, 0);
  return {
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    average: Math.round(total / prices.length),
    count: prices.length,
  };
}

/**
 * Get item icon URL for a given item type.
 * Returns image data or a URL pointing to the icon.
 *
 * @param {string} itemType - Item type identifier
 */
export async function getItemIcon(itemType) {
  const listings = await getListings({ search: itemType });
  const match = listings.find(item => normalizeText(item.AttributeName) === normalizeText(itemType)) || listings[0];
  if (!match) return null;

  const iconFrame = Array.isArray(match.IconFrames) ? match.IconFrames[0] : null;
  return iconFrame ? `${BASE_URL}/Icon/${match.AttributeId}` : null;
}

// ── Merchant / Seller Data ────────────────────────────────────────────────────

/**
 * Get a specific merchant's active shop listings.
 *
 * @param {string} sellerName - In-game seller name
 */
export async function getMerchantShop(sellerName) {
  return getListings({ seller: sellerName });
}

/**
 * List all active sellers currently in the market.
 */
export async function getSellers() {
  const items = await loadMarketSnapshot();
  return [...new Set(items.map(item => item.SellerName).filter(Boolean))].sort();
}

/**
 * Get avatar data for a seller.
 *
 * @param {string} sellerName
 */
export async function getSellerAvatar(sellerName) {
  void sellerName;
  return null;
}

// ── Sync Status ───────────────────────────────────────────────────────────────

/**
 * Check how fresh the market data is.
 * Returns last sync timestamp + status.
 */
export async function getSyncStatus() {
  const lastUpdate = await getLastUpdateToken();
  return { lastUpdate };
}

// ── High-level helpers ────────────────────────────────────────────────────────

/**
 * Full price check for a given item name/type.
 * Returns { lowest, highest, average, listings[] }
 *
 * @param {string} itemName - Item name as returned by OCR/search
 * @param {Object} extraFilters - Optional additional filters
 */
export async function priceCheck(itemName, extraFilters = {}) {
  const [summary, listings] = await Promise.all([
    getPriceSummary({ search: itemName, ...extraFilters }),
    getListings({ search: itemName, ...extraFilters }),
  ]);
  return { summary, listings };
}

/**
 * Price history approximation using date-filtered listing snapshots.
 * The API may not expose a true history endpoint — adapt this once you
 * inspect the actual API responses in DevTools.
 *
 * @param {string} itemName
 * @param {number} days - 1 | 3 | 7 | 14 | 30
 */
export async function getPriceHistory(itemName, days = 7) {
  void itemName;
  void days;
  return [];
}

/**
 * Poll for a specific item at or below a max price.
 * Resolves when a match is found or timeout is reached.
 *
 * @param {string}   itemName
 * @param {number}   maxPrice
 * @param {Function} onMatch  - Called with matching listing(s)
 * @param {number}   intervalMs - Poll interval (default: 15s)
 * @returns {Function} cancel - Call to stop polling
 */
export function watchForDeal(filtersOrItemName, maxPriceOrOnMatch, onMatchOrInterval, intervalMs = 15000) {
  const filters = typeof filtersOrItemName === 'object' && filtersOrItemName !== null
    ? { ...filtersOrItemName }
    : { search: filtersOrItemName, maxPrice: maxPriceOrOnMatch };
  const onMatch = typeof filtersOrItemName === 'object' && filtersOrItemName !== null
    ? maxPriceOrOnMatch
    : onMatchOrInterval;
  const pollIntervalMs = typeof filtersOrItemName === 'object' && filtersOrItemName !== null
    ? (onMatchOrInterval ?? intervalMs)
    : intervalMs;
  let stopped = false;
  let knownIds = new Set();

  async function poll() {
    if (stopped) return;
    try {
      const data = await getListings(filters);
      const items = Array.isArray(data) ? data : (data.listings || data.items || []);
      const newItems = items.filter(item => {
        const id = item.ItemId || item.id || `${item.SellerName}-${item.AttributeName}-${item.Price}`;
        return !knownIds.has(id);
      });
      if (newItems.length > 0) {
        newItems.forEach(item => knownIds.add(item.ItemId || item.id || `${item.SellerName}-${item.AttributeName}-${item.Price}`));
        onMatch(newItems);
      }
    } catch (err) {
      console.warn('[WatchForDeal] Poll error:', err.message);
    } finally {
      if (!stopped) setTimeout(poll, pollIntervalMs);
    }
  }

  poll();
  return {
    cancel: () => { stopped = true; },
    reset:  () => { knownIds = new Set(); },
  };
}
