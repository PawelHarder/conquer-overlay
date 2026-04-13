'use strict';

const Database = require('better-sqlite3');
const path = require('path');

// DB_PATH can be overridden via env var for Railway (persistent volume at /data)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'market.db');

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS price_snapshots (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id        INTEGER NOT NULL,
    attribute_id   INTEGER NOT NULL,
    attribute_name TEXT    NOT NULL,
    price          INTEGER NOT NULL,
    quality_name   TEXT    NOT NULL DEFAULT '',
    gem1           TEXT    NOT NULL DEFAULT 'None',
    gem2           TEXT    NOT NULL DEFAULT 'None',
    addition_level INTEGER NOT NULL DEFAULT 0,
    major_class    TEXT    NOT NULL DEFAULT '',
    minor_class    TEXT    NOT NULL DEFAULT '',
    server_name    TEXT    NOT NULL DEFAULT '',
    snapshot_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attr_snapshot
    ON price_snapshots(attribute_id, snapshot_at);

  CREATE INDEX IF NOT EXISTS idx_minor_plus_snapshot
    ON price_snapshots(minor_class, addition_level, snapshot_at);

  CREATE INDEX IF NOT EXISTS idx_minor_quality_snapshot
    ON price_snapshots(minor_class, quality_name, snapshot_at);

  -- Hourly aggregates survive the 30-day prune of raw snapshots,
  -- enabling long-term trend queries beyond the raw retention window.
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
    hour_bucket    INTEGER NOT NULL,
    avg_price      INTEGER NOT NULL,
    min_price      INTEGER NOT NULL,
    max_price      INTEGER NOT NULL,
    sample_count   INTEGER NOT NULL DEFAULT 1,
    UNIQUE(attribute_id, server_name, quality_name, gem1, gem2, addition_level, hour_bucket)
  );

  CREATE INDEX IF NOT EXISTS idx_hourly_minor_plus
    ON price_hourly_averages(minor_class, addition_level, hour_bucket);

  CREATE INDEX IF NOT EXISTS idx_hourly_minor_quality
    ON price_hourly_averages(minor_class, quality_name, hour_bucket);

  CREATE INDEX IF NOT EXISTS idx_hourly_attr_name
    ON price_hourly_averages(attribute_name, hour_bucket);
`);

const insertOne = db.prepare(`
  INSERT INTO price_snapshots
    (item_id, attribute_id, attribute_name, price, quality_name, gem1, gem2,
     addition_level, major_class, minor_class, server_name, snapshot_at)
  VALUES
    (@item_id, @attribute_id, @attribute_name, @price, @quality_name, @gem1, @gem2,
     @addition_level, @major_class, @minor_class, @server_name, @snapshot_at)
`);

const insertBatch = db.transaction((rows) => {
  for (const row of rows) insertOne.run(row);
});

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

function pruneOldData() {
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_S;
  const result = db.prepare('DELETE FROM price_snapshots WHERE snapshot_at < ?').run(cutoff);
  return result.changes;
}

function insertSnapshot(items, snapshotAt) {
  const rows = items.map(item => ({
    item_id:        item.ItemId,
    attribute_id:   item.AttributeId,
    attribute_name: item.AttributeName ?? '',
    price:          item.Price,
    quality_name:   item.QualityName ?? '',
    gem1:           item.Gem1 ?? 'None',
    gem2:           item.Gem2 ?? 'None',
    addition_level: item.AdditionLevel ?? 0,
    major_class:    item.ItemMajorClass ?? '',
    minor_class:    item.ItemMinorClass ?? '',
    server_name:    item.ServerName ?? '',
    snapshot_at:    snapshotAt,
  }));
  insertBatch(rows);
  return rows.length;
}

// Build (or update) hourly aggregates for the hour that contains snapshotAt.
// Must be called BEFORE pruneOldData so the raw rows are still present.
function buildHourlyAverages(snapshotAt) {
  const hourStart = Math.floor(snapshotAt / 3600) * 3600;
  const hourEnd   = hourStart + 3600;

  // Aggregate raw snapshots for the current hour, then upsert into the
  // hourly averages table, merging with any existing row for that bucket.
  db.prepare(`
    INSERT INTO price_hourly_averages
      (attribute_id, attribute_name, quality_name, gem1, gem2, addition_level,
       major_class, minor_class, server_name, hour_bucket,
       avg_price, min_price, max_price, sample_count)
    SELECT
      attribute_id, attribute_name, quality_name, gem1, gem2, addition_level,
      major_class, minor_class, server_name,
      (snapshot_at / 3600) * 3600 AS hour_bucket,
      CAST(AVG(price) AS INTEGER) AS avg_price,
      MIN(price)                  AS min_price,
      MAX(price)                  AS max_price,
      COUNT(*)                    AS sample_count
    FROM price_snapshots
    WHERE snapshot_at >= ? AND snapshot_at < ?
    GROUP BY attribute_id, attribute_name, quality_name, gem1, gem2,
             addition_level, major_class, minor_class, server_name, hour_bucket
    ON CONFLICT(attribute_id, server_name, quality_name, gem1, gem2, addition_level, hour_bucket)
    DO UPDATE SET
      avg_price    = CAST(
                      (avg_price * sample_count + excluded.avg_price * excluded.sample_count)
                      / (sample_count + excluded.sample_count)
                    AS INTEGER),
      min_price    = MIN(min_price, excluded.min_price),
      max_price    = MAX(max_price, excluded.max_price),
      sample_count = sample_count + excluded.sample_count
  `).run(hourStart, hourEnd);
}

module.exports = { insertSnapshot, pruneOldData, buildHourlyAverages };
