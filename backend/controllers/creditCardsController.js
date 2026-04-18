const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const cards = db.prepare('SELECT * FROM credit_cards WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
    res.json({ cards });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.add = (req, res) => {
  try {
    const { card_name, bank, last4, credit_limit, outstanding, due_date, statement_date, reward_points, notes } = req.body;
    if (!card_name || !bank) return res.status(400).json({ error: 'Card name and bank required' });
    const result = db.prepare(
      `INSERT INTO credit_cards (user_id, card_name, bank, last4, credit_limit, outstanding, due_date, statement_date, reward_points, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(req.session.userId, card_name, bank, last4||null, parseFloat(credit_limit||0), parseFloat(outstanding||0), due_date||null, statement_date||null, parseInt(reward_points||0), notes||null);
    res.status(201).json({ card: db.prepare('SELECT * FROM credit_cards WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM credit_cards WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    const { card_name, bank, credit_limit, outstanding, due_date, reward_points, notes } = req.body;
    db.prepare(`UPDATE credit_cards SET card_name=COALESCE(?,card_name), bank=COALESCE(?,bank), credit_limit=COALESCE(?,credit_limit),
      outstanding=COALESCE(?,outstanding), due_date=COALESCE(?,due_date), reward_points=COALESCE(?,reward_points), notes=COALESCE(?,notes) WHERE id=?`)
      .run(card_name||null, bank||null, credit_limit?parseFloat(credit_limit):null, outstanding?parseFloat(outstanding):null, due_date||null, reward_points?parseInt(reward_points):null, notes!==undefined?notes:null, id);
    res.json({ card: db.prepare('SELECT * FROM credit_cards WHERE id=?').get(id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM credit_cards WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM credit_cards WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const cards = db.prepare('SELECT * FROM credit_cards WHERE user_id=? AND is_active=1').all(userId);
    const totalLimit = cards.reduce((s, c) => s + c.credit_limit, 0);
    const totalOutstanding = cards.reduce((s, c) => s + c.outstanding, 0);
    const totalPoints = cards.reduce((s, c) => s + c.reward_points, 0);
    const utilizationPct = totalLimit > 0 ? (totalOutstanding / totalLimit * 100).toFixed(1) : 0;
    const dueSoon = cards.filter(c => {
      if (!c.due_date) return false;
      const days = (new Date(c.due_date) - new Date()) / 86400000;
      return days >= 0 && days <= 7;
    });
    res.json({ cards, totalLimit, totalOutstanding, totalPoints, utilizationPct, dueSoonCount: dueSoon.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
