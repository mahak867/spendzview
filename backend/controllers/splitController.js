const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const splits = db.prepare('SELECT * FROM split_expenses WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
    const result = splits.map(s => ({
      ...s,
      participants: db.prepare('SELECT * FROM split_participants WHERE split_id=?').all(s.id)
    }));
    res.json({ splits: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.add = (req, res) => {
  try {
    const { title, total_amount, date, group_name, participants, notes } = req.body;
    if (!title || !total_amount || !date) return res.status(400).json({ error: 'Title, amount and date required' });
    if (!participants || !Array.isArray(participants) || participants.length < 2)
      return res.status(400).json({ error: 'At least 2 participants required' });

    const splitResult = db.prepare(`INSERT INTO split_expenses (user_id, title, total_amount, date, group_name, notes) VALUES (?,?,?,?,?,?)`).run(req.session.userId, title, parseFloat(total_amount), date, group_name || null, notes || null);
    const splitId = splitResult.lastInsertRowid;

    const insertParticipant = db.prepare(`INSERT INTO split_participants (split_id, name, share, is_paid) VALUES (?,?,?,?)`);
    for (const p of participants) {
      if (!p.name || !p.share) continue;
      insertParticipant.run(splitId, p.name, parseFloat(p.share), p.is_paid ? 1 : 0);
    }

    const split = db.prepare('SELECT * FROM split_expenses WHERE id=?').get(splitId);
    const parts = db.prepare('SELECT * FROM split_participants WHERE split_id=?').all(splitId);
    res.status(201).json({ split: { ...split, participants: parts } });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.markPaid = (req, res) => {
  try {
    const { participantId } = req.params;
    const participant = db.prepare('SELECT sp.* FROM split_participants sp JOIN split_expenses se ON sp.split_id=se.id WHERE sp.id=? AND se.user_id=?').get(participantId, req.session.userId);
    if (!participant) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE split_participants SET is_paid=1 WHERE id=?').run(participantId);
    res.json({ message: 'Marked as paid' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM split_expenses WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM split_expenses WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
