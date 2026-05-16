const db = require('../models/db');

exports.generate = (req, res) => {
  try {
    const { upi_id, payee_name, amount, currency, notes } = req.body;
    if (!upi_id || !amount) return res.status(400).json({ error: 'UPI ID and amount required' });
    const cur = currency || 'INR';
    const tn = encodeURIComponent(notes || 'Payment via SpendSense Pro');
    const pn = encodeURIComponent(payee_name || 'Payee');
    const upiLink = `upi://pay?pa=${upi_id}&pn=${pn}&am=${amount}&cu=${cur}&tn=${tn}`;
    const qrData = `UPI:${upi_id}|${payee_name || ''}|${amount}|${cur}`;
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(`INSERT INTO upi_payments (user_id, upi_id, payee_name, amount, currency, status, upi_link, qr_data, notes, date) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.session.userId, upi_id, payee_name || null, Number.parseFloat(amount), cur, 'generated', upiLink, qrData, notes || null, today);
    res.json({ upiLink, qrData, paymentId: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.savePayment = (req, res) => {
  try {
    const { upi_id, payee_name, amount, currency, status, transaction_ref, notes, date } = req.body;
    if (!upi_id || !amount) return res.status(400).json({ error: 'UPI ID and amount required' });
    if (transaction_ref) {
      const existing = db.prepare('SELECT * FROM upi_payments WHERE user_id=? AND transaction_ref=?').get(req.session.userId, transaction_ref);
      if (existing) {
        return res.json({ payment: existing, duplicate: true });
      }
    }
    const result = db.prepare(`INSERT INTO upi_payments (user_id, upi_id, payee_name, amount, currency, status, transaction_ref, notes, date) VALUES (?,?,?,?,?,?,?,?,?)`).run(req.session.userId, upi_id, payee_name || null, Number.parseFloat(amount), currency || 'INR', status || 'pending', transaction_ref || null, notes || null, date || new Date().toISOString().split('T')[0]);
    res.status(201).json({ payment: db.prepare('SELECT * FROM upi_payments WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.listPayments = (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    let sql = 'SELECT * FROM upi_payments WHERE user_id=?';
    const params = [req.session.userId];
    if (status) { sql += ' AND status=?'; params.push(status); }
    if (startDate) { sql += ' AND date>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND date<=?'; params.push(endDate); }
    sql += ' ORDER BY created_at DESC';
    res.json({ payments: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.updateStatus = (req, res) => {
  try {
    const { id } = req.params;
    const payment = db.prepare('SELECT id FROM upi_payments WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const { status, transaction_ref } = req.body;
    const validStatuses = ['pending', 'completed', 'failed', 'refunded', 'generated'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (transaction_ref) {
      const existing = db.prepare('SELECT id FROM upi_payments WHERE user_id=? AND transaction_ref=? AND id!=?').get(req.session.userId, transaction_ref, id);
      if (existing) return res.status(409).json({ error: 'Duplicate UPI reference number' });
    }
    db.prepare('UPDATE upi_payments SET status=?, transaction_ref=COALESCE(?,transaction_ref) WHERE id=?').run(status, transaction_ref || null, id);
    res.json({ payment: db.prepare('SELECT * FROM upi_payments WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM upi_payments WHERE user_id=?`).get(userId);
    const byStatus = db.prepare(`SELECT status, COUNT(*) as count, SUM(amount) as total FROM upi_payments WHERE user_id=? GROUP BY status`).all(userId);
    const thisMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM upi_payments WHERE user_id=? AND date LIKE ?`).get(userId, `${month}%`);
    res.json({ total: total.total, count: total.count, byStatus, thisMonth: thisMonth.total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
