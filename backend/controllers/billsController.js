const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { type, is_paid } = req.query;
    let sql = 'SELECT * FROM bills WHERE user_id=?';
    const params = [req.session.userId];
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (is_paid !== undefined) { sql += ' AND is_paid=?'; params.push(parseInt(is_paid)); }
    sql += ' ORDER BY due_date ASC';
    const bills = db.prepare(sql).all(...params);
    res.json({ bills });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { type, amount, due_date, notes, late_fee, monthly_usage, utility_type } = req.body;
    if (!type || !amount || !due_date) return res.status(400).json({ error: 'Type, amount, due_date required' });
    const result = db.prepare(`INSERT INTO bills (user_id, type, utility_type, amount, due_date, late_fee, monthly_usage, notes) VALUES (?,?,?,?,?,?,?,?)`).run(req.session.userId, type, utility_type || null, parseFloat(amount), due_date, parseFloat(late_fee || 0), monthly_usage ? parseFloat(monthly_usage) : null, notes || null);

    // Create reminder notification
    const daysUntilDue = Math.ceil((new Date(due_date) - new Date()) / 86400000);
    if (daysUntilDue <= 7 && daysUntilDue >= 0) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'bill_reminder', `Bill Due: ${type}`, `Your ${type} bill of ₹${amount} is due on ${due_date}`);
    }

    const bill = db.prepare('SELECT * FROM bills WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ bill });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    const bill = db.prepare('SELECT * FROM bills WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const { type, amount, due_date, is_paid, notes, late_fee, monthly_usage, utility_type } = req.body;
    const paidDate = is_paid ? (req.body.paid_date || new Date().toISOString().split('T')[0]) : null;
    db.prepare(`UPDATE bills SET type=COALESCE(?,type), utility_type=COALESCE(?,utility_type), amount=COALESCE(?,amount), due_date=COALESCE(?,due_date), is_paid=COALESCE(?,is_paid), paid_date=?, late_fee=COALESCE(?,late_fee), monthly_usage=COALESCE(?,monthly_usage), notes=COALESCE(?,notes) WHERE id=?`).run(type || null, utility_type || null, amount ? parseFloat(amount) : null, due_date || null, is_paid !== undefined ? parseInt(is_paid) : null, paidDate, late_fee !== undefined ? parseFloat(late_fee) : null, monthly_usage ? parseFloat(monthly_usage) : null, notes || null, id);
    const updated = db.prepare('SELECT * FROM bills WHERE id=?').get(id);
    res.json({ bill: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    const bill = db.prepare('SELECT id FROM bills WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    db.prepare('DELETE FROM bills WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.upcoming = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const bills = db.prepare(`SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date BETWEEN ? AND ? ORDER BY due_date`).all(req.session.userId, today, in7);
    res.json({ bills });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];
    const userId = req.session.userId;

    const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM bills WHERE user_id=? AND is_paid=0`).get(userId);
    const paidThisMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM bills WHERE user_id=? AND paid_date LIKE ?`).get(userId, `${month}%`);
    const overdue = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM bills WHERE user_id=? AND is_paid=0 AND due_date < ?`).get(userId, today);
    const byType = db.prepare(`SELECT type, SUM(amount) as total, COUNT(*) as count FROM bills WHERE user_id=? GROUP BY type ORDER BY total DESC`).all(userId);

    res.json({ totalDue: total.total, paidThisMonth: paidThisMonth.total, overdueCount: overdue.cnt, overdueAmount: overdue.total, byType });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};