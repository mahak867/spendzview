const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
    res.json({ goals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { goal_name, target_amount, monthly_target, target_date, notes } = req.body;
    if (!goal_name || !target_amount || target_amount <= 0) return res.status(400).json({ error: 'Goal name and target amount required' });
    const result = db.prepare(`INSERT INTO savings_goals (user_id, goal_name, target_amount, monthly_target, target_date, notes) VALUES (?,?,?,?,?,?)`).run(req.session.userId, goal_name, parseFloat(target_amount), monthly_target ? parseFloat(monthly_target) : 0, target_date || null, notes || null);
    res.status(201).json({ goal: db.prepare('SELECT * FROM savings_goals WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM savings_goals WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    const { goal_name, target_amount, monthly_target, target_date, notes } = req.body;
    db.prepare(`UPDATE savings_goals SET goal_name=COALESCE(?,goal_name), target_amount=COALESCE(?,target_amount), monthly_target=COALESCE(?,monthly_target), target_date=COALESCE(?,target_date), notes=COALESCE(?,notes) WHERE id=?`).run(goal_name || null, target_amount ? parseFloat(target_amount) : null, monthly_target ? parseFloat(monthly_target) : null, target_date || null, notes || null, id);
    res.json({ goal: db.prepare('SELECT * FROM savings_goals WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM savings_goals WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM savings_goals WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deposit = (req, res) => {
  try {
    const { id } = req.params;
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const { amount, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
    const newSaved = Math.min(goal.saved_amount + parseFloat(amount), goal.target_amount);
    db.prepare('UPDATE savings_goals SET saved_amount=? WHERE id=?').run(newSaved, id);

    if (newSaved >= goal.target_amount) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'goal_achieved', `🎉 Goal Achieved!`, `Congratulations! You've reached your savings goal: ${goal.goal_name}`);
    }

    res.json({ goal: db.prepare('SELECT * FROM savings_goals WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id=?').all(userId);
    const totalSaved = goals.reduce((s, g) => s + g.saved_amount, 0);
    const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
    const completed = goals.filter(g => g.saved_amount >= g.target_amount).length;
    res.json({ totalSaved, totalTarget, overallProgress: totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0, totalGoals: goals.length, completedGoals: completed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};