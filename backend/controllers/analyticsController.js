const db = require('../models/db');

const CATEGORY_COLORS = {
  Food: '#f97316', Transport: '#3b82f6', Shopping: '#ec4899',
  Bills: '#eab308', Health: '#ef4444', Education: '#8b5cf6',
  Travel: '#06b6d4', Entertainment: '#10b981', Insurance: '#64748b',
  Other: '#6b7280'
};

exports.monthly = (req, res) => {
  try {
    const userId = req.session.userId;
    const labels = [], data = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const row = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${month}%`);
      labels.push(label);
      data.push(parseFloat(row.total.toFixed(2)));
    }
    res.json({ labels, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.categories = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rows = db.prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC`).all(userId, `${month}%`);
    const labels = rows.map(r => r.category);
    const data = rows.map(r => parseFloat(r.total.toFixed(2)));
    const colors = labels.map(l => CATEGORY_COLORS[l] || '#6b7280');
    res.json({ labels, data, colors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.daily = (req, res) => {
  try {
    const userId = req.session.userId;
    const labels = [], data = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split('T')[0];
      const label = d.toLocaleString('default', { month: 'short', day: 'numeric' });
      const row = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date=?`).get(userId, date);
      labels.push(label);
      data.push(parseFloat(row.total.toFixed(2)));
    }
    res.json({ labels, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.budgetProgress = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const catBudgets = db.prepare('SELECT category, category_budget FROM budgets WHERE user_id=? AND month=? AND category IS NOT NULL').all(userId, month);
    const result = catBudgets.map(b => {
      const spent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ? AND category=?`).get(userId, `${month}%`, b.category);
      return { category: b.category, budget: b.category_budget, spent: spent.total, percent: b.category_budget > 0 ? Math.min((spent.total / b.category_budget) * 100, 100) : 0 };
    });
    res.json({ categories: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.weeklyComparison = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - now.getDay() + 1);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(lastSunday.getDate() - 1);

    const thisWeek = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date>=?`).get(userId, thisMonday.toISOString().split('T')[0]);
    const lastWeek = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date>=? AND date<=?`).get(userId, lastMonday.toISOString().split('T')[0], lastSunday.toISOString().split('T')[0]);
    const change = lastWeek.total > 0 ? ((thisWeek.total - lastWeek.total) / lastWeek.total) * 100 : 0;
    res.json({ thisWeek: thisWeek.total, lastWeek: lastWeek.total, changePercent: parseFloat(change.toFixed(1)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.incomeVsExpense = (req, res) => {
  try {
    const userId = req.session.userId;
    const user = db.prepare('SELECT monthly_income FROM users WHERE id=?').get(userId);
    const income = user?.monthly_income || 0;
    const labels = [], expenses = [], incomes = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const row = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${month}%`);
      labels.push(label);
      expenses.push(parseFloat(row.total.toFixed(2)));
      incomes.push(income);
    }
    res.json({ labels, expenses, incomes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};