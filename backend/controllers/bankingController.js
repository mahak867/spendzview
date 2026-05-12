const db = require('../models/db');
const { parseCSV } = require('../services/csvParser');
const {
  createConsentRequest,
  handleConsentCallback,
  listBankAccounts,
  maskAccountNumber,
  persistTransactions,
  syncUserAccounts
} = require('../services/setuService');
const { categorizeByRules } = require('../services/categorizerService');
const { createLowBalanceWarning, createSyncFailedAlert } = require('../services/notificationService');

/**
 * List manual and linked bank accounts with live balances.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>} Response promise.
 */
exports.listAccounts = async (req, res) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const accounts = await listBankAccounts(req.session.userId, refresh);
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add a manual bank account.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
exports.addAccount = (req, res) => {
  try {
    const { bank_name, account_number, account_type, balance, ifsc_code, branch, notes } = req.body;
    if (!bank_name) {
      return res.status(400).json({ error: 'Bank name required' });
    }

    const result = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, account_type, balance, ifsc_code, branch, notes)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      req.session.userId,
      bank_name,
      account_number || null,
      account_type || 'savings',
      Number.parseFloat(balance || 0),
      ifsc_code || null,
      branch || null,
      notes || null
    );
    const account = db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(result.lastInsertRowid);
    createLowBalanceWarning(req.session.userId, account);
    return res.status(201).json({ account: { ...account, masked_account_number: maskAccountNumber(account.account_number) } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Update a manual bank account.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
exports.updateAccount = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM bank_accounts WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { bank_name, account_number, account_type, balance, ifsc_code, branch, notes } = req.body;
    db.prepare(`UPDATE bank_accounts
      SET bank_name=COALESCE(?,bank_name), account_number=COALESCE(?,account_number), account_type=COALESCE(?,account_type),
          balance=COALESCE(?,balance), ifsc_code=COALESCE(?,ifsc_code), branch=COALESCE(?,branch),
          notes=COALESCE(?,notes), last_synced=CURRENT_TIMESTAMP
      WHERE id=?`).run(
      bank_name || null,
      account_number || null,
      account_type || null,
      balance !== undefined ? Number.parseFloat(balance) : null,
      ifsc_code || null,
      branch || null,
      notes || null,
      id
    );
    const account = db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id);
    createLowBalanceWarning(req.session.userId, account);
    return res.json({ account: { ...account, masked_account_number: maskAccountNumber(account.account_number) } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Delete a bank account and its linked transactions.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
exports.deleteAccount = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM bank_accounts WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }

    db.prepare('DELETE FROM bank_raw_transactions WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM transactions WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM bank_account_links WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM bank_accounts WHERE id=?').run(id);
    return res.json({ message: 'Deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Start the Setu consent flow.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>} Response promise.
 */
exports.initiateLink = async (req, res) => {
  try {
    const user = db.prepare('SELECT phone FROM users WHERE id=?').get(req.session.userId);
    const phoneNumber = req.body.phone_number || user?.phone;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number required to start Setu consent' });
    }

    const consent = await createConsentRequest(req.session.userId, {
      phoneNumber,
      redirectUrl: req.body.redirect_url || process.env.SETU_REDIRECT_URL
    });
    return res.status(201).json({ consent, redirectUrl: consent.consent_url });
  } catch (error) {
    createSyncFailedAlert(req.session.userId, error.message);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Handle the Setu redirect callback.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
exports.callback = (req, res) => {
  try {
    const consent = handleConsentCallback(req.session.userId, req.query);
    if ((req.headers.accept || '').includes('application/json')) {
      return res.json({ consent });
    }

    const status = String(consent.status || '').toLowerCase();
    const target = status === 'failed'
      ? `/dashboard?bankingLink=failed&message=${encodeURIComponent(consent.last_error || 'Consent failed')}`
      : '/dashboard?bankingLink=success';
    return res.redirect(target);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Sync the latest transactions and balances from Setu.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>} Response promise.
 */
exports.sync = async (req, res) => {
  try {
    const result = await syncUserAccounts(req.session.userId, { balancesOnly: req.body.balances_only === true });
    return res.json(result);
  } catch (error) {
    createSyncFailedAlert(req.session.userId, error.message);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Import a bank statement CSV and auto-categorize each row.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>} Response promise.
 */
exports.importCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { bank_account_id } = req.body;
    const rows = parseCSV(req.file.path).map((row, index) => ({
      ...row,
      bankAccountId: bank_account_id ? Number.parseInt(bank_account_id, 10) : null,
      providerTransactionId: `csv-${row.date}-${row.amount}-${index}`,
      rawPayload: row
    }));

    const summary = await persistTransactions(req.session.userId, rows, {
      provider: 'csv',
      bankAccountId: bank_account_id ? Number.parseInt(bank_account_id, 10) : null
    });

    if (bank_account_id) {
      db.prepare('UPDATE bank_accounts SET last_synced=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(bank_account_id, req.session.userId);
      const account = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND user_id=?').get(bank_account_id, req.session.userId);
      if (account) {
        createLowBalanceWarning(req.session.userId, account);
      }
    }

    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * List bank and UPI transactions together with filtering and pagination.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
exports.listTransactions = (req, res) => {
  try {
    const {
      bank_account_id,
      startDate,
      endDate,
      category,
      type,
      search,
      limit = 25,
      page = 1,
      source = 'all'
    } = req.query;
    const safeLimit = Math.min(100, Number.parseInt(limit, 10) || 25);
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);

    let bankSql = `
      SELECT t.*, 'bank' as source, ba.bank_name, ba.account_number,
             brt.merchant_name, brt.merchant_vpa, brt.upi_ref_no
      FROM transactions t
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      LEFT JOIN bank_raw_transactions brt ON brt.transaction_id = t.id
      WHERE t.user_id=?
    `;
    const bankParams = [req.session.userId];
    if (bank_account_id) { bankSql += ' AND t.bank_account_id=?'; bankParams.push(Number.parseInt(bank_account_id, 10)); }
    if (startDate) { bankSql += ' AND t.date>=?'; bankParams.push(startDate); }
    if (endDate) { bankSql += ' AND t.date<=?'; bankParams.push(endDate); }
    if (category) { bankSql += ' AND t.category=?'; bankParams.push(category); }
    if (type) { bankSql += ' AND t.type=?'; bankParams.push(type); }
    if (search) {
      bankSql += ' AND (t.description LIKE ? OR brt.merchant_name LIKE ? OR brt.merchant_vpa LIKE ? OR t.reference_number LIKE ?)';
      const query = `%${search}%`;
      bankParams.push(query, query, query, query);
    }
    bankSql += ' ORDER BY t.date DESC, t.created_at DESC LIMIT 500';

    let upiSql = 'SELECT * FROM upi_payments WHERE user_id=?';
    const upiParams = [req.session.userId];
    if (startDate) { upiSql += ' AND date>=?'; upiParams.push(startDate); }
    if (endDate) { upiSql += ' AND date<=?'; upiParams.push(endDate); }
    if (search) {
      upiSql += ' AND (payee_name LIKE ? OR upi_id LIKE ? OR transaction_ref LIKE ?)';
      const query = `%${search}%`;
      upiParams.push(query, query, query);
    }
    upiSql += ' ORDER BY date DESC, created_at DESC LIMIT 500';

    const bankTransactions = source === 'upi' ? [] : db.prepare(bankSql).all(...bankParams);
    const upiTransactions = source === 'bank' ? [] : db.prepare(upiSql).all(...upiParams)
      .map((payment) => ({
        id: `upi-${payment.id}`,
        amount: payment.amount,
        type: 'debit',
        description: payment.payee_name || payment.upi_id,
        category: categorizeByRules(payment.payee_name || payment.upi_id, payment.notes || '') || 'Other',
        date: payment.date,
        reference_number: payment.transaction_ref,
        balance_after: null,
        created_at: payment.created_at,
        source: 'upi',
        bank_name: 'UPI',
        account_number: null,
        merchant_name: payment.payee_name || null,
        merchant_vpa: payment.upi_id,
        upi_ref_no: payment.transaction_ref,
        status: payment.status
      }))
      .filter((payment) => !category || payment.category === category)
      .filter((payment) => !type || payment.type === type);

    const merged = [...bankTransactions, ...upiTransactions]
      .sort((left, right) => `${right.date}${right.created_at || ''}`.localeCompare(`${left.date}${left.created_at || ''}`));

    const offset = (safePage - 1) * safeLimit;
    const paginated = merged.slice(offset, offset + safeLimit).map((transaction) => ({
      ...transaction,
      masked_account_number: transaction.account_number ? maskAccountNumber(transaction.account_number) : null
    }));

    return res.json({
      transactions: paginated,
      total: merged.length,
      page: safePage,
      limit: safeLimit,
      hasMore: offset + safeLimit < merged.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
