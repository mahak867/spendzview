const db = require('../models/db');
const { parseCSV, autoCategory } = require('../services/csvParser');
const { uploadStatement } = require('../middleware/upload');

exports.listAccounts = (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM bank_accounts WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
    res.json({ accounts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.addAccount = (req, res) => {
  try {
    const { bank_name, account_number, account_type, balance, ifsc_code, branch, notes } = req.body;
    if (!bank_name) return res.status(400).json({ error: 'Bank name required' });
    const result = db.prepare(`INSERT INTO bank_accounts (user_id, bank_name, account_number, account_type, balance, ifsc_code, branch, notes) VALUES (?,?,?,?,?,?,?,?)`).run(req.session.userId, bank_name, account_number || null, account_type || 'savings', parseFloat(balance || 0), ifsc_code || null, branch || null, notes || null);
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
    db.prepare(`UPDATE bank_accounts SET bank_name=COALESCE(?,bank_name), account_number=COALESCE(?,account_number), account_type=COALESCE(?,account_type), balance=COALESCE(?,balance), ifsc_code=COALESCE(?,ifsc_code), branch=COALESCE(?,branch), notes=COALESCE(?,notes), last_synced=CURRENT_TIMESTAMP WHERE id=?`).run(bank_name || null, account_number || null, account_type || null, balance !== undefined ? parseFloat(balance) : null, ifsc_code || null, branch || null, notes || null, id);
    res.json({ account: db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteAccount = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM bank_accounts WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM transactions WHERE bank_account_id=?').run(id);
    db.prepare('DELETE FROM bank_accounts WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.importCSV = (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { bank_account_id } = req.body;

    const rows = parseCSV(req.file.path);
    let imported = 0, duplicates = 0;

    const insertTx = db.prepare(`INSERT INTO transactions (user_id, bank_account_id, amount, type, description, category, date, reference_number, balance_after, is_duplicate) VALUES (?,?,?,?,?,?,?,?,?,?)`);

    for (const row of rows) {
      const category = autoCategory(row.description);
      // Duplicate check: same amount, date, description
      const dup = db.prepare(`SELECT id FROM transactions WHERE user_id=? AND amount=? AND date=? AND description=?`).get(req.session.userId, row.amount, row.date, row.description);
      const isDuplicate = dup ? 1 : 0;
      if (isDuplicate) duplicates++;
      insertTx.run(req.session.userId, bank_account_id || null, row.amount, row.type, row.description, category, row.date, null, row.balance, isDuplicate);
      if (!isDuplicate) imported++;
    }

    // Update account last_synced
    if (bank_account_id) {
      db.prepare('UPDATE bank_accounts SET last_synced=CURRENT_TIMESTAMP WHERE id=?').run(bank_account_id);
    }

    res.json({ imported, duplicates, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.listTransactions = (req, res) => {
  try {
    const { bank_account_id, startDate, endDate, category, type, search } = req.query;
    let sql = 'SELECT * FROM transactions WHERE user_id=?';
    const params = [req.session.userId];
    if (bank_account_id) { sql += ' AND bank_account_id=?'; params.push(parseInt(bank_account_id)); }
    if (startDate) { sql += ' AND date>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND date<=?'; params.push(endDate); }
    if (category) { sql += ' AND category=?'; params.push(category); }
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (search) { sql += ' AND description LIKE ?'; params.push(`%${search}%`); }
    sql += ' ORDER BY date DESC, created_at DESC LIMIT 200';
    res.json({ transactions: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};