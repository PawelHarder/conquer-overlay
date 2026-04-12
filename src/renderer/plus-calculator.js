import { PLUS_DIVISOR, formatPrice } from './utils.js';

export function setup() {
  const calcToggle = document.getElementById('calc-toggle');
  const calcPanel  = document.getElementById('calc-panel');
  const calcArrow  = document.getElementById('calc-arrow');
  const calcCount  = document.getElementById('calc-count');
  const calcOutput = document.getElementById('calc-output');

  if (!calcToggle || !calcPanel) return;

  calcToggle.addEventListener('click', () => {
    const open = calcPanel.style.display !== 'none';
    calcPanel.style.display = open ? 'none' : 'block';
    if (calcArrow) calcArrow.textContent = open ? '▶' : '▼';
  });

  calcCount?.addEventListener('input', () => updateCalcOutput(parseInt(calcCount.value, 10), calcOutput));
}

// Given N plus-1 items, greedily decompose into the fewest higher-plus equivalents.
// Works top-down: fill as many of the highest tier as possible, then move to the next.
function updateCalcOutput(count, outputEl) {
  if (!outputEl) return;
  if (!count || count < 1 || isNaN(count)) {
    outputEl.innerHTML = '<div class="calc-table"><div class="calc-empty">Enter how many +1 items you have</div></div>';
    return;
  }

  const rows = [];
  let remaining = count;
  for (let lvl = 9; lvl >= 1; lvl--) {
    const divisor = PLUS_DIVISOR[lvl];
    const qty     = Math.floor(remaining / divisor);
    if (qty >= 1) {
      rows.push(`
        <div class="calc-row">
          <span class="calc-plus">+${lvl}</span>
          <span class="calc-qty">×${qty.toLocaleString()}</span>
          <span class="calc-cost">(${divisor.toLocaleString()} per)</span>
        </div>
      `);
      remaining -= qty * divisor;
    }
    if (remaining === 0) break;
  }

  outputEl.innerHTML = rows.length
    ? `<div class="calc-table">${rows.join('')}</div>`
    : '<div class="calc-table"><div class="calc-empty">Not enough +1 items</div></div>';
}
