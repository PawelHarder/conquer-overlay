'use strict';

const axios = require('axios');
const cron = require('node-cron');
const { insertSnapshot, pruneOldData, buildHourlyAverages } = require('./db');

const BASE_URL = 'https://conqueronline.net';
const ITEMS_PATH = '/Community/GetItems';

async function fetchAllListings() {
  const res = await axios.get(BASE_URL + ITEMS_PATH, {
    headers: { Accept: 'application/json' },
    timeout: 30000,
  });
  if (!Array.isArray(res.data)) throw new Error('Unexpected response shape');
  return res.data;
}

async function runPoll() {
  const startedAt = new Date().toISOString();
  console.log(`[Poller] Starting poll at ${startedAt}`);
  try {
    const items = await fetchAllListings();
    const snapshotAt = Math.floor(Date.now() / 1000);
    const inserted = insertSnapshot(items, snapshotAt);
    buildHourlyAverages(snapshotAt);   // must run before prune
    const pruned = pruneOldData();
    console.log(`[Poller] Inserted ${inserted} listings, pruned ${pruned} old rows`);
  } catch (err) {
    console.error(`[Poller] Poll failed: ${err.message}`);
  }
}

// Run immediately on start, then every 30 minutes
runPoll();
cron.schedule('*/30 * * * *', runPoll);

console.log('[Poller] Running — polls every 30 minutes. Press Ctrl+C to stop.');
