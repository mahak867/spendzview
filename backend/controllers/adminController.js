const db = require('../models/db');

// Simple admin auth — protect with env var
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'spendsense-admin-2024';

exports.requireAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (key !== ADMIN_SECRET) return res.status(403).json({ error: 'Admin access required' });
  next();
};

exports.metrics = (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalExpenses = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM expenses').get();
    const totalIncomes = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM incomes').get();
    const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    const planBreakdown = db.prepare(`SELECT COALESCE(plan,'free') as plan, COUNT(*) as count FROM users GROUP BY plan`).all();
    const paidRevenue = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payment_orders WHERE status='paid'`).get().total;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const newUsersToday = db.prepare(`SELECT COUNT(*) as count FROM users WHERE DATE(created_at)=?`).get(today).count;
    const newUsersThisMonth = db.prepare(`SELECT COUNT(*) as count FROM users WHERE created_at LIKE ?`).get(`${thisMonth}%`).count;
    const activeToday = db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM expenses WHERE date=?`).get(today).count;

    // Growth chart - users per month last 6 months
    const userGrowth = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const count = db.prepare(`SELECT COUNT(*) as count FROM users WHERE created_at LIKE ?`).get(`${m}%`).count;
      userGrowth.push({ label, count });
    }

    res.json({
      users: { total: totalUsers, newToday: newUsersToday, newThisMonth: newUsersThisMonth, activeToday },
      expenses: { count: totalExpenses.count, totalVolume: totalExpenses.total },
      incomes: { count: totalIncomes.count, totalVolume: totalIncomes.total },
      transactions: totalTransactions,
      plans: planBreakdown,
      revenue: paidRevenue,
      userGrowth
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
