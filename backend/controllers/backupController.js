const db = require('../models/db');
const { generateReport } = require('../services/pdfExport');

exports.exportCSV = (req, res) => {
  try {
    const userId = req.session.userId;
    const expenses = db.prepare('SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC').all(userId);
    const today = new Date().toISOString().split('T')[0];
    const header = 'Date,Category,Description,Amount,Payment Method,Tags,Notes\n';
    const rows = expenses.map(e => {
      const esc = v => `"${(v || '').toString().replace(/"/g, '""')}"`;
      return [e.date, esc(e.category), esc(e.description), e.amount, esc(e.payment_method), esc(e.tags), esc(e.notes)].join(',');
    }).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-backup-${today}.csv"`);
    res.send(header + rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.exportPDF = async (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const pdfBuffer = await generateReport(userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="spendsense-report-${today}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.exportJSON = (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const data = {
      exportDate: new Date().toISOString(),
      user: db.prepare('SELECT id, name, email, phone, currency, monthly_income FROM users WHERE id=?').get(userId),
      expenses: db.prepare('SELECT * FROM expenses WHERE user_id=?').all(userId),
      budgets: db.prepare('SELECT * FROM budgets WHERE user_id=?').all(userId),
      bills: db.prepare('SELECT * FROM bills WHERE user_id=?').all(userId),
      subscriptions: db.prepare('SELECT * FROM subscriptions WHERE user_id=?').all(userId),
      purchases: db.prepare('SELECT * FROM purchases WHERE user_id=?').all(userId),
      travel: db.prepare('SELECT * FROM travel WHERE user_id=?').all(userId),
      health: db.prepare('SELECT * FROM health WHERE user_id=?').all(userId),
      education: db.prepare('SELECT * FROM education WHERE user_id=?').all(userId),
      insurance: db.prepare('SELECT * FROM insurance WHERE user_id=?').all(userId),
      savings_goals: db.prepare('SELECT * FROM savings_goals WHERE user_id=?').all(userId),
      bank_accounts: db.prepare('SELECT * FROM bank_accounts WHERE user_id=?').all(userId),
      upi_payments: db.prepare('SELECT * FROM upi_payments WHERE user_id=?').all(userId)
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="spendsense-backup-${today}.json"`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.importJSON = (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });
    const userId = req.session.userId;
    let imported = 0;

    const importTable = (rows, insertFn) => {
      for (const row of (rows || [])) {
        try { insertFn(row); imported++; } catch (e) { /* skip duplicates/errors */ }
      }
    };

    importTable(data.expenses, r => db.prepare('INSERT OR IGNORE INTO expenses (user_id, amount, category, description, notes, tags, payment_method, date) VALUES (?,?,?,?,?,?,?,?)').run(userId, r.amount, r.category, r.description, r.notes, r.tags, r.payment_method, r.date));
    importTable(data.bills, r => db.prepare('INSERT OR IGNORE INTO bills (user_id, type, amount, due_date, is_paid, notes) VALUES (?,?,?,?,?,?)').run(userId, r.type, r.amount, r.due_date, r.is_paid, r.notes));
    importTable(data.subscriptions, r => db.prepare('INSERT OR IGNORE INTO subscriptions (user_id, name, amount, billing_cycle, next_renewal, category) VALUES (?,?,?,?,?,?)').run(userId, r.name, r.amount, r.billing_cycle, r.next_renewal, r.category));

    res.json({ message: `Imported ${imported} records successfully` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};