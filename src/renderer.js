// Conquer Market Overlay — Renderer Process orchestrator.
// Imports all feature modules, injects tab partials into the DOM, then calls
// each module's setup() after DOM refs are available.

import { loadTabPartials }         from './renderer/tab-loader.js';
import { buildDomRefs, dom }       from './renderer/dom-refs.js';
import { applyTheme, applyUiScale, applyFontPairing, applyOpacity, applyTextOpacity } from './renderer/themes.js';
import { setupGoldShorthandInput } from './renderer/price-inputs.js';
import { ensureFilterMeta, setupAutocomplete } from './renderer/filters.js';
import { registerLoadHistory }     from './renderer/ui.js';
import { loadHistory } from './renderer/history.js';
import * as ui          from './renderer/ui.js';
import * as search      from './renderer/search.js';
import * as history     from './renderer/history.js';
import * as watch       from './renderer/watch.js';
import * as autoclicker from './renderer/autoclicker.js';
import * as settings    from './renderer/settings.js';
import * as plusCalc    from './renderer/plus-calculator.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// 1. Inject HTML partials into the empty tab-panel containers
loadTabPartials();

// 2. Populate the shared dom object — must happen after partials are in the DOM
buildDomRefs();

// 3. Wire cross-module dependency: ui.switchTab triggers loadHistory
registerLoadHistory(loadHistory);

// 4. Set up each module's event listeners
ui.setup();
search.setup();
history.setup();
watch.setup();
autoclicker.setup();
settings.setup();
plusCalc.setup();

// 5. Restore persisted display preferences
const savedTheme      = localStorage.getItem('theme')        || 'original-dark';
const savedScale      = localStorage.getItem('uiScale')      || '1';
const savedFont       = localStorage.getItem('fontPairing')  || 'classic';
const savedOpacity    = parseInt(localStorage.getItem('opacity')      ?? '100', 10);
const savedTxtOpacity = parseInt(localStorage.getItem('textOpacity')  ?? '100', 10);

applyTheme(savedTheme);
applyUiScale(savedScale);
applyFontPairing(savedFont);
applyOpacity(savedOpacity);
applyTextOpacity(savedTxtOpacity);

// 6. Set up gold-shorthand price inputs (requires DOM to exist after partial injection)
setupGoldShorthandInput(dom.searchMaxPrice);
setupGoldShorthandInput(dom.watchPrice);

// 7. Set up autocomplete on all three name inputs
setupAutocomplete(dom.searchInput,     dom.searchAutocomplete);
setupAutocomplete(dom.historyItemName, dom.historyAutocomplete);
setupAutocomplete(dom.watchItem,       dom.watchAutocomplete);

// 8. Eagerly load filter metadata (populates dropdowns in background)
void ensureFilterMeta();

// 9. Restore saved server selection from localStorage
const savedServer = localStorage.getItem('savedServer');
if (savedServer !== null && dom.filterRememberServer?.checked) {
  dom.serverBtns?.forEach(btn => {
    if (btn.dataset.server === savedServer) btn.click();
  });
}

// 10. Load initial automation state
void autoclicker.refreshAutomationState();
