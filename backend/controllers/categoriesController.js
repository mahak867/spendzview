const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM categories WHERE user_id=?';
    const params = [req.session.userId];
    if (type) { sql += ' AND type=?'; params.push(type); }
    sql += ' ORDER BY name ASC';
    const categories = db.prepare(sql).all(...params);
    res.json({ categories });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.add = (req, res) => {
  try {
    const { name, icon, color, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });
    const existing = db.prepare('SELECT id FROM categories WHERE user_id=? AND name=?').get(req.session.userId, name);
    if (existing) return res.status(409).json({ error: 'Category already exists' });
    const result = db.prepare(`INSERT INTO categories (user_id, name, icon, color, type) VALUES (?,?,?,?,?)`).run(req.session.userId, name, icon || '📦', color || '#6b7280', type || 'expense');
    res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM categories WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    const { name, icon, color } = req.body;
    db.prepare(`UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), color=COALESCE(?,color) WHERE id=?`).run(name||null, icon||null, color||null, id);
    res.json({ category: db.prepare('SELECT * FROM categories WHERE id=?').get(id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM categories WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
