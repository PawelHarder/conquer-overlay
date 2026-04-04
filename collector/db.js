'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'market.db');

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

module.exports = { insertSnapshot, pruneOldData };
