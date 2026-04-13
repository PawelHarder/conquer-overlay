const path = require('path');

// ── Railway API (production) ──────────────────────────────────────────────────
// Set this to your Railway deployment URL once deployed.
// Leave as null to fall back to local SQLite (dev only).
const RAILWAY_API_URL = 'https://conquer-overlay-production.up.railway.app';

// ── Local SQLite fallback (dev / admin mode) ──────────────────────────────────
const DB_RUNNER_PATH = path.join(__dirname, '../../collector/db_query_runner.js');
const DB_FILE_PATH   = path.join(__dirname, '../../collector/market.db');

let db = null;

function getDb() {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_FILE_PATH, { readonly: true, fileMustExist: true });
  } catch (_) { /* DB not created yet — poller not started */ }
  return db;
}

function queryDbExternally(mode, filters) {
  const { execFileSync } = require('child_process');
  const stdout = execFileSync('node', [DB_RUNNER_PATH, DB_FILE_PATH, JSON.stringify({ mode, filters })], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return JSON.parse(stdout || 'null');
}

// ── Railway HTTP client ───────────────────────────────────────────────────────

async function queryRailway(endpoint, filters = {}) {
  const url = new URL(endpoint, RAILWAY_API_URL);
  for (const [key, val] of Object.entries(filters)) {
    if (val != null && val !== '') url.searchParams.set(key, val);
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Shared local query logic (mirrors collector/server.js) ────────────────────

function buildDbConditions(filters = {}) {
  const conditions = ['1=1'];
  const params = {};

  const {
    itemName,
    majorClass,
    minorClass,
    quality,
    plusLevel,
    sockets,
    server,
    days,
  } = filters;

  if (itemName) {
    conditions.push("attribute_name LIKE '%' || @itemName || '%'");
    params.itemName = itemName;
  }
  if (majorClass) {
    conditions.push('major_class = @majorClass');
    params.majorClass = majorClass;
  }
  if (minorClass) {
    conditions.push('minor_class = @minorClass');
    params.minorClass = minorClass;
  }
  if (quality) {
    conditions.push('quality_name = @quality');
    params.quality = quality;
  }
  if (plusLevel != null) {
    conditions.push('addition_level = @plusLevel');
    params.plusLevel = plusLevel;
  }
  if (sockets != null) {
    if (sockets === 0) conditions.push("gem1 = 'None'");
    else if (sockets === 1) conditions.push("gem1 != 'None' AND gem2 = 'None'");
    else if (sockets === 2) conditions.push("gem1 != 'None' AND gem2 != 'None'");
  }
  if (server) {
    conditions.push('server_name = @server');
    params.server = server;
  }

  params.cutoff = Math.floor(Date.now() / 1000) - (days ?? 7) * 86400;
  conditions.push('snapshot_at >= @cutoff');
  return { conditions, params };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function queryPriceHistoryData(filters = {}) {
  // 1. Try Railway API first (works for all users, installed or not)
  if (RAILWAY_API_URL) {
    return queryRailway('/api/history', filters);
  }

  // 2. Local SQLite (available in dev/admin mode when poller has been run)
  const database = getDb();
  if (database) {
    const { conditions, params } = buildDbConditions(filters);
    const sql = `
      SELECT
        (snapshot_at / 1800) * 1800 AS bucket,
        MIN(price) AS lowest,
        CAST(AVG(price) AS INTEGER) AS avg,
        MAX(price) AS highest
      FROM price_snapshots
      WHERE ${conditions.join(' AND ')}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return database.prepare(sql).all(params);
  }

  // 3. Subprocess fallback (last resort — may not work in installed builds)
  return queryDbExternally('history', filters);
}

async function queryWatchBaselineData(filters = {}) {
  // 1. Try Railway API first
  if (RAILWAY_API_URL) {
    return queryRailway('/api/baseline', filters);
  }

  // 2. Local SQLite
  const baselineFilters = { ...filters, days: 30 };
  const database = getDb();
  if (database) {
    const { conditions, params } = buildDbConditions(baselineFilters);
    const sql = `
      SELECT
        MIN(price) AS lowest,
        CAST(AVG(price) AS INTEGER) AS avg,
        MAX(price) AS highest
      FROM price_snapshots
      WHERE ${conditions.join(' AND ')}
    `;
    return database.prepare(sql).get(params) ?? null;
  }

  // 3. Subprocess fallback
  return queryDbExternally('baseline', filters);
}

module.exports = { getDb, queryPriceHistoryData, queryWatchBaselineData };
