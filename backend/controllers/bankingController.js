const crypto = require('crypto');
const db = require('../models/db');
const { parseCSV } = require('../services/csvParser');
const setuService = require('../services/setuService');
const { categorizeDescription, categorizeDescriptionSync, getMerchantIcon } = require('../services/categorizerService');
const { parseUPITransactionSms } = require('../services/upiParser');
const {
  createLargeTransactionNotification,
  createLowBalanceNotification,
  createSyncFailedNotification
} = require('../services/notificationService');
const {
  getLinkedAccountsSummary,
  hydrateConsentAccounts,
  syncUserLinkedAccounts
} = require('../services/bankingSyncService');

/**
 * Creates a deterministic duplicate check for UPI transactions.
 * @param {number} userId
 * @param {object} parsedUpi
 * @param {object} row
 * @returns {boolean}
 */
function insertUpiPaymentIfNew(userId, parsedUpi, row) {
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
    parsedUpi.merchantName || row.description || 'UPI Payment',
    Number.parseFloat(parsedUpi.amount || row.amount) || 0,
    'INR',
    'completed',
    parsedUpi.referenceNumber,
    row.description || null,
    row.date
  );

  return true;
}

exports.listAccounts = (req, res) => {
  try {
    const summary = getLinkedAccountsSummary(req.session.userId);
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.addAccount = (req, res) => {
  try {
    const { bank_name, account_number, account_type, balance, ifsc_code, branch, notes } = req.body;
    if (!bank_name) return res.status(400).json({ error: 'Bank name required' });
    const result = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, account_type, balance, ifsc_code, branch, notes) VALUES (?,?,?,?,?,?,?,?)`).run(req.session.userId, bank_name, account_number || null, account_type || 'savings', Number.parseFloat(balance || 0), ifsc_code || null, branch || null, notes || null);
    res.status(201).json({ account: db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.updateAccount = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM bank_accounts WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    const { bank_name, account_number, account_type, balance, ifsc_code, branch, notes } = req.body;
    db.prepare(`UPDATE bank_accounts SET bank_name=COALESCE(?,bank_name), account_number=COALESCE(?,account_number), account_type=COALESCE(?,account_type), balance=COALESCE(?,balance), ifsc_code=COALESCE(?,ifsc_code), branch=COALESCE(?,branch), notes=COALESCE(?,notes), last_synced=CURRENT_TIMESTAMP WHERE id=?`).run(bank_name || null, account_number || null, account_type || null, balance !== undefined ? Number.parseFloat(balance) : null, ifsc_code || null, branch || null, notes || null, id);
    res.json({ account: db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteAccount = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM bank_accounts WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM bank_account_links WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM raw_bank_transactions WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM transactions WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM bank_accounts WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.importCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { bank_account_id } = req.body;
    const rows = parseCSV(req.file.path);
    let imported = 0;
    let duplicates = 0;
    let upiDetected = 0;
    const userId = req.session.userId;

    const insertTx = db.prepare(`INSERT INTO transactions (user_id, bank_account_id, amount, type, description, category, date, reference_number, balance_after, is_duplicate) VALUES (?,?,?,?,?,?,?,?,?,?)`);

    for (const row of rows) {
      const classification = await categorizeDescription({ description: row.description, cookie: req.headers.cookie });
      const dup = row.referenceNumber
        ? db.prepare('SELECT id FROM transactions WHERE user_id=? AND reference_number=?').get(userId, row.referenceNumber)
        : db.prepare(`SELECT id FROM transactions WHERE user_id=? AND amount=? AND date=? AND description=?`).get(userId, row.amount, row.date, row.description);
      const isDuplicate = dup ? 1 : 0;
      if (isDuplicate) {
        duplicates += 1;
      } else {
        imported += 1;
      }

      insertTx.run(userId, bank_account_id || null, row.amount, row.type, row.description, classification.category, row.date, row.referenceNumber || null, row.balance, isDuplicate);

      const parsedUpi = parseUPITransactionSms(row.description);
      if (parsedUpi.isUpi && insertUpiPaymentIfNew(userId, parsedUpi, row)) {
        upiDetected += 1;
      }

      if (row.type === 'debit' && row.amount > 10000) {
        createLargeTransactionNotification(userId, row);
      }
    }

    if (bank_account_id) {
      db.prepare('UPDATE bank_accounts SET last_synced=CURRENT_TIMESTAMP WHERE id=?').run(bank_account_id);
      const account = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND user_id=?').get(bank_account_id, userId);
      if (account && Number(account.balance || 0) < 500) {
        createLowBalanceNotification(userId, account);
      }
    }

    res.json({ imported, duplicates, total: rows.length, upiDetected });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.listTransactions = (req, res) => {
  try {
    const {
      bank_account_id,
      startDate,
      endDate,
      category,
      type,
      search,
      page = 1,
      limit = 20
    } = req.query;
    const userId = req.session.userId;

    let bankSql = `
      SELECT t.*, ba.bank_name, ba.account_number, 'bank' AS source
      FROM transactions t
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      WHERE t.user_id=?
    `;
    const bankParams = [userId];
    if (bank_account_id) { bankSql += ' AND t.bank_account_id=?'; bankParams.push(Number.parseInt(bank_account_id, 10)); }
    if (startDate) { bankSql += ' AND t.date>=?'; bankParams.push(startDate); }
    if (endDate) { bankSql += ' AND t.date<=?'; bankParams.push(endDate); }
    if (type) { bankSql += ' AND t.type=?'; bankParams.push(type); }
    if (search) { bankSql += ' AND t.description LIKE ?'; bankParams.push(`%${search}%`); }
    bankSql += ' ORDER BY t.date DESC, t.created_at DESC LIMIT 500';

    const bankRows = db.prepare(bankSql).all(...bankParams).map((row) => ({
      ...row,
      merchant_icon: getMerchantIcon(row.category, row.description),
      merchant_name: categorizeDescriptionSync(row.description).merchant || row.description,
      live_source: 'bank'
    }));

    let upiSql = `SELECT * FROM upi_payments WHERE user_id=?`;
    const upiParams = [userId];
    if (startDate) { upiSql += ' AND date>=?'; upiParams.push(startDate); }
    if (endDate) { upiSql += ' AND date<=?'; upiParams.push(endDate); }
    if (search) { upiSql += ' AND (payee_name LIKE ? OR upi_id LIKE ? OR notes LIKE ?)'; const like = `%${search}%`; upiParams.push(like, like, like); }
    upiSql += ' ORDER BY date DESC, created_at DESC LIMIT 500';

    const upiRows = bank_account_id
      ? []
      : db.prepare(upiSql).all(...upiParams).map((payment) => {
        const classification = categorizeDescriptionSync(payment.payee_name || payment.notes || payment.upi_id);
        return {
          id: `upi-${payment.id}`,
          user_id: payment.user_id,
          bank_account_id: null,
          amount: payment.amount,
          type: type && type !== 'debit' ? payment.status : 'debit',
          description: payment.notes || payment.payee_name || payment.upi_id,
          category: classification.category,
          date: payment.date,
          reference_number: payment.transaction_ref,
          balance_after: null,
          is_duplicate: 0,
          created_at: payment.created_at,
          source: 'upi',
          bank_name: 'UPI',
          account_number: payment.upi_id,
          merchant_icon: classification.icon,
          merchant_name: classification.merchant || payment.payee_name || payment.upi_id,
          status: payment.status
        };
      });

    const filteredRows = [...bankRows, ...upiRows].filter((row) => {
      if (category && row.category !== category) {
        return false;
      }
      if (type && row.source === 'upi' && type !== 'debit') {
        return false;
      }
      return true;
    }).sort((left, right) => {
      const leftTime = new Date(`${left.date}T00:00:00Z`).getTime();
      const rightTime = new Date(`${right.date}T00:00:00Z`).getTime();
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const offset = (pageNumber - 1) * pageSize;
    const transactions = filteredRows.slice(offset, offset + pageSize);

    res.json({
      transactions,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: filteredRows.length,
        totalPages: Math.max(1, Math.ceil(filteredRows.length / pageSize))
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/**
 * Initiates a Setu consent flow for the authenticated user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.linkAccount = async (req, res) => {
  try {
    const stateToken = crypto.randomUUID();
    const redirectBase = req.body.redirect_url || process.env.SETU_REDIRECT_URL;
    if (!redirectBase) {
      return res.status(400).json({ error: 'SETU_REDIRECT_URL is not configured' });
    }

    const redirectUrl = `${redirectBase}${redirectBase.includes('?') ? '&' : '?'}state=${encodeURIComponent(stateToken)}`;
    const consent = await setuService.initiateConsent({
      phone: req.body.phone,
      redirectUrl,
      purpose: req.body.purpose,
      consentDurationDays: req.body.consent_duration_days,
      fromDate: req.body.from_date,
      toDate: req.body.to_date
    });

    db.prepare(`INSERT INTO bank_consents (user_id, provider, consent_id, state_token, status, consent_url, redirect_url, metadata_json) VALUES (?,?,?,?,?,?,?,?)`).run(
      req.session.userId,
      'setu',
      consent.consentId || null,
      stateToken,
      consent.status,
      consent.consentUrl || null,
      redirectUrl,
      JSON.stringify(consent.raw || {})
    );

    res.status(201).json({
      consent: {
        consent_id: consent.consentId,
        consent_url: consent.consentUrl,
        redirect_url: redirectUrl,
        state_token: stateToken,
        status: consent.status
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/**
 * Handles the Setu redirect callback and performs an immediate sync.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.handleCallback = async (req, res) => {
  try {
    const { consentId, consent_id, status, state, error } = req.query;
    const consentKey = consentId || consent_id || null;
    const consentRow = state
      ? db.prepare('SELECT * FROM bank_consents WHERE state_token=?').get(state)
      : consentKey
        ? db.prepare('SELECT * FROM bank_consents WHERE consent_id=?').get(consentKey)
        : null;

    if (!consentRow) {
      return res.status(404).send('Consent request not found');
    }

    if (error) {
      db.prepare('UPDATE bank_consents SET status=?, last_error=?, metadata_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
        'failed',
        String(error),
        JSON.stringify(req.query),
        consentRow.id
      );
      createSyncFailedNotification(consentRow.user_id, `Consent failed: ${String(error)}`);
      return res.redirect('/dashboard?section=banking&status=failed');
    }

    const consent = consentKey ? await setuService.getConsent(consentKey) : await setuService.getConsent(consentRow.consent_id);
    db.prepare(`UPDATE bank_consents SET consent_id=?, status=?, consent_url=COALESCE(?,consent_url), metadata_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      consent.consentId || consentRow.consent_id,
      status || consent.status,
      consent.consentUrl || null,
      JSON.stringify(consent.raw || req.query),
      consentRow.id
    );

    await hydrateConsentAccounts(consentRow.user_id, { ...consentRow, consent_id: consent.consentId || consentRow.consent_id });
    await syncUserLinkedAccounts(consentRow.user_id, { consentIds: [consent.consentId || consentRow.consent_id] });

    return res.redirect('/dashboard?section=banking&status=linked');
  } catch (e) {
    const state = req.query.state;
    if (state) {
      const consentRow = db.prepare('SELECT * FROM bank_consents WHERE state_token=?').get(state);
      if (consentRow) {
        db.prepare('UPDATE bank_consents SET status=?, last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run('failed', e.message, consentRow.id);
        createSyncFailedNotification(consentRow.user_id, e.message);
      }
    }
    res.status(500).send(e.message);
  }
};

/**
 * Pulls the latest linked account balances and statements for the authenticated user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
exports.syncAccounts = async (req, res) => {
  try {
    const accountId = req.body.bank_account_id ? Number.parseInt(req.body.bank_account_id, 10) : null;
    const summary = await syncUserLinkedAccounts(req.session.userId, {
      cookie: req.headers.cookie,
      accountIds: accountId ? [accountId] : undefined,
      days: req.body.days ? Number.parseInt(req.body.days, 10) : undefined
    });
    res.json(summary);
  } catch (e) {
    createSyncFailedNotification(req.session.userId, e.message);
    res.status(500).json({ error: e.message });
  }
};
