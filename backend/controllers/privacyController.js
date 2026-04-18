const db = require('../models/db');

// GDPR / DPDP: full data export and account deletion
exports.exportData = (req, res) => {
  try {
    const userId = req.session.userId;
    const user = db.prepare('SELECT id, name, email, phone, currency, monthly_income, plan, created_at FROM users WHERE id=?').get(userId);
    const data = {
      user,
      expenses: db.prepare('SELECT * FROM expenses WHERE user_id=?').all(userId),
      incomes: db.prepare('SELECT * FROM incomes WHERE user_id=?').all(userId),
      budgets: db.prepare('SELECT * FROM budgets WHERE user_id=?').all(userId),
      bills: db.prepare('SELECT * FROM bills WHERE user_id=?').all(userId),
      subscriptions: db.prepare('SELECT * FROM subscriptions WHERE user_id=?').all(userId),
      investments: db.prepare('SELECT * FROM investments WHERE user_id=?').all(userId),
      loans: db.prepare('SELECT * FROM loans WHERE user_id=?').all(userId),
      credit_cards: db.prepare('SELECT id, card_name, bank, credit_limit, outstanding, due_date, reward_points FROM credit_cards WHERE user_id=?').all(userId),
      savings_goals: db.prepare('SELECT * FROM savings_goals WHERE user_id=?').all(userId),
      insurance: db.prepare('SELECT * FROM insurance WHERE user_id=?').all(userId),
      health: db.prepare('SELECT * FROM health WHERE user_id=?').all(userId),
      education: db.prepare('SELECT * FROM education WHERE user_id=?').all(userId),
      travel: db.prepare('SELECT * FROM travel WHERE user_id=?').all(userId),
      shopping: db.prepare('SELECT * FROM purchases WHERE user_id=?').all(userId),
      exported_at: new Date().toISOString()
    };
    res.setHeader('Content-Disposition', `attachment; filename="spendsense-data-export-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteAccount = (req, res) => {
  try {
    const userId = req.session.userId;
    // Delete all user data in order (foreign keys)
    const tables = ['audit_log', 'notifications', 'documents', 'upi_payments', 'transactions', 'bank_accounts',
      'purchases', 'travel', 'health', 'education', 'insurance', 'savings_goals', 'split_participants',
      'split_expenses', 'credit_cards', 'loans', 'investments', 'incomes', 'subscriptions', 'bills',
      'budgets', 'expenses', 'categories', 'payment_orders', 'users'];
    for (const table of tables) {
      try {
        if (table === 'split_participants') {
          const splitIds = db.prepare('SELECT id FROM split_expenses WHERE user_id=?').all(userId).map(r => r.id);
          for (const sid of splitIds) db.prepare('DELETE FROM split_participants WHERE split_id=?').run(sid);
        } else {
          db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
        }
      } catch (_) {}
    }
    req.session.destroy(() => res.json({ message: 'Account and all data permanently deleted' }));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.privacyPolicy = (req, res) => {
  res.json({
    title: 'Privacy Policy — SpendSense Pro',
    lastUpdated: '2024-01-01',
    dataCollected: ['Name, email, phone (for account creation)', 'Financial data (expenses, income, bills, investments) — stored locally', 'Usage data for app improvement'],
    dataNotShared: 'We do not sell or share your personal data with third parties.',
    dataRetention: 'Your data is retained until you delete your account.',
    yourRights: ['Right to access your data (Data Export)', 'Right to delete your data (Delete Account)', 'Right to correct inaccurate data (Profile Settings)'],
    contact: 'privacy@spendsense.app'
  });
};
