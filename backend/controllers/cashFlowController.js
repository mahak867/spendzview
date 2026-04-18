const db = require('../models/db');

// Cash flow calendar — next 30 days of events
exports.upcoming = (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const todayStr = today.toISOString().split('T')[0];
    const in30Str = in30.toISOString().split('T')[0];

    const events = [];

    // Unpaid bills
    const bills = db.prepare(`SELECT id, type as name, amount, due_date as date, 'bill' as type FROM bills WHERE user_id=? AND is_paid=0 AND due_date>=? AND due_date<=? ORDER BY due_date`).all(userId, todayStr, in30Str);
    bills.forEach(b => events.push({ ...b, impact: 'expense', color: '#f59e0b' }));

    // Subscriptions renewing
    const subs = db.prepare(`SELECT id, name, amount, next_renewal as date, 'subscription' as type FROM subscriptions WHERE user_id=? AND is_active=1 AND next_renewal>=? AND next_renewal<=? ORDER BY next_renewal`).all(userId, todayStr, in30Str);
    subs.forEach(s => events.push({ ...s, impact: 'expense', color: '#8b5cf6' }));

    // Loan EMIs
    const loans = db.prepare(`SELECT id, loan_name as name, emi_amount as amount, next_emi_date as date, 'emi' as type FROM loans WHERE user_id=? AND next_emi_date>=? AND next_emi_date<=? ORDER BY next_emi_date`).all(userId, todayStr, in30Str);
    loans.forEach(l => events.push({ ...l, impact: 'expense', color: '#ef4444' }));

    // Recurring incomes
    const incomes = db.prepare(`SELECT id, source as name, amount, date, 'income' as type FROM incomes WHERE user_id=? AND is_recurring=1 ORDER BY date DESC LIMIT 5`).all(userId);
    // Project next occurrence
    incomes.forEach(inc => {
      const last = new Date(inc.date);
      const next = new Date(last);
      next.setMonth(next.getMonth() + 1);
      const nextStr = next.toISOString().split('T')[0];
      if (nextStr >= todayStr && nextStr <= in30Str) {
        events.push({ ...inc, date: nextStr, impact: 'income', color: '#10b981' });
      }
    });

    // Insurance premiums due
    const insurance = db.prepare(`SELECT id, type as name, premium as amount, next_premium_date as date, 'insurance' as type FROM insurance WHERE user_id=? AND next_premium_date>=? AND next_premium_date<=? ORDER BY next_premium_date`).all(userId, todayStr, in30Str);
    insurance.forEach(i => events.push({ ...i, impact: 'expense', color: '#64748b' }));

    // Credit card due dates
    const cards = db.prepare(`SELECT id, card_name as name, outstanding as amount, due_date as date, 'credit_card' as type FROM credit_cards WHERE user_id=? AND is_active=1 AND due_date>=? AND due_date<=? ORDER BY due_date`).all(userId, todayStr, in30Str);
    cards.forEach(c => events.push({ ...c, impact: 'expense', color: '#ec4899' }));

    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    const totalIncoming = events.filter(e => e.impact === 'income').reduce((s, e) => s + e.amount, 0);
    const totalOutgoing = events.filter(e => e.impact === 'expense').reduce((s, e) => s + e.amount, 0);

    res.json({ events, totalIncoming, totalOutgoing, netCashFlow: totalIncoming - totalOutgoing });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
