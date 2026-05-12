const db = require('../models/db');
const setuService = require('./setuService');
const { categorizeDescription, getMerchantIcon } = require('./categorizerService');
const { parseUPITransactionSms } = require('./upiParser');
const {
  createLargeTransactionNotification,
  createLowBalanceNotification,
  createSyncFailedNotification
} = require('./notificationService');

/**
 * Returns today's date in YYYY-MM-DD format.
 * @returns {string}
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Returns an ISO date some days before today.
 * @param {number} days
 * @returns {string}
 */
function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
}

/**
 * Masks an account number for display.
 * @param {string|null} value
 * @returns {string|null}
 */
function maskAccountNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return value || null;
  }

  return `••••${digits.slice(-4)}`;
}

/**
 * Finds or creates a local bank account for a linked Setu account.
 * @param {number} userId
 * @param {{ consent_id: string }} consentRow
 * @param {object} remoteAccount
 * @returns {{ bankAccountId: number, linkId: number }}
 */
function upsertLinkedAccount(userId, consentRow, remoteAccount) {
  const existingLink = db.prepare('SELECT * FROM bank_account_links WHERE user_id=? AND provider=? AND provider_account_id=?').get(userId, 'setu', remoteAccount.providerAccountId);
  if (existingLink) {
    db.prepare(`UPDATE bank_accounts SET bank_name=?, account_number=COALESCE(?,account_number), account_type=?, ifsc_code=COALESCE(?,ifsc_code), branch=COALESCE(?,branch), last_synced=COALESCE(last_synced, CURRENT_TIMESTAMP) WHERE id=?`).run(
      remoteAccount.bankName,
      remoteAccount.maskedAccountNumber || remoteAccount.accountNumber,
      remoteAccount.accountType,
      remoteAccount.ifscCode,
      remoteAccount.branch,
      existingLink.bank_account_id
    );
    db.prepare(`UPDATE bank_account_links SET consent_id=?, status=?, masked_account_number=?, account_type=?, metadata_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      consentRow.consent_id,
      remoteAccount.status,
      remoteAccount.maskedAccountNumber || maskAccountNumber(remoteAccount.accountNumber),
      remoteAccount.accountType,
      JSON.stringify(remoteAccount.metadata || {}),
      existingLink.id
    );
    return { bankAccountId: existingLink.bank_account_id, linkId: existingLink.id };
  }

  const bankInsert = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, account_type, balance, ifsc_code, branch, last_synced, notes) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    userId,
    remoteAccount.bankName,
    remoteAccount.maskedAccountNumber || remoteAccount.accountNumber,
    remoteAccount.accountType || 'savings',
    0,
    remoteAccount.ifscCode || null,
    remoteAccount.branch || null,
    null,
    'Linked via Setu Account Aggregator'
  );

  const linkInsert = db.prepare(`INSERT INTO bank_account_links (bank_account_id, user_id, provider, provider_account_id, consent_id, status, masked_account_number, account_type, metadata_json) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    bankInsert.lastInsertRowid,
    userId,
    'setu',
    remoteAccount.providerAccountId,
    consentRow.consent_id,
    remoteAccount.status,
    remoteAccount.maskedAccountNumber || maskAccountNumber(remoteAccount.accountNumber),
    remoteAccount.accountType || 'savings',
    JSON.stringify(remoteAccount.metadata || {})
  );

  return { bankAccountId: bankInsert.lastInsertRowid, linkId: linkInsert.lastInsertRowid };
}

/**
 * Upserts all linked accounts for a consent.
 * @param {number} userId
 * @param {{ consent_id: string }} consentRow
 * @returns {Promise<Array<object>>}
 */
async function hydrateConsentAccounts(userId, consentRow) {
  const remoteAccounts = await setuService.getAccounts(consentRow.consent_id);
  return remoteAccounts.map((account) => {
    const ids = upsertLinkedAccount(userId, consentRow, account);
    return { ...account, ...ids };
  });
}

/**
 * Records raw provider transactions for auditability.
 * @param {number} userId
 * @param {number} bankAccountId
 * @param {object} transaction
 * @returns {void}
 */
function insertRawTransaction(userId, bankAccountId, transaction) {
  const providerTransactionId = transaction.externalId || `${transaction.date}:${transaction.amount}:${transaction.referenceNumber || transaction.description}`;
  db.prepare(`INSERT OR IGNORE INTO raw_bank_transactions (user_id, bank_account_id, provider, provider_transaction_id, reference_number, raw_payload) VALUES (?,?,?,?,?,?)`).run(
    userId,
    bankAccountId,
    'setu',
    providerTransactionId,
    transaction.referenceNumber || null,
    JSON.stringify(transaction.raw || transaction)
  );
}

/**
 * Records a detected UPI payment if it does not already exist.
 * @param {number} userId
 * @param {object} parsedUpi
 * @param {object} transaction
 * @returns {boolean}
 */
function upsertUpiPayment(userId, parsedUpi, transaction) {
  if (!parsedUpi.referenceNumber) {
    return false;
  }

  const existing = db.prepare('SELECT id FROM upi_payments WHERE user_id=? AND transaction_ref=?').get(userId, parsedUpi.referenceNumber);
  if (existing) {
    return false;
  }

  db.prepare(`INSERT INTO upi_payments (user_id, upi_id, payee_name, amount, currency, status, transaction_ref, notes, date) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    userId,
    parsedUpi.merchantVpa || 'unknown@upi',
    parsedUpi.merchantName || transaction.description || 'UPI Payment',
    Number.parseFloat(parsedUpi.amount || transaction.amount) || 0,
    'INR',
    'completed',
    parsedUpi.referenceNumber,
    transaction.description || null,
    transaction.date
  );

  return true;
}

/**
 * Inserts a bank transaction if it is not a duplicate.
 * @param {number} userId
 * @param {number} bankAccountId
 * @param {object} transaction
 * @param {{ category: string }} classification
 * @returns {boolean}
 */
function insertTransaction(userId, bankAccountId, transaction, classification) {
  const existing = transaction.referenceNumber
    ? db.prepare('SELECT id FROM transactions WHERE user_id=? AND reference_number=?').get(userId, transaction.referenceNumber)
    : db.prepare('SELECT id FROM transactions WHERE user_id=? AND amount=? AND date=? AND description=?').get(userId, transaction.amount, transaction.date, transaction.description);

  if (existing) {
    db.prepare(`INSERT INTO transactions (user_id, bank_account_id, amount, type, description, category, date, reference_number, balance_after, is_duplicate) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      userId,
      bankAccountId,
      transaction.amount,
      transaction.type,
      transaction.description,
      classification.category,
      transaction.date,
      transaction.referenceNumber || null,
      transaction.balanceAfter,
      1
    );
    return false;
  }

  db.prepare(`INSERT INTO transactions (user_id, bank_account_id, amount, type, description, category, date, reference_number, balance_after, is_duplicate) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    userId,
    bankAccountId,
    transaction.amount,
    transaction.type,
    transaction.description,
    classification.category,
    transaction.date,
    transaction.referenceNumber || null,
    transaction.balanceAfter,
    0
  );
  return true;
}

/**
 * Syncs linked Setu accounts for a user.
 * @param {number} userId
 * @param {{ cookie?: string, consentIds?: string[], accountIds?: number[], days?: number }} options
 * @returns {Promise<{ syncedAccounts: number, importedTransactions: number, duplicateTransactions: number, upiTransactions: number, errors: string[] }>}
 */
async function syncUserLinkedAccounts(userId, options = {}) {
  const summary = {
    syncedAccounts: 0,
    importedTransactions: 0,
    duplicateTransactions: 0,
    upiTransactions: 0,
    errors: []
  };
  const consents = db.prepare(`SELECT * FROM bank_consents WHERE user_id=? AND provider='setu' AND status NOT IN ('failed','rejected','revoked') ORDER BY created_at DESC`).all(userId);
  const activeConsents = Array.isArray(options.consentIds) && options.consentIds.length > 0
    ? consents.filter((consent) => options.consentIds.includes(consent.consent_id))
    : consents;

  for (const consent of activeConsents) {
    try {
      const linkedAccounts = await hydrateConsentAccounts(userId, consent);
      const candidateAccounts = Array.isArray(options.accountIds) && options.accountIds.length > 0
        ? linkedAccounts.filter((account) => options.accountIds.includes(account.bankAccountId))
        : linkedAccounts;

      for (const account of candidateAccounts) {
        try {
          const balance = await setuService.getBalance(account.providerAccountId, consent.consent_id);
          db.prepare(`UPDATE bank_accounts SET balance=?, last_synced=CURRENT_TIMESTAMP WHERE id=?`).run(balance.balance, account.bankAccountId);
          db.prepare(`UPDATE bank_account_links SET last_balance=?, last_balance_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(balance.balance, account.linkId);

          const accountRow = db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(account.bankAccountId);
          if (balance.balance < 500) {
            createLowBalanceNotification(userId, accountRow);
          }

          const fromDate = daysAgo(options.days || 30);
          const toDate = getToday();
          const transactions = await setuService.getStatements(account.providerAccountId, consent.consent_id, fromDate, toDate);
          for (const transaction of transactions) {
            insertRawTransaction(userId, account.bankAccountId, transaction);
            const classification = await categorizeDescription({ description: transaction.description, cookie: options.cookie });
            const inserted = insertTransaction(userId, account.bankAccountId, transaction, classification);
            if (inserted) {
              summary.importedTransactions += 1;
            } else {
              summary.duplicateTransactions += 1;
            }

            if (transaction.type === 'debit' && transaction.amount > 10000) {
              createLargeTransactionNotification(userId, transaction);
            }

            const parsedUpi = parseUPITransactionSms(transaction.description);
            if (parsedUpi.isUpi && upsertUpiPayment(userId, parsedUpi, transaction)) {
              summary.upiTransactions += 1;
            }
          }

          summary.syncedAccounts += 1;
        } catch (error) {
          const message = `${account.bankName}: ${error.message}`;
          summary.errors.push(message);
          createSyncFailedNotification(userId, message);
        }
      }
    } catch (error) {
      const message = `${consent.consent_id}: ${error.message}`;
      summary.errors.push(message);
      createSyncFailedNotification(userId, message);
    }
  }

  return summary;
}

/**
 * Returns linked account and transaction display metadata.
 * @param {number} userId
 * @returns {{ accounts: object[], netWorth: number, savingsProgress: number, totalSavings: number }}
 */
function getLinkedAccountsSummary(userId) {
  const accounts = db.prepare(`
    SELECT ba.*, bal.provider, bal.provider_account_id, bal.status AS link_status, bal.masked_account_number, bal.last_balance, bal.last_balance_at
    FROM bank_accounts ba
    LEFT JOIN bank_account_links bal ON bal.bank_account_id = ba.id
    WHERE ba.user_id=?
    ORDER BY ba.created_at DESC
  `).all(userId).map((account) => ({
    ...account,
    account_number_masked: account.masked_account_number || maskAccountNumber(account.account_number),
    live_balance: account.last_balance !== null && account.last_balance !== undefined ? account.last_balance : account.balance,
    is_linked: account.provider === 'setu'
  }));

  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.live_balance || 0), 0);
  const savings = db.prepare('SELECT COALESCE(SUM(saved_amount),0) AS totalSaved, COALESCE(SUM(target_amount),0) AS totalTarget FROM savings_goals WHERE user_id=?').get(userId);

  return {
    accounts: accounts.map((account) => ({
      ...account,
      merchant_icon: getMerchantIcon(account.account_type, account.bank_name)
    })),
    netWorth: totalBalance + Number(savings.totalSaved || 0),
    savingsProgress: Number(savings.totalTarget || 0) > 0 ? (Number(savings.totalSaved || 0) / Number(savings.totalTarget || 0)) * 100 : 0,
    totalSavings: Number(savings.totalSaved || 0)
  };
}

module.exports = {
  getLinkedAccountsSummary,
  hydrateConsentAccounts,
  maskAccountNumber,
  syncUserLinkedAccounts
};
