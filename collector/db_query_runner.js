'use strict';

const Database = require('better-sqlite3');

function buildConditions(filters = {}) {
  const conditions = ['1=1'];
  const params = {};

  const {
    itemName,
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

function runHistoryQuery(db, filters) {
  const { conditions, params } = buildConditions(filters);
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
  return db.prepare(sql).all(params);
}

function runBaselineQuery(db, filters) {
  const { conditions, params } = buildConditions({ ...filters, days: 30 });
  const sql = `
    SELECT
      MIN(price) AS lowest,
      CAST(AVG(price) AS INTEGER) AS avg,
      MAX(price) AS highest
    FROM price_snapshots
    WHERE ${conditions.join(' AND ')}
  `;
  return db.prepare(sql).get(params) ?? null;
}

function main() {
  const dbPath = process.argv[2];
  const payload = JSON.parse(process.argv[3] || '{}');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  let result;
  if (payload.mode === 'history') {
    result = runHistoryQuery(db, payload.filters || {});
  } else if (payload.mode === 'baseline') {
    result = runBaselineQuery(db, payload.filters || {});
  } else {
    throw new Error(`Unknown mode: ${payload.mode}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main();