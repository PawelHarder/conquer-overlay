# Conquer Overlay — Implementation Plan

Prioritized order: History/DB Cloud Migration → Hotkey Improvements → Tab Disabling → i18n

---

## Phase 1: History Tab — Cloud DB & 24/7 Poller

### 1.1 Set Up Turso Database

**Goal:** Replace local `collector/market.db` with a Turso libSQL cloud database so any user can access price history.

**Steps:**

1. Create a Turso account and database (e.g. `conquer-market`)
2. Recreate the `price_snapshots` table on Turso with the same schema from `collector/db.js`
3. Add a new `price_hourly_averages` table for aggregated data that survives pruning:
   ```sql
   CREATE TABLE IF NOT EXISTS price_hourly_averages (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     attribute_id   INTEGER NOT NULL,
     attribute_name TEXT    NOT NULL,
     quality_name   TEXT    NOT NULL DEFAULT '',
     gem1           TEXT    NOT NULL DEFAULT 'None',
     gem2           TEXT    NOT NULL DEFAULT 'None',
     addition_level INTEGER NOT NULL DEFAULT 0,
     major_class    TEXT    NOT NULL DEFAULT '',
     minor_class    TEXT    NOT NULL DEFAULT '',
     server_name    TEXT    NOT NULL DEFAULT '',
     hour_bucket    INTEGER NOT NULL,   -- Unix timestamp rounded to hour
     avg_price      INTEGER NOT NULL,
     min_price      INTEGER NOT NULL,
     max_price      INTEGER NOT NULL,
     sample_count   INTEGER NOT NULL DEFAULT 1,
     UNIQUE(attribute_id, server_name, quality_name, gem1, gem2, addition_level, hour_bucket)
   );
   ```
4. Create indexes matching the existing ones, plus an index on `hour_bucket` for the averages table

**Files to create/modify:**
- `collector/db-turso.js` — new module replacing `collector/db.js` with `@libsql/client` HTTP driver
- `collector/poller.js` — switch from `require('./db')` to `require('./db-turso')`

### 1.2 Rewrite the Poller for Turso

**Goal:** `poller.js` writes to Turso instead of local SQLite.

**Steps:**

1. Install `@libsql/client` in the collector dependencies
2. Create `collector/db-turso.js`:
   - Connect to Turso via `createClient({ url, authToken })` using env vars `TURSO_URL` and `TURSO_AUTH_TOKEN`
   - Implement `insertSnapshot(items, snapshotAt)` using batched inserts
   - Implement `buildHourlyAverages(snapshotAt)` — after each insert, aggregate the current hour's data:
     - Group by (attribute_id, server_name, quality_name, gem1, gem2, addition_level, hour_bucket)
     - UPSERT into `price_hourly_averages` with running avg/min/max/count
   - Implement `pruneOldData()` — delete from `price_snapshots` where `snapshot_at < now - 30 days`
   - Implement query functions for the client (history + baseline)
3. Update `collector/poller.js`:
   - Poll flow: fetch → insertSnapshot → buildHourlyAverages → pruneOldData
   - Add error handling and retry logic for network failures
4. Create `.env.example` with `TURSO_URL` and `TURSO_AUTH_TOKEN` placeholders

### 1.3 Deploy Poller to Railway (24/7)

**Goal:** Poller runs continuously on Railway so data collection doesn't depend on your PC.

**Steps:**

1. Create a `collector/package.json` with its own dependencies (`@libsql/client`, `axios`, `node-cron`)
2. Add a `collector/Dockerfile` or `Procfile` for Railway:
   ```
   worker: node poller.js
   ```
3. Set up Railway project:
   - Connect the repo or deploy the `collector/` directory
   - Set env vars: `TURSO_URL`, `TURSO_AUTH_TOKEN`
   - Deploy as a **worker** (not a web service) so it doesn't need a port
4. Remove the local `better-sqlite3` dependency from the collector (Turso client is pure HTTP, no native modules)
5. Verify polling works by checking Turso dashboard for incoming rows

### 1.4 Update Electron Client to Fetch from Turso

**Goal:** The Electron app reads history data from Turso via HTTP instead of local SQLite.

**Steps:**

1. Create `src/main/db-turso-client.js` — a read-only client:
   - Uses `@libsql/client` or plain HTTP requests to Turso's REST API
   - Implements `queryPriceHistoryData(filters)` with the same bucket-aggregation SQL
   - Implements `queryWatchBaselineData(filters)` with the same 30-day avg SQL
   - For items with >30 days of range requested, query `price_hourly_averages` table instead
2. Update `src/main/db-queries.js`:
   - Replace the local SQLite `getDb()` path with the Turso HTTP client
   - Remove the `execFileSync` subprocess fallback (no longer needed)
   - Remove the `better-sqlite3` dependency from the main app entirely
3. Store the Turso URL/token:
   - Hardcode the read-only URL in the client (it's a public read endpoint)
   - Or use a lightweight API proxy if you want to avoid exposing the token
4. Update `src/main/ipc-handlers.js` — no changes needed if the function signatures stay the same
5. Remove `collector/db_query_runner.js` (no longer needed)

**Alternative approach (API proxy):** If you don't want to embed the Turso auth token in the client, deploy a tiny read-only API on Railway alongside the poller:
- `GET /api/history?itemName=...&server=...&days=7` → returns bucketed data
- `GET /api/baseline?...` → returns 30-day avg
- Client calls this API instead of Turso directly

### 1.5 Hourly Aggregation & Pruning Logic

**Goal:** Raw snapshots are pruned after 30 days, but hourly averages persist indefinitely.

**Aggregation logic (runs after each poll):**
```
For each unique combination of (attribute_id, server_name, quality_name, gem1, gem2, addition_level):
  For each hour_bucket in the current snapshot:
    UPSERT into price_hourly_averages:
      - avg_price = running weighted average
      - min_price = MIN(existing min, new min)
      - max_price = MAX(existing max, new max)
      - sample_count += new count
```

**Query logic update:**
- For queries within 30 days → use `price_snapshots` (30-min buckets, as today)
- For queries beyond 30 days → fall back to `price_hourly_averages` (hourly buckets)

---

## Phase 2: Hotkey Improvements

### 2.1 Clear/Unassign Hotkey Button

**Goal:** Allow users to remove hotkey assignments from clicker/automation hotkeys (not app hotkeys).

**Steps:**

1. Update `public/partials/settings.html`:
   - Add a small "×" clear button next to each **Clicker Hotkeys** input:
     ```html
     <button class="hotkey-clear-btn" data-target="automation-hotkey-master" title="Remove binding">×</button>
     ```
   - Do NOT add clear buttons to the 4 App Hotkeys (interact, collapse, hide, quit)

2. Add CSS in `public/css/settings.css`:
   ```css
   .hotkey-clear-btn {
     background: none; border: 1px solid var(--border-dim);
     color: var(--text-dim); cursor: pointer; font-size: 14px;
     width: 24px; height: 24px; border-radius: 4px;
     display: inline-flex; align-items: center; justify-content: center;
   }
   .hotkey-clear-btn:hover { color: var(--red); border-color: var(--red); }
   ```

3. Update `src/renderer/settings.js`:
   - Add event delegation for `.hotkey-clear-btn` clicks:
     ```js
     document.querySelectorAll('.hotkey-clear-btn').forEach(btn => {
       btn.addEventListener('click', () => {
         const input = document.getElementById(btn.dataset.target);
         if (input) { input.value = ''; }
       });
     });
     ```
   - The save handler already sends `undefined` for empty values, so no backend change needed

**Files to modify:** `settings.html`, `settings.css` (or inline), `settings.js`

### 2.2 Visual Keyboard/Mouse Picker Popup

**Goal:** A clickable keyboard + mouse diagram popup for selecting hotkeys visually.

**Steps:**

1. Create `public/partials/keyboard-picker.html` — modal overlay containing:
   - A visual keyboard grid rendered dynamically
   - A mouse diagram (left, right, middle, mouse4, mouse5 buttons)
   - Modifier toggle buttons (Ctrl, Alt, Shift) that stay "held" when clicked
   - A "Current binding" display showing the composed hotkey string
   - Confirm / Cancel buttons

2. Create `src/renderer/keyboard-picker.js`:
   - **Layout detection:** Use `navigator.keyboard.getLayoutMap()` (Chromium API) to detect the user's physical keyboard layout. This returns a map from physical key codes to the characters they produce
   - **Fallback layouts:** If the API is unavailable, default to a standard QWERTY layout with an option to switch between QWERTY/QWERTZ/AZERTY manually via a small dropdown in the picker
   - **Keyboard rendering:** Generate rows of key buttons based on the layout:
     - Row 0: Esc, F1–F12
     - Row 1: `/~, 1-0, -, =, Backspace
     - Row 2: Tab, Q–P (or layout-adjusted), [, ], \
     - Row 3: CapsLock, A–L (or layout-adjusted), ;, ', Enter
     - Row 4: Shift, Z–M (or layout-adjusted), comma, period, /, Shift
     - Row 5: Ctrl, Win, Alt, Space, Alt, Ctrl
     - Each key shows its actual character from the layout map
   - **Mouse section:** 5 clickable regions on a mouse SVG diagram
   - **Modifier toggling:** Clicking Ctrl/Alt/Shift toggles them on/off visually (highlighted border). They compose with the next key click
   - **Key selection:** Clicking any non-modifier key composes `[modifiers+]Key` string, displays it, and the user confirms
   - Export `openKeyboardPicker(inputEl, mode)` returning a Promise that resolves with the selected hotkey string or null if cancelled

3. Add a 🎹 (or keyboard icon) button next to each hotkey input in `settings.html`:
   ```html
   <button class="hotkey-picker-btn" data-target="app-hotkey-interact" title="Pick from keyboard">⌨</button>
   ```
   - These go next to ALL hotkey inputs (both app and automation)

4. Wire up in `settings.js`:
   ```js
   document.querySelectorAll('.hotkey-picker-btn').forEach(btn => {
     btn.addEventListener('click', async () => {
       const input = document.getElementById(btn.dataset.target);
       const mode = input.id.startsWith('automation-') ? 'automation' : 'app';
       const result = await openKeyboardPicker(input, mode);
       if (result) input.value = result;
     });
   });
   ```

5. Style the picker modal in `public/css/keyboard-picker.css`:
   - Dark theme consistent with the app
   - Keys as rounded rectangles with hover/active states
   - Active modifiers glow with accent color
   - Mouse diagram uses SVG with clickable regions

**Files to create:** `keyboard-picker.html`, `keyboard-picker.js`, `keyboard-picker.css`
**Files to modify:** `settings.html`, `settings.js`, `dom-refs.js`, `tab-loader.js` (if modal is a partial)

---

## Phase 3: Tab/Feature Disabling

### 3.1 Feature Toggle Settings

**Goal:** Allow users to disable and hide specific tabs (History, Watch, Autoclicker) from the settings panel.

**Steps:**

1. Add a "Features" section in `settings.html` (before or after Display):
   ```html
   <div class="section-label">Features</div>
   <div style="font-size:10px;color:var(--text-dim);margin-bottom:8px;">
     Disable features you don't use. The tab will be hidden from the bar.
   </div>
   <div class="setting-row">
     <label>Search</label>
     <input type="checkbox" checked disabled title="Core feature — cannot be disabled" />
   </div>
   <div class="setting-row">
     <label>Watch</label>
     <input type="checkbox" id="feature-watch" checked title="Toggle the Watch tab" />
   </div>
   <div class="setting-row">
     <label>History</label>
     <input type="checkbox" id="feature-history" checked title="Toggle the History tab" />
   </div>
   <div class="setting-row">
     <label>Clicker</label>
     <input type="checkbox" id="feature-autoclicker" checked title="Toggle the Clicker tab" />
   </div>
   ```

2. Create `src/renderer/feature-toggles.js`:
   - On load: read `localStorage` for `disabledFeatures` (a JSON array, e.g. `["autoclicker"]`)
   - `applyFeatureToggles()`:
     - For each disabled tab, hide the `.tab[data-tab="xxx"]` element and the `#tab-xxx` panel
     - If the currently active tab is disabled, switch to "search"
   - `toggleFeature(tabId, enabled)`:
     - Update localStorage
     - Show/hide the tab element
     - If disabling the active tab, switch to search
   - On the main process side, optionally send an IPC message to stop watch polling or automation when those features are disabled

3. Wire up in `settings.js`:
   - `feature-watch`, `feature-history`, `feature-autoclicker` checkboxes trigger `toggleFeature()`
   - Restore checkbox states on settings load

4. Update `dom-refs.js` to include the new feature toggle elements

5. Call `applyFeatureToggles()` in `renderer.js` after `buildDomRefs()`

**Files to create:** `feature-toggles.js`
**Files to modify:** `settings.html`, `settings.js`, `dom-refs.js`, `renderer.js`

---

## Phase 4: Internationalization (i18n)

### 4.1 Build the i18n Infrastructure

**Goal:** Full translation of all UI text into Polish, German, Spanish, and French.

**Steps:**

1. Create `src/renderer/i18n.js`:
   ```js
   let currentLocale = localStorage.getItem('locale') || 'en';
   let strings = {};

   const LOCALES = {
     en: () => import('../../locales/en.json'),
     pl: () => import('../../locales/pl.json'),
     de: () => import('../../locales/de.json'),
     es: () => import('../../locales/es.json'),
     fr: () => import('../../locales/fr.json'),
   };

   export async function setLocale(locale) {
     currentLocale = locale;
     localStorage.setItem('locale', locale);
     const mod = await LOCALES[locale]();
     strings = mod.default || mod;
     applyTranslations();
   }

   export function t(key, fallback) {
     return strings[key] ?? fallback ?? key;
   }

   function applyTranslations() {
     document.querySelectorAll('[data-i18n]').forEach(el => {
       el.textContent = t(el.dataset.i18n);
     });
     document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
       el.placeholder = t(el.dataset.i18nPlaceholder);
     });
     document.querySelectorAll('[data-i18n-title]').forEach(el => {
       el.title = t(el.dataset.i18nTitle);
     });
   }

   export function getCurrentLocale() { return currentLocale; }
   ```

2. Create `locales/en.json` — the master file with ALL translatable strings:
   - Tab names: `"tab.search"`, `"tab.watch"`, `"tab.history"`, `"tab.autoclicker"`
   - Section labels: `"settings.display"`, `"settings.window"`, `"settings.features"`, etc.
   - All setting labels, button text, placeholders, tooltips
   - Status messages: `"status.loading"`, `"status.noResults"`, `"status.error"`, etc.
   - Chart labels, filter labels, price display text
   - Estimated ~200–300 string keys total

3. Create translation files: `locales/pl.json`, `locales/de.json`, `locales/es.json`, `locales/fr.json`
   - Start with machine translation as a base, then refine
   - Game-specific terms (item names, server names) stay in English

4. Add `data-i18n` attributes to all HTML partials:
   - `settings.html`: every label, section header, button, tooltip
   - `search.html`: filter labels, buttons, placeholders
   - `history.html`: filter labels, day buttons, stats labels
   - `watch.html`: all labels and buttons
   - `autoclicker.html`: all labels and controls
   - `index.html`: tab names, titlebar elements

5. Add a Language selector in settings (in the Display section):
   ```html
   <div class="setting-row">
     <label data-i18n="settings.language">Language</label>
     <select id="locale-select">
       <option value="en">English</option>
       <option value="pl">Polski</option>
       <option value="de">Deutsch</option>
       <option value="es">Español</option>
       <option value="fr">Français</option>
     </select>
   </div>
   ```

6. Wire up in `settings.js`:
   ```js
   dom.localeSelect.addEventListener('change', () => setLocale(dom.localeSelect.value));
   ```

7. Handle dynamic content — strings set via JS (status messages, chart tooltips, etc.):
   - Import `t()` in each renderer module
   - Replace hardcoded strings: `setStatus(t('status.historyLoaded', 'History loaded'), 'ok')`
   - Template strings with variables: `t('status.historyBuckets').replace('{n}', points.length)`

8. Update `esbuild.config.mjs` if needed to handle JSON imports from `locales/`

9. Initialize i18n in `renderer.js` — call `setLocale(currentLocale)` after DOM is ready

**Files to create:** `i18n.js`, `locales/en.json`, `locales/pl.json`, `locales/de.json`, `locales/es.json`, `locales/fr.json`
**Files to modify:** All HTML partials, `settings.js`, `settings.html`, `renderer.js`, `history.js`, `search.js`, `watch.js`, `autoclicker.js`, `ui.js`, `utils.js`, `dom-refs.js`, `esbuild.config.mjs`

---

## Summary: Execution Order & Estimates

| Phase | Feature | Estimated Effort | Dependencies |
|-------|---------|-----------------|--------------|
| 1.1 | Turso DB setup | 1–2 hours | Turso account |
| 1.2 | Rewrite poller for Turso | 2–3 hours | 1.1 |
| 1.3 | Deploy poller to Railway | 1–2 hours | 1.2, Railway account |
| 1.4 | Client fetches from Turso | 2–3 hours | 1.1 |
| 1.5 | Hourly aggregation logic | 2–3 hours | 1.2 |
| 2.1 | Clear/unassign hotkeys | 30 min | None |
| 2.2 | Visual keyboard picker | 4–6 hours | None |
| 3.1 | Feature toggle settings | 1–2 hours | None |
| 4.1 | Full i18n system + 5 languages | 6–10 hours | None |

**Total estimated effort: ~20–30 hours**

Phases 2, 3, and 4 are independent of each other and of Phase 1. Phase 1 steps are sequential (1.1 → 1.2 → 1.3, and 1.1 → 1.4 can run in parallel with 1.2/1.3).
