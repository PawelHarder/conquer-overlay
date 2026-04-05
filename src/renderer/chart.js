/**
 * History price chart — draws a simple line+fill chart on a canvas element.
 *
 * @param {HTMLCanvasElement} canvas  - Target canvas (e.g. dom.chartCanvas)
 * @param {Array}             points  - Array of { avg?, lowest? } price objects
 * @param {Function}          formatPrice - Price formatter from renderer
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
