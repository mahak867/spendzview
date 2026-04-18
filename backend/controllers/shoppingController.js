const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { search, category, returnDeadline } = req.query;
    let sql = 'SELECT * FROM purchases WHERE user_id=?';
    const params = [req.session.userId];
    if (search) { sql += ' AND (item_name LIKE ? OR store LIKE ?)'; const s = `%${search}%`; params.push(s, s); }
    if (category) { sql += ' AND category=?'; params.push(category); }
    if (returnDeadline === 'soon') {
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      sql += ' AND return_deadline IS NOT NULL AND return_deadline BETWEEN ? AND ? AND return_status=\'pending\'';
      params.push(today, in7);
    }
    sql += ' ORDER BY purchase_date DESC';
    const purchases = db.prepare(sql).all(...params);
    res.json({ purchases });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { item_name, amount, store, category, purchase_date, warranty_expiry, return_deadline, notes } = req.body;
    if (!item_name || !amount || !purchase_date) return res.status(400).json({ error: 'Item name, amount, and date required' });
    const result = db.prepare(`INSERT INTO purchases (user_id, item_name, amount, store, category, purchase_date, warranty_expiry, return_deadline, notes) VALUES (?,?,?,?,?,?,?,?,?)`).run(req.session.userId, item_name, parseFloat(amount), store || null, category || null, purchase_date, warranty_expiry || null, return_deadline || null, notes || null);

    // Warranty notification
    if (warranty_expiry) {
      const daysUntil = Math.ceil((new Date(warranty_expiry) - new Date()) / 86400000);
      if (daysUntil <= 30) {
        db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'warranty_expiry', `Warranty Expiring: ${item_name}`, `Warranty for ${item_name} expires on ${warranty_expiry}`);
      }
    }

    const purchase = db.prepare('SELECT * FROM purchases WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ purchase });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM purchases WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });
    const { item_name, amount, store, category, purchase_date, warranty_expiry, return_deadline, return_status, notes } = req.body;
    db.prepare(`UPDATE purchases SET item_name=COALESCE(?,item_name), amount=COALESCE(?,amount), store=COALESCE(?,store), category=COALESCE(?,category), purchase_date=COALESCE(?,purchase_date), warranty_expiry=COALESCE(?,warranty_expiry), return_deadline=COALESCE(?,return_deadline), return_status=COALESCE(?,return_status), notes=COALESCE(?,notes) WHERE id=?`).run(item_name || null, amount ? parseFloat(amount) : null, store || null, category || null, purchase_date || null, warranty_expiry || null, return_deadline || null, return_status || null, notes || null, id);
    res.json({ purchase: db.prepare('SELECT * FROM purchases WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM purchases WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });
    db.prepare('DELETE FROM purchases WHERE id=?').run(id);
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
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const totalMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM purchases WHERE user_id=? AND purchase_date LIKE ?`).get(userId, `${month}%`);
    const warrantyExpiring = db.prepare(`SELECT * FROM purchases WHERE user_id=? AND warranty_expiry BETWEEN ? AND ?`).all(userId, today, in7);
    const returnDeadline = db.prepare(`SELECT * FROM purchases WHERE user_id=? AND return_deadline BETWEEN ? AND ? AND return_status='pending'`).all(userId, today, in7);

    res.json({ totalThisMonth: totalMonth.total, warrantyExpiringSoon: warrantyExpiring, returnDeadlineSoon: returnDeadline });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};