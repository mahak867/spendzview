const db = require('../models/db');

// Amortization schedule helper
function generateSchedule(principal, annualRate, tenureMonths, startDate) {
  const monthlyRate = annualRate / 12 / 100;
  const emi = monthlyRate > 0
    ? (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) / (Math.pow(1 + monthlyRate, tenureMonths) - 1)
    : principal / tenureMonths;

  const schedule = [];
  let balance = principal;
  const start = startDate ? new Date(startDate) : new Date();

  for (let i = 1; i <= Math.min(tenureMonths, 360); i++) {
    const interest = balance * monthlyRate;
    const principalPart = emi - interest;
    balance = Math.max(0, balance - principalPart);
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    schedule.push({
      installment: i,
      emi: parseFloat(emi.toFixed(2)),
      principal: parseFloat(principalPart.toFixed(2)),
      interest: parseFloat(interest.toFixed(2)),
      balance: parseFloat(balance.toFixed(2)),
      dueDate: dueDate.toISOString().split('T')[0]
    });
    if (balance <= 0) break;
  }
  return { emi: parseFloat(emi.toFixed(2)), schedule };
}

exports.list = (req, res) => {
  try {
    const loans = db.prepare('SELECT * FROM loans WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
    res.json({ loans });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.add = (req, res) => {
  try {
    const { loan_name, lender, type, principal, outstanding, interest_rate, emi_amount, tenure_months, start_date, next_emi_date, account_number, notes } = req.body;
    if (!loan_name || !type || !principal || !interest_rate) return res.status(400).json({ error: 'Name, type, principal and interest rate required' });
    const result = db.prepare(
      `INSERT INTO loans (user_id, loan_name, lender, type, principal, outstanding, interest_rate, emi_amount, tenure_months, start_date, next_emi_date, account_number, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.session.userId, loan_name, lender||null, type, parseFloat(principal), parseFloat(outstanding||principal), parseFloat(interest_rate), parseFloat(emi_amount||0), tenure_months?parseInt(tenure_months):null, start_date||null, next_emi_date||null, account_number||null, notes||null);
    res.status(201).json({ loan: db.prepare('SELECT * FROM loans WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM loans WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    const { loan_name, lender, outstanding, interest_rate, emi_amount, next_emi_date, notes } = req.body;
    db.prepare(`UPDATE loans SET loan_name=COALESCE(?,loan_name), lender=COALESCE(?,lender), outstanding=COALESCE(?,outstanding),
      interest_rate=COALESCE(?,interest_rate), emi_amount=COALESCE(?,emi_amount), next_emi_date=COALESCE(?,next_emi_date), notes=COALESCE(?,notes) WHERE id=?`)
      .run(loan_name||null, lender||null, outstanding?parseFloat(outstanding):null, interest_rate?parseFloat(interest_rate):null, emi_amount?parseFloat(emi_amount):null, next_emi_date||null, notes!==undefined?notes:null, id);
    res.json({ loan: db.prepare('SELECT * FROM loans WHERE id=?').get(id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM loans WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM loans WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.schedule = (req, res) => {
  try {
    const { id } = req.params;
    const loan = db.prepare('SELECT * FROM loans WHERE id=? AND user_id=?').get(id, req.session.userId);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    const { emi, schedule } = generateSchedule(loan.outstanding, loan.interest_rate, loan.tenure_months || 60, loan.next_emi_date || loan.start_date);
    res.json({ loan, emi, schedule });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const loans = db.prepare('SELECT * FROM loans WHERE user_id=?').all(userId);
    const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);
    const totalEMI = loans.reduce((s, l) => s + l.emi_amount, 0);
    const totalPrincipal = loans.reduce((s, l) => s + l.principal, 0);
    res.json({ loans, totalOutstanding, totalEMI, totalPrincipal, loanCount: loans.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
