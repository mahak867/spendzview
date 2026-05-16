const cron = require('node-cron');
const db = require('../models/db');
const { syncUserLinkedAccounts } = require('./bankingSyncService');

const DEFAULT_SYNC_CRON = process.env.BANK_SYNC_CRON || '0 6 * * *';

let schedulerStarted = false;
let isRunning = false;

/**
 * Runs a full sync for all users with linked Setu accounts.
 * @returns {Promise<void>}
 */
async function runScheduledSync() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  try {
    const users = db.prepare(`SELECT DISTINCT user_id FROM bank_account_links WHERE provider='setu'`).all();
    for (const user of users) {
      await syncUserLinkedAccounts(user.user_id, { days: 2 });
    }
  } catch (error) {
    console.error('Scheduled bank sync failed:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Starts the daily linked account sync scheduler.
 * @returns {void}
 */
function startSyncScheduler() {
  if (schedulerStarted) {
    return;
  }

  cron.schedule(DEFAULT_SYNC_CRON, () => {
    runScheduledSync().catch((error) => console.error('Daily sync failed:', error));
  });
  schedulerStarted = true;
}

module.exports = {
  runScheduledSync,
  startSyncScheduler
};
