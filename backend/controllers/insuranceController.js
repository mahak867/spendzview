const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM insurance WHERE user_id=?';
    const params = [req.session.userId];
    if (type) { sql += ' AND type=?'; params.push(type); }
    sql += ' ORDER BY next_premium_date ASC';
    res.json({ insurance: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { type, provider, policy_number, premium, coverage_amount, start_date, end_date, next_premium_date, notes } = req.body;
    if (!type || !provider || !premium) return res.status(400).json({ error: 'Type, provider, premium required' });
    const result = db.prepare(`INSERT INTO insurance (user_id, type, provider, policy_number, premium, coverage_amount, start_date, end_date, next_premium_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.session.userId, type, provider, policy_number || null, parseFloat(premium), coverage_amount ? parseFloat(coverage_amount) : null, start_date || null, end_date || null, next_premium_date || null, notes || null);
    if (next_premium_date) {
      const daysUntil = Math.ceil((new Date(next_premium_date) - new Date()) / 86400000);
      if (daysUntil <= 7) {
        db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'insurance_premium', `Premium Due: ${provider}`, `${type} insurance premium of ₹${premium} due on ${next_premium_date}`);
      }
    }
    res.status(201).json({ insurance: db.prepare('SELECT * FROM insurance WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM insurance WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    const { type, provider, policy_number, premium, coverage_amount, start_date, end_date, next_premium_date, notes } = req.body;
    db.prepare(`UPDATE insurance SET type=COALESCE(?,type), provider=COALESCE(?,provider), policy_number=COALESCE(?,policy_number), premium=COALESCE(?,premium), coverage_amount=COALESCE(?,coverage_amount), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), next_premium_date=COALESCE(?,next_premium_date), notes=COALESCE(?,notes) WHERE id=?`).run(type || null, provider || null, policy_number || null, premium ? parseFloat(premium) : null, coverage_amount ? parseFloat(coverage_amount) : null, start_date || null, end_date || null, next_premium_date || null, notes || null, id);
    res.json({ insurance: db.prepare('SELECT * FROM insurance WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM insurance WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM insurance WHERE id=?').run(id);
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
    const stats = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(premium),0) as totalPremium, COALESCE(SUM(coverage_amount),0) as totalCoverage FROM insurance WHERE user_id=?`).get(userId);
    const byType = db.prepare(`SELECT type, COUNT(*) as count, SUM(premium) as premium, SUM(coverage_amount) as coverage FROM insurance WHERE user_id=? GROUP BY type`).all(userId);
    const upcomingPremiums = db.prepare(`SELECT * FROM insurance WHERE user_id=? AND next_premium_date BETWEEN ? AND ? ORDER BY next_premium_date`).all(userId, today, in30);
    res.json({ count: stats.count, totalAnnualPremium: stats.totalPremium, totalCoverage: stats.totalCoverage, byType, upcomingPremiums });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};