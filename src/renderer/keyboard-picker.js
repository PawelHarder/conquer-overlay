// Keyboard layout — each entry: { label, value, autoValue?, w?, modKey? }
// value     = output for 'app' mode
// autoValue = output for 'automation' mode (if different from value)
// w         = flex-grow weight (default 1)
// modKey    = true for Ctrl/Alt/Shift keys on the grid (clicking toggles the modifier)
// null      = visual gap between key groups

const LAYOUT = [
  // Row 0 — Esc + Function keys
  [
    { label: 'Esc',  value: 'Escape', w: 1.5 },
    null,
    { label: 'F1',  value: 'F1'  }, { label: 'F2',  value: 'F2'  },
    { label: 'F3',  value: 'F3'  }, { label: 'F4',  value: 'F4'  },
    null,
    { label: 'F5',  value: 'F5'  }, { label: 'F6',  value: 'F6'  },
    { label: 'F7',  value: 'F7'  }, { label: 'F8',  value: 'F8'  },
    null,
    { label: 'F9',  value: 'F9'  }, { label: 'F10', value: 'F10' },
    { label: 'F11', value: 'F11' }, { label: 'F12', value: 'F12' },
  ],
  // Row 1 — Number row
  [
    { label: '`',    value: '`',  autoValue: 'Backquote' },
    { label: '1',    value: '1'  }, { label: '2', value: '2' },
    { label: '3',    value: '3'  }, { label: '4', value: '4' },
    { label: '5',    value: '5'  }, { label: '6', value: '6' },
    { label: '7',    value: '7'  }, { label: '8', value: '8' },
    { label: '9',    value: '9'  }, { label: '0', value: '0' },
    { label: '-',    value: '-',  autoValue: 'Minus'  },
    { label: '=',    value: '=',  autoValue: 'Equal'  },
    { label: 'Bksp', value: 'Backspace', w: 2 },
  ],
  // Row 2 — QWERTY row
  [
    { label: 'Tab', value: 'Tab', w: 1.5 },
    { label: 'Q', value: 'Q' }, { label: 'W', value: 'W' },
    { label: 'E', value: 'E' }, { label: 'R', value: 'R' },
    { label: 'T', value: 'T' }, { label: 'Y', value: 'Y' },
    { label: 'U', value: 'U' }, { label: 'I', value: 'I' },
    { label: 'O', value: 'O' }, { label: 'P', value: 'P' },
    { label: '[',  value: '[',  autoValue: 'BracketLeft'  },
    { label: ']',  value: ']',  autoValue: 'BracketRight' },
    { label: '\\', value: '\\', autoValue: 'Backslash', w: 1.5 },
  ],
  // Row 3 — ASDF row
  [
    { label: 'Caps',  value: 'CapsLock', w: 1.75 },
    { label: 'A', value: 'A' }, { label: 'S', value: 'S' },
    { label: 'D', value: 'D' }, { label: 'F', value: 'F' },
    { label: 'G', value: 'G' }, { label: 'H', value: 'H' },
    { label: 'J', value: 'J' }, { label: 'K', value: 'K' },
    { label: 'L', value: 'L' },
    { label: ';',     value: ';',  autoValue: 'Semicolon' },
    { label: "'",     value: "'",  autoValue: 'Quote'     },
    { label: 'Enter', value: 'Enter', w: 2.25 },
  ],
  // Row 4 — ZXCV row
  [
    { label: 'Shift', value: 'Shift', w: 2.25, modKey: true },
    { label: 'Z', value: 'Z' }, { label: 'X', value: 'X' },
    { label: 'C', value: 'C' }, { label: 'V', value: 'V' },
    { label: 'B', value: 'B' }, { label: 'N', value: 'N' },
    { label: 'M', value: 'M' },
    { label: ',', value: ',', autoValue: 'Comma'  },
    { label: '.', value: '.', autoValue: 'Period' },
    { label: '/', value: '/', autoValue: 'Slash'  },
    { label: 'Shift', value: 'Shift', w: 2.75, modKey: true },
  ],
  // Row 5 — Bottom row
  [
    { label: 'Ctrl',  value: 'Ctrl', w: 1.5,  modKey: true },
    { label: 'Alt',   value: 'Alt',  w: 1.25, modKey: true },
    { label: 'Space', value: 'Space', w: 7 },
    { label: 'Alt',   value: 'Alt',  w: 1.25, modKey: true },
    { label: 'Ctrl',  value: 'Ctrl', w: 1.5,  modKey: true },
  ],
];

const MOUSE_BUTTONS = [
  { label: 'M Middle', value: 'MouseMiddle' },
  { label: 'M4',       value: 'Mouse4'      },
  { label: 'M5',       value: 'Mouse5'      },
];

// ── Module state ─────────────────────────────────────────────────────────────

let modalEl        = null;
let resolvePromise = null;
let activeModifiers = new Set();
let selectedKey    = null;
let currentMode    = 'app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function keyValue(key) {
  return (currentMode === 'automation' && key.autoValue) ? key.autoValue : key.value;
}

function composedHotkey() {
  if (!selectedKey) return null;
  const parts = [];
  if (activeModifiers.has('Ctrl'))  parts.push('Ctrl');
  if (activeModifiers.has('Alt'))   parts.push('Alt');
  if (activeModifiers.has('Shift')) parts.push('Shift');
  parts.push(selectedKey);
  return parts.join('+');
}

function updateDisplay() {
  const displayEl  = modalEl.querySelector('#keyboard-picker-current');
  const confirmBtn = modalEl.querySelector('#kp-btn-confirm');
  const val = composedHotkey();
  if (val) {
    displayEl.textContent = val;
    displayEl.classList.remove('empty');
    confirmBtn.disabled = false;
  } else {
    displayEl.textContent = 'Click a key to select\u2026';
    displayEl.classList.add('empty');
    confirmBtn.disabled = true;
  }
  // Highlight the currently selected key / mouse button
  modalEl.querySelectorAll('.kp-key[data-selectable]').forEach(el => {
    el.classList.toggle('selected', el.dataset.keyval === selectedKey);
  });
  modalEl.querySelectorAll('.kp-mouse-btn').forEach(el => {
    el.classList.toggle('selected', el.dataset.value === selectedKey);
  });
}

function toggleModifier(mod) {
  if (activeModifiers.has(mod)) activeModifiers.delete(mod);
  else                          activeModifiers.add(mod);

  const isActive = activeModifiers.has(mod);
  // Top modifier buttons
  modalEl.querySelectorAll(`.kp-mod-btn[data-mod="${mod}"]`).forEach(el => {
    el.classList.toggle('active', isActive);
  });
  // Keyboard grid modifier keys
  modalEl.querySelectorAll(`.kp-key.mod-key[data-mod="${mod}"]`).forEach(el => {
    el.classList.toggle('active', isActive);
  });
  updateDisplay();
}

function selectKey(val) {
  selectedKey = val;
  updateDisplay();
}

// ── Modal builder ─────────────────────────────────────────────────────────────

function buildModal() {
  const el = document.createElement('div');
  el.id = 'keyboard-picker-modal';
  el.innerHTML = `
    <div id="keyboard-picker-backdrop"></div>
    <div id="keyboard-picker">
      <div id="keyboard-picker-header">
        <span id="keyboard-picker-title">Select Hotkey</span>
        <button id="keyboard-picker-close">&#x2715;</button>
      </div>
      <div id="keyboard-picker-current" class="empty">Click a key to select\u2026</div>
      <div id="keyboard-picker-modifiers">
        <button class="kp-mod-btn" data-mod="Ctrl">Ctrl</button>
        <button class="kp-mod-btn" data-mod="Alt">Alt</button>
        <button class="kp-mod-btn" data-mod="Shift">Shift</button>
      </div>
      <div id="keyboard-picker-keys"></div>
      <div id="keyboard-picker-mouse">
        <span class="kp-mouse-label">Mouse</span>
      </div>
      <div id="keyboard-picker-footer">
        <button class="kp-btn-cancel" id="kp-btn-cancel">Cancel</button>
        <button class="kp-btn-confirm" id="kp-btn-confirm" disabled>Confirm</button>
      </div>
    </div>
  `;

  // ── Keyboard rows ─────────────────────────────────────────────────────────
  const keysContainer = el.querySelector('#keyboard-picker-keys');

  LAYOUT.forEach((row, rowIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = rowIdx === 0 ? 'kp-row kp-row-fn' : 'kp-row';

    row.forEach(key => {
      if (key === null) {
        const gap = document.createElement('div');
        gap.className = 'kp-gap';
        rowEl.appendChild(gap);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'kp-key';
      btn.textContent = key.label;
      btn.style.flexGrow = String(key.w || 1);

      if (key.modKey) {
        btn.classList.add('mod-key');
        btn.dataset.mod = key.value; // 'Ctrl', 'Alt', or 'Shift'
        btn.addEventListener('click', () => toggleModifier(key.value));
      } else {
        btn.dataset.selectable = '1';
        btn.dataset.keyval = keyValue(key);
        btn.dataset.keyIdx = rowIdx + ',' + row.indexOf(key); // used by rebuildKeyValues
        btn.addEventListener('click', () => selectKey(btn.dataset.keyval));
      }

      rowEl.appendChild(btn);
    });

    keysContainer.appendChild(rowEl);
  });

  // ── Mouse buttons ─────────────────────────────────────────────────────────
  const mouseContainer = el.querySelector('#keyboard-picker-mouse');
  MOUSE_BUTTONS.forEach(mb => {
    const btn = document.createElement('button');
    btn.className = 'kp-mouse-btn';
    btn.textContent = mb.label;
    btn.dataset.value = mb.value;
    btn.addEventListener('click', () => selectKey(mb.value));
    mouseContainer.appendChild(btn);
  });

  // ── Event wiring ──────────────────────────────────────────────────────────
  el.querySelector('#keyboard-picker-backdrop').addEventListener('click', () => close(null));
  el.querySelector('#keyboard-picker-close').addEventListener('click',    () => close(null));
  el.querySelector('#kp-btn-cancel').addEventListener('click',            () => close(null));
  el.querySelector('#kp-btn-confirm').addEventListener('click', () => {
    const val = composedHotkey();
    if (val) close(val);
  });
  el.querySelectorAll('.kp-mod-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleModifier(btn.dataset.mod));
  });

  document.body.appendChild(el);
  return el;
}

// Updates data-keyval on all non-modifier keyboard keys to reflect the current mode.
// Must be called when mode changes between 'app' and 'automation'.
function rebuildKeyValues() {
  modalEl.querySelectorAll('.kp-key[data-selectable]').forEach(btn => {
    const [rowStr, colStr] = btn.dataset.keyIdx.split(',');
    const row = LAYOUT[Number(rowStr)];
    const key = row[Number(colStr)];
    if (key && !key.modKey) {
      btn.dataset.keyval = keyValue(key);
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Opens the keyboard picker modal and returns a Promise that resolves with
 * the selected hotkey string (e.g. "Ctrl+F1") or null if cancelled.
 *
 * @param {'app'|'automation'} mode
 */
export function openKeyboardPicker(mode = 'app') {
  return new Promise(resolve => {
    if (!modalEl) modalEl = buildModal();

    currentMode = mode;
    activeModifiers.clear();
    selectedKey = null;

    // Reset modifier button visuals (top row + keyboard grid)
    modalEl.querySelectorAll('.kp-mod-btn, .kp-key.mod-key').forEach(el => {
      el.classList.remove('active');
    });

    // Update key values for the current mode
    rebuildKeyValues();

    // Reset selection highlighting
    updateDisplay();

    resolvePromise = resolve;
    modalEl.classList.add('open');
  });
}

function close(result) {
  if (modalEl) modalEl.classList.remove('open');
  if (resolvePromise) {
    resolvePromise(result);
    resolvePromise = null;
  }
}
