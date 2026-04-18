const db = require('../models/db');

// Indian tax year: April–March
exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    // Tax year: Apr current to Mar next (or Apr prev to Mar current if before April)
    const taxYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const startDate = `${taxYear}-04-01`;
    const endDate = `${taxYear + 1}-03-31`;

    // 80C: LIC, PPF, ELSS, home loan principal, tuition fees, FD (5yr), EPF
    // We track investments marked as 80C-eligible
    const investments = db.prepare(`SELECT * FROM investments WHERE user_id=? AND start_date>=? AND start_date<=?`).all(userId, startDate, endDate);
    const elss = investments.filter(i => i.type === 'ELSS' || i.type === 'PPF' || i.type === 'NPS');
    const elssAmount = elss.reduce((s, i) => s + i.invested_amount, 0);

    // Education (80E): interest on education loan
    const eduLoans = db.prepare(`SELECT * FROM loans WHERE user_id=? AND type='Education Loan'`).all(userId);
    const eduLoanInterest = eduLoans.reduce((s, l) => {
      const interest = l.outstanding * l.interest_rate / 100;
      return s + interest;
    }, 0);

    // 80D: health insurance premiums
    const healthInsurance = db.prepare(`SELECT COALESCE(SUM(premium),0) as total FROM insurance WHERE user_id=? AND type LIKE '%Health%'`).get(userId);

    // HRA: rent paid (from bills)
    const rentBills = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM bills WHERE user_id=? AND type='Rent' AND due_date>=? AND due_date<=?`).get(userId, startDate, endDate);

    // Education expenses (80E education)
    const education = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM education WHERE user_id=? AND date>=? AND date<=?`).get(userId, startDate, endDate);

    // Gross income
    const grossIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM incomes WHERE user_id=? AND date>=? AND date<=?`).get(userId, startDate, endDate);

    const sec80C = Math.min(elssAmount, 150000);
    const sec80D = Math.min(healthInsurance.total, 25000);
    const sec80E = eduLoanInterest;
    const hraDeduction = Math.min(rentBills.total, grossIncome.total * 0.4);
    const stdDeduction = 50000;
    const totalDeductions = sec80C + sec80D + sec80E + hraDeduction + stdDeduction;
    const taxableIncome = Math.max(0, grossIncome.total - totalDeductions);
    const estimatedTax = computeTax(taxableIncome);

    res.json({
      taxYear: `${taxYear}-${taxYear + 1}`,
      grossIncome: grossIncome.total,
      deductions: { sec80C, sec80D, sec80E, hra: hraDeduction, standardDeduction: stdDeduction, total: totalDeductions },
      taxableIncome,
      estimatedTax,
      elssInvestments: elss,
      rentPaid: rentBills.total,
      healthInsurancePremium: healthInsurance.total,
      educationLoanInterest: eduLoanInterest
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

function computeTax(income) {
  // New regime FY2024-25
  if (income <= 300000) return 0;
  if (income <= 600000) return (income - 300000) * 0.05;
  if (income <= 900000) return 15000 + (income - 600000) * 0.10;
  if (income <= 1200000) return 45000 + (income - 900000) * 0.15;
  if (income <= 1500000) return 90000 + (income - 1200000) * 0.20;
  return 150000 + (income - 1500000) * 0.30;
}
