/**
 * Recurring Expenses Cron Job
 * Runs daily at midnight to auto-generate recurring expenses, bills, and income entries.
 */
const cron = require('node-cron');
const db = require('../models/db');

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function addYears(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

function getNextDate(date, interval) {
  switch (interval) {
    case 'daily':   return addDays(date, 1);
    case 'weekly':  return addDays(date, 7);
    case 'monthly': return addMonths(date, 1);
    case 'yearly':  return addYears(date, 1);
    default:        return addMonths(date, 1);
  }
}

function processRecurringExpenses() {
  const today = new Date().toISOString().split('T')[0];
  const recurring = db.prepare(`SELECT * FROM expenses WHERE is_recurring=1 AND recurring_interval IS NOT NULL`).all();
  let created = 0;

  for (const exp of recurring) {
    const next = getNextDate(exp.date, exp.recurring_interval);
    if (next > today) continue;

    // Check if already created for next period
    const exists = db.prepare(`SELECT id FROM expenses WHERE user_id=? AND description=? AND date=? AND amount=? AND is_recurring=0`)
      .get(exp.user_id, exp.description, next, exp.amount);
    if (exists) continue;

    db.prepare(`INSERT INTO expenses (user_id, amount, category, description, notes, tags, payment_method, date, is_recurring, recurring_interval)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(exp.user_id, exp.amount, exp.category, exp.description, exp.notes, exp.tags, exp.payment_method, next, 0, null);

    // Update original recurring entry date to next
    db.prepare('UPDATE expenses SET date=? WHERE id=?').run(next, exp.id);

    // Notify user
    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`)
      .run(exp.user_id, 'recurring', '🔄 Recurring Expense', `Auto-added: ${exp.description || exp.category} ₹${exp.amount} for ${next}`);
    created++;
  }

  return created;
}

function processRecurringIncomes() {
  const today = new Date().toISOString().split('T')[0];
  const recurring = db.prepare(`SELECT * FROM incomes WHERE is_recurring=1 AND recurring_interval IS NOT NULL`).all();
  let created = 0;

  for (const inc of recurring) {
    const next = getNextDate(inc.date, inc.recurring_interval);
    if (next > today) continue;

    const exists = db.prepare(`SELECT id FROM incomes WHERE user_id=? AND source=? AND date=? AND amount=?`)
      .get(inc.user_id, inc.source, next, inc.amount);
    if (exists) continue;

    db.prepare(`INSERT INTO incomes (user_id, amount, source, category, description, date, is_recurring, recurring_interval, notes)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(inc.user_id, inc.amount, inc.source, inc.category, inc.description, next, 0, null, inc.notes);

    db.prepare('UPDATE incomes SET date=? WHERE id=?').run(next, inc.id);
    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`)
      .run(inc.user_id, 'recurring', '💰 Income Recorded', `Auto-added: ${inc.source} ₹${inc.amount} for ${next}`);
    created++;
  }

  return created;
}

function processBillReminders() {
  const today = new Date();
  const in3Days = new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0];
  const in7Days = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

  const upcoming = db.prepare(`SELECT * FROM bills WHERE is_paid=0 AND due_date>=? AND due_date<=?`).all(today.toISOString().split('T')[0], in7Days);
  for (const bill of upcoming) {
    const days = Math.ceil((new Date(bill.due_date) - today) / 86400000);
    const exists = db.prepare(`SELECT id FROM notifications WHERE user_id=? AND type='bill_reminder' AND message LIKE ? AND DATE(created_at)=?`)
      .get(bill.user_id, `%bill #${bill.id}%`, today.toISOString().split('T')[0]);
    if (!exists) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`)
        .run(bill.user_id, 'bill_reminder', `🧾 Bill Due ${days === 0 ? 'Today' : `in ${days} day(s)`}`, `${bill.type} ₹${bill.amount} due on ${bill.due_date} (bill #${bill.id})`);
    }
  }
}

function processSubscriptionReminders() {
  const today = new Date();
  const in3Days = new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0];

  const renewing = db.prepare(`SELECT * FROM subscriptions WHERE is_active=1 AND next_renewal<=?`).all(in3Days);
  for (const sub of renewing) {
    const exists = db.prepare(`SELECT id FROM notifications WHERE user_id=? AND type='subscription_reminder' AND message LIKE ? AND DATE(created_at)=?`)
      .get(sub.user_id, `%subscription #${sub.id}%`, today.toISOString().split('T')[0]);
    if (!exists) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`)
        .run(sub.user_id, 'subscription_reminder', `🔄 Subscription Renewing`, `${sub.name} ₹${sub.amount} renews on ${sub.next_renewal} (subscription #${sub.id})`);
    }
  }
}

function processLoanEMIReminders() {
  const today = new Date();
  const in5Days = new Date(today.getTime() + 5 * 86400000).toISOString().split('T')[0];

  const loans = db.prepare(`SELECT * FROM loans WHERE next_emi_date<=?`).all(in5Days);
  for (const loan of loans) {
    const exists = db.prepare(`SELECT id FROM notifications WHERE user_id=? AND type='emi_reminder' AND message LIKE ? AND DATE(created_at)=?`)
      .get(loan.user_id, `%loan #${loan.id}%`, today.toISOString().split('T')[0]);
    if (!exists) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`)
        .run(loan.user_id, 'emi_reminder', `🏦 EMI Due Soon`, `${loan.loan_name} EMI ₹${loan.emi_amount} due on ${loan.next_emi_date} (loan #${loan.id})`);
    }
  }
}

function runAllJobs() {
  try {
    const exp = processRecurringExpenses();
    const inc = processRecurringIncomes();
    processBillReminders();
    processSubscriptionReminders();
    processLoanEMIReminders();
    if (exp + inc > 0) console.log(`[Cron] Auto-generated: ${exp} expenses, ${inc} incomes`);
  } catch (e) {
    console.error('[Cron] Job error:', e.message);
  }
}

// Schedule: daily at midnight
cron.schedule('0 0 * * *', runAllJobs, { timezone: 'Asia/Kolkata' });

// Also run on startup (after a small delay)
setTimeout(runAllJobs, 5000);

console.log('[Cron] Recurring job scheduler started');

module.exports = { runAllJobs };
