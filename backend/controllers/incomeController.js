const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { startDate, endDate, source, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM incomes WHERE user_id=?';
    const params = [req.session.userId];
    if (startDate) { sql += ' AND date>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND date<=?'; params.push(endDate); }
    if (source) { sql += ' AND source LIKE ?'; params.push(`%${source}%`); }
    sql += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const incomes = db.prepare(sql).all(...params);
    const { total } = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM incomes WHERE user_id=?').get(req.session.userId);
    res.json({ incomes, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.add = (req, res) => {
  try {
    const { amount, source, category, description, date, is_recurring, recurring_interval, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
    if (!source) return res.status(400).json({ error: 'Source required' });
    if (!date) return res.status(400).json({ error: 'Date required' });
    const result = db.prepare(
      `INSERT INTO incomes (user_id, amount, source, category, description, date, is_recurring, recurring_interval, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(req.session.userId, parseFloat(amount), source, category || 'Salary', description || null, date, is_recurring ? 1 : 0, recurring_interval || null, notes || null);
    res.status(201).json({ income: db.prepare('SELECT * FROM incomes WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM incomes WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    const { amount, source, category, description, date, notes } = req.body;
    db.prepare(`UPDATE incomes SET amount=COALESCE(?,amount), source=COALESCE(?,source), category=COALESCE(?,category),
      description=COALESCE(?,description), date=COALESCE(?,date), notes=COALESCE(?,notes) WHERE id=?`)
      .run(amount ? parseFloat(amount) : null, source || null, category || null, description !== undefined ? description : null, date || null, notes !== undefined ? notes : null, id);
    res.json({ income: db.prepare('SELECT * FROM incomes WHERE id=?').get(id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM incomes WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM incomes WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const labels = [], incomeData = [], expenseData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const inc = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM incomes WHERE user_id=? AND date LIKE ?`).get(userId, `${m}%`);
      const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${m}%`);
      labels.push(label);
      incomeData.push(parseFloat(inc.total.toFixed(2)));
      expenseData.push(parseFloat(exp.total.toFixed(2)));
    }
    const monthTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM incomes WHERE user_id=? AND date LIKE ?`).get(userId, `${thisMonth}%`);
    const expTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${thisMonth}%`);
    const sources = db.prepare(`SELECT source, SUM(amount) as total FROM incomes WHERE user_id=? AND date LIKE ? GROUP BY source ORDER BY total DESC`).all(userId, `${thisMonth}%`);
    res.json({
      thisMonthIncome: monthTotal.total,
      thisMonthExpense: expTotal.total,
      netCashFlow: monthTotal.total - expTotal.total,
      savingsRate: monthTotal.total > 0 ? ((monthTotal.total - expTotal.total) / monthTotal.total * 100).toFixed(1) : 0,
      sources, labels, incomeData, expenseData
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
