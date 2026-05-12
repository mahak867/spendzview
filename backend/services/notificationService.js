const db = require('../models/db');

/**
 * Create a notification once per day for the same title and type.
 * @param {number} userId - Authenticated user ID.
 * @param {string} type - Notification type.
 * @param {string} title - Notification title.
 * @param {string} message - Notification body.
 * @returns {{created: boolean, notification: object|null}} Notification result.
 */
function createNotificationOncePerDay(userId, type, title, message) {
  const today = new Date().toISOString().split('T')[0];
  const existing = db.prepare('SELECT * FROM notifications WHERE user_id=? AND type=? AND title=? AND date(created_at)=?').get(userId, type, title, today);
  if (existing) {
    return { created: false, notification: existing };
  }

  const result = db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)').run(userId, type, title, message);
  return {
    created: true,
    notification: db.prepare('SELECT * FROM notifications WHERE id=?').get(result.lastInsertRowid)
  };
}

/**
 * Create a large transaction alert when the threshold is crossed.
 * @param {number} userId - Authenticated user ID.
 * @param {{amount:number, type?:string, description?:string, date?:string}} transaction - Transaction payload.
 * @returns {{created: boolean, notification: object|null}|null} Notification result.
 */
function createLargeTransactionAlert(userId, transaction) {
  if (!transaction || Math.abs(Number(transaction.amount) || 0) <= 10000) {
    return null;
  }

  const direction = transaction.type === 'credit' ? 'credit' : 'debit';
  const title = `Large transaction detected (${direction})`;
  const message = `₹${Math.abs(Number(transaction.amount)).toFixed(2)} ${direction} ${transaction.description ? `for ${transaction.description}` : 'transaction'}${transaction.date ? ` on ${transaction.date}` : ''}`;
  return createNotificationOncePerDay(userId, 'large_transaction', title, message);
}

/**
 * Create a low balance warning for a linked account.
 * @param {number} userId - Authenticated user ID.
 * @param {{bank_name?:string, account_number?:string, masked_account_number?:string, balance?:number, live_balance?:number}} account - Account payload.
 * @returns {{created: boolean, notification: object|null}|null} Notification result.
 */
function createLowBalanceWarning(userId, account) {
  const balance = Number(account?.live_balance ?? account?.balance ?? 0);
  if (balance >= 500) {
    return null;
  }

  const suffixSource = account?.masked_account_number || account?.account_number || '';
  const suffix = suffixSource ? suffixSource.slice(-4) : 'acct';
  const title = `Low balance warning: ${account?.bank_name || 'Bank account'} ••••${suffix}`;
  const message = `Available balance is ₹${balance.toFixed(2)}. Please top up or review upcoming payments.`;
  return createNotificationOncePerDay(userId, 'low_balance', title, message);
}

/**
 * Create a sync failure notification.
 * @param {number} userId - Authenticated user ID.
 * @param {string} reason - Sync failure reason.
 * @returns {{created: boolean, notification: object|null}} Notification result.
 */
function createSyncFailedAlert(userId, reason) {
  return createNotificationOncePerDay(userId, 'sync_failed', 'Sync failed', reason || 'We could not refresh your linked bank accounts.');
}

module.exports = {
  createNotificationOncePerDay,
  createLargeTransactionAlert,
  createLowBalanceWarning,
  createSyncFailedAlert
};
