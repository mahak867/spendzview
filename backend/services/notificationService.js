const db = require('../models/db');

/**
 * Returns today's date in YYYY-MM-DD format.
 * @returns {string}
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Creates a notification once per day for the same user, type, and title.
 * @param {number} userId
 * @param {string} type
 * @param {string} title
 * @param {string} message
 * @returns {boolean}
 */
function createNotification(userId, type, title, message) {
  const today = getToday();
  const existing = db.prepare(`SELECT id FROM notifications WHERE user_id=? AND type=? AND title=? AND date(created_at)=?`).get(userId, type, title, today);
  if (existing) {
    return false;
  }

  db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)').run(userId, type, title, message);
  return true;
}

/**
 * Creates a sync failure notification.
 * @param {number} userId
 * @param {string} reason
 * @returns {boolean}
 */
function createSyncFailedNotification(userId, reason) {
  return createNotification(userId, 'sync_failed', 'Bank sync failed', reason);
}

/**
 * Creates a large transaction notification when a debit crosses the threshold.
 * @param {number} userId
 * @param {{ amount: number, description?: string, date?: string }} transaction
 * @returns {boolean}
 */
function createLargeTransactionNotification(userId, transaction) {
  return createNotification(
    userId,
    'large_transaction',
    `Large transaction detected: ₹${Number(transaction.amount || 0).toFixed(2)}`,
    `${transaction.description || 'Transaction'} on ${transaction.date || getToday()} exceeded ₹10,000.`
  );
}

/**
 * Creates a low balance warning notification.
 * @param {number} userId
 * @param {{ bank_name?: string, balance?: number, account_number?: string }} account
 * @returns {boolean}
 */
function createLowBalanceNotification(userId, account) {
  const lastFourDigits = `${account.account_number || ''}`.replace(/\D/g, '').slice(-4);
  const title = `Low balance warning: ${account.bank_name || 'Linked account'}`;
  const masked = lastFourDigits ? ` ••••${lastFourDigits}` : '';
  return createNotification(
    userId,
    'low_balance',
    title,
    `${account.bank_name || 'Account'}${masked} balance is ₹${Number(account.balance || 0).toFixed(2)}.`
  );
}

module.exports = {
  createNotification,
  createSyncFailedNotification,
  createLargeTransactionNotification,
  createLowBalanceNotification
};
