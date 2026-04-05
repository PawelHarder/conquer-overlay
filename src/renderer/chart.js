/**
 * History price chart — draws a simple line+fill chart on a canvas element.
 *
 * @param {HTMLCanvasElement} canvas  - Target canvas (e.g. dom.chartCanvas)
 * @param {Array}             points  - Array of { bucket, avg?, lowest? } price objects
 * @param {Function}          formatPrice - Price formatter from renderer
 * @returns {{ pts: Array<{x,y,price,bucket}> }} Screen coords + data for tooltip hit-testing
 */
export function drawChart(canvas, points, formatPrice) {
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
  const PAD = { top: 10, right: 10, bottom: 36, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '9px Share Tech Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatPrice(max - (range / 4) * i), PAD.left - 4, y + 3);
  }

  const pts = prices.map((p, i) => ({
    x: PAD.left + (i / Math.max(prices.length - 1, 1)) * plotW,
    y: PAD.top + plotH - ((p - min) / range) * plotH,
    price: p,
    bucket: points[i].bucket,
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

  // X-axis labels — time (HH:MM) for spans ≤ 1 day, date otherwise
  const spanSec = points.length > 1 ? (points[points.length - 1].bucket - points[0].bucket) : 0;
  const isIntraday = spanSec <= 86400;
  const minLabelSpacingPx = 42; // minimum pixel gap between labels

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '9px Share Tech Mono, monospace';
  ctx.textAlign = 'center';

  let lastLabelX = -Infinity;
  let lastDateStr = null;

  pts.forEach((pt, i) => {
    if (!points[i].bucket) return;
    const d = new Date(points[i].bucket * 1000);

    if (isIntraday) {
      // Show label every 2 hours (every 4th 30min bucket boundary)
      const totalMinutes = d.getHours() * 60 + d.getMinutes();
      if (totalMinutes % 120 !== 0) return;
      if (pt.x - lastLabelX < minLabelSpacingPx) return;
      lastLabelX = pt.x;
      const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillText(label, pt.x, PAD.top + plotH + 12);
    } else {
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (dateStr === lastDateStr) return;
      if (pt.x - lastLabelX < minLabelSpacingPx) return;
      lastLabelX = pt.x;
      lastDateStr = dateStr;
      ctx.save();
      ctx.translate(pt.x, PAD.top + plotH + 14);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(dateStr, 0, 0);
      ctx.restore();
    }
  });

  return { pts };
}
