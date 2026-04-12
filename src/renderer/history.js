import { state } from './state.js';
import { dom } from './dom-refs.js';
import { setStatus, formatPrice } from './utils.js';
import { drawChart } from './chart.js';

// ── Chart tooltip hit-test ─────────────────────────────────────────────────────

function chartHitTest(pts, canvasEl, mouseX) {
  if (!pts || !pts.length) return null;
  const rect = canvasEl.getBoundingClientRect();
  const relX = mouseX - rect.left;
  let best = null, bestDx = Infinity;
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

export async function loadHistory() {
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

export function setup() {
  dom.dayBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.dayBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.historyDays = parseInt(btn.dataset.days);
      loadHistory();
    });
  });

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

  // Chart canvas tooltip
  dom.chartCanvas?.addEventListener('mousemove', e => showChartTooltip(chartHitTest(state.chartPts, dom.chartCanvas, e.clientX), e));
  dom.chartCanvas?.addEventListener('mouseleave', () => { dom.chartTooltip.style.display = 'none'; });

  // Expand chart into modal
  dom.chartExpandBtn?.addEventListener('click', () => {
    if (!state.historyPoints.length) return;
    dom.chartModal.style.display = 'flex';
    requestAnimationFrame(() => {
      const { pts } = drawChart(dom.chartModalCanvas, state.historyPoints, formatPrice);
      dom.chartModalCanvas._pts = pts;
    });
  });

  dom.chartModalCanvas?.addEventListener('mousemove', e => showChartTooltip(chartHitTest(dom.chartModalCanvas._pts, dom.chartModalCanvas, e.clientX), e));
  dom.chartModalCanvas?.addEventListener('mouseleave', () => { dom.chartTooltip.style.display = 'none'; });

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
}
