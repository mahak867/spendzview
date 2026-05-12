const db = require('../models/db');

const CATEGORY_HINTS = {
  Food: /swiggy|zomato|eat|cafe|restaurant|coffee|tea|biryani|pizza|burger|bakery|dine/i,
  Transport: /uber|ola|rapido|metro|train|flight|air|fuel|petrol|diesel|taxi|cab|bus|parking|toll/i,
  Shopping: /amazon|flipkart|myntra|ajio|nykaa|meesho|store|mall|shop|mart|retail/i,
  Bills: /airtel|jio|bsnl|electricity|water|gas|broadband|internet|bill|recharge|utility/i,
  Health: /apollo|pharmacy|medical|clinic|hospital|doctor|health|lab/i,
  Education: /school|college|university|course|tuition|udemy|coursera|book|exam/i,
  Entertainment: /movie|cinema|spotify|youtube|bookmyshow|gaming|playstation|xbox/i,
  Subscription: /netflix|prime|hotstar|subscription|renewal|saas|membership|adobe|chatgpt|github/i,
  Insurance: /insurance|policy|premium|lic|assure|cover/i,
  Income: /salary|bonus|refund|interest|credited|cashback|dividend/i,
  Travel: /hotel|resort|makemytrip|goibibo|airbnb|trip|holiday/i
};

/**
 * Infer a category from a merchant-like text snippet.
 * @param {string} text - Merchant or narration text.
 * @returns {string} Best-fit category.
 */
function inferCategoryFromMerchant(text) {
  const sample = String(text || '').trim();
  if (!sample) {
    return 'Other';
  }

  const entry = Object.entries(CATEGORY_HINTS).find(([, pattern]) => pattern.test(sample));
  return entry ? entry[0] : 'Other';
}

/**
 * Run the in-app DeepSearch analysis for a user query.
 * @param {number} userId - Authenticated user ID.
 * @param {string} query - Natural language query.
 * @returns {{query:string,intent:string,results:Array,summary:string,recommendations:string[]}} DeepSearch response.
 */
function runDeepSearchQuery(userId, query) {
  const q = String(query || '').trim().toLowerCase();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  let intent = 'general';
  let results = [];
  let summary = '';
  const recommendations = [];

  if (/categori[sz]e|category for merchant|merchant category|unknown merchant/.test(q)) {
    intent = 'merchant_category';
    const quoted = String(query || '').match(/"([^"]+)"|'([^']+)'/);
    const merchantText = quoted ? (quoted[1] || quoted[2]) : String(query || '').replace(/categori[sz]e|category for merchant|unknown merchant|merchant/ig, ' ');
    const category = inferCategoryFromMerchant(merchantText);
    results = [{ label: 'Suggested Category', value: category, type: 'category' }];
    summary = `${merchantText.trim() || 'This merchant'} is best classified as ${category}.`;
    recommendations.push(category === 'Other' ? 'Review the merchant manually and update your category map if needed.' : `You can auto-file similar transactions under ${category}.`);
  } else if (/last month|previous month/.test(q)) {
    intent = 'last_month';
    const total = db.prepare('SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id=? AND date LIKE ?').get(userId, `${lastMonth}%`);
    const cats = db.prepare('SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 5').all(userId, `${lastMonth}%`);
    results = [
      { label: 'Total Spent', value: `₹${total.total.toFixed(2)}`, type: 'stat' },
      { label: 'Transactions', value: total.count, type: 'stat' },
      ...cats.map((category) => ({ label: category.category, value: `₹${category.total.toFixed(2)}`, type: 'category' }))
    ];
    summary = `Last month you spent ₹${total.total.toFixed(2)} across ${total.count} transactions.`;
    if (cats.length > 0) {
      recommendations.push(`Your biggest spending was on ${cats[0].category} (₹${cats[0].total.toFixed(2)}).`);
    }
  } else if (/unusual|suspicious|anomal|weird/.test(q)) {
    intent = 'unusual';
    const averageRow = db.prepare('SELECT AVG(amount) as avg FROM expenses WHERE user_id=?').get(userId);
    const threshold = (averageRow?.avg || 0) * 2;
    const unusual = db.prepare('SELECT * FROM expenses WHERE user_id=? AND amount > ? ORDER BY amount DESC LIMIT 10').all(userId, threshold);
    results = unusual.map((expense) => ({ label: expense.description || expense.category, value: `₹${expense.amount.toFixed(2)} on ${expense.date}`, type: 'expense', data: expense }));
    summary = threshold > 0 ? `Found ${unusual.length} transactions significantly above your average spending of ₹${(averageRow?.avg || 0).toFixed(2)}.` : 'Not enough data to detect unusual transactions.';
    recommendations.push('Review these high-value transactions to ensure they are expected.');
  } else if (/predict|next month|forecast/.test(q)) {
    intent = 'predict';
    const months = [];
    for (let index = 2; index >= 0; index -= 1) {
      const cursor = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const row = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?').get(userId, `${month}%`);
      months.push(row.total);
    }
    const average = months.reduce((sum, value) => sum + value, 0) / months.length;
    const trend = months.length >= 2 ? (months[months.length - 1] - months[0]) / months.length : 0;
    const prediction = Math.max(0, average + trend);
    results = [
      { label: '3-Month Average', value: `₹${average.toFixed(2)}`, type: 'stat' },
      { label: 'Monthly Trend', value: `${trend >= 0 ? '+' : ''}₹${trend.toFixed(2)}`, type: 'stat' },
      { label: 'Predicted Next Month', value: `₹${prediction.toFixed(2)}`, type: 'prediction' }
    ];
    summary = `Based on your last 3 months, you are predicted to spend ₹${prediction.toFixed(2)} next month.`;
    recommendations.push(trend > 0 ? `Your spending is trending upward by ₹${trend.toFixed(2)}/month. Consider setting a stricter budget.` : 'Great! Your spending trend is stable or decreasing.');
  } else if (/duplicate|same|repeated/.test(q)) {
    intent = 'duplicate';
    const duplicates = db.prepare(`
      SELECT amount, DATE(date) as day, description, COUNT(*) as cnt
      FROM expenses WHERE user_id=?
      GROUP BY amount, DATE(date), description
      HAVING cnt > 1
      ORDER BY cnt DESC LIMIT 10
    `).all(userId);
    results = duplicates.map((duplicate) => ({ label: `${duplicate.description || 'No desc'} - ₹${duplicate.amount}`, value: `${duplicate.cnt}x on ${duplicate.day}`, type: 'duplicate' }));
    summary = duplicates.length > 0 ? `Found ${duplicates.length} potential duplicate expense groups.` : 'No duplicate expenses detected.';
    if (duplicates.length > 0) {
      recommendations.push('Review and remove any duplicate entries to keep your records accurate.');
    }
  } else if (/save|saving|reduce|cut|cheaper/.test(q)) {
    intent = 'saving_tips';
    const topCategories = db.prepare('SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 3').all(userId, `${thisMonth}%`);
    results = topCategories.map((category) => ({ label: category.category, value: `₹${category.total.toFixed(2)} this month`, type: 'category' }));
    summary = `Your top spending categories this month are: ${topCategories.map((category) => category.category).join(', ')}.`;
    const tips = {
      Food: 'Try meal prepping at home and limit food delivery to 2x/week.',
      Shopping: 'Use a 24-hour rule before making non-essential purchases.',
      Entertainment: 'Review streaming subscriptions - are you using all of them?',
      Transport: 'Consider carpooling or monthly transit passes for savings.',
      Bills: 'Check if you can switch to better utility plans.'
    };
    topCategories.forEach((category) => {
      if (tips[category.category]) {
        recommendations.push(tips[category.category]);
      }
    });
  } else if (/subscription|recurring|netflix|spotify/.test(q)) {
    intent = 'subscriptions';
    const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 ORDER BY amount DESC').all(userId);
    const totalMonthly = subscriptions.reduce((sum, subscription) => sum + (subscription.billing_cycle === 'yearly' ? subscription.amount / 12 : subscription.amount), 0);
    results = subscriptions.map((subscription) => ({ label: subscription.name, value: `₹${subscription.amount} (${subscription.billing_cycle})`, type: 'subscription' }));
    summary = `You have ${subscriptions.length} active subscriptions costing ₹${totalMonthly.toFixed(2)}/month.`;
    if (totalMonthly > 2000) {
      recommendations.push('Your subscription spending is high. Consider cancelling unused services.');
    }
    recommendations.push('Check renewal dates to avoid surprise charges.');
  } else if (/budget|over budget|exceed|limit/.test(q)) {
    intent = 'budget_status';
    const overall = db.prepare('SELECT total_budget FROM budgets WHERE user_id=? AND month=? AND category IS NULL').get(userId, thisMonth);
    const spent = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ?').get(userId, `${thisMonth}%`);
    const categoryBudgets = db.prepare('SELECT category, category_budget FROM budgets WHERE user_id=? AND month=? AND category IS NOT NULL').all(userId, thisMonth);
    results = [
      { label: 'Monthly Budget', value: overall ? `₹${overall.total_budget}` : 'Not set', type: 'stat' },
      { label: 'Spent So Far', value: `₹${spent.total.toFixed(2)}`, type: 'stat' }
    ];
    categoryBudgets.forEach((budget) => {
      const categorySpent = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date LIKE ? AND category=?').get(userId, `${thisMonth}%`, budget.category);
      const percent = budget.category_budget > 0 ? (categorySpent.total / budget.category_budget) * 100 : 0;
      results.push({ label: budget.category, value: `₹${categorySpent.total.toFixed(2)} / ₹${budget.category_budget} (${percent.toFixed(0)}%)`, type: percent >= 100 ? 'danger' : percent >= 80 ? 'warning' : 'safe' });
    });
    summary = overall ? `You've spent ₹${spent.total.toFixed(2)} of your ₹${overall.total_budget} monthly budget.` : 'No monthly budget set.';
    if (!overall) {
      recommendations.push('Set a monthly budget to track your spending limits.');
    }
  } else if (/bill|due|payment|overdue/.test(q)) {
    intent = 'bills';
    const today = now.toISOString().split('T')[0];
    const inSevenDays = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const upcoming = db.prepare('SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date<=? ORDER BY due_date').all(userId, inSevenDays);
    const overdue = db.prepare('SELECT * FROM bills WHERE user_id=? AND is_paid=0 AND due_date<?').all(userId, today);
    results = [
      ...overdue.map((bill) => ({ label: `OVERDUE: ${bill.type}`, value: `₹${bill.amount} (was due ${bill.due_date})`, type: 'danger' })),
      ...upcoming.map((bill) => ({ label: bill.type, value: `₹${bill.amount} due ${bill.due_date}`, type: 'bill' }))
    ];
    summary = `You have ${overdue.length} overdue and ${upcoming.length} upcoming bills.`;
    if (overdue.length > 0) {
      recommendations.push('Pay overdue bills immediately to avoid late fees.');
    }
  } else {
    intent = 'general';
    const totalThisMonth = db.prepare('SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id=? AND date LIKE ?').get(userId, `${thisMonth}%`);
    const topCategory = db.prepare('SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND date LIKE ? GROUP BY category ORDER BY total DESC LIMIT 1').get(userId, `${thisMonth}%`);
    const budget = db.prepare('SELECT total_budget FROM budgets WHERE user_id=? AND month=? AND category IS NULL').get(userId, thisMonth);
    const subscriptionTotal = db.prepare("SELECT COALESCE(SUM(CASE WHEN billing_cycle='yearly' THEN amount/12 ELSE amount END),0) as monthly FROM subscriptions WHERE user_id=? AND is_active=1").get(userId);
    const upcomingBills = db.prepare('SELECT COUNT(*) as cnt FROM bills WHERE user_id=? AND is_paid=0 AND due_date>=?').get(userId, now.toISOString().split('T')[0]);
    results = [
      { label: 'This Month Spent', value: `₹${totalThisMonth.total.toFixed(2)}`, type: 'stat' },
      { label: 'Transactions', value: totalThisMonth.count, type: 'stat' },
      { label: 'Top Category', value: topCategory ? `${topCategory.category} (₹${topCategory.total.toFixed(2)})` : 'N/A', type: 'stat' },
      { label: 'Monthly Budget', value: budget ? `₹${budget.total_budget}` : 'Not set', type: 'stat' },
      { label: 'Subscription Cost', value: `₹${(subscriptionTotal?.monthly || 0).toFixed(2)}/mo`, type: 'stat' },
      { label: 'Upcoming Bills', value: upcomingBills.cnt, type: 'stat' }
    ];
    summary = `This month: ₹${totalThisMonth.total.toFixed(2)} spent. ${upcomingBills.cnt} bills pending.`;
    recommendations.push('Try asking: "Where did I spend most last month?", "Predict next month", or "How can I save money?"');
  }

  return { query, intent, results, summary, recommendations };
}

module.exports = {
  inferCategoryFromMerchant,
  runDeepSearchQuery
};
