/**
 * Market Minimap — isometric projection, stall grid, popup management.
 *
 * Call init(dom, state) once before using any exported function.
 *
 * Isometric projection calibrated 2026-04-04 via least-squares fit across 8
 * field samples (NW1/NW2, NE1/NE2, SE1/SE2, SW1/SW2). Keep FIT_W/FIT_H
 * aligned with the street.jpg asset if recalibration is needed.
 *
 *   img_x = (worldX - worldY) × A + OX
 *   img_y = (worldX + worldY) × B + OY
 *
 * Fit residuals: X ≈ 3.2 px,  Y ≈ 1.9 px  (at 1600×1600 resolution)
 */

export const MINIMAP_POPUP_WIDTH = 336;

let _dom, _state;

export function init(domRef, stateRef) {
  _dom   = domRef;
  _state = stateRef;
  ensureMapImage(); // preload in background
}

// ── Map image ─────────────────────────────────────────────────────────────────

export async function ensureMapImage() {
  if (_state.mapImage !== null) return _state.mapImage;
  _state.mapImage = await new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = './assets/street.jpg';
  });
  return _state.mapImage;
}

export async function updateMinimapSide() {
  if (!window.electronAPI?.getWindowPos) return;
  try {
    const [x] = await window.electronAPI.getWindowPos();
    _state.minimapSide = x + 420 + MINIMAP_POPUP_WIDTH <= (window.screen?.availWidth || 1920) ? 'right' : 'left';
    _dom.minimapPopup.classList.toggle('side-left',  _state.minimapSide === 'left');
    _dom.minimapPopup.classList.toggle('side-right', _state.minimapSide === 'right');
  } catch (_) { /* ignore */ }
}

// ── ISO constants ─────────────────────────────────────────────────────────────

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
      stalls.push({ sector: 'NW', row, subsection: Math.floor(row / 2) + 1, displayRow: twoRowDisplay(row), stall: s, wx: 120 + row * 7, wy: 217 - s * 4 });
    }
  }

  // SE — 4 rows × 12 stalls, row step x+7, sibling step y−4
  for (let row = 0; row < 4; row++) {
    for (let s = 0; s < 12; s++) {
      stalls.push({ sector: 'SE', row, subsection: Math.floor(row / 2) + 1, displayRow: twoRowDisplay(row), stall: s, wx: 232 + row * 7, wy: 217 - s * 4 });
    }
  }

  // NE — 2 rows × 6 stalls, row step x+32, sibling step y−5
  for (let row = 0; row < 2; row++) {
    for (let s = 0; s < 6; s++) {
      stalls.push({ sector: 'NE', row, subsection: 1, displayRow: twoRowDisplay(row), stall: s, wx: 168 + row * 32, wy: 152 - s * 5 });
    }
  }

  // SW — 2 rows × 6 stalls, row step x+32, sibling step y−5
  for (let row = 0; row < 2; row++) {
    for (let s = 0; s < 6; s++) {
      stalls.push({ sector: 'SW', row, subsection: 1, displayRow: twoRowDisplay(row), stall: s, wx: 180 + row * 32, wy: 268 - s * 5 });
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

// ── Listing key / pin helpers ─────────────────────────────────────────────────

export function getListingKey(item) {
  return [
    item.AttributeName ?? '',
    item.SellerName    ?? '',
    item.PositionX     ?? '',
    item.PositionY     ?? '',
    item.Price ?? item.price ?? '',
  ].join('|');
}

export function isPinnedListing(containerId, item) {
  return _state.minimapPinned?.containerId === containerId
    && _state.minimapPinned?.itemKey === getListingKey(item);
}

export function refreshPinnedListingStyles() {
  document.querySelectorAll('.listing-row[data-item-key]').forEach(row => {
    const containerId = row.parentElement?.id;
    row.classList.toggle(
      'pinned',
      Boolean(_state.minimapPinned)
        && _state.minimapPinned.containerId === containerId
        && _state.minimapPinned.itemKey === row.dataset.itemKey,
    );
  });
}

export function togglePinnedMinimap(containerId, items, highlightIdx) {
  const item = items[highlightIdx];
  if (!item) return;
  const itemKey = getListingKey(item);
  if (_state.minimapPinned?.containerId === containerId && _state.minimapPinned?.itemKey === itemKey) {
    clearPinnedMinimap();
    return;
  }
  _state.minimapPinned = { containerId, itemKey };
  refreshPinnedListingStyles();
  showMinimapPopup(items, highlightIdx, true);
}

export function clearPinnedMinimap() {
  _state.minimapPinned = null;
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
  if (_state.mapImage) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(_state.mapImage, 0, 0, W, H);
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
  ctx.fillText(_state.minimapPinned ? 'Market map (pinned)' : 'Market map', 8, 11);

  // Frame border
  ctx.beginPath();
  ctx.rect(0.5, 0.5, W - 1, H - 1);
  ctx.strokeStyle = '#2a2a40';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Popup show / hide ─────────────────────────────────────────────────────────

export async function showMinimapPopup(items, highlightIdx, pinned = false) {
  if (!items.length) return;
  _dom.minimapPopup.classList.add('open');
  _dom.minimapPopup.classList.toggle('pinned', pinned);
  await ensureMapImage();
  drawMinimap(_dom.minimapCanvas, items, highlightIdx, pinned);
  const item = items[highlightIdx];
  if (item?.PositionX != null) {
    const snap = nearestStall(item.PositionX, item.PositionY);
    _dom.minimapCaption.textContent = snap
      ? `${item.SellerName ?? 'Seller'} · ${formatSnapLabel(snap)}${pinned ? ' · left-click row to unpin' : ' · left-click row to pin'}`
      : `${item.SellerName ?? 'Seller'} at ${item.PositionX},${item.PositionY}${pinned ? ' · left-click row to unpin' : ' · left-click row to pin'}`;
  } else {
    _dom.minimapCaption.textContent = `Location unavailable${pinned ? ' · left-click row to unpin' : ''}`;
  }
}

export function hideMinimapPopup() {
  _dom.minimapPopup.classList.remove('open');
  _dom.minimapPopup.classList.remove('pinned');
  const ctx = _dom.minimapCanvas.getContext('2d');
  ctx.clearRect(0, 0, _dom.minimapCanvas.width, _dom.minimapCanvas.height);
  _dom.minimapCaption.textContent = 'Hover a listing to preview its position';
}
