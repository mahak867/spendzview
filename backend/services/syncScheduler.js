const cron = require('node-cron');
const { syncAllEligibleUsers } = require('./setuService');

let schedulerStarted = false;

/**
 * Start the daily bank sync scheduler once per process.
 * @returns {void}
 */
function startSyncScheduler() {
  if (schedulerStarted) {
    return;
  }

  cron.schedule('0 6 * * *', async () => {
    try {
      await syncAllEligibleUsers();
    } catch (error) {
      console.error('Daily Setu sync failed:', error);
    }
  });

  schedulerStarted = true;
}

module.exports = {
  startSyncScheduler
};
