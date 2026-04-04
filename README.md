# Conquer Market Overlay

An always-on-top transparent overlay for **Classic Conquer Online** (`conqueronline.net`) that lets you check market prices, view price history, and set deal alerts — all without leaving the game.

---

## Features

| Feature | Description |
|---|---|
| **Tooltip Scan** | Press `Alt+S` to OCR the item tooltip on screen → auto-fills price check |
| **Price Check** | Lowest / Average / Highest prices + active listings for scanned item |
| **Price History** | Trend chart filterable to 1, 3, 7, 14, 30 days |
| **Deal Watch** | Background polling for a specific item below your max price — plays a sound alert |
| **Manual Search** | Search by name, category, quality, max price |
| **Click-through** | Window is fully transparent to mouse by default — hold `Alt` to interact |
| **Collapse** | Press `Alt+C` or click ▲ to collapse to title bar only |

---

## Setup

### Prerequisites
- [Node.js](https://nodejs.org) v18+
- [Git](https://git-scm.com)

### Install

```bash
git clone <repo>
cd conquer-overlay
npm install
```

### Run (development)

```bash
npm run dev
```

This opens the overlay with DevTools attached for debugging.

### Build (Windows executable)

```bash
npm run build
```

Output in `dist/`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + S` | Scan tooltip under cursor |
| `Alt + C` | Collapse / expand overlay |
| `Alt + H` | Hide / show overlay entirely |
| Hold `Alt` | Enable mouse interaction with overlay |

---

## Architecture

```
conquer-overlay/
├── src/
│   ├── main.js        ← Electron main process
│   │                     Window creation, always-on-top, click-through,
│   │                     global shortcuts, IPC handlers, screen capture
│   ├── preload.js     ← Secure IPC bridge (contextIsolation)
│   ├── renderer.js    ← All UI logic, state, API calls, chart drawing
│   ├── api.js         ← conqueronline.net/api/v1 wrapper
│   └── ocr.js         ← Tesseract.js OCR + tooltip parser
└── public/
    └── index.html     ← Overlay UI (dark game aesthetic)
```

---

## ⚠️ Completing the API Integration

The API endpoints were reverse-engineered from the site's JS bundle. There is **no official documentation**. Before the app will work correctly, you need to confirm the actual request/response shapes using browser DevTools:

### Steps

1. Open [https://conqueronline.net/Community/Market](https://conqueronline.net/Community/Market) in Chrome
2. Open DevTools → **Network** tab → filter by `api`
3. Use the market filters and search — watch the API calls fire
4. Note the **exact query parameter names** and **response JSON field names**

### Key things to confirm

| File | What to update |
|---|---|
| `src/api.js` | Query parameter names in `getListings()`, `getPriceSummary()`, etc. |
| `src/renderer.js` | Field names in `renderPriceSummary()` — `data.lowest` vs `data.minPrice` etc. |
| `src/renderer.js` | Field names in `renderListings()` — `item.SellerName`, `item.Price` etc. |
| `src/api.js` | `getPriceHistory()` — check if a true history endpoint exists |

The field names used in the HTML template on the market page give a strong hint:
```
{{item.QualityName}}  {{item.AdditionLevel}}  {{item.Gem1}}  {{item.Gem2}}
{{item.SellerName}}   {{item.Price | humanize}}
```
These match what's already used in `renderer.js`.

---

## OCR Tuning

The OCR uses **Tesseract.js** with a tooltip border color detection heuristic. If the tooltip isn't detected:

1. Take a screenshot of a tooltip in-game
2. Use a color picker to get the exact RGB of the tooltip's outer border
3. Update `BORDER_R`, `BORDER_G`, `BORDER_B` ranges in `src/ocr.js → findTooltipRegion()`

### Alternative: Memory Reading

If OCR is too unreliable (pixel fonts can be tricky), a more robust approach is to read item data directly from game memory using a native addon:

- [`node-ffi-napi`](https://github.com/node-ffi-napi/node-ffi-napi) — call Windows API from Node
- Find item struct offsets using a debugger/Cheat Engine (see [github.com/conquer-online](https://github.com/conquer-online) for packet/struct research)
- This gives you perfect structured data with zero OCR errors

---

## Notes

- The overlay uses `alwaysOnTop: 'screen-saver'` — the highest z-order level in Windows, which keeps it above the game even in fullscreen-windowed mode
- Market data freshness can be checked via `/api/v1/sync/status`
- The deal watch polls at the configured interval (default 15s) — don't set it too low or you may get rate-limited
