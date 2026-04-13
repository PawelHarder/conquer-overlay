// Symbols expressed as code names in automation (native helper) format
export const AUTOMATION_CODE_MAP = {
  ';': 'Semicolon', "'": 'Quote', ',': 'Comma',
  '[': 'BracketLeft', ']': 'BracketRight', '.': 'Period',
  '/': 'Slash', '\\': 'Backslash', '=': 'Equal', '-': 'Minus',
  '`': 'Backquote',
};

export function setupHotkeyCapture(inputEl, mode) {
  if (!inputEl) return;

  inputEl.addEventListener('focus', () => {
    if (!inputEl.value) {
      inputEl.placeholder = 'Press a key…';
      inputEl.classList.add('listening');
    }
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Tab') return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Backspace' && !inputEl.value) {
      inputEl.placeholder = 'Click to bind…';
      inputEl.classList.remove('listening');
      inputEl.blur();
      return;
    }

    const pureMod = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
    if (pureMod) return;

    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    let keyPart;
    if (mode === 'automation') {
      if (/^F\d+$/.test(e.key)) {
        keyPart = e.key;
      } else if (AUTOMATION_CODE_MAP[e.key]) {
        keyPart = AUTOMATION_CODE_MAP[e.key];
      } else if (e.key === 'Escape') {
        keyPart = 'Escape';
      } else if (e.key === 'Mouse3' || e.code === 'Mouse3') {
        keyPart = 'MouseMiddle';
      } else if (/^Numpad\d$/.test(e.code)) {
        // Distinguish numpad digits from number-row digits regardless of NumLock state
        keyPart = e.code;
      } else if (e.key.length === 1) {
        keyPart = e.key.toUpperCase();
      } else {
        keyPart = e.code || e.key;
      }
    } else {
      if (/^F\d+$/.test(e.key)) {
        keyPart = e.key;
      } else if (e.key === 'Escape') {
        keyPart = 'Escape';
      } else if (e.key.length === 1) {
        keyPart = e.key.toUpperCase();
      } else {
        keyPart = e.key;
      }
    }

    parts.push(keyPart);
    inputEl.value = parts.join('+');
    inputEl.placeholder = 'Click to bind…';
    inputEl.classList.remove('listening');
    inputEl.blur();
  });

  inputEl.addEventListener('blur', () => {
    inputEl.placeholder = 'Click to bind…';
    inputEl.classList.remove('listening');
  });
}
