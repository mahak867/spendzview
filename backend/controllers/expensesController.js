const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { category, startDate, endDate, search, minAmount, maxAmount, payment_method, tags, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM expenses WHERE user_id=?';
    const params = [req.session.userId];

    if (category && category !== 'All') { sql += ' AND category=?'; params.push(category); }
    if (startDate) { sql += ' AND date>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND date<=?'; params.push(endDate); }
    if (search) { sql += ' AND (description LIKE ? OR notes LIKE ? OR tags LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
    if (minAmount) { sql += ' AND amount>=?'; params.push(parseFloat(minAmount)); }
    if (maxAmount) { sql += ' AND amount<=?'; params.push(parseFloat(maxAmount)); }
    if (payment_method && payment_method !== 'All') { sql += ' AND payment_method=?'; params.push(payment_method); }
    if (tags) { sql += ' AND tags LIKE ?'; params.push(`%${tags}%`); }

    sql += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const expenses = db.prepare(sql).all(...params);

    // Count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM expenses WHERE user_id=?';
    const countParams = [req.session.userId];
    if (category && category !== 'All') { countSql += ' AND category=?'; countParams.push(category); }
    if (startDate) { countSql += ' AND date>=?'; countParams.push(startDate); }
    if (endDate) { countSql += ' AND date<=?'; countParams.push(endDate); }
    if (search) { countSql += ' AND (description LIKE ? OR notes LIKE ? OR tags LIKE ?)'; const s = `%${search}%`; countParams.push(s, s, s); }
    if (minAmount) { countSql += ' AND amount>=?'; countParams.push(parseFloat(minAmount)); }
    if (maxAmount) { countSql += ' AND amount<=?'; countParams.push(parseFloat(maxAmount)); }

    const { total } = db.prepare(countSql).get(...countParams);

    res.json({ expenses, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { amount, category, description, notes, tags, payment_method, date, is_recurring, recurring_interval } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
    if (!category) return res.status(400).json({ error: 'Category required' });
    if (!date) return res.status(400).json({ error: 'Date required' });

    const result = db.prepare(`INSERT INTO expenses (user_id, amount, category, description, notes, tags, payment_method, date, is_recurring, recurring_interval) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.session.userId, parseFloat(amount), category, description || null, notes || null, tags || null, payment_method || 'cash', date, is_recurring ? 1 : 0, recurring_interval || null);

    // Check budget alert
    const month = date.substring(0, 7);
    const budget = db.prepare('SELECT total_budget FROM budgets WHERE user_id=? AND month=? AND category IS NULL').get(req.session.userId, month);
    if (budget && budget.total_budget > 0) {
      const spent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(req.session.userId, `${month}%`);
      if (spent.total >= budget.total_budget * 0.9) {
        db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'budget_alert', 'Budget Alert', `You've used ${((spent.total / budget.total_budget) * 100).toFixed(0)}% of your monthly budget`);
      }
    }

    const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ expense });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    const expense = db.prepare('SELECT * FROM expenses WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const { amount, category, description, notes, tags, payment_method, date, is_recurring, recurring_interval } = req.body;
    db.prepare(`UPDATE expenses SET amount=COALESCE(?,amount), category=COALESCE(?,category), description=COALESCE(?,description), notes=COALESCE(?,notes), tags=COALESCE(?,tags), payment_method=COALESCE(?,payment_method), date=COALESCE(?,date), is_recurring=COALESCE(?,is_recurring), recurring_interval=COALESCE(?,recurring_interval) WHERE id=?`).run(amount ? parseFloat(amount) : null, category || null, description !== undefined ? description : null, notes !== undefined ? notes : null, tags !== undefined ? tags : null, payment_method || null, date || null, is_recurring !== undefined ? (is_recurring ? 1 : 0) : null, recurring_interval || null, id);

    const updated = db.prepare('SELECT * FROM expenses WHERE id=?').get(id);
    res.json({ expense: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    const expense = db.prepare('SELECT id FROM expenses WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    db.prepare('DELETE FROM expenses WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.stats = (req, res) => {
  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const userId = req.session.userId;

    const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${month}%`);
    const topCat = db.prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 1`).get(userId, `${month}%`);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    res.json({
      totalThisMonth: total.total,
      transactionCount: total.count,
      avgPerDay: total.total / now.getDate(),
      topCategory: topCat?.category || 'N/A',
      topCategoryAmount: topCat?.total || 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};