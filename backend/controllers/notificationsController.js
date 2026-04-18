const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { is_read } = req.query;
    let sql = 'SELECT * FROM notifications WHERE user_id=?';
    const params = [req.session.userId];
    if (is_read !== undefined) { sql += ' AND is_read=?'; params.push(parseInt(is_read)); }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    res.json({ notifications: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.markRead = (req, res) => {
  try {
    const { id } = req.params;
    const notif = db.prepare('SELECT id FROM notifications WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(id);
    res.json({ message: 'Marked as read' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.markAllRead = (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.session.userId);
    res.json({ message: 'All marked as read' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.check = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const in3 = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0];
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let created = 0;

    const createIfNew = (type, title, message) => {
      const existing = db.prepare(`SELECT id FROM notifications WHERE user_id=? AND type=? AND title=? AND date(created_at)=?`).get(userId, type, title, today);
      if (!existing) { db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)').run(userId, type, title, message); created++; }
    };

    // Bills due in 3 days
    const dueBills = db.prepare(`SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date BETWEEN ? AND ?`).all(userId, today, in3);
    dueBills.forEach(b => createIfNew('bill_reminder', `Bill Due: ${b.type}`, `₹${b.amount} due on ${b.due_date}`));

    // Overdue bills
    const overdueBills = db.prepare(`SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date < ?`).all(userId, today);
    overdueBills.forEach(b => createIfNew('bill_overdue', `Overdue Bill: ${b.type}`, `₹${b.amount} was due ${b.due_date}`));

    // Subscriptions renewing in 3 days
    const renewingSubs = db.prepare(`SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 AND next_renewal BETWEEN ? AND ?`).all(userId, today, in3);
    renewingSubs.forEach(s => createIfNew('subscription_renewal', `Subscription Renewal: ${s.name}`, `${s.name} renews on ${s.next_renewal} for ₹${s.amount}`));

    // Budget alerts (>80%)
    const catBudgets = db.prepare(`SELECT category, category_budget FROM budgets WHERE user_id=? AND month=? AND category IS NOT NULL`).all(userId, thisMonth);
    catBudgets.forEach(b => {
      const spent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ? AND category=?`).get(userId, `${thisMonth}%`, b.category);
      const pct = b.category_budget > 0 ? (spent.total / b.category_budget) * 100 : 0;
      if (pct >= 80) createIfNew('budget_alert', `Budget Alert: ${b.category}`, `${b.category} budget is ${pct.toFixed(0)}% used (₹${spent.total.toFixed(0)}/₹${b.category_budget})`);
    });

    // Insurance premiums due in 7 days
    const premiums = db.prepare(`SELECT * FROM insurance WHERE user_id=? AND next_premium_date BETWEEN ? AND ?`).all(userId, today, in7);
    premiums.forEach(p => createIfNew('insurance_premium', `Premium Due: ${p.provider}`, `${p.type} premium of ₹${p.premium} due on ${p.next_premium_date}`));

    // Warranty expiring in 7 days
    const warranties = db.prepare(`SELECT * FROM purchases WHERE user_id=? AND warranty_expiry BETWEEN ? AND ?`).all(userId, today, in7);
    warranties.forEach(w => createIfNew('warranty_expiry', `Warranty Expiring: ${w.item_name}`, `Warranty expires on ${w.warranty_expiry}`));

    res.json({ created, message: `${created} new notification(s) generated` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    const notif = db.prepare('SELECT id FROM notifications WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    db.prepare('DELETE FROM notifications WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.unreadCount = (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id=? AND is_read=0').get(req.session.userId);
    res.json({ count: row.count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};