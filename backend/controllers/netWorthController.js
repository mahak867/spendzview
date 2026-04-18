const db = require('../models/db');

// Net Worth = Assets - Liabilities
exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;

    // Assets
    const bankBalances = db.prepare('SELECT COALESCE(SUM(balance),0) as total FROM bank_accounts WHERE user_id=?').get(userId);
    const savingsGoals = db.prepare('SELECT COALESCE(SUM(saved_amount),0) as total FROM savings_goals WHERE user_id=?').get(userId);
    const investments = db.prepare('SELECT COALESCE(SUM(current_value),0) as total FROM investments WHERE user_id=?').get(userId);
    const totalAssets = bankBalances.total + savingsGoals.total + investments.total;

    // Liabilities
    const loans = db.prepare('SELECT COALESCE(SUM(outstanding),0) as total FROM loans WHERE user_id=?').get(userId);
    const creditCards = db.prepare('SELECT COALESCE(SUM(outstanding),0) as total FROM credit_cards WHERE user_id=? AND is_active=1').get(userId);
    const totalLiabilities = loans.total + creditCards.total;

    const netWorth = totalAssets - totalLiabilities;

    // History (last 6 months using savings as proxy - simplified)
    const labels = [], netWorthHistory = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      // Approximate net worth at each month end
      const incomeUpTo = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM incomes WHERE user_id=? AND date<=?`).get(userId, `${m}-31`);
      const expUpTo = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id=? AND date<=?`).get(userId, `${m}-31`);
      const netFlow = incomeUpTo.total - expUpTo.total;
      labels.push(label);
      netWorthHistory.push(parseFloat((investments.total + Math.max(0, netFlow)).toFixed(2)));
    }

    res.json({
      assets: {
        bankBalances: bankBalances.total,
        savingsGoals: savingsGoals.total,
        investments: investments.total,
        total: totalAssets
      },
      liabilities: {
        loans: loans.total,
        creditCards: creditCards.total,
        total: totalLiabilities
      },
      netWorth,
      labels,
      netWorthHistory
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
