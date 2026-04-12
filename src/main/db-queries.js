const path = require('path');
const { execFileSync } = require('child_process');

const DB_RUNNER_PATH = path.join(__dirname, '../../collector/db_query_runner.js');
const DB_FILE_PATH = path.join(__dirname, '../../collector/market.db');

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
  const stdout = execFileSync('node', [DB_RUNNER_PATH, DB_FILE_PATH, JSON.stringify({ mode, filters })], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return JSON.parse(stdout || 'null');
}

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

function queryPriceHistoryData(filters = {}) {
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

  return queryDbExternally('history', filters);
}

function queryWatchBaselineData(filters = {}) {
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

  return queryDbExternally('baseline', filters);
}

module.exports = { getDb, queryPriceHistoryData, queryWatchBaselineData };
