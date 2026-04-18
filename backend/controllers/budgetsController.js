const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const budgets = db.prepare('SELECT * FROM budgets WHERE user_id=? AND month=?').all(req.session.userId, month);
    res.json({ budgets, month });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.set = (req, res) => {
  try {
    const now = new Date();
    const month = req.body.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { total_budget, categories } = req.body;
    const userId = req.session.userId;

    // Upsert overall budget
    if (total_budget !== undefined) {
      const existing = db.prepare('SELECT id FROM budgets WHERE user_id=? AND month=? AND category IS NULL').get(userId, month);
      if (existing) {
        db.prepare('UPDATE budgets SET total_budget=? WHERE id=?').run(parseFloat(total_budget), existing.id);
      } else {
        db.prepare('INSERT INTO budgets (user_id, month, total_budget) VALUES (?,?,?)').run(userId, month, parseFloat(total_budget));
      }
    }

    // Upsert category budgets
    if (categories && Array.isArray(categories)) {
      for (const { category, amount } of categories) {
        if (!category || amount === undefined) continue;
        const existing = db.prepare('SELECT id FROM budgets WHERE user_id=? AND month=? AND category=?').get(userId, month, category);
        if (existing) {
          db.prepare('UPDATE budgets SET category_budget=? WHERE id=?').run(parseFloat(amount), existing.id);
        } else {
          db.prepare('INSERT INTO budgets (user_id, month, category, category_budget) VALUES (?,?,?,?)').run(userId, month, category, parseFloat(amount));
        }
      }
    }

    const budgets = db.prepare('SELECT * FROM budgets WHERE user_id=? AND month=?').all(userId, month);
    res.json({ budgets, month });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.status = (req, res) => {
  try {
    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const userId = req.session.userId;

    const overall = db.prepare('SELECT total_budget FROM budgets WHERE user_id=? AND month=? AND category IS NULL').get(userId, month);
    const totalSpent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${month}%`);

    const catBudgets = db.prepare('SELECT * FROM budgets WHERE user_id=? AND month=? AND category IS NOT NULL').all(userId, month);
    const catStatus = catBudgets.map(b => {
      const spent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ? AND category=?`).get(userId, `${month}%`, b.category);
      const pct = b.category_budget > 0 ? (spent.total / b.category_budget) * 100 : 0;
      return {
        category: b.category,
        budget: b.category_budget,
        spent: spent.total,
        remaining: b.category_budget - spent.total,
        percentage: Math.min(pct, 100),
        alert: pct >= 80
      };
    });

    const totalBudget = overall?.total_budget || 0;
    res.json({
      month,
      totalBudget,
      totalSpent: totalSpent.total,
      remaining: totalBudget - totalSpent.total,
      percentage: totalBudget > 0 ? Math.min((totalSpent.total / totalBudget) * 100, 100) : 0,
      categories: catStatus
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};