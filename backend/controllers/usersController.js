const db = require('../models/db');

exports.getProfile = (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, currency, monthly_income, created_at FROM users WHERE id=?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
};

exports.updateProfile = (req, res) => {
  try {
    const { name, email, phone, currency, monthly_income } = req.body;
    const userId = req.session.userId;
    if (email) {
      const existing = db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(email, userId);
      if (existing) return res.status(409).json({ error: 'Email already in use' });
    }
    db.prepare(`UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email), phone=COALESCE(?,phone), currency=COALESCE(?,currency), monthly_income=COALESCE(?,monthly_income) WHERE id=?`).run(name || null, email || null, phone || null, currency || null, monthly_income || null, userId);
    const user = db.prepare('SELECT id, name, email, phone, currency, monthly_income, created_at FROM users WHERE id=?').get(userId);
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};