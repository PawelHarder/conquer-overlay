# Conquer Overlay

An always-on-top transparent overlay for **Classic Conquer Online** ([conqueronline.net](https://conqueronline.net)) built with Electron. Search the in-game market, track price history, set deal alerts, and run automation — all without leaving the game window.

---

## Features

### Market Search

Search active market listings by item name with autocomplete, and filter by category, quality, plus level, socket count, and server. Results display with sortable columns, price summaries (lowest / average / highest), and a gold-shorthand input parser (e.g. `1.5k` → `1,500`).

### Price History

Canvas-rendered line chart showing price trends over selectable time ranges (1, 3, 7, 14, or 30 days). Data is stored locally in SQLite via a background poller. Hover for tooltips; click to expand the chart in a modal.

### Deal Watch

Set a target item and maximum price. The app polls the market and triggers a sound alert when a matching listing appears. Matched items are shown in a separate **Watch Overlay** notification window with item details and per-plus pricing.

### Automation / Clicker

Profile-based automation system with:

- **Click automation** — left-click, right-click, and F7 key at configurable intervals with jitter
- **Modifier hold** — hold Shift or Ctrl continuously while enabled
- **13 configurable hotkeys** per profile — clicker toggles, buff activators, buff pausers, emergency stop
- **Game target attachment** — match by process name, window title, or manual selection
- **Profile management** — create, duplicate, rename, delete, import/export as JSON

### Buff Timers

Three default buff timers (Stigma, Shield, Invisibility) with configurable durations, two-stage warnings, and countdown/countup modes. Each buff can be activated and paused via hotkey. Active buff timers are rendered as progress bars in a dedicated **Buff Overlay** window.

### HUD & Buff Overlays

Two additional always-on-top windows rendered independently from the main overlay:

- **HUD Overlay** — compact chip display showing the state of each automation toggle (MST, LMB, RMB, F7, SHFT, CTRL)
- **Buff Overlay** — countdown bars for active buff timers with warning color stages

Both overlays support configurable opacity, position offsets, and can anchor relative to the game window or the screen work area.

### Market Minimap

Isometric projection of the in-game marketplace map. Hover a listing row to see the seller's stall location with dot highlighting and stall label. Click a row to pin the minimap view.

### Plus Calculator

Enter a count of +1 items to see how many higher-plus items can be crafted via greedy decomposition (+9 → +5 → +1 remainder breakdown).

### Appearance

- **6 themes** — Original Dark, Midnight Blue, Obsidian, Smokey, Parchment, Light
- **7 font pairings** — Classic, Scholar, Terminal, Modern, Old English, Humanist, Sharp
- **Opacity** — separate window opacity and text opacity sliders
- **UI scale** — 0.9× to 1.2×

### Interaction Model

The overlay uses `alwaysOnTop: 'screen-saver'` (highest z-level) and is fully click-through by default. Press the interact hotkey to toggle mouse interaction on/off.

---

## Keyboard Shortcuts

All app-level shortcuts are configurable in the Settings tab.

| Default | Action |
|---|---|
| `F8` | Toggle interactive mode (click-through ↔ interactive) |
| `Alt+C` | Collapse / expand to title bar |
| `Alt+H` | Hide / show the overlay |
| `Alt+Q` | Quit the application |

Automation hotkeys (13 per profile) are configured in the Clicker tab. Defaults include `MouseMiddle` for master toggle, `F1`–`F3` for buff activation, and `Escape` for emergency stop.

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Git](https://git-scm.com)

### Install

```bash
git clone <repo-url>
cd conquer-overlay
npm install
```

### Bundle

Build the renderer and CSS bundles before first run:

```bash
npm run bundle
```

### Run

| Command | Description |
|---|---|
| `npm start` | Launch the overlay |
| `npm run start:admin` | Launch with administrator privileges (required for automation input injection on Windows) |
| `npm run dev` | Launch with DevTools attached |
| `npm run dev:admin` | Launch with DevTools + admin privileges |
| `npm run bundle:watch` | Rebuild bundles on file change |

---

## Building

### Windows

```bash
npm run build:win
```

Produces an NSIS installer in `dist/`. The packaged app requests administrator privileges at launch (required for automation input injection).

### Linux

The Linux build requires the Rust-based automation helper to be compiled first:

```bash
# Install X11 development libraries (Debian/Ubuntu)
sudo apt install libx11-dev libxtst-dev libxi-dev libxrandr-dev libxcb1-dev

# Build the native helper
npm run build:helper:linux

# Build the Electron app
npm run build:linux
```

Produces an AppImage and a `.deb` package in `dist/`.

A `beforePack` build hook validates that the platform-specific helper binary exists before packaging.

---

## Architecture

```
conquer-overlay/
├── src/
│   ├── main.js                        ← Main-process orchestrator (~40 lines)
│   ├── main/
│   │   ├── window-manager.js          ← Window creation, overlays, shutdown
│   │   ├── hotkey-manager.js          ← Global shortcuts, interactive mode
│   │   ├── ipc-handlers.js            ← All IPC registrations
│   │   ├── state-store.js             ← Persisted window state & hotkeys
│   │   ├── db-queries.js              ← SQLite price-history queries
│   │   ├── automation-setup.js        ← Helper process init & cleanup
│   │   └── market-client.js           ← HTTP market API proxy
│   │
│   ├── renderer.js                    ← Renderer orchestrator
│   ├── renderer/
│   │   ├── state.js                   ← Shared state object
│   │   ├── dom-refs.js                ← Cached DOM references
│   │   ├── ui.js                      ← Tabs, collapse, window drag
│   │   ├── search.js                  ← Market search & results
│   │   ├── history.js                 ← Price history chart
│   │   ├── watch.js                   ← Deal watch polling
│   │   ├── autoclicker.js             ← Automation UI
│   │   ├── settings.js                ← Settings tab
│   │   ├── themes.js                  ← Theme & font system
│   │   ├── minimap.js                 ← Isometric market map
│   │   ├── chart.js                   ← Canvas chart renderer
│   │   ├── filters.js                 ← Category filter metadata
│   │   ├── listings.js                ← Listing row rendering
│   │   ├── plus-calculator.js         ← +1 item decomposition
│   │   ├── price-inputs.js            ← Gold shorthand inputs
│   │   ├── hotkey-capture.js          ← Hotkey binding UI
│   │   ├── tab-loader.js             ← HTML partial injection
│   │   └── utils.js                   ← Shared utilities
│   │
│   ├── preload.js                     ← Secure IPC bridge (contextIsolation)
│   ├── api.js                         ← Market API client
│   ├── automation-contracts.js        ← Automation schemas & defaults
│   ├── automation-service.js          ← Core automation orchestrator
│   ├── automation-helper-client.js    ← Helper child-process RPC client
│   ├── profile-store.js               ← Automation profile CRUD & persistence
│   ├── hud-window.js                  ← Overlay window factory
│   └── hud-renderer.js               ← HUD & buff overlay renderer
│
├── public/
│   ├── index.html                     ← Main overlay shell
│   ├── automation-hud.html            ← HUD overlay
│   ├── automation-buffs.html          ← Buff overlay
│   ├── watch-overlay.html             ← Watch notification overlay
│   ├── partials/                      ← Tab HTML fragments (search, history, watch, autoclicker, settings)
│   ├── css/                           ← Component CSS files + entry bundles
│   ├── assets/                        ← Market minimap image
│   └── dist/                          ← esbuild output (gitignored)
│
├── collector/
│   ├── poller.js                      ← Background market data poller (30 min interval)
│   ├── db.js                          ← SQLite schema & insert/prune logic
│   └── db_query_runner.js             ← Child-process query fallback
│
├── native-helper/
│   ├── conquer-helper-spike.ps1       ← Windows automation helper (PowerShell)
│   └── conquer-helper/                ← Linux automation helper (Rust, x11rb + xtest)
│
├── scripts/
│   └── before-pack.js                 ← Build hook: validates helper binary exists
│
└── esbuild.config.mjs                ← JS (IIFE) & CSS bundler config
```

### Build Pipeline

1. **esbuild** bundles `src/renderer.js` and `src/hud-renderer.js` into IIFE scripts under `public/dist/`, and merges CSS component files into four entry bundles (main, watch overlay, HUD, buffs). An `htmlTextPlugin` inlines HTML partials as JS string exports to avoid `fetch()` on `file://`.
2. **electron-builder** packages the app as an NSIS installer (Windows) or AppImage/DEB (Linux), embedding the platform-specific automation helper in the app resources.

---

## Data Collection

Price history is currently collected by a local poller (`collector/poller.js`) that snapshots the market every 30 minutes into a SQLite database. The poller is a standalone Node script intended for development and self-hosting:

```bash
node collector/poller.js
```

A hosted database is planned so that all users can access shared price history without running the poller locally.

---

## Notes

- The overlay sits above all other windows including fullscreen-windowed games, using the `screen-saver` always-on-top level
- Windows builds request administrator privileges — this is required for the automation helper to inject input into the game process
- The automation helper for Windows is currently a PowerShell script (`conquer-helper-spike.ps1`); the long-term target is a compiled native binary
- The Linux helper is a compiled Rust binary using x11rb and xtest for input injection
