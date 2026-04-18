const bcrypt = require('bcrypt');
const db = require('../models/db');

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (name, email, password, phone) VALUES (?,?,?,?)').run(name, email, hash, phone || null);
    req.session.userId = result.lastInsertRowid;
    const user = db.prepare('SELECT id, name, email, phone, currency, monthly_income, created_at FROM users WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
};

exports.me = (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, currency, monthly_income, created_at FROM users WHERE id=?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
};