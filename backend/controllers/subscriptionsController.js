const db = require('../models/db');

function toMonthly(amount, cycle) {
  switch (cycle) {
    case 'yearly': return amount / 12;
    case 'quarterly': return amount / 3;
    case 'weekly': return amount * 4.33;
    default: return amount;
  }
}

exports.list = (req, res) => {
  try {
    const { is_active } = req.query;
    let sql = 'SELECT * FROM subscriptions WHERE user_id=?';
    const params = [req.session.userId];
    if (is_active !== undefined) { sql += ' AND is_active=?'; params.push(parseInt(is_active)); }
    sql += ' ORDER BY amount DESC';
    const subscriptions = db.prepare(sql).all(...params);
    res.json({ subscriptions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { name, amount, billing_cycle, next_renewal, category, notes, cancel_url, logo_url } = req.body;
    if (!name || !amount) return res.status(400).json({ error: 'Name and amount required' });
    const validCycles = ['monthly', 'yearly', 'weekly', 'quarterly'];
    const cycle = validCycles.includes(billing_cycle) ? billing_cycle : 'monthly';
    const result = db.prepare(`INSERT INTO subscriptions (user_id, name, amount, billing_cycle, next_renewal, category, cancel_url, logo_url, notes) VALUES (?,?,?,?,?,?,?,?,?)`).run(req.session.userId, name, parseFloat(amount), cycle, next_renewal || null, category || null, cancel_url || null, logo_url || null, notes || null);

    // Reminder if renewing soon
    if (next_renewal) {
      const daysUntil = Math.ceil((new Date(next_renewal) - new Date()) / 86400000);
      if (daysUntil <= 3 && daysUntil >= 0) {
        db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`).run(req.session.userId, 'subscription_renewal', `Subscription Renewal: ${name}`, `${name} renews on ${next_renewal} for ₹${amount}`);
      }
    }

    const sub = db.prepare('SELECT * FROM subscriptions WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ subscription: sub });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    const { name, amount, billing_cycle, next_renewal, category, is_active, notes, cancel_url, logo_url } = req.body;
    db.prepare(`UPDATE subscriptions SET name=COALESCE(?,name), amount=COALESCE(?,amount), billing_cycle=COALESCE(?,billing_cycle), next_renewal=COALESCE(?,next_renewal), category=COALESCE(?,category), is_active=COALESCE(?,is_active), cancel_url=COALESCE(?,cancel_url), logo_url=COALESCE(?,logo_url), notes=COALESCE(?,notes) WHERE id=?`).run(name || null, amount ? parseFloat(amount) : null, billing_cycle || null, next_renewal || null, category || null, is_active !== undefined ? parseInt(is_active) : null, cancel_url || null, logo_url || null, notes || null, id);
    const updated = db.prepare('SELECT * FROM subscriptions WHERE id=?').get(id);
    res.json({ subscription: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    const sub = db.prepare('SELECT id FROM subscriptions WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    db.prepare('DELETE FROM subscriptions WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const active = db.prepare('SELECT * FROM subscriptions WHERE user_id=? AND is_active=1').all(userId);
    const totalMonthly = active.reduce((s, sub) => s + toMonthly(sub.amount, sub.billing_cycle), 0);
    const renewingSoon = active.filter(s => s.next_renewal && s.next_renewal >= today && s.next_renewal <= in7);

    res.json({
      totalMonthly,
      totalYearly: totalMonthly * 12,
      activeCount: active.length,
      inactiveCount: db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE user_id=? AND is_active=0').get(userId).c,
      renewingSoon
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.detectRecurring = (req, res) => {
  try {
    const userId = req.session.userId;
    // Find expenses that appear with same description multiple months
    const recurring = db.prepare(`
      SELECT description, amount, COUNT(DISTINCT strftime('%Y-%m', date)) as months, MAX(date) as last_date
      FROM expenses WHERE user_id=? AND description IS NOT NULL AND description != ''
      GROUP BY description, amount HAVING months >= 2 ORDER BY months DESC LIMIT 10
    `).all(userId);
    res.json({ recurring });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};