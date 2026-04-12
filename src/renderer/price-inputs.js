export const priceFormatter = new Intl.NumberFormat(navigator.language);

export function setupPriceInput(input) {
  input.dataset.raw = '';
  input.addEventListener('blur', () => {
    const raw = parseRawPrice(input.value);
    if (raw != null) {
      input.dataset.raw = String(raw);
      input.value = priceFormatter.format(raw);
    } else {
      input.dataset.raw = '';
    }
  });
  input.addEventListener('focus', () => {
    if (input.dataset.raw) input.value = input.dataset.raw;
  });
}

export function parseRawPrice(str) {
  const n = parseInt(str.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

export function getRawPrice(input) {
  return parseRawPrice(input.dataset.raw || input.value);
}

export function parseGoldShorthand(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase().replace(/,/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(k{1,3}|m|b)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2] || '';
  if (suffix === 'k')                   return Math.round(num * 1_000);
  if (suffix === 'kk' || suffix === 'm') return Math.round(num * 1_000_000);
  if (suffix === 'kkk' || suffix === 'b') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

export function setupGoldShorthandInput(input) {
  input.dataset.raw = '';
  input.addEventListener('focus', () => {
    if (input.dataset.raw) input.value = input.dataset.raw;
  });
  input.addEventListener('blur', () => {
    const result = parseGoldShorthand(input.value);
    if (result != null) {
      input.dataset.raw = String(result);
      input.value = priceFormatter.format(result);
    } else {
      input.dataset.raw = '';
    }
  });
}
