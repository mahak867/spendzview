const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { type, institution } = req.query;
    let sql = 'SELECT * FROM education WHERE user_id=?';
    const params = [req.session.userId];
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (institution) { sql += ' AND institution LIKE ?'; params.push(`%${institution}%`); }
    sql += ' ORDER BY date DESC';
    res.json({ education: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { type, title, amount, date, institution, renewal_date, notes } = req.body;
    if (!type || !title || !amount || !date) return res.status(400).json({ error: 'Type, title, amount, date required' });
    const result = db.prepare(`INSERT INTO education (user_id, type, title, amount, date, institution, renewal_date, notes) VALUES (?,?,?,?,?,?,?,?)`).run(req.session.userId, type, title, parseFloat(amount), date, institution || null, renewal_date || null, notes || null);
    if (renewal_date) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'course_renewal', `Course Renewal: ${title}`, `${title} renews on ${renewal_date}`);
    }
    res.status(201).json({ education: db.prepare('SELECT * FROM education WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM education WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    const { type, title, amount, date, institution, renewal_date, notes } = req.body;
    db.prepare(`UPDATE education SET type=COALESCE(?,type), title=COALESCE(?,title), amount=COALESCE(?,amount), date=COALESCE(?,date), institution=COALESCE(?,institution), renewal_date=COALESCE(?,renewal_date), notes=COALESCE(?,notes) WHERE id=?`).run(type || null, title || null, amount ? parseFloat(amount) : null, date || null, institution || null, renewal_date || null, notes || null, id);
    res.json({ education: db.prepare('SELECT * FROM education WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM education WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM education WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM education WHERE user_id=?`).get(userId);
    const byType = db.prepare(`SELECT type, SUM(amount) as total, COUNT(*) as count FROM education WHERE user_id=? GROUP BY type`).all(userId);
    const renewals = db.prepare(`SELECT * FROM education WHERE user_id=? AND renewal_date BETWEEN ? AND ?`).all(userId, today, in30);
    res.json({ totalSpend: total.total, byType, upcomingRenewals: renewals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};