const db = require('../models/db');

exports.search = (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    const userId = req.session.userId;
    const like = `%${q.trim()}%`;
    const lim = parseInt(limit);
    const results = [];

    const expenses = db.prepare(`SELECT id, 'expense' as module, description as title, amount, date, category as subtitle FROM expenses WHERE user_id=? AND (description LIKE ? OR category LIKE ? OR tags LIKE ? OR notes LIKE ?) LIMIT ?`).all(userId, like, like, like, like, lim);
    expenses.forEach(r => results.push({ ...r, icon: '💸' }));

    const bills = db.prepare(`SELECT id, 'bill' as module, type as title, amount, due_date as date, utility_type as subtitle FROM bills WHERE user_id=? AND (type LIKE ? OR notes LIKE ?) LIMIT ?`).all(userId, like, like, Math.ceil(lim / 2));
    bills.forEach(r => results.push({ ...r, icon: '🧾' }));

    const accounts = db.prepare(`SELECT id, 'banking' as module, bank_name as title, balance as amount, last_synced as date, account_type as subtitle FROM bank_accounts WHERE user_id=? AND (bank_name LIKE ? OR account_number LIKE ? OR branch LIKE ?) LIMIT ?`).all(userId, like, like, like, Math.ceil(lim / 3));
    accounts.forEach(r => results.push({ ...r, icon: '🏛️' }));

    const subs = db.prepare(`SELECT id, 'subscriptions' as module, name as title, amount, next_renewal as date, category as subtitle FROM subscriptions WHERE user_id=? AND (name LIKE ? OR category LIKE ?) LIMIT ?`).all(userId, like, like, Math.ceil(lim / 3));
    subs.forEach(r => results.push({ ...r, icon: '🔄' }));

    const insurance = db.prepare(`SELECT id, 'insurance' as module, type as title, premium as amount, next_premium_date as date, provider as subtitle FROM insurance WHERE user_id=? AND (type LIKE ? OR provider LIKE ? OR policy_number LIKE ?) LIMIT ?`).all(userId, like, like, like, Math.ceil(lim / 3));
    insurance.forEach(r => results.push({ ...r, icon: '🛡️' }));

    const investments = db.prepare(`SELECT id, 'investments' as module, name as title, current_value as amount, start_date as date, platform as subtitle FROM investments WHERE user_id=? AND (name LIKE ? OR platform LIKE ? OR type LIKE ?) LIMIT ?`).all(userId, like, like, like, Math.ceil(lim / 3));
    investments.forEach(r => results.push({ ...r, icon: '📈' }));

    const loans = db.prepare(`SELECT id, 'loans' as module, loan_name as title, outstanding as amount, next_emi_date as date, lender as subtitle FROM loans WHERE user_id=? AND (loan_name LIKE ? OR lender LIKE ?) LIMIT ?`).all(userId, like, like, Math.ceil(lim / 3));
    loans.forEach(r => results.push({ ...r, icon: '🏦' }));

    const incomes = db.prepare(`SELECT id, 'income' as module, source as title, amount, date, category as subtitle FROM incomes WHERE user_id=? AND (source LIKE ? OR description LIKE ?) LIMIT ?`).all(userId, like, like, Math.ceil(lim / 2));
    incomes.forEach(r => results.push({ ...r, icon: '💰' }));

    results.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

    res.json({ query: q, results: results.slice(0, parseInt(limit)), total: results.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
