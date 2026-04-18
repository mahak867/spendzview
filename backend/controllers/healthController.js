const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    let sql = 'SELECT * FROM health WHERE user_id=?';
    const params = [req.session.userId];
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (startDate) { sql += ' AND date>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND date<=?'; params.push(endDate); }
    sql += ' ORDER BY date DESC';
    res.json({ health: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { type, amount, date, provider, reminder_date, insurance_claim, notes } = req.body;
    if (!type || !amount || !date) return res.status(400).json({ error: 'Type, amount, date required' });
    const result = db.prepare(`INSERT INTO health (user_id, type, amount, date, provider, reminder_date, insurance_claim, notes) VALUES (?,?,?,?,?,?,?,?)`).run(req.session.userId, type, parseFloat(amount), date, provider || null, reminder_date || null, insurance_claim ? parseFloat(insurance_claim) : 0, notes || null);
    if (reminder_date) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'health_reminder', `Health Reminder`, `${type} appointment/reminder on ${reminder_date}`);
    }
    res.status(201).json({ health: db.prepare('SELECT * FROM health WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM health WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    const { type, amount, date, provider, reminder_date, insurance_claim, notes } = req.body;
    db.prepare(`UPDATE health SET type=COALESCE(?,type), amount=COALESCE(?,amount), date=COALESCE(?,date), provider=COALESCE(?,provider), reminder_date=COALESCE(?,reminder_date), insurance_claim=COALESCE(?,insurance_claim), notes=COALESCE(?,notes) WHERE id=?`).run(type || null, amount ? parseFloat(amount) : null, date || null, provider || null, reminder_date || null, insurance_claim !== undefined ? parseFloat(insurance_claim) : null, notes || null, id);
    res.json({ health: db.prepare('SELECT * FROM health WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM health WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM health WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(insurance_claim),0) as claims FROM health WHERE user_id=?`).get(userId);
    const byType = db.prepare(`SELECT type, SUM(amount) as total, COUNT(*) as count FROM health WHERE user_id=? GROUP BY type`).all(userId);
    const reminders = db.prepare(`SELECT * FROM health WHERE user_id=? AND reminder_date BETWEEN ? AND ?`).all(userId, today, in7);
    res.json({ totalSpend: total.total, totalClaims: total.claims, byType, upcomingReminders: reminders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};