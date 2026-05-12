const crypto = require('node:crypto');
const db = require('../models/db');
const { categorizeTransaction } = require('./categorizerService');
const { parseUpiTransaction } = require('./upiParser');
const {
  createLargeTransactionAlert,
  createLowBalanceWarning,
  createSyncFailedAlert
} = require('./notificationService');

const SETU_BASE_URL = (process.env.SETU_AA_BASE_URL || 'https://fiu-sandbox.setu.co').replace(/\/$/, '');

/**
 * Mask an account number for safe display.
 * @param {string|null|undefined} value - Raw account number.
 * @returns {string|null} Masked account number.
 */
function maskAccountNumber(value) {
  const digits = String(value || '').replace(/\s+/g, '');
  if (!digits) {
    return null;
  }
  if (digits.length <= 4) {
    return digits;
  }
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/**
 * Ensure Setu credentials exist before making an API call.
 * @throws {Error} When credentials are missing.
 */
function ensureSetuConfigured() {
  if (!process.env.SETU_CLIENT_ID || !process.env.SETU_CLIENT_SECRET) {
    throw new Error('Setu Account Aggregator is not configured. Add SETU_CLIENT_ID and SETU_CLIENT_SECRET first.');
  }
}

/**
 * Build authenticated headers for Setu API requests.
 * @returns {Record<string, string>} Request headers.
 */
function getSetuHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-client-id': process.env.SETU_CLIENT_ID,
    'x-client-secret': process.env.SETU_CLIENT_SECRET
  };
}

/**
 * Pause execution for a short duration.
 * @param {number} ms - Delay in milliseconds.
 * @returns {Promise<void>} Promise that resolves after the delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely coerce a value into a date string.
 * @param {string|number|Date|null|undefined} value - Raw date value.
 * @returns {string} Normalized YYYY-MM-DD string.
 */
function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString().split('T')[0];
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().split('T')[0];
}

/**
 * Safely coerce a value into a numeric amount.
 * @param {unknown} value - Raw amount value.
 * @returns {number} Parsed number.
 */
function normalizeAmount(value) {
  const amount = Number.parseFloat(String(value ?? 0).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Read a nested property from candidate paths.
 * @param {object} source - Source object.
 * @param {string[]} paths - Candidate dot paths.
 * @returns {any} Resolved value.
 */
function pickValue(source, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * Normalize array-like payloads into a plain array.
 * @param {any} value - Raw payload.
 * @returns {Array} Normalized array.
 */
function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

/**
 * Upsert a linked bank account and its provider metadata.
 * @param {number} userId - Authenticated user ID.
 * @param {{bankName:string,accountNumber?:string|null,maskedAccountNumber?:string|null,accountType?:string|null,balance?:number,providerAccountId?:string|null,status?:string|null,rawPayload?:object}} account - Account payload.
 * @param {number} consentId - Consent row ID.
 * @returns {object} Linked account row.
 */
function upsertLinkedAccount(userId, account, consentId) {
  const existingLink = account.providerAccountId
    ? db.prepare('SELECT * FROM bank_account_links WHERE user_id=? AND provider=? AND provider_account_id=?').get(userId, 'setu', account.providerAccountId)
    : null;

  const accountNumber = account.accountNumber || account.maskedAccountNumber || null;
  const maskedAccountNumber = account.maskedAccountNumber || maskAccountNumber(accountNumber);
  let bankAccountId = existingLink?.bank_account_id;

  if (!bankAccountId) {
    const inserted = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, account_type, balance, notes, last_synced)
      VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(
      userId,
      account.bankName || 'Linked Bank',
      accountNumber,
      account.accountType || 'savings',
      Number(account.balance || 0),
      'Linked via Setu Account Aggregator'
    );
    bankAccountId = inserted.lastInsertRowid;
  } else {
    db.prepare(`UPDATE bank_accounts
      SET bank_name=?, account_number=COALESCE(?, account_number), account_type=COALESCE(?, account_type), balance=?, last_synced=CURRENT_TIMESTAMP
      WHERE id=?`).run(
      account.bankName || 'Linked Bank',
      accountNumber,
      account.accountType || null,
      Number(account.balance || 0),
      bankAccountId
    );
  }

  db.prepare(`
    INSERT INTO bank_account_links (
      user_id, bank_account_id, provider, provider_account_id, consent_id, masked_account_number,
      status, live_balance, live_balance_at, raw_payload, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP)
    ON CONFLICT(bank_account_id) DO UPDATE SET
      provider_account_id=excluded.provider_account_id,
      consent_id=excluded.consent_id,
      masked_account_number=excluded.masked_account_number,
      status=excluded.status,
      live_balance=excluded.live_balance,
      live_balance_at=CURRENT_TIMESTAMP,
      raw_payload=excluded.raw_payload,
      updated_at=CURRENT_TIMESTAMP
  `).run(
    userId,
    bankAccountId,
    'setu',
    account.providerAccountId || null,
    consentId,
    maskedAccountNumber,
    account.status || 'linked',
    Number(account.balance || 0),
    JSON.stringify(account.rawPayload || {})
  );

  const linkedAccount = db.prepare(`
    SELECT ba.*, bal.provider, bal.provider_account_id, bal.masked_account_number, bal.status as link_status,
           COALESCE(bal.live_balance, ba.balance) as live_balance, bal.live_balance_at
    FROM bank_accounts ba
    LEFT JOIN bank_account_links bal ON bal.bank_account_id = ba.id
    WHERE ba.id=?
  `).get(bankAccountId);

  createLowBalanceWarning(userId, linkedAccount);
  return linkedAccount;
}

/**
 * Persist a normalized bank transaction, raw payload, and matching UPI record.
 * @param {number} userId - Authenticated user ID.
 * @param {{bankAccountId:number|null, provider:string, providerTransactionId?:string|null, referenceNumber?:string|null, amount:number, type:string, description:string, date:string, balanceAfter?:number|null, merchantName?:string|null, merchantVpa?:string|null, upiRefNo?:string|null, rawPayload?:object}} transaction - Transaction payload.
 * @returns {Promise<{inserted:boolean, duplicate:boolean, upiInserted:boolean, transaction:object}>} Persistence result.
 */
async function persistTransaction(userId, transaction) {
  const parsedUpi = transaction.upiRefNo || transaction.merchantVpa
    ? {
      upiRefNo: transaction.upiRefNo || null,
      merchantVpa: transaction.merchantVpa || null,
      merchantName: transaction.merchantName || null,
      amount: Math.abs(Number(transaction.amount))
    }
    : parseUpiTransaction(transaction.description, transaction.amount);
  const resolvedReference = transaction.referenceNumber || parsedUpi?.upiRefNo || null;
  const resolvedMerchantName = transaction.merchantName || parsedUpi?.merchantName || null;
  const resolvedMerchantVpa = transaction.merchantVpa || parsedUpi?.merchantVpa || null;

  const categoryResult = await categorizeTransaction({
    userId,
    merchantName: resolvedMerchantName || transaction.description,
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type
  });

  const existing = resolvedReference
    ? db.prepare('SELECT * FROM transactions WHERE user_id=? AND reference_number=?').get(userId, resolvedReference)
    : transaction.bankAccountId
      ? db.prepare('SELECT * FROM transactions WHERE user_id=? AND bank_account_id=? AND amount=? AND date=? AND description=?').get(
        userId,
        transaction.bankAccountId,
        Math.abs(Number(transaction.amount)),
        transaction.date,
        transaction.description
      )
      : db.prepare('SELECT * FROM transactions WHERE user_id=? AND bank_account_id IS NULL AND amount=? AND date=? AND description=?').get(
        userId,
        Math.abs(Number(transaction.amount)),
        transaction.date,
        transaction.description
      );

  const duplicate = Boolean(existing);
  const inserted = db.prepare(`INSERT INTO transactions
    (user_id, bank_account_id, amount, type, description, category, date, reference_number, balance_after, is_duplicate)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    userId,
    transaction.bankAccountId || null,
    Math.abs(Number(transaction.amount)),
    transaction.type || 'debit',
    transaction.description || resolvedMerchantName || 'Bank transaction',
    categoryResult.category,
    transaction.date,
    resolvedReference,
    transaction.balanceAfter ?? null,
    duplicate ? 1 : 0
  );

  const storedTransaction = db.prepare('SELECT * FROM transactions WHERE id=?').get(inserted.lastInsertRowid);

  db.prepare(`
    INSERT OR IGNORE INTO bank_raw_transactions (
      user_id, transaction_id, bank_account_id, consent_id, provider, provider_transaction_id,
      reference_number, merchant_name, merchant_vpa, upi_ref_no, amount, type, category,
      date, balance_after, raw_payload
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    userId,
    storedTransaction.id,
    transaction.bankAccountId || null,
    transaction.consentId || null,
    transaction.provider || 'manual',
    transaction.providerTransactionId || null,
    resolvedReference,
    resolvedMerchantName,
    resolvedMerchantVpa,
    parsedUpi?.upiRefNo || null,
    Math.abs(Number(transaction.amount)),
    transaction.type || 'debit',
    categoryResult.category,
    transaction.date,
    transaction.balanceAfter ?? null,
    JSON.stringify(transaction.rawPayload || {})
  );

  let upiInserted = false;

  if (parsedUpi?.upiRefNo) {
    const existingUpi = db.prepare('SELECT id FROM upi_payments WHERE user_id=? AND transaction_ref=?').get(userId, parsedUpi.upiRefNo);
    if (!existingUpi) {
      db.prepare(`INSERT INTO upi_payments
        (user_id, upi_id, payee_name, amount, status, transaction_ref, notes, date)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        userId,
        parsedUpi.merchantVpa || 'unknown@upi',
        parsedUpi.merchantName || resolvedMerchantName || transaction.description || 'UPI Merchant',
        parsedUpi.amount || Math.abs(Number(transaction.amount)),
        transaction.type === 'credit' ? 'completed' : 'completed',
        parsedUpi.upiRefNo,
        'Imported from bank transaction sync',
        transaction.date
      );
      upiInserted = true;
    }
  }

  if (!duplicate) {
    createLargeTransactionAlert(userId, storedTransaction);
  }

  return { inserted: !duplicate, duplicate, upiInserted, transaction: storedTransaction };
}

/**
 * Persist multiple transaction rows from any bank data source.
 * @param {number} userId - Authenticated user ID.
 * @param {Array<object>} rows - Normalized transaction rows.
 * @param {{provider:string, bankAccountId?:number|null, consentId?:number|null}} options - Persistence options.
 * @returns {Promise<{imported:number, duplicates:number, upiImported:number, total:number}>} Summary.
 */
async function persistTransactions(userId, rows, options = {}) {
  let imported = 0;
  let duplicates = 0;
  let upiImported = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const result = await persistTransaction(userId, {
      ...row,
      provider: options.provider || 'manual',
      bankAccountId: options.bankAccountId ?? row.bankAccountId ?? null,
      consentId: options.consentId ?? row.consentId ?? null,
      providerTransactionId: row.providerTransactionId || `${options.provider || 'manual'}-${crypto.createHash('sha1').update(`${row.date}|${row.amount}|${row.description}|${index}`).digest('hex')}`,
      rawPayload: row.rawPayload || row
    });
    if (result.inserted) {
      imported += 1;
    }
    if (result.duplicate) {
      duplicates += 1;
    }
    if (result.upiInserted) {
      upiImported += 1;
    }
  }

  return { imported, duplicates, upiImported, total: rows.length };
}

/**
 * Normalize a Setu account payload.
 * @param {object} record - Raw account record.
 * @returns {{bankName:string,accountNumber:string|null,maskedAccountNumber:string|null,accountType:string,balance:number,providerAccountId:string|null,status:string,rawPayload:object}} Normalized account.
 */
function normalizeSetuAccount(record) {
  const accountNumber = pickValue(record, ['account.accountNumber', 'account.accNumber', 'account.maskedAccountNumber', 'account.maskedAccNumber', 'maskedAccountNumber', 'maskedAccNumber']);
  const maskedAccountNumber = pickValue(record, ['account.maskedAccountNumber', 'account.maskedAccNumber', 'maskedAccountNumber', 'maskedAccNumber']) || maskAccountNumber(accountNumber);
  return {
    bankName: pickValue(record, ['account.bankName', 'account.fipName', 'bankName', 'fipName']) || 'Linked Bank',
    accountNumber: accountNumber || null,
    maskedAccountNumber,
    accountType: pickValue(record, ['account.accountType', 'account.type', 'accountType']) || 'savings',
    balance: normalizeAmount(pickValue(record, ['account.balance', 'account.currentBalance', 'account.summary.balance', 'currentBalance', 'balance'])),
    providerAccountId: String(pickValue(record, ['account.id', 'account.accountId', 'id', 'accountId']) || '').trim() || null,
    status: pickValue(record, ['account.status', 'status']) || 'linked',
    rawPayload: record
  };
}

/**
 * Normalize transaction records from a Setu account block.
 * @param {object} record - Raw Setu account block.
 * @param {number} bankAccountId - Local bank account ID.
 * @returns {Array<object>} Normalized transaction rows.
 */
function normalizeSetuTransactions(record, bankAccountId) {
  const transactions = toArray(pickValue(record, ['transactions', 'statement.transactions', 'txns', 'transactionList', 'Transactions']));
  return transactions.map((transaction, index) => {
    const amount = normalizeAmount(pickValue(transaction, ['amount', 'txnAmount', 'value', 'debit', 'credit']));
    const type = String(pickValue(transaction, ['type', 'transactionType']) || '').toLowerCase()
      || (pickValue(transaction, ['credit']) ? 'credit' : 'debit');
    const description = pickValue(transaction, ['description', 'narration', 'remarks', 'details', 'merchantName', 'name']) || 'Bank transaction';
    const parsedUpi = parseUpiTransaction(description, amount);
    return {
      bankAccountId,
      amount: Math.abs(amount),
      type: type === 'credit' ? 'credit' : 'debit',
      description,
      date: normalizeDate(pickValue(transaction, ['date', 'txnDate', 'transactionDate', 'valueDate', 'timestamp'])),
      referenceNumber: pickValue(transaction, ['referenceNumber', 'refNo', 'txnId', 'id']) || parsedUpi?.upiRefNo || null,
      balanceAfter: pickValue(transaction, ['balance', 'balanceAfter', 'runningBalance']) !== undefined ? normalizeAmount(pickValue(transaction, ['balance', 'balanceAfter', 'runningBalance'])) : null,
      merchantName: pickValue(transaction, ['merchantName', 'counterParty.name']) || parsedUpi?.merchantName || null,
      merchantVpa: parsedUpi?.merchantVpa || null,
      upiRefNo: parsedUpi?.upiRefNo || null,
      providerTransactionId: String(pickValue(transaction, ['id', 'txnId', 'referenceNumber']) || `${bankAccountId}-${index}-${description}`).trim(),
      rawPayload: transaction
    };
  }).filter((transaction) => transaction.amount > 0);
}

/**
 * Call the Setu API with native fetch.
 * @param {string} path - API path.
 * @param {RequestInit} options - Fetch options.
 * @returns {Promise<any>} Parsed response body.
 */
async function setuRequest(path, options = {}) {
  ensureSetuConfigured();
  const response = await fetch(`${SETU_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getSetuHeaders(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { error: text || 'Invalid Setu response' };
  }
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || data?.error || `Setu request failed: ${response.status}`);
  }
  return data;
}

/**
 * Initiate an Account Aggregator consent request.
 * @param {number} userId - Authenticated user ID.
 * @param {{phoneNumber:string, redirectUrl?:string}} payload - Consent payload.
 * @returns {Promise<object>} Stored consent row.
 */
async function createConsentRequest(userId, payload) {
  const today = new Date();
  const expiry = new Date(today);
  expiry.setFullYear(expiry.getFullYear() + 1);
  const dataRangeFrom = new Date(today.getTime() - 90 * 86400000);
  const redirectUrl = payload.redirectUrl || process.env.SETU_REDIRECT_URL || 'http://localhost:3000/api/banking/callback';
  const response = await setuRequest('/consents', {
    method: 'POST',
    body: JSON.stringify({
      Detail: {
        consentStart: today.toISOString(),
        consentExpiry: expiry.toISOString(),
        Customer: { id: `${payload.phoneNumber}@setu-sandbox` },
        FIDataRange: { from: dataRangeFrom.toISOString(), to: today.toISOString() },
        consentTypes: ['TRANSACTIONS', 'PROFILE', 'SUMMARY'],
        fiTypes: ['DEPOSIT'],
        DataConsumer: { id: process.env.SETU_CLIENT_ID },
        fetchType: 'PERIODIC',
        Frequency: { value: 1, unit: 'DAY' },
        DataLife: { value: 1, unit: 'YEAR' }
      },
      redirectUrl
    })
  });

  const consentId = response.id || response.consentId || response.consentHandle;
  const consentHandle = response.consentHandle || response.handle || consentId;
  const consentUrl = response.url || response.consentUrl || `${SETU_BASE_URL}/consents/${consentId}/webview`;
  const inserted = db.prepare(`INSERT INTO setu_consents
    (user_id, consent_id, consent_handle, phone_number, status, consent_url, redirect_url, requested_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(
    userId,
    consentId,
    consentHandle,
    payload.phoneNumber,
    response.status || 'pending',
    consentUrl,
    redirectUrl
  );

  return db.prepare('SELECT * FROM setu_consents WHERE id=?').get(inserted.lastInsertRowid);
}

/**
 * Update consent status from the Setu redirect callback.
 * @param {number} userId - Authenticated user ID.
 * @param {Record<string, string>} query - Callback query parameters.
 * @returns {object} Updated consent row.
 */
function handleConsentCallback(userId, query) {
  const consentId = query.consentId || query.consent_id || query.id || query.consentHandle || query.handle;
  const status = (query.status || query.consentStatus || query.state || (query.error ? 'failed' : 'approved')).toLowerCase();
  const errorMessage = query.error_description || query.error || null;
  let consent = consentId
    ? db.prepare('SELECT * FROM setu_consents WHERE user_id=? AND (consent_id=? OR consent_handle=?) ORDER BY created_at DESC LIMIT 1').get(userId, consentId, consentId)
    : db.prepare('SELECT * FROM setu_consents WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(userId);

  if (!consent) {
    const result = db.prepare(`INSERT INTO setu_consents (user_id, consent_id, consent_handle, status, last_error, redirect_url)
      VALUES (?,?,?,?,?,?)`).run(userId, consentId || null, consentId || null, status, errorMessage, process.env.SETU_REDIRECT_URL || null);
    consent = db.prepare('SELECT * FROM setu_consents WHERE id=?').get(result.lastInsertRowid);
  }

  db.prepare(`UPDATE setu_consents SET status=?, last_error=?, approved_at=CASE WHEN ? IN ('approved','active','linked') THEN CURRENT_TIMESTAMP ELSE approved_at END, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    status,
    errorMessage,
    status,
    consent.id
  );
  return db.prepare('SELECT * FROM setu_consents WHERE id=?').get(consent.id);
}

/**
 * Fetch the latest completed Setu session data for a consent.
 * @param {object} consent - Stored consent row.
 * @returns {Promise<any>} Session payload.
 */
async function fetchSessionData(consent) {
  const session = await setuRequest('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      consentHandle: consent.consent_handle || consent.consent_id,
      consentId: consent.consent_id,
      DataRange: {
        from: new Date(Date.now() - 30 * 86400000).toISOString(),
        to: new Date().toISOString()
      },
      format: { type: 'json' }
    })
  });

  const sessionId = session.id || session.sessionId;
  if (!sessionId) {
    return session;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(1500);
    const statusPayload = await setuRequest(`/sessions/${sessionId}`, { method: 'GET' });
    const status = String(statusPayload.status || '').toLowerCase();
    if (!status || ['completed', 'success', 'ready'].includes(status)) {
      return statusPayload;
    }
    if (['failed', 'error', 'rejected'].includes(status)) {
      throw new Error(statusPayload.message || 'Setu session failed');
    }
  }

  throw new Error('Timed out while waiting for Setu session data.');
}

/**
 * Extract account blocks from a Setu session payload.
 * @param {any} payload - Raw session payload.
 * @returns {Array<object>} Account-level records.
 */
function extractAccountBlocks(payload) {
  const fiBlocks = toArray(pickValue(payload, ['FIFetchResponse.fiList', 'FIFetchResponse.fi', 'fiList', 'fi', 'accounts']));
  if (fiBlocks.length > 0) {
    return fiBlocks;
  }
  const nestedAccounts = toArray(pickValue(payload, ['data.accounts', 'data.fi', 'result.accounts']));
  return nestedAccounts;
}

/**
 * Sync linked accounts and transactions for a user.
 * @param {number} userId - Authenticated user ID.
 * @param {{balancesOnly?:boolean}} options - Sync options.
 * @returns {Promise<{accounts:Array<object>, imported:number, duplicates:number, upiImported:number}>} Sync result.
 */
async function syncUserAccounts(userId, options = {}) {
  const consent = db.prepare(`SELECT * FROM setu_consents WHERE user_id=? AND status IN ('approved','active','linked','completed','pending') ORDER BY approved_at DESC, created_at DESC LIMIT 1`).get(userId);
  if (!consent) {
    throw new Error('No active Setu consent found for this user.');
  }

  const payload = await fetchSessionData(consent);
  const accountBlocks = extractAccountBlocks(payload);
  if (accountBlocks.length === 0) {
    throw new Error('No bank account data returned by Setu.');
  }

  const linkedAccounts = [];
  let imported = 0;
  let duplicates = 0;
  let upiImported = 0;

  for (const block of accountBlocks) {
    const linkedAccount = upsertLinkedAccount(userId, normalizeSetuAccount(block), consent.id);
    linkedAccounts.push(linkedAccount);
    if (!options.balancesOnly) {
      const summary = await persistTransactions(userId, normalizeSetuTransactions(block, linkedAccount.id), {
        provider: 'setu',
        bankAccountId: linkedAccount.id,
        consentId: consent.id
      });
      imported += summary.imported;
      duplicates += summary.duplicates;
      upiImported += summary.upiImported;
    }
  }

  db.prepare('UPDATE setu_consents SET last_synced_at=CURRENT_TIMESTAMP, status=?, updated_at=CURRENT_TIMESTAMP, last_error=NULL WHERE id=?').run('linked', consent.id);
  return { accounts: linkedAccounts, imported, duplicates, upiImported };
}

/**
 * Sync all eligible users for the daily scheduler.
 * @returns {Promise<void>} Completion promise.
 */
async function syncAllEligibleUsers() {
  const users = db.prepare('SELECT DISTINCT user_id FROM setu_consents WHERE status IN (\'approved\',\'active\',\'linked\',\'completed\',\'pending\')').all();
  for (const user of users) {
    try {
      await syncUserAccounts(user.user_id);
    } catch (error) {
      db.prepare('UPDATE setu_consents SET last_error=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(error.message, user.user_id);
      createSyncFailedAlert(user.user_id, error.message);
    }
  }
}

/**
 * List bank accounts with live balance metadata.
 * @param {number} userId - Authenticated user ID.
 * @param {boolean} refresh - Whether to refresh linked balances before reading.
 * @returns {Promise<Array<object>>} Account rows.
 */
async function listBankAccounts(userId, refresh = false) {
  if (refresh) {
    try {
      await syncUserAccounts(userId, { balancesOnly: true });
    } catch (error) {
      createSyncFailedAlert(userId, error.message);
    }
  }

  return db.prepare(`
    SELECT ba.*, bal.provider, bal.provider_account_id, bal.masked_account_number, bal.status as link_status,
           COALESCE(bal.live_balance, ba.balance) as live_balance, bal.live_balance_at
    FROM bank_accounts ba
    LEFT JOIN bank_account_links bal ON bal.bank_account_id = ba.id
    WHERE ba.user_id=?
    ORDER BY COALESCE(bal.live_balance_at, ba.last_synced, ba.created_at) DESC
  `).all(userId).map((account) => ({
    ...account,
    masked_account_number: account.masked_account_number || maskAccountNumber(account.account_number)
  }));
}

module.exports = {
  createConsentRequest,
  handleConsentCallback,
  listBankAccounts,
  maskAccountNumber,
  persistTransactions,
  syncAllEligibleUsers,
  syncUserAccounts
};
