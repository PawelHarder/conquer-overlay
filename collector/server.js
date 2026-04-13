'use strict';

const path    = require('path');
const express = require('express');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'market.db');

// Open a read-only connection — the poller owns the write connection.
let db = null;
function getDb() {
  if (db) return db;
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return db;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function buildConditions(filters = {}) {
  const conditions = ['1=1'];
  const params     = {};
  const { itemName, majorClass, minorClass, quality, plusLevel, sockets, server, days } = filters;

  if (itemName)               { conditions.push("attribute_name LIKE '%' || @itemName || '%'"); params.itemName = itemName; }
  if (majorClass)             { conditions.push('major_class = @majorClass');   params.majorClass = majorClass; }
  if (minorClass)             { conditions.push('minor_class = @minorClass');   params.minorClass = minorClass; }
  if (quality)                { conditions.push('quality_name = @quality');     params.quality    = quality; }
  if (plusLevel != null)      { conditions.push('addition_level = @plusLevel'); params.plusLevel  = Number(plusLevel); }
  if (sockets != null) {
    const s = Number(sockets);
    if      (s === 0) conditions.push("gem1 = 'None'");
    else if (s === 1) conditions.push("gem1 != 'None' AND gem2 = 'None'");
    else if (s === 2) conditions.push("gem1 != 'None' AND gem2 != 'None'");
  }
  if (server) { conditions.push('server_name = @server'); params.server = server; }

  params.cutoff = Math.floor(Date.now() / 1000) - (Number(days) || 7) * 86400;
  conditions.push('snapshot_at >= @cutoff');
  return { conditions, params };
}

function queryHistory(filters) {
  const { conditions, params } = buildConditions(filters);
  return getDb().prepare(`
    SELECT
      (snapshot_at / 1800) * 1800 AS bucket,
      MIN(price)                  AS lowest,
      CAST(AVG(price) AS INTEGER) AS avg,
      MAX(price)                  AS highest
    FROM price_snapshots
    WHERE ${conditions.join(' AND ')}
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(params);
}

function queryBaseline(filters) {
  const baselineFilters       = { ...filters, days: 30 };
  const { conditions, params } = buildConditions(baselineFilters);
  return getDb().prepare(`
    SELECT
      MIN(price)                  AS lowest,
      CAST(AVG(price) AS INTEGER) AS avg,
      MAX(price)                  AS highest
    FROM price_snapshots
    WHERE ${conditions.join(' AND ')}
  `).get(params) ?? null;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// Allow the Electron app (file:// origin) and any future web clients to query.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/history', (req, res) => {
  try {
    const rows = queryHistory(req.query);
    res.json(rows);
  } catch (err) {
    console.error('[Server] /api/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/baseline', (req, res) => {
  try {
    const row = queryBaseline(req.query);
    res.json(row);
  } catch (err) {
    console.error('[Server] /api/baseline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// TEMPORARY — remove after seeding
app.post('/admin/seed-db', (req, res) => {
  const secret = process.env.UPLOAD_SECRET;
  if (!secret || req.headers['x-upload-secret'] !== secret) return res.status(401).end();
  const fs = require('fs');
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    fs.writeFileSync(DB_PATH, Buffer.concat(chunks));
    res.send('seeded');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
