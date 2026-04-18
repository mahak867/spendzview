const db = require('../models/db');
const fs = require('fs');
const path = require('path');

exports.list = (req, res) => {
  try {
    const { type, related_to } = req.query;
    let sql = 'SELECT * FROM documents WHERE user_id=?';
    const params = [req.session.userId];
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (related_to) { sql += ' AND related_to=?'; params.push(related_to); }
    sql += ' ORDER BY created_at DESC';
    res.json({ documents: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.upload = (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { name, type, related_to, notes } = req.body;
    const result = db.prepare(`INSERT INTO documents (user_id, name, type, file_path, related_to, notes) VALUES (?,?,?,?,?,?)`).run(req.session.userId, name || req.file.originalname, type || null, req.file.path, related_to || null, notes || null);
    res.status(201).json({ document: db.prepare('SELECT * FROM documents WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    const doc = db.prepare('SELECT * FROM documents WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    try { fs.unlinkSync(doc.file_path); } catch (e) { /* file may not exist */ }
    db.prepare('DELETE FROM documents WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getById = (req, res) => {
  try {
    const { id } = req.params;
    const doc = db.prepare('SELECT * FROM documents WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json({ document: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};