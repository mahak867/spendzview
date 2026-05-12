const db = require('../models/db');
const { categorizeDescriptionSync } = require('../services/categorizerService');

const STANDARD_DEVIATION_THRESHOLD = 2;

/**
 * Calculates the standard deviation for numeric values.
 * @param {number[]} values
 * @returns {number}
 */
function standardDeviation(values) {
  if (!values.length) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

exports.query = (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const userId = req.session.userId;
    const q = query.toLowerCase();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    let intent = 'general';
    let results = [];
    let summary = '';
    let recommendations = [];

    if (q.includes('classify merchant') || q.includes('exactly one category') || (q.includes('merchant') && q.includes('category'))) {
      intent = 'merchant_category';
      const merchantMatch = query.match(/merchant\s+"([^"]+)"/i) || query.match(/merchant\s+'([^']+)'/i);
      const merchant = merchantMatch ? merchantMatch[1] : query;
      const classification = categorizeDescriptionSync(merchant);
      results = [{ label: 'Category', value: classification.category, type: 'category' }];
      summary = `${merchant} best matches ${classification.category}.`;
      return res.json({ query, intent, category: classification.category, results, summary, recommendations });
    }

    if (/last month|previous month/.test(q)) {
      intent = 'last_month';
      const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${lastMonth}%`);
      const cats = db.prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 5`).all(userId, `${lastMonth}%`);
      results = [
        { label: 'Total Spent', value: `₹${total.total.toFixed(2)}`, type: 'stat' },
        { label: 'Transactions', value: total.count, type: 'stat' },
        ...cats.map((item) => ({ label: item.category, value: `₹${item.total.toFixed(2)}`, type: 'category' }))
      ];
      summary = `Last month you spent ₹${total.total.toFixed(2)} across ${total.count} transactions.`;
      if (cats.length > 0) recommendations.push(`Your biggest spending was on ${cats[0].category} (₹${cats[0].total.toFixed(2)})`);
    } else if (/unusual|suspicious|anomal|weird/.test(q)) {
      intent = 'unusual';
      const expenses = db.prepare('SELECT amount, description, date FROM expenses WHERE user_id=?').all(userId);
      const avg = expenses.length ? expenses.reduce((sum, item) => sum + item.amount, 0) / expenses.length : 0;
      const deviation = standardDeviation(expenses.map((item) => item.amount));
      const threshold = avg + (deviation * STANDARD_DEVIATION_THRESHOLD);
      const unusual = threshold > 0 ? expenses.filter((item) => item.amount > threshold).sort((left, right) => right.amount - left.amount).slice(0, 10) : [];
      results = unusual.map((item) => ({ label: item.description || 'Expense', value: `₹${item.amount.toFixed(2)} on ${item.date}`, type: 'expense', data: item }));
      summary = threshold > 0 ? `Found ${unusual.length} transactions significantly above your average spending of ₹${avg.toFixed(2)}.` : 'Not enough data to detect unusual transactions.';
      recommendations.push('Review these high-value transactions to ensure they are expected.');
    } else if (/predict|next month|forecast/.test(q)) {
      intent = 'predict';
      const months = [];
      for (let index = 2; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const row = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${month}%`);
        months.push(row.total);
      }
      const avg = months.reduce((sum, value) => sum + value, 0) / months.length;
      const trend = months.length >= 2 ? (months[months.length - 1] - months[0]) / months.length : 0;
      const prediction = Math.max(0, avg + trend);
      results = [
        { label: '3-Month Average', value: `₹${avg.toFixed(2)}`, type: 'stat' },
        { label: 'Monthly Trend', value: `${trend >= 0 ? '+' : ''}₹${trend.toFixed(2)}`, type: 'stat' },
        { label: 'Predicted Next Month', value: `₹${prediction.toFixed(2)}`, type: 'prediction' }
      ];
      summary = `Based on your last 3 months, you are predicted to spend ₹${prediction.toFixed(2)} next month.`;
      recommendations.push(trend > 0 ? `Your spending is trending upward by ₹${trend.toFixed(2)}/month. Consider setting a stricter budget.` : 'Great! Your spending trend is stable or decreasing.');
    } else if (/duplicate|same|repeated/.test(q)) {
      intent = 'duplicate';
      const dupes = db.prepare(`
        SELECT amount, DATE(date) as day, description, COUNT(*) as cnt
        FROM expenses WHERE user_id=?
        GROUP BY amount, DATE(date), description
        HAVING cnt > 1
        ORDER BY cnt DESC LIMIT 10
      `).all(userId);
      results = dupes.map((item) => ({ label: `${item.description || 'No desc'} - ₹${item.amount}`, value: `${item.cnt}x on ${item.day}`, type: 'duplicate' }));
      summary = dupes.length > 0 ? `Found ${dupes.length} potential duplicate expense groups.` : 'No duplicate expenses detected.';
      if (dupes.length > 0) recommendations.push('Review and remove any duplicate entries to keep your records accurate.');
    } else if (/save|saving|reduce|cut|cheaper/.test(q)) {
      intent = 'saving_tips';
      const topCats = db.prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 3`).all(userId, `${thisMonth}%`);
      results = topCats.map((item) => ({ label: item.category, value: `₹${item.total.toFixed(2)} this month`, type: 'category' }));
      summary = `Your top spending categories this month are: ${topCats.map((item) => item.category).join(', ')}.`;
      const tips = {
        Food: 'Try meal prepping at home and limit food delivery to 2x/week',
        Shopping: 'Use a 24-hour rule before making non-essential purchases',
        Entertainment: 'Review streaming subscriptions - are you using all of them?',
        Transport: 'Consider carpooling or monthly transit passes for savings',
        Bills: 'Check if you can switch to better utility plans'
      };
      topCats.forEach((item) => { if (tips[item.category]) recommendations.push(tips[item.category]); });
    } else if (/subscription|recurring|netflix|spotify/.test(q)) {
      intent = 'subscriptions';
      const subs = db.prepare(`SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 ORDER BY amount DESC`).all(userId);
      const totalMonthly = subs.reduce((sum, sub) => sum + (sub.billing_cycle === 'yearly' ? sub.amount / 12 : sub.amount), 0);
      results = subs.map((sub) => ({ label: sub.name, value: `₹${sub.amount} (${sub.billing_cycle})`, type: 'subscription' }));
      summary = `You have ${subs.length} active subscriptions costing ₹${totalMonthly.toFixed(2)}/month.`;
      if (totalMonthly > 2000) recommendations.push('Your subscription spending is high. Consider cancelling unused services.');
      recommendations.push('Check renewal dates to avoid surprise charges.');
    } else if (/budget|over budget|exceed|limit/.test(q)) {
      intent = 'budget_status';
      const overall = db.prepare(`SELECT total_budget FROM budgets WHERE user_id=? AND month=? AND category IS NULL`).get(userId, thisMonth);
      const spent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${thisMonth}%`);
      const catBudgets = db.prepare(`SELECT category, category_budget FROM budgets WHERE user_id=? AND month=? AND category IS NOT NULL`).all(userId, thisMonth);
      results = [{ label: 'Monthly Budget', value: overall ? `₹${overall.total_budget}` : 'Not set', type: 'stat' }, { label: 'Spent So Far', value: `₹${spent.total.toFixed(2)}`, type: 'stat' }];
      catBudgets.forEach((budget) => {
        const catSpent = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ? AND category=?`).get(userId, `${thisMonth}%`, budget.category);
        const pct = budget.category_budget > 0 ? (catSpent.total / budget.category_budget) * 100 : 0;
        results.push({ label: budget.category, value: `₹${catSpent.total.toFixed(2)} / ₹${budget.category_budget} (${pct.toFixed(0)}%)`, type: pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'safe' });
      });
      summary = overall ? `You've spent ₹${spent.total.toFixed(2)} of your ₹${overall.total_budget} monthly budget.` : 'No monthly budget set.';
      if (!overall) recommendations.push('Set a monthly budget to track your spending limits.');
    } else if (/bill|due|payment|overdue/.test(q)) {
      intent = 'bills';
      const today = now.toISOString().split('T')[0];
      const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
      const upcoming = db.prepare(`SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date<=? ORDER BY due_date`).all(userId, in7);
      const overdue = db.prepare(`SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date<?`).all(userId, today);
      results = [
        ...overdue.map((bill) => ({ label: `OVERDUE: ${bill.type}`, value: `₹${bill.amount} (was due ${bill.due_date})`, type: 'danger' })),
        ...upcoming.map((bill) => ({ label: bill.type, value: `₹${bill.amount} due ${bill.due_date}`, type: 'bill' }))
      ];
      summary = `You have ${overdue.length} overdue and ${upcoming.length} upcoming bills.`;
      if (overdue.length > 0) recommendations.push('Pay overdue bills immediately to avoid late fees.');
    } else {
      intent = 'general';
      const totalThis = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id=? AND date LIKE ?`).get(userId, `${thisMonth}%`);
      const topCat = db.prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 1`).get(userId, `${thisMonth}%`);
      const budget = db.prepare(`SELECT total_budget FROM budgets WHERE user_id=? AND month=? AND category IS NULL`).get(userId, thisMonth);
      const subTotal = db.prepare(`SELECT COALESCE(SUM(CASE WHEN billing_cycle='yearly' THEN amount/12 ELSE amount END),0) as monthly FROM subscriptions WHERE user_id=? AND is_active=1`).get(userId);
      const upcomingBills = db.prepare(`SELECT COUNT(*) as cnt FROM bills WHERE user_id=? AND is_paid=0 AND due_date>=?`).get(userId, now.toISOString().split('T')[0]);
      results = [
        { label: 'This Month Spent', value: `₹${totalThis.total.toFixed(2)}`, type: 'stat' },
        { label: 'Transactions', value: totalThis.count, type: 'stat' },
        { label: 'Top Category', value: topCat ? `${topCat.category} (₹${topCat.total.toFixed(2)})` : 'N/A', type: 'stat' },
        { label: 'Monthly Budget', value: budget ? `₹${budget.total_budget}` : 'Not set', type: 'stat' },
        { label: 'Subscription Cost', value: `₹${(subTotal?.monthly || 0).toFixed(2)}/mo`, type: 'stat' },
        { label: 'Upcoming Bills', value: upcomingBills.cnt, type: 'stat' }
      ];
      summary = `This month: ₹${totalThis.total.toFixed(2)} spent. ${upcomingBills.cnt} bills pending.`;
      recommendations.push('Try asking: "Where did I spend most last month?", "Predict next month", or "How can I save money?"');
    }

    res.json({ query, intent, results, summary, recommendations });
  } catch (e) {
    console.error('DeepSearch error:', e);
    res.status(500).json({ error: e.message });
  }
};
