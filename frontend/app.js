/* ============================================================
   SpendSense Pro — app.js
   Main frontend application logic
   ============================================================ */

// ===== GLOBALS =====
let currentUser = null;
let currentSection = 'dashboard';
let selectedPlan = 'pro_monthly';
let chartsRegistry = {};
let obStep = 1;

const fmt = (n, sym = '₹') => `${sym}${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().split('T')[0];

// ===== API HELPER =====
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `API Error ${r.status}`);
  return data;
}
const GET = url => api('GET', url);
const POST = (url, b) => api('POST', url, b);
const PUT = (url, b) => api('PUT', url, b);
const DEL = url => api('DELETE', url);

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const tc = document.getElementById('toastContainer');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

// ===== MODAL =====
function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('active'); } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('active'); } }

// ===== NAVIGATION =====
function showSection(name) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById(`section-${name}`);
  if (section) section.classList.add('active');
  const nav = document.querySelector(`[data-section="${name}"]`);
  if (nav) nav.classList.add('active');
  currentSection = name;
  const breadcrumbs = {
    dashboard: 'Dashboard', expenses: 'Expenses', budget: 'Budget', bills: 'Bills', subscriptions: 'Subscriptions',
    shopping: 'Shopping', travel: 'Travel', health: 'Health', education: 'Education', insurance: 'Insurance',
    savings: 'Savings Goals', banking: 'Banking', upi: 'UPI Payments', deepsearch: 'DeepSearch AI',
    reports: 'Reports & Analytics', settings: 'Settings', income: 'Income', investments: 'Investment Portfolio',
    loans: 'Loans & EMI', creditcards: 'Credit Cards', networth: 'Net Worth', cashflow: 'Cash Flow Calendar',
    tax: 'Tax Planner', split: 'Split Expenses'
  };
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = breadcrumbs[name] || name;
  // Lazy load section data
  const loaders = {
    dashboard: loadDashboard, expenses: loadExpenses, budget: loadBudget, bills: loadBills,
    subscriptions: loadSubscriptions, shopping: loadShopping, travel: loadTravel, health: loadHealth,
    education: loadEducation, insurance: loadInsurance, savings: loadSavings, banking: loadBanking,
    upi: loadUPI, deepsearch: () => {}, reports: loadReports, settings: loadSettings,
    income: loadIncome, investments: loadInvestments, loans: loadLoans, creditcards: loadCreditCards,
    networth: loadNetWorth, cashflow: loadCashFlow, tax: loadTax, split: loadSplit
  };
  if (loaders[name]) loaders[name]();
  // Close sidebar on mobile
  if (window.innerWidth < 768) closeSidebar();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => showSection(item.dataset.section));
});

// ===== SIDEBAR =====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  if (overlay) overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}

// ===== THEME =====
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  const d = document.getElementById('btnDarkTheme');
  const l = document.getElementById('btnLightTheme');
  if (d) d.classList.toggle('btn-primary', theme === 'dark');
  if (l) l.classList.toggle('btn-primary', theme === 'light');
}

// ===== INIT =====
async function init() {
  try {
    const data = await GET('/api/auth/me');
    currentUser = data.user;
    updateUserUI(currentUser);
    setTheme(localStorage.getItem('theme') || 'dark');
    showSection('dashboard');
    loadNotifications();
    loadPlanStatus();
    if (!currentUser.onboarding_done) {
      setTimeout(() => openModal('onboardingModal'), 500);
    }
  } catch (e) {
    window.location.href = '/';
  }
}

function updateUserUI(user) {
  if (!user) return;
  const name = user.name || 'User';
  const initial = name.charAt(0).toUpperCase();
  ['navUserAvatar', 'settingsAvatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initial;
  });
  ['navUserName', 'settingsAvatarName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = name;
  });
  ['settingsName', 'settingsEmail', 'settingsPhone', 'settingsIncome', 'settingsCurrency'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'settingsName') el.value = user.name || '';
    if (id === 'settingsEmail') el.value = user.email || '';
    if (id === 'settingsPhone') el.value = user.phone || '';
    if (id === 'settingsIncome') el.value = user.monthly_income || '';
    if (id === 'settingsCurrency') el.value = user.currency || 'INR';
  });
}

// ===== PLAN STATUS =====
async function loadPlanStatus() {
  try {
    const d = await GET('/api/payments/status');
    const badge = document.getElementById('planBadge');
    const label = document.getElementById('currentPlanLabel');
    const expLabel = document.getElementById('planExpiresLabel');
    const planBadge2 = document.getElementById('currentPlanBadge');
    if (d.plan && d.plan !== 'free') {
      if (badge) { badge.textContent = d.plan.toUpperCase().replace('_', ' '); badge.classList.remove('hidden'); }
      if (label) label.textContent = d.plan.charAt(0).toUpperCase() + d.plan.slice(1).replace('_', ' ') + ' Plan';
      if (expLabel && d.planExpiresAt) expLabel.textContent = `Expires: ${fmtDate(d.planExpiresAt)}`;
      if (planBadge2) { planBadge2.textContent = d.plan.toUpperCase(); planBadge2.className = 'text-xs px-2 py-1 rounded-full bg-indigo-900 text-indigo-300 font-semibold'; }
    }
  } catch (e) {}
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const [analytics, savings, billData, incSummary, nwData, loanSummary] = await Promise.allSettled([
      GET('/api/analytics/summary'),
      GET('/api/savings/summary'),
      GET('/api/bills?limit=50'),
      GET('/api/income/summary'),
      GET('/api/networth/summary'),
      GET('/api/loans/summary')
    ]);

    if (analytics.status === 'fulfilled') {
      const a = analytics.value;
      setEl('dashTotalExpenses', fmt(a.totalExpenses));
      const budgetLeft = (a.totalBudget || 0) - (a.totalExpenses || 0);
      setEl('dashBudgetRemaining', fmt(Math.max(0, budgetLeft)));
      const budgetPct = a.totalBudget > 0 ? Math.min(100, (a.totalExpenses / a.totalBudget) * 100) : 0;
      setStyle('dashBudgetBar', 'width', `${budgetPct}%`);
      // Upcoming bills count
      const unpaid = (billData.value?.bills || []).filter(b => !b.is_paid);
      const in7 = unpaid.filter(b => {
        const days = (new Date(b.due_date) - new Date()) / 86400000;
        return days >= 0 && days <= 7;
      });
      setEl('dashUpcomingBills', in7.length);
      renderDashCharts(a);
    }

    if (savings.status === 'fulfilled') {
      const s = savings.value;
      setEl('dashSavingsTotal', fmt(s.totalSaved));
      setEl('dashSavingsGoals', `${s.totalGoals} goal${s.totalGoals !== 1 ? 's' : ''}`);
    }

    if (incSummary.status === 'fulfilled') {
      const i = incSummary.value;
      setEl('dashTotalIncome', fmt(i.thisMonthIncome));
      setEl('dashSavingsRate', `Savings rate: ${i.savingsRate}%`);
    }

    if (nwData.status === 'fulfilled') {
      setEl('dashNetWorth', fmt(nwData.value.netWorth));
    }

    if (loanSummary.status === 'fulfilled') {
      const l = loanSummary.value;
      setEl('dashEMI', fmt(l.totalEMI));
      setEl('dashLoanCount', `${l.loanCount} active loan${l.loanCount !== 1 ? 's' : ''}`);
    }

    // Investments
    try {
      const inv = await GET('/api/investments/portfolio');
      setEl('dashInvestments', fmt(inv.totalCurrent));
      const gain = inv.gainPct;
      const gainEl = document.getElementById('dashInvestmentGain');
      if (gainEl) {
        gainEl.textContent = `${gain >= 0 ? '+' : ''}${gain}%`;
        gainEl.className = `text-xs mt-1 ${parseFloat(gain) >= 0 ? 'text-emerald-500' : 'text-red-400'}`;
      }
    } catch (_) {}

  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setStyle(id, prop, val) { const el = document.getElementById(id); if (el) el.style[prop] = val; }

function renderDashCharts(a) {
  destroyChart('dashSpendChart');
  destroyChart('dashCatChart');
  const ctx1 = document.getElementById('dashSpendChart');
  if (ctx1 && a.monthlyTrend) {
    chartsRegistry['dashSpendChart'] = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: a.monthlyTrend.map(m => m.month),
        datasets: [{ label: 'Spending', data: a.monthlyTrend.map(m => m.total), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', tension: 0.4, fill: true, pointRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
    });
  }
  const ctx2 = document.getElementById('dashCatChart');
  if (ctx2 && a.categoryBreakdown) {
    const cats = a.categoryBreakdown.slice(0, 6);
    chartsRegistry['dashCatChart'] = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels: cats.map(c => c.category), datasets: [{ data: cats.map(c => c.total), backgroundColor: ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'] }] },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } } }
    });
  }
}

function destroyChart(id) {
  if (chartsRegistry[id]) { chartsRegistry[id].destroy(); delete chartsRegistry[id]; }
}

// ===== EXPENSES =====
let expensesData = [];
async function loadExpenses() {
  try {
    const filters = buildExpenseFilters();
    const d = await GET(`/api/expenses?${filters}`);
    expensesData = d.expenses || [];
    renderExpensesTable(expensesData);
    setEl('expTotal', fmt(d.total));
    setEl('expCount', d.expenses?.length || 0);
  } catch (e) { showToast(e.message, 'error'); }
}

function buildExpenseFilters() {
  const params = new URLSearchParams();
  const from = document.getElementById('expDateFrom')?.value;
  const to = document.getElementById('expDateTo')?.value;
  const cat = document.getElementById('expCategoryFilter')?.value;
  const q = document.getElementById('expSearchInput')?.value;
  if (from) params.set('startDate', from);
  if (to) params.set('endDate', to);
  if (cat) params.set('category', cat);
  if (q) params.set('search', q);
  params.set('limit', '200');
  return params.toString();
}

function renderExpensesTable(expenses) {
  const tbody = document.querySelector('#expensesTable tbody');
  if (!tbody) return;
  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">💸</div>No expenses found</td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td>${fmtDate(e.date)}</td>
      <td><span class="truncate-text" style="max-width:200px">${e.description || '—'}</span></td>
      <td><span class="badge-cat">${e.category}</span></td>
      <td>${e.payment_method || '—'}</td>
      <td class="amount-negative font-semibold">${fmt(e.amount)}</td>
      <td>${e.tags ? `<span class="text-xs text-slate-500">${e.tags}</span>` : '—'}</td>
      <td>
        <button class="btn-icon text-sm" onclick="editExpense(${e.id})">✏️</button>
        <button class="btn-icon text-sm" onclick="deleteExpense(${e.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

function openExpenseModal(id = null) {
  document.getElementById('expenseEditId').value = id || '';
  document.getElementById('expenseModalTitle').textContent = id ? 'Edit Expense' : 'Add Expense';
  if (!id) {
    ['expAmount','expDescription','expNotes','expTags'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    document.getElementById('expDate').value = today();
    document.getElementById('expCategoryInput').value = '';
    document.getElementById('expPaymentInput').value = 'cash';
    document.getElementById('expRecurring').checked = false;
    document.getElementById('expIntervalDiv').classList.add('hidden');
  }
  openModal('expenseModal');
}

async function editExpense(id) {
  const exp = expensesData.find(e => e.id === id);
  if (!exp) return;
  document.getElementById('expenseEditId').value = id;
  document.getElementById('expenseModalTitle').textContent = 'Edit Expense';
  document.getElementById('expAmount').value = exp.amount;
  document.getElementById('expDate').value = exp.date;
  document.getElementById('expCategoryInput').value = exp.category;
  document.getElementById('expDescription').value = exp.description || '';
  document.getElementById('expPaymentInput').value = exp.payment_method || 'cash';
  document.getElementById('expNotes').value = exp.notes || '';
  document.getElementById('expTags').value = exp.tags || '';
  const rec = document.getElementById('expRecurring');
  if (rec) { rec.checked = !!exp.is_recurring; toggleRecurringField(); }
  openModal('expenseModal');
}

async function saveExpense() {
  const btn = document.getElementById('saveExpenseBtn');
  const id = document.getElementById('expenseEditId').value;
  const amount = parseFloat(document.getElementById('expAmount').value);
  const category = document.getElementById('expCategoryInput').value;
  const date = document.getElementById('expDate').value;
  if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
  if (!category) return showToast('Select a category', 'error');
  if (!date) return showToast('Enter a date', 'error');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const body = {
      amount, category, date,
      description: document.getElementById('expDescription').value,
      payment_method: document.getElementById('expPaymentInput').value,
      notes: document.getElementById('expNotes').value,
      tags: document.getElementById('expTags').value,
      is_recurring: document.getElementById('expRecurring').checked ? 1 : 0,
      recurring_interval: document.getElementById('expInterval').value
    };
    if (id) await PUT(`/api/expenses/${id}`, body);
    else await POST('/api/expenses', body);
    showToast(id ? 'Expense updated' : 'Expense added');
    closeModal('expenseModal');
    loadExpenses();
    if (currentSection === 'dashboard') loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save Expense'; }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    await DEL(`/api/expenses/${id}`);
    showToast('Expense deleted');
    loadExpenses();
    if (currentSection === 'dashboard') loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}

function toggleRecurringField() {
  const div = document.getElementById('expIntervalDiv');
  const checked = document.getElementById('expRecurring').checked;
  if (div) div.classList.toggle('hidden', !checked);
}

// ===== INCOME =====
let incomeData = [];
async function loadIncome() {
  try {
    const [listData, summary] = await Promise.all([GET('/api/income'), GET('/api/income/summary')]);
    incomeData = listData.incomes || [];
    renderIncomeTable(incomeData);
    setEl('incomeThisMonth', fmt(summary.thisMonthIncome));
    setEl('incomeExpThisMonth', fmt(summary.thisMonthExpense));
    setEl('incomeNetFlow', fmt(summary.netCashFlow));
    setEl('incomeSavingsRate', `${summary.savingsRate}%`);
    // Income vs Expense chart
    destroyChart('incomeVsExpChart');
    const ctx = document.getElementById('incomeVsExpChart');
    if (ctx) {
      chartsRegistry['incomeVsExpChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: summary.labels || [],
          datasets: [
            { label: 'Income', data: summary.incomeData || [], backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
            { label: 'Expenses', data: summary.expenseData || [], backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 }
          ]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
      });
    }
    // Sources list
    const srcEl = document.getElementById('incomeSourcesList');
    if (srcEl) {
      if (!summary.sources?.length) { srcEl.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">No income this month</p>'; }
      else {
        srcEl.innerHTML = summary.sources.map(s => `
          <div class="flex justify-between items-center py-2 border-b border-slate-700">
            <span class="text-sm text-slate-300">${s.source}</span>
            <span class="font-semibold text-emerald-400">${fmt(s.total)}</span>
          </div>`).join('');
      }
    }
  } catch (e) { showToast(e.message, 'error'); }
}

function renderIncomeTable(incomes) {
  const tbody = document.querySelector('#incomeTable tbody');
  if (!tbody) return;
  if (!incomes.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">💰</div>No income records yet</td></tr>`; return; }
  tbody.innerHTML = incomes.map(i => `
    <tr>
      <td>${fmtDate(i.date)}</td>
      <td class="font-medium text-white">${i.source}</td>
      <td>${i.category || '—'}</td>
      <td>${i.description || '—'}</td>
      <td class="amount-positive font-semibold">${fmt(i.amount)}</td>
      <td>
        <button class="btn-icon text-sm" onclick="deleteIncome(${i.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

function openIncomeModal() {
  document.getElementById('incomeEditId').value = '';
  document.getElementById('incomeModalTitle').textContent = 'Add Income';
  document.getElementById('incomeAmount').value = '';
  document.getElementById('incomeDate').value = today();
  document.getElementById('incomeSource').value = '';
  document.getElementById('incomeDescription').value = '';
  document.getElementById('incomeRecurring').checked = false;
  openModal('incomeModal');
}

async function saveIncome() {
  const amount = parseFloat(document.getElementById('incomeAmount').value);
  const date = document.getElementById('incomeDate').value;
  const source = document.getElementById('incomeSource').value;
  if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
  if (!source) return showToast('Enter income source', 'error');
  if (!date) return showToast('Select a date', 'error');
  try {
    const rec = document.getElementById('incomeRecurring').checked;
    await POST('/api/income', { amount, date, source, category: document.getElementById('incomeCat').value, description: document.getElementById('incomeDescription').value, is_recurring: rec ? 1 : 0, recurring_interval: document.getElementById('incomeInterval').value });
    showToast('Income added');
    closeModal('incomeModal');
    loadIncome();
    if (currentSection === 'dashboard') loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteIncome(id) {
  if (!confirm('Delete this income record?')) return;
  try { await DEL(`/api/income/${id}`); showToast('Deleted'); loadIncome(); } catch (e) { showToast(e.message, 'error'); }
}

document.getElementById('incomeRecurring')?.addEventListener('change', function() {
  const el = document.getElementById('incomeInterval');
  if (el) el.style.display = this.checked ? 'block' : 'none';
});

// ===== INVESTMENTS =====
let investmentsData = [];
async function loadInvestments() {
  try {
    const portfolio = await GET('/api/investments/portfolio');
    investmentsData = portfolio.investments || [];
    setEl('invTotalInvested', fmt(portfolio.totalInvested));
    setEl('invCurrentValue', fmt(portfolio.totalCurrent));
    const gainEl = document.getElementById('invGainLoss');
    const pctEl = document.getElementById('invGainPct');
    if (gainEl) {
      gainEl.textContent = fmt(Math.abs(portfolio.totalGainLoss));
      gainEl.className = `text-xl font-bold ${portfolio.totalGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
    if (pctEl) {
      pctEl.textContent = `${portfolio.totalGainLoss >= 0 ? '+' : '-'}${Math.abs(portfolio.gainPct)}%`;
      pctEl.className = `text-xl font-bold ${portfolio.totalGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
    renderInvestmentsTable(investmentsData);
    // Portfolio type chart
    const byType = portfolio.byType || {};
    destroyChart('investmentTypeChart');
    const ctx = document.getElementById('investmentTypeChart');
    if (ctx) {
      chartsRegistry['investmentTypeChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType).map(v => v.current), backgroundColor: ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899'] }] },
        options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } } }
      });
    }
    // Top holdings
    const topEl = document.getElementById('topHoldingsList');
    if (topEl) {
      const sorted = [...investmentsData].sort((a, b) => (b.current_value || 0) - (a.current_value || 0)).slice(0, 5);
      topEl.innerHTML = sorted.length ? sorted.map(i => {
        const gain = (i.current_value || 0) - i.invested_amount;
        const pct = i.invested_amount > 0 ? (gain / i.invested_amount * 100).toFixed(1) : 0;
        return `<div class="flex justify-between items-center py-2 border-b border-slate-700">
          <div><div class="text-sm font-medium text-white">${i.name}</div><div class="text-xs text-slate-500">${i.type}</div></div>
          <div class="text-right"><div class="font-semibold text-cyan-400">${fmt(i.current_value || 0)}</div>
          <div class="text-xs ${parseFloat(pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}">${pct >= 0 ? '+' : ''}${pct}%</div></div>
        </div>`;
      }).join('') : '<p class="text-slate-500 text-sm text-center py-4">No investments yet</p>';
    }
  } catch (e) { showToast(e.message, 'error'); }
}

function renderInvestmentsTable(invs) {
  const tbody = document.querySelector('#investmentsTable tbody');
  if (!tbody) return;
  if (!invs.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">📈</div>No investments yet</td></tr>`; return; }
  tbody.innerHTML = invs.map(i => {
    const gain = (i.current_value || 0) - i.invested_amount;
    const pct = i.invested_amount > 0 ? (gain / i.invested_amount * 100).toFixed(1) : 0;
    return `<tr>
      <td class="font-medium text-white">${i.name}</td>
      <td><span class="badge-cat">${i.type}</span></td>
      <td>${fmt(i.invested_amount)}</td>
      <td class="text-cyan-400 font-semibold">${fmt(i.current_value || 0)}</td>
      <td class="${gain >= 0 ? 'amount-positive' : 'amount-negative'} font-semibold">${gain >= 0 ? '+' : ''}${fmt(Math.abs(gain))} (${pct}%)</td>
      <td class="text-slate-400">${i.platform || '—'}</td>
      <td>
        <button class="btn-icon text-sm" onclick="deleteInvestment(${i.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function openInvestmentModal() {
  document.getElementById('investmentEditId').value = '';
  document.getElementById('investmentModalTitle').textContent = 'Add Investment';
  ['invName','invInvested','invCurrentValue','invUnits','invPlatform','invFolio','invSipAmount','invSipDate','invNotes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('invStartDate').value = today();
  document.getElementById('invMaturityDate').value = '';
  openModal('investmentModal');
}

async function saveInvestment() {
  const name = document.getElementById('invName').value;
  const type = document.getElementById('invType').value;
  const invested_amount = parseFloat(document.getElementById('invInvested').value);
  if (!name || !type || !invested_amount) return showToast('Name, type and amount required', 'error');
  try {
    await POST('/api/investments', {
      name, type, invested_amount,
      current_value: document.getElementById('invCurrentValue').value || invested_amount,
      units: document.getElementById('invUnits').value,
      platform: document.getElementById('invPlatform').value,
      folio_number: document.getElementById('invFolio').value,
      sip_amount: document.getElementById('invSipAmount').value,
      sip_date: document.getElementById('invSipDate').value,
      start_date: document.getElementById('invStartDate').value,
      maturity_date: document.getElementById('invMaturityDate').value,
      notes: document.getElementById('invNotes').value
    });
    showToast('Investment added');
    closeModal('investmentModal');
    loadInvestments();
    if (currentSection === 'dashboard') loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteInvestment(id) {
  if (!confirm('Delete this investment?')) return;
  try { await DEL(`/api/investments/${id}`); showToast('Deleted'); loadInvestments(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== LOANS =====
let loansData = [];
async function loadLoans() {
  try {
    const summary = await GET('/api/loans/summary');
    loansData = summary.loans || [];
    setEl('loanCount', loansData.length);
    setEl('loanOutstanding', fmt(summary.totalOutstanding));
    setEl('loanMonthlyEMI', fmt(summary.totalEMI));
    setEl('loanOriginalPrincipal', fmt(summary.totalPrincipal));
    renderLoanCards(loansData);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderLoanCards(loans) {
  const container = document.getElementById('loansList');
  if (!container) return;
  if (!loans.length) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>No loans added</p></div>`; return; }
  container.innerHTML = loans.map(l => {
    const paidPct = l.principal > 0 ? Math.max(0, Math.min(100, ((l.principal - l.outstanding) / l.principal * 100))).toFixed(0) : 0;
    return `<div class="loan-card">
      <div class="flex justify-between items-start mb-2">
        <div>
          <div class="font-semibold text-white">${l.loan_name}</div>
          <div class="text-xs text-slate-500">${l.lender || l.type} · ${l.interest_rate}% p.a.</div>
        </div>
        <div class="text-right">
          <div class="font-bold text-red-400">${fmt(l.outstanding)}</div>
          <div class="text-xs text-slate-500">outstanding</div>
        </div>
      </div>
      <div class="loan-progress"><div class="loan-progress-bar" style="width:${paidPct}%"></div></div>
      <div class="flex justify-between text-xs text-slate-500 mt-1 mb-3">
        <span>${paidPct}% paid</span><span>EMI: ${fmt(l.emi_amount)}/mo</span>
        ${l.next_emi_date ? `<span>Next: ${fmtDate(l.next_emi_date)}</span>` : ''}
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary btn-sm flex-1" onclick="showLoanSchedule(${l.id})">📅 EMI Schedule</button>
        <button class="btn-icon text-sm" onclick="deleteLoan(${l.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

async function showLoanSchedule(id) {
  try {
    const d = await GET(`/api/loans/${id}/schedule`);
    const tbody = document.querySelector('#loanScheduleTable tbody');
    if (!tbody) return;
    tbody.innerHTML = d.schedule.slice(0, 36).map(s => `
      <tr>
        <td>${s.installment}</td>
        <td>${fmtDate(s.dueDate)}</td>
        <td class="font-semibold">${fmt(s.emi)}</td>
        <td class="text-indigo-400">${fmt(s.principal)}</td>
        <td class="text-amber-400">${fmt(s.interest)}</td>
        <td>${fmt(s.balance)}</td>
      </tr>`).join('');
    document.getElementById('loanScheduleArea').classList.remove('hidden');
    document.getElementById('loanScheduleArea').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { showToast(e.message, 'error'); }
}

function openLoanModal() {
  document.getElementById('loanEditId').value = '';
  document.getElementById('loanModalTitle').textContent = 'Add Loan';
  ['loanName','loanPrincipal','loanOutstanding','loanRate','loanTenure','loanEMI','loanLender','loanNotes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('loanStartDate').value = today();
  document.getElementById('loanNextEMI').value = '';
  openModal('loanModal');
}

async function saveLoan() {
  const loan_name = document.getElementById('loanName').value;
  const principal = parseFloat(document.getElementById('loanPrincipal').value);
  const interest_rate = parseFloat(document.getElementById('loanRate').value);
  const type = document.getElementById('loanType').value;
  if (!loan_name || !principal || !interest_rate) return showToast('Name, principal and rate required', 'error');
  try {
    await POST('/api/loans', {
      loan_name, type, principal,
      outstanding: document.getElementById('loanOutstanding').value || principal,
      interest_rate,
      emi_amount: document.getElementById('loanEMI').value,
      tenure_months: document.getElementById('loanTenure').value,
      lender: document.getElementById('loanLender').value,
      start_date: document.getElementById('loanStartDate').value,
      next_emi_date: document.getElementById('loanNextEMI').value,
      notes: document.getElementById('loanNotes').value
    });
    showToast('Loan added');
    closeModal('loanModal');
    loadLoans();
    if (currentSection === 'dashboard') loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteLoan(id) {
  if (!confirm('Delete this loan?')) return;
  try { await DEL(`/api/loans/${id}`); showToast('Deleted'); loadLoans(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== CREDIT CARDS =====
let creditCardsData = [];
async function loadCreditCards() {
  try {
    const d = await GET('/api/credit-cards/summary');
    creditCardsData = d.cards || [];
    setEl('ccTotalLimit', fmt(d.totalLimit));
    setEl('ccTotalOutstanding', fmt(d.totalOutstanding));
    setEl('ccUtilization', `${d.utilizationPct}%`);
    setEl('ccRewardPoints', (d.totalPoints || 0).toLocaleString());
    renderCreditCards(creditCardsData);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderCreditCards(cards) {
  const container = document.getElementById('creditCardsList');
  if (!container) return;
  if (!cards.length) { container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">💳</div><p>No credit cards added</p></div>`; return; }
  container.innerHTML = cards.map(c => {
    const util = c.credit_limit > 0 ? (c.outstanding / c.credit_limit * 100).toFixed(0) : 0;
    const daysLeft = c.due_date ? Math.ceil((new Date(c.due_date) - new Date()) / 86400000) : null;
    return `<div class="cc-card">
      <div class="cc-card-bank">${c.bank}</div>
      <div class="cc-card-number">•••• •••• •••• ${c.last4 || '????'}</div>
      <div class="font-semibold text-white">${c.card_name}</div>
      <div class="cc-card-utilization"><div class="cc-card-utilization-bar" style="width:${Math.min(100,util)}%"></div></div>
      <div class="flex justify-between text-xs mt-1">
        <span class="text-slate-400">${fmt(c.outstanding)} / ${fmt(c.credit_limit)}</span>
        <span class="${util > 30 ? 'text-amber-400' : 'text-emerald-400'}">${util}% used</span>
      </div>
      ${daysLeft !== null ? `<div class="text-xs mt-2 ${daysLeft <= 3 ? 'text-red-400' : 'text-slate-400'}">Due: ${fmtDate(c.due_date)} ${daysLeft <= 0 ? '(OVERDUE!)' : `(${daysLeft}d)`}</div>` : ''}
      <div class="text-xs text-slate-500 mt-1">🎁 ${c.reward_points?.toLocaleString() || 0} points</div>
      <div class="flex gap-2 mt-3">
        <button class="btn-secondary btn-sm flex-1" onclick="deleteCreditCard(${c.id})">🗑️ Remove</button>
      </div>
    </div>`;
  }).join('');
}

function openCreditCardModal() {
  document.getElementById('ccEditId').value = '';
  document.getElementById('ccModalTitle').textContent = 'Add Credit Card';
  ['ccName','ccBank','ccLast4','ccLimit','ccOutstanding','ccPoints','ccNotes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('ccDueDate').value = '';
  document.getElementById('ccStatementDate').value = '';
  openModal('creditCardModal');
}

async function saveCreditCard() {
  const card_name = document.getElementById('ccName').value;
  const bank = document.getElementById('ccBank').value;
  if (!card_name || !bank) return showToast('Card name and bank required', 'error');
  try {
    await POST('/api/credit-cards', {
      card_name, bank,
      last4: document.getElementById('ccLast4').value,
      credit_limit: document.getElementById('ccLimit').value,
      outstanding: document.getElementById('ccOutstanding').value,
      due_date: document.getElementById('ccDueDate').value,
      statement_date: document.getElementById('ccStatementDate').value,
      reward_points: document.getElementById('ccPoints').value,
      notes: document.getElementById('ccNotes').value
    });
    showToast('Credit card added');
    closeModal('creditCardModal');
    loadCreditCards();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteCreditCard(id) {
  if (!confirm('Remove this credit card?')) return;
  try { await DEL(`/api/credit-cards/${id}`); showToast('Removed'); loadCreditCards(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== NET WORTH =====
async function loadNetWorth() {
  try {
    const d = await GET('/api/networth/summary');
    setEl('nwNetWorth', fmt(d.netWorth));
    setEl('nwAssets', fmt(d.assets.total));
    setEl('nwLiabilities', fmt(d.liabilities.total));
    const assetsEl = document.getElementById('nwAssetsBreakdown');
    if (assetsEl) {
      assetsEl.innerHTML = `
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">Bank Balances</span><span class="text-emerald-400 font-semibold">${fmt(d.assets.bankBalances)}</span></div>
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">Savings Goals</span><span class="text-emerald-400 font-semibold">${fmt(d.assets.savingsGoals)}</span></div>
        <div class="flex justify-between py-2"><span class="text-slate-300 text-sm">Investments</span><span class="text-emerald-400 font-semibold">${fmt(d.assets.investments)}</span></div>`;
    }
    const liabEl = document.getElementById('nwLiabilitiesBreakdown');
    if (liabEl) {
      liabEl.innerHTML = `
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">Loans</span><span class="text-red-400 font-semibold">${fmt(d.liabilities.loans)}</span></div>
        <div class="flex justify-between py-2"><span class="text-slate-300 text-sm">Credit Cards</span><span class="text-red-400 font-semibold">${fmt(d.liabilities.creditCards)}</span></div>`;
    }
    destroyChart('netWorthChart');
    const ctx = document.getElementById('netWorthChart');
    if (ctx) {
      chartsRegistry['netWorthChart'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: d.labels || [],
          datasets: [{
            label: 'Net Worth', data: d.netWorthHistory || [],
            borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)',
            tension: 0.4, fill: true, pointRadius: 4
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
      });
    }
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== CASH FLOW =====
async function loadCashFlow() {
  try {
    const d = await GET('/api/cashflow/upcoming');
    setEl('cfIncoming', fmt(d.totalIncoming));
    setEl('cfOutgoing', fmt(d.totalOutgoing));
    const netEl = document.getElementById('cfNet');
    if (netEl) {
      netEl.textContent = fmt(d.netCashFlow);
      netEl.className = `text-xl font-bold ${d.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
    const timeline = document.getElementById('cashFlowTimeline');
    if (timeline) {
      if (!d.events?.length) { timeline.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No upcoming events in the next 30 days</p></div>`; return; }
      const typeIcons = { bill: '🧾', subscription: '🔄', emi: '🏦', income: '💰', insurance: '🛡️', credit_card: '💳' };
      const today = new Date().toISOString().split('T')[0];
      let lastDate = '';
      timeline.innerHTML = d.events.map(e => {
        const dateHeader = e.date !== lastDate ? `<div class="text-xs font-semibold text-slate-500 mt-3 mb-1 uppercase tracking-wide">${fmtDate(e.date)} ${e.date === today ? '— TODAY' : ''}</div>` : '';
        lastDate = e.date;
        return `${dateHeader}<div class="cf-event" style="border-left-color: ${e.color}">
          <span class="cf-icon">${typeIcons[e.type] || '📌'}</span>
          <div class="cf-details">
            <div class="cf-name">${e.name}</div>
            <div class="cf-date">${e.type.replace('_', ' ')}</div>
          </div>
          <div class="cf-amount ${e.impact === 'income' ? 'text-emerald-400' : 'text-red-400'}">${e.impact === 'income' ? '+' : '-'}${fmt(e.amount)}</div>
        </div>`;
      }).join('');
    }
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== TAX =====
async function loadTax() {
  try {
    const d = await GET('/api/tax/summary');
    setEl('taxYear', `Financial Year: ${d.taxYear}`);
    setEl('taxTaxableIncome', fmt(d.taxableIncome));
    setEl('taxEstimated', fmt(d.estimatedTax));
    const rate = d.grossIncome > 0 ? (d.estimatedTax / d.grossIncome * 100).toFixed(1) : 0;
    setEl('taxEffectiveRate', `${rate}%`);
    const incEl = document.getElementById('taxIncomeSection');
    if (incEl) {
      incEl.innerHTML = `
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">Gross Income</span><span class="text-white font-semibold">${fmt(d.grossIncome)}</span></div>
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">Total Deductions</span><span class="text-emerald-400 font-semibold">- ${fmt(d.deductions.total)}</span></div>
        <div class="flex justify-between py-2"><span class="text-slate-300 text-sm font-semibold">Taxable Income</span><span class="text-amber-400 font-bold">${fmt(d.taxableIncome)}</span></div>`;
    }
    const dedEl = document.getElementById('taxDeductionsSection');
    if (dedEl) {
      dedEl.innerHTML = `
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">Standard Deduction</span><span class="text-emerald-400 font-semibold">${fmt(d.deductions.standardDeduction)}</span></div>
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">80C (ELSS/PPF/NPS)</span><span class="text-emerald-400 font-semibold">${fmt(d.deductions.sec80C)} <span class="text-xs text-slate-500">/ ₹1.5L max</span></span></div>
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">80D (Health Ins.)</span><span class="text-emerald-400 font-semibold">${fmt(d.deductions.sec80D)}</span></div>
        <div class="flex justify-between py-2 border-b border-slate-700"><span class="text-slate-300 text-sm">80E (Edu. Loan Int.)</span><span class="text-emerald-400 font-semibold">${fmt(d.deductions.sec80E)}</span></div>
        <div class="flex justify-between py-2"><span class="text-slate-300 text-sm">HRA</span><span class="text-emerald-400 font-semibold">${fmt(d.deductions.hra)}</span></div>`;
    }
  } catch (e) { console.error('Tax load error:', e); }
}

// ===== SPLIT EXPENSES =====
let splitData = [];
async function loadSplit() {
  try {
    const d = await GET('/api/split');
    splitData = d.splits || [];
    renderSplitList(splitData);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderSplitList(splits) {
  const container = document.getElementById('splitList');
  if (!container) return;
  if (!splits.length) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><p>No split expenses yet</p></div>`; return; }
  container.innerHTML = splits.map(s => {
    const unpaid = s.participants.filter(p => !p.is_paid);
    const unpaidTotal = unpaid.reduce((acc, p) => acc + p.share, 0);
    return `<div class="split-card">
      <div class="flex justify-between items-start mb-2">
        <div>
          <div class="font-semibold text-white">${s.title}</div>
          <div class="text-xs text-slate-500">${fmtDate(s.date)} · ${s.group_name || 'Group'}</div>
        </div>
        <div class="text-right">
          <div class="font-bold text-white">${fmt(s.total_amount)}</div>
          <div class="text-xs ${unpaid.length > 0 ? 'text-amber-400' : 'text-emerald-400'}">${unpaid.length > 0 ? `${unpaid.length} pending (${fmt(unpaidTotal)})` : '✓ All settled'}</div>
        </div>
      </div>
      <div class="space-y-1">
        ${s.participants.map(p => `
          <div class="flex items-center justify-between text-sm py-1 border-b border-slate-700/50">
            <span class="${p.is_paid ? 'text-slate-500 line-through' : 'text-slate-300'}">${p.name}</span>
            <div class="flex items-center gap-2">
              <span class="${p.is_paid ? 'text-slate-500' : 'text-amber-400'} font-semibold">${fmt(p.share)}</span>
              ${!p.is_paid ? `<button onclick="markSplitPaid(${p.id})" class="text-xs text-emerald-400 hover:underline">Mark paid</button>` : '<span class="text-xs text-emerald-500">✓ Paid</span>'}
            </div>
          </div>`).join('')}
      </div>
      <button class="btn-icon text-sm mt-3" onclick="deleteSplit(${s.id})">🗑️ Delete</button>
    </div>`;
  }).join('');
}

function openSplitModal() {
  ['splitTitle','splitAmount','splitGroup','splitNotes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('splitDate').value = today();
  openModal('splitModal');
}

function addSplitParticipant() {
  const container = document.getElementById('splitParticipants');
  const row = document.createElement('div');
  row.className = 'flex gap-2 items-center split-participant-row';
  row.innerHTML = `<input type="text" class="form-input flex-1" placeholder="Name" data-field="name">
    <input type="number" class="form-input w-32" placeholder="Share ₹" data-field="share">
    <button type="button" onclick="this.closest('.split-participant-row').remove()" class="text-red-400 text-lg">✕</button>`;
  container.appendChild(row);
}

async function saveSplit() {
  const title = document.getElementById('splitTitle').value;
  const total_amount = parseFloat(document.getElementById('splitAmount').value);
  const date = document.getElementById('splitDate').value;
  if (!title || !total_amount || !date) return showToast('Title, amount and date required', 'error');
  const rows = document.querySelectorAll('.split-participant-row');
  const participants = Array.from(rows).map(r => ({
    name: r.querySelector('[data-field="name"]')?.value,
    share: parseFloat(r.querySelector('[data-field="share"]')?.value || 0)
  })).filter(p => p.name && p.share > 0);
  if (participants.length < 2) return showToast('Add at least 2 participants', 'error');
  try {
    await POST('/api/split', {
      title, total_amount, date,
      group_name: document.getElementById('splitGroup').value,
      notes: document.getElementById('splitNotes').value,
      participants
    });
    showToast('Split expense created');
    closeModal('splitModal');
    loadSplit();
  } catch (e) { showToast(e.message, 'error'); }
}

async function markSplitPaid(participantId) {
  try {
    await POST(`/api/split/participant/${participantId}/paid`, {});
    showToast('Marked as paid');
    loadSplit();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteSplit(id) {
  if (!confirm('Delete this split expense?')) return;
  try { await DEL(`/api/split/${id}`); showToast('Deleted'); loadSplit(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== GLOBAL SEARCH =====
let searchDebounce;
async function globalSearch(q) {
  clearTimeout(searchDebounce);
  const resultsEl = document.getElementById('globalSearchResults');
  if (!resultsEl) return;
  if (!q || q.length < 2) { resultsEl.classList.add('hidden'); return; }
  searchDebounce = setTimeout(async () => {
    try {
      const d = await GET(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      if (!d.results?.length) { resultsEl.innerHTML = '<div class="p-3 text-center text-slate-500 text-sm">No results found</div>'; resultsEl.classList.remove('hidden'); return; }
      resultsEl.innerHTML = d.results.map(r => `
        <div class="search-item" onclick="navigateToResult('${r.module}', ${r.id})">
          <span class="s-icon">${r.icon}</span>
          <div>
            <div class="s-title">${r.title}</div>
            <div class="s-sub">${r.subtitle || r.module} · ${fmtDate(r.date)}</div>
          </div>
          <span class="s-amount">${r.amount ? fmt(r.amount) : ''}</span>
        </div>`).join('');
      resultsEl.classList.remove('hidden');
    } catch (e) {}
  }, 300);
}

function hideGlobalSearch() {
  const el = document.getElementById('globalSearchResults');
  if (el) el.classList.add('hidden');
}

function navigateToResult(module, id) {
  hideGlobalSearch();
  document.getElementById('globalSearchInput').value = '';
  showSection(module);
}

// ===== RAZORPAY / UPGRADE =====
function openUpgradeModal() { openModal('upgradeModal'); }

function selectPlan(plan) {
  selectedPlan = plan;
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`[data-plan="${plan}"]`);
  if (card) card.classList.add('selected');
}

async function initiatePayment() {
  const btn = document.getElementById('payNowBtn');
  btn.disabled = true; btn.textContent = 'Loading...';
  try {
    const keyData = await GET('/api/payments/key');
    const orderData = await POST('/api/payments/create-order', { plan: selectedPlan });

    if (orderData.demoMode) {
      // Demo mode — verify directly
      await POST('/api/payments/verify', { razorpay_order_id: orderData.orderId, razorpay_payment_id: `pay_demo_${Date.now()}`, plan: selectedPlan });
      showToast('🎉 Plan activated! (Demo Mode)', 'success');
      closeModal('upgradeModal');
      loadPlanStatus();
      return;
    }

    // Load Razorpay script dynamically
    if (!window.Razorpay) {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    }

    const rzp = new window.Razorpay({
      key: keyData.key,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'SpendSense Pro',
      description: orderData.plan,
      order_id: orderData.orderId,
      handler: async (response) => {
        try {
          await POST('/api/payments/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            plan: selectedPlan
          });
          showToast('🎉 Plan activated successfully!', 'success');
          closeModal('upgradeModal');
          loadPlanStatus();
        } catch (e) { showToast('Payment verification failed: ' + e.message, 'error'); }
      },
      prefill: { name: currentUser?.name || '', email: currentUser?.email || '' },
      theme: { color: '#6366f1' }
    });
    rzp.open();
  } catch (e) {
    showToast(e.message || 'Failed to initiate payment', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Pay Now';
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ===== ONBOARDING =====
async function obNext() {
  if (obStep === 1) {
    const income = document.getElementById('obIncome').value;
    const currency = document.getElementById('obCurrency').value;
    if (income) {
      try { await PUT('/api/users/profile', { monthly_income: income, currency }); } catch (_) {}
    }
    obStep = 2;
  } else if (obStep === 2) {
    const budget = document.getElementById('obBudget').value;
    if (budget) {
      const m = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      try { await POST('/api/budgets', { month: m, total_budget: budget }); } catch (_) {}
    }
    obStep = 3;
    document.getElementById('obNext').textContent = 'Finish →';
  } else if (obStep === 3) {
    const name = document.getElementById('obGoalName').value;
    const amount = document.getElementById('obGoalAmount').value;
    if (name && amount) {
      try { await POST('/api/savings', { goal_name: name, target_amount: amount }); } catch (_) {}
    }
    // Mark onboarding done
    try { await PUT('/api/users/profile', { onboarding_done: 1 }); } catch (_) {}
    closeModal('onboardingModal');
    showToast('Welcome to SpendSense Pro! 🎉');
    loadDashboard();
    return;
  }
  updateObUI();
}

function obPrev() {
  if (obStep > 1) { obStep--; updateObUI(); }
}

function skipOnboarding() {
  try { fetch('/api/users/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboarding_done: 1 }), credentials: 'same-origin' }); } catch (_) {}
  closeModal('onboardingModal');
}

function updateObUI() {
  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById(`ob-step${i}`);
    const dot = document.getElementById(`ob-step${i}-dot`);
    if (step) step.classList.toggle('hidden', i !== obStep);
    if (dot) dot.classList.toggle('active', i === obStep);
  }
  const prev = document.getElementById('obPrev');
  const next = document.getElementById('obNext');
  if (prev) prev.style.display = obStep > 1 ? 'block' : 'none';
  if (next) next.textContent = obStep === 3 ? 'Finish →' : 'Next →';
}

// ===== NOTIFICATIONS =====
let notifOpen = false;
async function loadNotifications() {
  try {
    const d = await GET('/api/notifications?limit=20');
    const unread = (d.notifications || []).filter(n => !n.is_read);
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = unread.length;
      badge.classList.toggle('hidden', unread.length === 0);
    }
    const list = document.getElementById('notifList');
    if (list) {
      if (!d.notifications?.length) { list.innerHTML = '<div class="text-center py-6 text-slate-500 text-sm">No notifications</div>'; return; }
      list.innerHTML = d.notifications.map(n => `
        <div class="px-4 py-3 border-b border-slate-700/50 ${!n.is_read ? 'bg-indigo-900/10' : ''} hover:bg-slate-800/50">
          <div class="text-sm font-medium text-white">${n.title}</div>
          <div class="text-xs text-slate-400 mt-0.5">${n.message}</div>
          <div class="text-xs text-slate-600 mt-1">${fmtDate(n.created_at)}</div>
        </div>`).join('');
    }
  } catch (e) {}
}

function toggleNotifDropdown() {
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  notifOpen = !notifOpen;
  dd.classList.toggle('show', notifOpen);
  if (notifOpen) loadNotifications();
}

async function markAllNotifRead() {
  try {
    await PUT('/api/notifications/mark-all-read', {});
    loadNotifications();
  } catch (e) {}
}

// Close notif dropdown on outside click
document.addEventListener('click', e => {
  if (notifOpen && !e.target.closest('#notifBell') && !e.target.closest('#notifDropdown')) {
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.classList.remove('show');
    notifOpen = false;
  }
});

// ===== BUDGET =====
async function loadBudget() {
  try {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const el = document.getElementById('budgetModalMonth');
    if (el) el.value = m;
    const d = await GET(`/api/budgets?month=${m}`);
    renderBudgets(d.budgets || [], d.expenses || []);
  } catch (e) {}
}

function renderBudgets(budgets, expenses) {
  const overallBudget = budgets.find(b => !b.category);
  const catBudgets = budgets.filter(b => b.category);
  const totalOverall = document.getElementById('budgetTotalAmount');
  if (totalOverall && overallBudget) totalOverall.textContent = fmt(overallBudget.total_budget);
  const grid = document.getElementById('budgetCategoriesGrid');
  if (!grid) return;
  const cats = ['Food','Transport','Shopping','Bills','Health','Education','Travel','Entertainment','Insurance','Other'];
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  grid.innerHTML = cats.map(cat => {
    const budget = catBudgets.find(b => b.category === cat);
    const spent = expenses?.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0) || 0;
    const limit = budget?.category_budget || 0;
    const pct = limit > 0 ? Math.min(100, (spent / limit * 100)).toFixed(0) : 0;
    const color = pct >= 100 ? 'progress-red' : pct >= 80 ? 'progress-amber' : 'progress-blue';
    return `<div class="stat-card">
      <div class="flex justify-between mb-1">
        <span class="text-sm font-medium text-slate-300">${cat}</span>
        <span class="text-xs text-slate-500">${limit > 0 ? `${pct}%` : 'No limit'}</span>
      </div>
      <div class="text-sm font-semibold text-white mb-1">${fmt(spent)} ${limit > 0 ? `/ ${fmt(limit)}` : ''}</div>
      ${limit > 0 ? `<div class="progress-wrap"><div class="progress-bar ${color}" style="width:${pct}%"></div></div>` : ''}
    </div>`;
  }).join('');
}

function openBudgetModal() {
  const now = new Date();
  const m = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('budgetModalMonth').value = m;
  const cats = ['Food','Transport','Shopping','Bills','Health','Education','Travel','Entertainment','Insurance','Other'];
  const inputs = document.getElementById('catBudgetInputs');
  if (inputs) {
    inputs.innerHTML = cats.map(cat => `
      <div class="form-group"><label class="form-label">${cat}</label>
        <input type="number" class="form-input" id="catBudget_${cat}" placeholder="No limit">
      </div>`).join('');
  }
  openModal('budgetModal');
}

async function saveBudget() {
  const month = document.getElementById('budgetModalMonth').value;
  const total = document.getElementById('totalBudgetInput').value;
  if (!month) return showToast('Select a month', 'error');
  try {
    if (total) await POST('/api/budgets', { month, total_budget: parseFloat(total) });
    const cats = ['Food','Transport','Shopping','Bills','Health','Education','Travel','Entertainment','Insurance','Other'];
    for (const cat of cats) {
      const val = document.getElementById(`catBudget_${cat}`)?.value;
      if (val) await POST('/api/budgets', { month, category: cat, category_budget: parseFloat(val) });
    }
    showToast('Budget saved');
    closeModal('budgetModal');
    loadBudget();
    if (currentSection === 'dashboard') loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== BILLS =====
let billsData = [];
async function loadBills() {
  try {
    const d = await GET('/api/bills?limit=100');
    billsData = d.bills || [];
    renderBillsUI(billsData);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderBillsUI(bills) {
  const unpaid = bills.filter(b => !b.is_paid);
  const paid = bills.filter(b => b.is_paid);
  const totalUnpaid = unpaid.reduce((s, b) => s + b.amount, 0);
  setEl('billsUnpaid', unpaid.length);
  setEl('billsTotalDue', fmt(totalUnpaid));
  const today = new Date().toISOString().split('T')[0];
  const overdue = unpaid.filter(b => b.due_date < today);
  setEl('billsOverdue', overdue.length);
  const tbody = document.querySelector('#billsTable tbody');
  if (!tbody) return;
  if (!bills.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🧾</div>No bills added</td></tr>`; return; }
  tbody.innerHTML = bills.map(b => {
    const isOverdue = !b.is_paid && b.due_date < today;
    return `<tr>
      <td><span class="font-medium text-white">${b.type}</span></td>
      <td class="${isOverdue ? 'text-red-400 font-semibold' : ''}">${fmtDate(b.due_date)}</td>
      <td class="font-semibold">${fmt(b.amount)}</td>
      <td><span class="badge ${b.is_paid ? 'badge-success' : isOverdue ? 'badge-danger' : 'badge-warning'}">${b.is_paid ? '✓ Paid' : isOverdue ? 'Overdue' : 'Pending'}</span></td>
      <td>
        ${!b.is_paid ? `<button class="btn-secondary btn-sm mr-1" onclick="markBillPaid(${b.id})">✓ Pay</button>` : ''}
        <button class="btn-icon" onclick="deleteBill(${b.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function openBillModal(id = null) {
  document.getElementById('billEditId').value = id || '';
  document.getElementById('billModalTitle').textContent = id ? 'Edit Bill' : 'Add Bill';
  if (!id) {
    ['billAmount','billLateFee','billMonthlyUsage','billNotes'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    document.getElementById('billDueDate').value = '';
    document.getElementById('billType').value = '';
    document.getElementById('billIsPaid').checked = false;
  }
  openModal('billModal');
}

async function saveBill() {
  const type = document.getElementById('billType').value;
  const amount = parseFloat(document.getElementById('billAmount').value);
  const due_date = document.getElementById('billDueDate').value;
  if (!type) return showToast('Select bill type', 'error');
  if (!amount || amount <= 0) return showToast('Enter valid amount', 'error');
  if (!due_date) return showToast('Enter due date', 'error');
  try {
    const id = document.getElementById('billEditId').value;
    const body = { type, amount, due_date, late_fee: document.getElementById('billLateFee').value || 0, is_paid: document.getElementById('billIsPaid').checked ? 1 : 0, notes: document.getElementById('billNotes').value };
    if (id) await PUT(`/api/bills/${id}`, body); else await POST('/api/bills', body);
    showToast(id ? 'Bill updated' : 'Bill added');
    closeModal('billModal');
    loadBills();
  } catch (e) { showToast(e.message, 'error'); }
}

async function markBillPaid(id) {
  try { await PUT(`/api/bills/${id}`, { is_paid: 1 }); showToast('Bill marked as paid ✓'); loadBills(); } catch (e) { showToast(e.message, 'error'); }
}

async function deleteBill(id) {
  if (!confirm('Delete this bill?')) return;
  try { await DEL(`/api/bills/${id}`); showToast('Deleted'); loadBills(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== SUBSCRIPTIONS =====
let subscriptionsData = [];
async function loadSubscriptions() {
  try {
    const d = await GET('/api/subscriptions');
    subscriptionsData = d.subscriptions || [];
    renderSubscriptions(subscriptionsData);
    const monthly = subscriptionsData.filter(s => s.is_active).reduce((sum, s) => sum + (s.billing_cycle === 'yearly' ? s.amount / 12 : s.amount), 0);
    const annual = subscriptionsData.filter(s => s.is_active).reduce((sum, s) => sum + (s.billing_cycle === 'yearly' ? s.amount : s.amount * 12), 0);
    setEl('subMonthlyTotal', fmt(monthly));
    setEl('subAnnualTotal', fmt(annual));
    setEl('subActiveCount', subscriptionsData.filter(s => s.is_active).length);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderSubscriptions(subs) {
  const tbody = document.querySelector('#subscriptionsTable tbody');
  if (!tbody) return;
  if (!subs.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🔄</div>No subscriptions added</td></tr>`; return; }
  tbody.innerHTML = subs.map(s => `
    <tr class="${!s.is_active ? 'opacity-50' : ''}">
      <td class="font-medium text-white">${s.name}</td>
      <td>${fmt(s.amount)}</td>
      <td>${s.billing_cycle}</td>
      <td>${s.next_renewal ? fmtDate(s.next_renewal) : '—'}</td>
      <td><span class="badge ${s.is_active ? 'badge-success' : 'badge-default'}">${s.is_active ? 'Active' : 'Cancelled'}</span></td>
      <td>
        <button class="btn-icon" onclick="deleteSubscription(${s.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

function openSubscriptionModal(id = null) {
  document.getElementById('subEditId').value = id || '';
  document.getElementById('subModalTitle').textContent = id ? 'Edit Subscription' : 'Add Subscription';
  if (!id) {
    ['subName','subAmount','subCategory','subCancelUrl','subNotes'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    document.getElementById('subRenewal').value = '';
    document.getElementById('subCycle').value = 'monthly';
    document.getElementById('subIsActive').checked = true;
  }
  openModal('subscriptionModal');
}

async function saveSubscription() {
  const name = document.getElementById('subName').value;
  const amount = parseFloat(document.getElementById('subAmount').value);
  if (!name || !amount) return showToast('Name and amount required', 'error');
  try {
    const id = document.getElementById('subEditId').value;
    const body = { name, amount, billing_cycle: document.getElementById('subCycle').value, next_renewal: document.getElementById('subRenewal').value, category: document.getElementById('subCategory').value, cancel_url: document.getElementById('subCancelUrl').value, is_active: document.getElementById('subIsActive').checked ? 1 : 0, notes: document.getElementById('subNotes').value };
    if (id) await PUT(`/api/subscriptions/${id}`, body); else await POST('/api/subscriptions', body);
    showToast(id ? 'Updated' : 'Added');
    closeModal('subscriptionModal');
    loadSubscriptions();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteSubscription(id) {
  if (!confirm('Delete this subscription?')) return;
  try { await DEL(`/api/subscriptions/${id}`); showToast('Deleted'); loadSubscriptions(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== SAVINGS =====
let savingsData = [];
async function loadSavings() {
  try {
    const [list, summary] = await Promise.all([GET('/api/savings'), GET('/api/savings/summary')]);
    savingsData = list.goals || [];
    setEl('savingsTotalSaved', fmt(summary.totalSaved));
    setEl('savingsTotalTarget', fmt(summary.totalTarget));
    setEl('savingsGoalCount', summary.totalGoals);
    const bar = document.getElementById('savingsOverallBar');
    if (bar) bar.style.width = `${summary.overallProgress?.toFixed(0) || 0}%`;
    renderSavingsGoals(savingsData);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderSavingsGoals(goals) {
  const container = document.getElementById('savingsGoals');
  if (!container) return;
  if (!goals.length) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div>No savings goals yet</div>`; return; }
  container.innerHTML = goals.map(g => {
    const pct = g.target_amount > 0 ? Math.min(100, (g.saved_amount / g.target_amount * 100)).toFixed(0) : 0;
    return `<div class="stat-card">
      <div class="flex justify-between mb-2">
        <div class="font-semibold text-white">${g.goal_name}</div>
        <div class="text-sm font-bold text-emerald-400">${pct}%</div>
      </div>
      <div class="text-2xl font-bold text-white mb-1">${fmt(g.saved_amount)}</div>
      <div class="text-xs text-slate-500 mb-2">of ${fmt(g.target_amount)}</div>
      <div class="progress-wrap"><div class="progress-bar progress-blue" style="width:${pct}%"></div></div>
      ${g.target_date ? `<div class="text-xs text-slate-500 mt-1">Target: ${fmtDate(g.target_date)}</div>` : ''}
      <div class="flex gap-2 mt-3">
        <button class="btn-success btn-sm flex-1" onclick="openDepositModal(${g.id},'${g.goal_name}',${g.saved_amount})">+ Deposit</button>
        <button class="btn-icon" onclick="deleteGoal(${g.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openSavingsModal(id = null) {
  document.getElementById('savingsEditId').value = id || '';
  document.getElementById('savingsModalTitle').textContent = id ? 'Edit Goal' : 'Create Savings Goal';
  if (!id) {
    ['goalName','goalTarget','goalMonthly','goalNotes'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    document.getElementById('goalDate').value = '';
  }
  openModal('savingsModal');
}

async function saveGoal() {
  const goal_name = document.getElementById('goalName').value;
  const target_amount = parseFloat(document.getElementById('goalTarget').value);
  if (!goal_name || !target_amount) return showToast('Name and target amount required', 'error');
  try {
    const id = document.getElementById('savingsEditId').value;
    const body = { goal_name, target_amount, monthly_target: document.getElementById('goalMonthly').value, target_date: document.getElementById('goalDate').value, notes: document.getElementById('goalNotes').value };
    if (id) await PUT(`/api/savings/${id}`, body); else await POST('/api/savings', body);
    showToast(id ? 'Goal updated' : 'Goal created');
    closeModal('savingsModal');
    loadSavings();
  } catch (e) { showToast(e.message, 'error'); }
}

function openDepositModal(id, name, current) {
  document.getElementById('depositGoalId').value = id;
  document.getElementById('depositGoalName').value = name;
  document.getElementById('depositCurrentSaved').value = fmt(current);
  document.getElementById('depositAmount').value = '';
  openModal('depositModal');
}

async function submitDeposit() {
  const id = document.getElementById('depositGoalId').value;
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
  try {
    await POST(`/api/savings/${id}/deposit`, { amount });
    showToast('Deposit added ✓');
    closeModal('depositModal');
    loadSavings();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteGoal(id) {
  if (!confirm('Delete this savings goal?')) return;
  try { await DEL(`/api/savings/${id}`); showToast('Deleted'); loadSavings(); } catch (e) { showToast(e.message, 'error'); }
}

// ===== BANKING =====
async function loadBanking() {
  try {
    const accounts = await GET('/api/banking/accounts');
    renderBankAccounts(accounts.accounts || []);
    loadTransactions();
  } catch (e) { showToast(e.message, 'error'); }
}

function renderBankAccounts(accounts) {
  const container = document.getElementById('bankAccountsList');
  if (!container) return;
  if (!accounts.length) { container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🏛️</div>No bank accounts added</div>`; return; }
  container.innerHTML = accounts.map(a => `
    <div class="stat-card">
      <div class="text-sm font-semibold text-slate-300 mb-1">${a.bank_name}</div>
      <div class="text-2xl font-bold text-white mb-1">${fmt(a.balance)}</div>
      <div class="text-xs text-slate-500">${a.account_type || 'Savings'} · ••${a.account_number?.slice(-4) || '??'}</div>
      <button class="btn-icon mt-2 text-sm" onclick="deleteBankAccount(${a.id})">🗑️</button>
    </div>`).join('');
}

async function loadTransactions() {
  try {
    const params = new URLSearchParams();
    const from = document.getElementById('txDateFrom')?.value;
    const to = document.getElementById('txDateTo')?.value;
    const type = document.getElementById('txType')?.value;
    const cat = document.getElementById('txCategory')?.value;
    const q = document.getElementById('txSearch')?.value;
    if (from) params.set('dateFrom', from);
    if (to) params.set('dateTo', to);
    if (type) params.set('type', type);
    if (cat) params.set('category', cat);
    if (q) params.set('search', q);
    params.set('limit', '100');
    const d = await GET(`/api/banking/transactions?${params}`);
    renderTransactions(d.transactions || []);
  } catch (e) {}
}

function renderTransactions(txns) {
  const tbody = document.querySelector('#transactionsTable tbody');
  if (!tbody) return;
  if (!txns.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">🏛️</div>No transactions. Add bank account and import a CSV.</td></tr>`; return; }
  tbody.innerHTML = txns.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${t.description || '—'}</td>
      <td>${t.category || '—'}</td>
      <td><span class="badge ${t.type === 'credit' ? 'badge-success' : 'badge-danger'}">${t.type}</span></td>
      <td class="${t.type === 'credit' ? 'amount-positive' : 'amount-negative'} font-semibold">${fmt(t.amount)}</td>
      <td>${fmt(t.balance)}</td>
      <td>${t.is_duplicate ? '<span class="text-amber-400 text-xs">⚠️ Dup</span>' : '—'}</td>
    </tr>`).join('');
}

function openBankModal() { openModal('bankAccountModal'); }

async function saveBankAccount() {
  const bank_name = document.getElementById('bankName')?.value;
  if (!bank_name) return showToast('Bank name required', 'error');
  try {
    await POST('/api/banking/accounts', { bank_name, account_number: document.getElementById('bankAccountNum')?.value, account_type: document.getElementById('bankAccountType')?.value, balance: document.getElementById('bankBalance')?.value || 0, branch: document.getElementById('bankBranch')?.value, ifsc: document.getElementById('bankIFSC')?.value });
    showToast('Account added');
    closeModal('bankAccountModal');
    loadBanking();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteBankAccount(id) {
  if (!confirm('Delete this account and all its transactions?')) return;
  try { await DEL(`/api/banking/accounts/${id}`); showToast('Deleted'); loadBanking(); } catch (e) { showToast(e.message, 'error'); }
}

function openImportModal() { openModal('importCsvModal'); }

async function importCSV() {
  const fileInput = document.getElementById('csvFileInput');
  const accountId = document.getElementById('importAccountId')?.value;
  if (!fileInput?.files?.[0]) return showToast('Select a CSV file', 'error');
  const formData = new FormData();
  formData.append('csv', fileInput.files[0]);
  if (accountId) formData.append('account_id', accountId);
  try {
    const r = await fetch('/api/banking/import', { method: 'POST', body: formData, credentials: 'same-origin' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    showToast(`Imported ${d.imported} transactions (${d.duplicates || 0} duplicates skipped)`);
    closeModal('importCsvModal');
    loadBanking();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== UPI =====
let upiData = [];
async function loadUPI() {
  try {
    const d = await GET('/api/upi');
    upiData = d.payments || [];
    const total = upiData.reduce((s, p) => s + p.amount, 0);
    const pending = upiData.filter(p => p.status === 'pending').length;
    const completed = upiData.filter(p => p.status === 'completed').length;
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const thisMonth = upiData.filter(p => p.date?.startsWith(m)).reduce((s, p) => s + p.amount, 0);
    setEl('upiTotal', fmt(total));
    setEl('upiPending', pending);
    setEl('upiCompleted', completed);
    setEl('upiThisMonth', fmt(thisMonth));
    renderUPITable(upiData);
  } catch (e) {}
}

function renderUPITable(payments) {
  const tbody = document.querySelector('#upiPaymentsTable tbody');
  if (!tbody) return;
  if (!payments.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">📱</div>No UPI payments yet</td></tr>`; return; }
  tbody.innerHTML = payments.map(p => `
    <tr>
      <td>${fmtDate(p.date)}</td>
      <td>${p.upi_id}</td>
      <td>${p.payee_name || '—'}</td>
      <td class="font-semibold">${fmt(p.amount)}</td>
      <td><span class="badge badge-${p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}">${p.status}</span></td>
      <td class="text-xs text-slate-500">${p.reference_id || '—'}</td>
      <td><button class="btn-icon" onclick="deleteUPI(${p.id})">🗑️</button></td>
    </tr>`).join('');
}

function openUpiModal() { openModal('upiModal'); document.getElementById('upiModalDate').value = today(); }

async function saveUpiPayment() {
  const upi_id = document.getElementById('upiModalId').value;
  const amount = parseFloat(document.getElementById('upiModalAmount').value);
  const date = document.getElementById('upiModalDate').value;
  if (!upi_id || !amount || !date) return showToast('UPI ID, amount and date required', 'error');
  try {
    const id = document.getElementById('upiEditId').value;
    const body = { upi_id, payee_name: document.getElementById('upiModalPayee').value, amount, date, status: document.getElementById('upiModalStatus').value, reference_id: document.getElementById('upiModalRef').value, notes: document.getElementById('upiModalNotes').value };
    if (id) await PUT(`/api/upi/${id}`, body); else await POST('/api/upi', body);
    showToast('Saved');
    closeModal('upiModal');
    loadUPI();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteUPI(id) {
  if (!confirm('Delete?')) return;
  try { await DEL(`/api/upi/${id}`); showToast('Deleted'); loadUPI(); } catch (e) { showToast(e.message, 'error'); }
}

function generateUpiLink() {
  const id = document.getElementById('upiId').value;
  const name = document.getElementById('upiPayeeName').value;
  const amount = document.getElementById('upiAmount').value;
  const notes = document.getElementById('upiNotes').value;
  if (!id) return showToast('Enter UPI ID', 'error');
  let link = `upi://pay?pa=${encodeURIComponent(id)}`;
  if (name) link += `&pn=${encodeURIComponent(name)}`;
  if (amount) link += `&am=${amount}&cu=INR`;
  if (notes) link += `&tn=${encodeURIComponent(notes)}`;
  document.getElementById('upiLinkText').textContent = link;
  document.getElementById('upiLinkDisplay').classList.remove('hidden');
}

function copyUpiLink() {
  const text = document.getElementById('upiLinkText').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('UPI link copied!')).catch(() => showToast('Copy failed', 'error'));
}

function saveUpiAsPayment() {
  const upi_id = document.getElementById('upiId').value;
  const payee = document.getElementById('upiPayeeName').value;
  const amount = document.getElementById('upiAmount').value;
  document.getElementById('upiModalId').value = upi_id;
  document.getElementById('upiModalPayee').value = payee;
  document.getElementById('upiModalAmount').value = amount;
  document.getElementById('upiModalDate').value = today();
  openModal('upiModal');
}

// ===== TRAVEL, HEALTH, EDUCATION, INSURANCE, SHOPPING =====
async function loadTravel() {
  try {
    const d = await GET('/api/travel?limit=100');
    renderSimpleTable('#travelTable tbody', d.records || [], ['date','type','trip_name','origin','destination','amount'], ['Date','Type','Trip','From','To','Amount']);
    setEl('travelTotal', fmt(d.totalAmount));
  } catch (e) {}
}

async function loadHealth() {
  try {
    const d = await GET('/api/health?limit=100');
    renderSimpleTable('#healthTable tbody', d.records || [], ['date','type','provider','amount'], ['Date','Type','Provider','Amount']);
    setEl('healthTotal', fmt(d.totalAmount));
  } catch (e) {}
}

async function loadEducation() {
  try {
    const d = await GET('/api/education?limit=100');
    renderSimpleTable('#educationTable tbody', d.records || [], ['date','type','title','institution','amount'], ['Date','Type','Title','Institution','Amount']);
    setEl('educationTotal', fmt(d.totalAmount));
  } catch (e) {}
}

async function loadInsurance() {
  try {
    const d = await GET('/api/insurance?limit=100');
    renderSimpleTable('#insuranceTable tbody', d.insurance || [], ['type','provider','policy_number','premium','next_premium_date'], ['Type','Provider','Policy #','Premium','Next Due']);
  } catch (e) {}
}

async function loadShopping() {
  try {
    const d = await GET('/api/shopping?limit=100');
    renderSimpleTable('#shoppingTable tbody', d.purchases || [], ['purchase_date','item_name','store','category','amount'], ['Date','Item','Store','Category','Amount']);
    setEl('shoppingTotal', fmt(d.totalAmount));
  } catch (e) {}
}

function renderSimpleTable(selector, data, cols, _headers) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  const colCount = cols.length + 1;
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state"><div class="empty-icon">📋</div>No records</td></tr>`; return; }
  tbody.innerHTML = data.map(r => `<tr>${cols.map(c => `<td>${c === 'amount' ? `<span class="font-semibold amount-negative">${fmt(r[c])}</span>` : c.includes('date') || c.includes('Date') ? fmtDate(r[c]) : (r[c] || '—')}</td>`).join('')}<td><button class="btn-icon" onclick="deleteRecord('${selector}', ${r.id})">🗑️</button></td></tr>`).join('');
}

// ===== DEEP SEARCH =====
async function runDeepSearch() {
  const q = document.getElementById('deepSearchInput').value;
  if (!q) return showToast('Enter a query', 'error');
  const btn = document.getElementById('deepSearchBtn');
  const loading = document.getElementById('deepSearchLoading');
  const results = document.getElementById('deepSearchResults');
  btn.classList.add('hidden'); loading.classList.remove('hidden'); results.classList.add('hidden');
  try {
    const d = await POST('/api/deepsearch', { query: q });
    document.getElementById('searchIntent').textContent = d.intent;
    document.getElementById('searchSummary').textContent = d.summary;
    const resList = document.getElementById('searchResultsList');
    if (resList) {
      resList.innerHTML = (d.results || []).map(r => `
        <div class="flex justify-between items-center py-2 border-b border-slate-700">
          <span class="text-sm text-slate-300">${r.label}</span>
          <span class="font-semibold ${r.type === 'danger' ? 'text-red-400' : r.type === 'warning' ? 'text-amber-400' : r.type === 'safe' ? 'text-emerald-400' : 'text-white'}">${r.value}</span>
        </div>`).join('');
    }
    const recEl = document.getElementById('searchRecommendations');
    if (recEl) {
      recEl.innerHTML = (d.recommendations || []).map(r => `<div class="flex gap-2 text-sm text-slate-300 mb-2"><span>💡</span><span>${r}</span></div>`).join('') || '<p class="text-slate-500 text-sm">No recommendations</p>';
    }
    results.classList.remove('hidden');
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.classList.remove('hidden'); loading.classList.add('hidden'); }
}

function setSearchQuery(q) { document.getElementById('deepSearchInput').value = q; }

// ===== REPORTS =====
async function loadReports() {
  try {
    const d = await GET('/api/analytics/summary?months=12');
    renderReportsCharts(d);
  } catch (e) {}
}

async function loadReportsCharts() {
  const from = document.getElementById('reportDateFrom')?.value;
  const to = document.getElementById('reportDateTo')?.value;
  const url = `/api/analytics/summary?months=12${from ? '&startDate=' + from : ''}${to ? '&endDate=' + to : ''}`;
  try {
    const d = await GET(url);
    renderReportsCharts(d);
  } catch (e) {}
}

function renderReportsCharts(d) {
  destroyChart('reportsMonthlyChart');
  destroyChart('incomeExpenseChart');
  destroyChart('reportsCategoryChart');
  const ctx1 = document.getElementById('reportsMonthlyChart');
  if (ctx1 && d.monthlyTrend) {
    chartsRegistry['reportsMonthlyChart'] = new Chart(ctx1, {
      type: 'bar',
      data: { labels: d.monthlyTrend.map(m => m.month), datasets: [{ label: 'Spending', data: d.monthlyTrend.map(m => m.total), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 5 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
    });
  }
  const ctx3 = document.getElementById('reportsCategoryChart');
  if (ctx3 && d.categoryBreakdown) {
    const cats = d.categoryBreakdown.slice(0, 8);
    chartsRegistry['reportsCategoryChart'] = new Chart(ctx3, {
      type: 'doughnut',
      data: { labels: cats.map(c => c.category), datasets: [{ data: cats.map(c => c.total), backgroundColor: ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'] }] },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } } }
    });
  }
}

// ===== SETTINGS =====
async function loadSettings() {
  if (currentUser) updateUserUI(currentUser);
  setTheme(localStorage.getItem('theme') || 'dark');
}

async function saveProfile(e) {
  e.preventDefault();
  try {
    await PUT('/api/users/profile', {
      name: document.getElementById('settingsName').value,
      email: document.getElementById('settingsEmail').value,
      phone: document.getElementById('settingsPhone').value
    });
    showToast('Profile saved');
    const data = await GET('/api/auth/me');
    currentUser = data.user;
    updateUserUI(currentUser);
  } catch (err) { showToast(err.message, 'error'); }
}

async function savePreferences() {
  try {
    await PUT('/api/users/profile', {
      currency: document.getElementById('settingsCurrency').value,
      monthly_income: document.getElementById('settingsIncome').value
    });
    showToast('Preferences saved');
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteAccount() {
  const confirmed = prompt('Type "DELETE" to permanently delete your account and all data:');
  if (confirmed !== 'DELETE') return;
  try {
    await DEL('/api/privacy/account');
    showToast('Account deleted');
    setTimeout(() => { window.location.href = '/'; }, 1500);
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== EXPORT =====
async function exportCSV() {
  try {
    const d = await GET('/api/backup/export');
    const expenses = d.expenses || [];
    if (!expenses.length) return showToast('No expenses to export', 'error');
    const headers = 'Date,Category,Description,Amount,Payment Method,Notes\n';
    const rows = expenses.map(e => `${e.date},${e.category},"${(e.description||'').replace(/"/g,'""')}",${e.amount},${e.payment_method||''},"${(e.notes||'').replace(/"/g,'""')}"`).join('\n');
    download('expenses.csv', 'text/csv', headers + rows);
  } catch (e) { showToast(e.message, 'error'); }
}

async function exportJSON() {
  try {
    const d = await GET('/api/backup/export');
    download(`spendsense-backup-${today()}.json`, 'application/json', JSON.stringify(d, null, 2));
  } catch (e) { showToast(e.message, 'error'); }
}

async function exportPDF() { showToast('PDF export — use browser Print (Ctrl+P) for now', 'info'); }

async function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    const r = await fetch('/api/backup/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    showToast(`Imported successfully`);
    loadDashboard();
  } catch (e) { showToast(e.message || 'Invalid JSON file', 'error'); }
}

function download(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===== AUTH =====
async function logout() {
  try { await POST('/api/auth/logout', {}); } catch (_) {}
  window.location.href = '/';
}

// ===== HEALTH / EDUCATION / INSURANCE / SHOPPING / TRAVEL MODALS =====
function openTravelModal(id = null) { document.getElementById('travelEditId').value = id || ''; document.getElementById('travelDate').value = today(); openModal('travelModal'); }
async function saveTravel() {
  const type = document.getElementById('travelType').value;
  const amount = parseFloat(document.getElementById('travelAmount').value);
  const date = document.getElementById('travelDate').value;
  if (!type || !amount || !date) return showToast('Type, amount and date required', 'error');
  try {
    const id = document.getElementById('travelEditId').value;
    const body = { type, amount, date, trip_name: document.getElementById('travelTripName').value, origin: document.getElementById('travelOrigin').value, destination: document.getElementById('travelDest').value, distance_km: document.getElementById('travelDistance').value, fuel_cost: document.getElementById('travelFuelCost').value, notes: document.getElementById('travelNotes').value };
    if (id) await PUT(`/api/travel/${id}`, body); else await POST('/api/travel', body);
    showToast('Saved'); closeModal('travelModal'); loadTravel();
  } catch (e) { showToast(e.message, 'error'); }
}

function openHealthModal(id = null) { document.getElementById('healthEditId').value = id || ''; document.getElementById('healthDate').value = today(); openModal('healthModal'); }
async function saveHealth() {
  const type = document.getElementById('healthType').value;
  const amount = parseFloat(document.getElementById('healthAmount').value);
  const date = document.getElementById('healthDate').value;
  if (!type || !amount || !date) return showToast('Required fields missing', 'error');
  try {
    const id = document.getElementById('healthEditId').value;
    const body = { type, amount, date, provider: document.getElementById('healthProvider').value, insurance_claim: document.getElementById('healthClaim').value, reminder_date: document.getElementById('healthReminder').value, notes: document.getElementById('healthNotes').value };
    if (id) await PUT(`/api/health/${id}`, body); else await POST('/api/health', body);
    showToast('Saved'); closeModal('healthModal'); loadHealth();
  } catch (e) { showToast(e.message, 'error'); }
}

function openEducationModal(id = null) { document.getElementById('eduEditId').value = id || ''; document.getElementById('eduDate').value = today(); openModal('educationModal'); }
async function saveEducation() {
  const type = document.getElementById('eduType').value;
  const amount = parseFloat(document.getElementById('eduAmount').value);
  const title = document.getElementById('eduTitle').value;
  const date = document.getElementById('eduDate').value;
  if (!type || !amount || !title || !date) return showToast('Required fields missing', 'error');
  try {
    const id = document.getElementById('eduEditId').value;
    const body = { type, amount, title, date, institution: document.getElementById('eduInstitution').value, notes: document.getElementById('eduNotes').value };
    if (id) await PUT(`/api/education/${id}`, body); else await POST('/api/education', body);
    showToast('Saved'); closeModal('educationModal'); loadEducation();
  } catch (e) { showToast(e.message, 'error'); }
}

function openInsuranceModal(id = null) { document.getElementById('insEditId').value = id || ''; openModal('insuranceModal'); }
async function saveInsurance() {
  const type = document.getElementById('insType').value;
  const provider = document.getElementById('insProvider').value;
  const premium = parseFloat(document.getElementById('insPremium').value);
  if (!type || !provider || !premium) return showToast('Type, provider and premium required', 'error');
  try {
    const id = document.getElementById('insEditId').value;
    const body = { type, provider, premium, policy_number: document.getElementById('insPolicyNumber').value, coverage_amount: document.getElementById('insCoverage').value, next_premium_date: document.getElementById('insNextPremium').value, start_date: document.getElementById('insStartDate').value, end_date: document.getElementById('insEndDate').value, notes: document.getElementById('insNotes').value };
    if (id) await PUT(`/api/insurance/${id}`, body); else await POST('/api/insurance', body);
    showToast('Saved'); closeModal('insuranceModal'); loadInsurance();
  } catch (e) { showToast(e.message, 'error'); }
}

function openShoppingModal(id = null) { document.getElementById('shopEditId').value = id || ''; document.getElementById('shopDate').value = today(); openModal('shoppingModal'); }
async function savePurchase() {
  const item_name = document.getElementById('shopItemName').value;
  const amount = parseFloat(document.getElementById('shopAmount').value);
  const date = document.getElementById('shopDate').value;
  if (!item_name || !amount || !date) return showToast('Required fields missing', 'error');
  try {
    const id = document.getElementById('shopEditId').value;
    const body = { item_name, amount, purchase_date: date, store: document.getElementById('shopStore').value, category: document.getElementById('shopCategoryInput').value, warranty_until: document.getElementById('shopWarranty').value, return_deadline: document.getElementById('shopReturnDeadline').value, return_status: document.getElementById('shopReturnStatus').value, notes: document.getElementById('shopNotes').value };
    if (id) await PUT(`/api/shopping/${id}`, body); else await POST('/api/shopping', body);
    showToast('Saved'); closeModal('shoppingModal'); loadShopping();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== PWA INSTALL =====
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'flex';
});

function installPWA() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.style.display = 'none';
    });
  }
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    if (notifOpen) { const dd = document.getElementById('notifDropdown'); if (dd) dd.classList.remove('show'); notifOpen = false; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.getElementById('globalSearchInput');
    if (input) { input.focus(); input.select(); }
  }
});

// ===== START APP =====
document.addEventListener('DOMContentLoaded', init);
