const state = {
  charts: {},
  dashboardTxPage: 1,
  dashboardTxLimit: 6,
  bankingPage: 1,
  bankingLimit: 25,
  notificationsOpen: false,
  accounts: []
};

/**
 * Perform an API request and parse JSON.
 * @param {string} url - API URL.
 * @param {RequestInit} [options] - Fetch options.
 * @returns {Promise<any>} Parsed JSON payload.
 */
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

/**
 * Escape user-controlled HTML.
 * @param {string} value - Raw text.
 * @returns {string} Escaped string.
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format INR values.
 * @param {number|string} value - Amount.
 * @returns {string} Formatted currency.
 */
function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount).replace('₹', '₹');
}

/**
 * Format ISO date values.
 * @param {string} value - Date string.
 * @returns {string} Human friendly date.
 */
function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Show a temporary toast message.
 * @param {string} message - Toast body.
 * @param {'success'|'error'|'info'} [type] - Toast type.
 * @returns {void}
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    return;
  }
  const toast = document.createElement('div');
  const color = type === 'success' ? 'border-emerald-500/40 text-emerald-300' : type === 'error' ? 'border-red-500/40 text-red-300' : 'border-slate-700 text-slate-200';
  toast.className = `mb-3 rounded-xl border bg-slate-900/95 px-4 py-3 text-sm shadow-2xl ${color}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

/**
 * Return a simple merchant icon.
 * @param {string} merchant - Merchant text.
 * @returns {string} Emoji icon.
 */
function merchantIcon(merchant) {
  const sample = (merchant || '').toLowerCase();
  if (/swiggy|zomato|food|cafe|restaurant/.test(sample)) return '🍽️';
  if (/uber|ola|rapido|metro|train|fuel|travel/.test(sample)) return '🚕';
  if (/netflix|spotify|prime|subscription/.test(sample)) return '📺';
  if (/amazon|flipkart|myntra|store|mall|shop/.test(sample)) return '🛍️';
  if (/airtel|jio|electricity|water|gas|bill/.test(sample)) return '🧾';
  if (/salary|refund|bonus/.test(sample)) return '💰';
  if (/upi/.test(sample)) return '📱';
  return '🏦';
}

/**
 * Build a styled category badge.
 * @param {string} category - Category text.
 * @returns {string} Badge HTML.
 */
function categoryBadge(category) {
  const palette = {
    Food: 'bg-orange-500/15 text-orange-300',
    Transport: 'bg-sky-500/15 text-sky-300',
    Shopping: 'bg-pink-500/15 text-pink-300',
    Bills: 'bg-amber-500/15 text-amber-300',
    Subscription: 'bg-violet-500/15 text-violet-300',
    Income: 'bg-emerald-500/15 text-emerald-300'
  };
  const classes = palette[category] || 'bg-slate-700/70 text-slate-200';
  return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${classes}">${escapeHtml(category || 'Other')}</span>`;
}

/**
 * Toggle the mobile sidebar.
 * @returns {void}
 */
function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

/**
 * Close the mobile sidebar.
 * @returns {void}
 */
function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

/**
 * Switch the active dashboard section.
 * @param {string} section - Section key.
 * @returns {void}
 */
function switchSection(section) {
  document.querySelectorAll('.page-section').forEach((node) => node.classList.toggle('active', node.id === `section-${section}`));
  document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.section === section));
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = section.charAt(0).toUpperCase() + section.slice(1);
  }
  closeSidebar();
}

/**
 * Open a modal by ID.
 * @param {string} modalId - Modal DOM ID.
 * @returns {void}
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Close a modal by ID.
 * @param {string} modalId - Modal DOM ID.
 * @returns {void}
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Toggle the notifications dropdown.
 * @returns {void}
 */
function toggleNotifDropdown() {
  state.notificationsOpen = !state.notificationsOpen;
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown) {
    dropdown.classList.toggle('open', state.notificationsOpen);
  }
}

/**
 * Load the authenticated user and populate header details.
 * @returns {Promise<void>} Completion promise.
 */
async function loadCurrentUser() {
  const payload = await apiRequest('/api/auth/me');
  const user = payload.user;
  const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
  ['sidebarUserName', 'navUserName', 'settingsAvatarName'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = user.name || 'User';
  });
  ['sidebarUserAvatar', 'navUserAvatar', 'settingsAvatar'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = initial;
  });
  const email = document.getElementById('sidebarUserEmail');
  if (email) email.textContent = user.email || '';
}

/**
 * Load notifications and unread counts.
 * @returns {Promise<void>} Completion promise.
 */
async function loadNotifications() {
  const [listPayload, countPayload] = await Promise.all([
    apiRequest('/api/notifications'),
    apiRequest('/api/notifications/unread-count')
  ]);
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent = countPayload.count || 0;
    badge.classList.toggle('hidden', !countPayload.count);
  }
  if (!list) {
    return;
  }
  if (!listPayload.notifications.length) {
    list.innerHTML = '<div class="text-center py-6 text-slate-500 text-sm">No notifications</div>';
    return;
  }
  list.innerHTML = listPayload.notifications.map((notification) => `
    <div class="border-b border-slate-800 px-4 py-3 ${notification.is_read ? 'opacity-70' : ''}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-medium text-white">${escapeHtml(notification.title)}</div>
          <div class="mt-1 text-xs text-slate-400">${escapeHtml(notification.message || '')}</div>
        </div>
        <span class="text-[10px] uppercase tracking-wide text-slate-500">${notification.type.replace(/_/g, ' ')}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Mark all notifications as read.
 * @returns {Promise<void>} Completion promise.
 */
async function markAllNotifRead() {
  await apiRequest('/api/notifications/read-all', { method: 'PUT' });
  await loadNotifications();
}

/**
 * Render the dashboard summary cards and charts.
 * @returns {Promise<void>} Completion promise.
 */
async function loadDashboardOverview() {
  const [expenseStats, budgetStatus, billSummary, savingsSummary, expenses, monthly, daily, categories] = await Promise.all([
    apiRequest('/api/expenses/stats'),
    apiRequest('/api/budgets/status').catch(() => ({ totalBudget: 0, remaining: 0, percentage: 0 })),
    apiRequest('/api/bills/summary').catch(() => ({ overdueCount: 0 })),
    apiRequest('/api/savings/summary').catch(() => ({ totalSaved: 0, totalGoals: 0 })),
    apiRequest('/api/expenses?limit=5').catch(() => ({ expenses: [] })),
    apiRequest('/api/analytics/monthly').catch(() => ({ labels: [], data: [] })),
    apiRequest('/api/analytics/daily').catch(() => ({ labels: [], data: [] })),
    apiRequest('/api/analytics/categories').catch(() => ({ labels: [], data: [], colors: [] }))
  ]);

  const textMap = {
    dashTotalExpenses: formatCurrency(expenseStats.totalThisMonth || 0),
    dashBudgetRemaining: formatCurrency(budgetStatus.remaining || 0),
    dashUpcomingBills: billSummary.overdueCount || 0,
    dashSavingsTotal: formatCurrency(savingsSummary.totalSaved || 0),
    dashSavingsGoals: `${savingsSummary.totalGoals || 0} goals`
  };
  Object.entries(textMap).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
  const budgetBar = document.getElementById('dashBudgetBar');
  if (budgetBar) budgetBar.style.width = `${Math.min(100, Math.max(0, 100 - (budgetStatus.percentage || 0)))}%`;

  const recentExpensesTable = document.querySelector('#recentExpensesTable tbody');
  if (recentExpensesTable) {
    recentExpensesTable.innerHTML = expenses.expenses?.length
      ? expenses.expenses.slice(0, 5).map((expense) => `
          <tr>
            <td>${formatDate(expense.date)}</td>
            <td>${categoryBadge(expense.category)}</td>
            <td>${escapeHtml(expense.description || '-')}</td>
            <td class="text-right font-semibold text-white">${formatCurrency(expense.amount)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="empty-state"><div class="empty-icon">💸</div>No expenses yet</td></tr>';
  }

  renderChart('categoryChart', 'doughnut', categories.labels, [{ data: categories.data, backgroundColor: categories.colors, borderWidth: 0 }]);
  renderChart('dailyChart', 'line', daily.labels, [{ label: 'Daily spend', data: daily.data, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)', fill: true, tension: 0.35 }]);
  renderChart('monthlyChart', 'bar', monthly.labels, [{ label: 'Monthly spend', data: monthly.data, backgroundColor: '#8b5cf6', borderRadius: 8 }]);
}

/**
 * Render or update a Chart.js chart.
 * @param {string} canvasId - Canvas element ID.
 * @param {string} type - Chart type.
 * @param {Array<string>} labels - Chart labels.
 * @param {Array<object>} datasets - Chart datasets.
 * @returns {void}
 */
function renderChart(canvasId, type, labels, datasets) {
  if (typeof Chart === 'undefined') {
    return;
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    return;
  }
  const context = canvas.getContext('2d');
  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }
  state.charts[canvasId] = new Chart(context, {
    type,
    data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: type === 'doughnut' ? {} : { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } } } }
  });
}

/**
 * Load linked accounts into dashboard and banking sections.
 * @returns {Promise<void>} Completion promise.
 */
async function loadLinkedAccounts() {
  const payload = await apiRequest('/api/banking/accounts');
  state.accounts = payload.accounts || [];
  const dashboardList = document.getElementById('dashboardLinkedAccounts');
  const bankingList = document.getElementById('bankAccountsList');
  const importSelect = document.getElementById('importBankId');
  const renderCards = (accounts) => accounts.length
    ? accounts.map((account) => `
        <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-sm font-semibold text-white">${escapeHtml(account.bank_name)}</div>
              <div class="mt-1 text-xs text-slate-500">${escapeHtml(account.masked_account_number || account.account_number || 'Manual account')}</div>
            </div>
            <span class="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">${escapeHtml(account.provider || 'manual')}</span>
          </div>
          <div class="mt-4 text-2xl font-bold text-emerald-400">${formatCurrency(account.live_balance || account.balance || 0)}</div>
          <div class="mt-2 text-xs text-slate-500">Last synced ${account.live_balance_at ? formatDate(account.live_balance_at) : account.last_synced ? formatDate(account.last_synced) : 'never'}</div>
        </div>
      `).join('')
    : '<div class="text-center py-6 text-slate-500 text-sm">No linked accounts yet</div>';

  if (dashboardList) dashboardList.innerHTML = renderCards(state.accounts.slice(0, 4));
  if (bankingList) bankingList.innerHTML = renderCards(state.accounts);
  if (importSelect) {
    importSelect.innerHTML = '<option value="">Select account</option>' + state.accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.bank_name)} • ${escapeHtml(account.masked_account_number || account.account_number || '')}</option>`).join('');
  }
}

/**
 * Load the net worth widget.
 * @returns {Promise<void>} Completion promise.
 */
async function loadNetWorthWidget() {
  const savings = await apiRequest('/api/savings/summary').catch(() => ({ totalSaved: 0, overallProgress: 0 }));
  const totalBalance = state.accounts.reduce((sum, account) => sum + Number(account.live_balance || account.balance || 0), 0);
  const total = totalBalance + Number(savings.totalSaved || 0);
  const progress = Math.max(0, Math.min(100, Number(savings.overallProgress || 0)));
  const map = {
    netWorthTotal: formatCurrency(total),
    netWorthBalanceTotal: formatCurrency(totalBalance),
    netWorthSavingsTotal: formatCurrency(savings.totalSaved || 0),
    netWorthProgressText: `${progress.toFixed(0)}%`
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
  const progressBar = document.getElementById('netWorthProgressBar');
  if (progressBar) progressBar.style.width = `${progress}%`;
}

/**
 * Load the dashboard transaction feed.
 * @returns {Promise<void>} Completion promise.
 */
async function loadDashboardTransactionFeed() {
  const source = document.getElementById('dashboardTxSource')?.value || 'all';
  const search = document.getElementById('dashboardTxSearch')?.value || '';
  const payload = await apiRequest(`/api/banking/transactions?page=${state.dashboardTxPage}&limit=${state.dashboardTxLimit}&source=${encodeURIComponent(source)}&search=${encodeURIComponent(search)}`);
  const list = document.getElementById('dashboardRecentTransactions');
  if (!list) {
    return;
  }
  if (!payload.transactions.length) {
    list.innerHTML = '<div class="text-center py-6 text-slate-500 text-sm">No recent transactions yet</div>';
  } else {
    list.innerHTML = payload.transactions.map((transaction) => `
      <div class="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-lg">${merchantIcon(transaction.merchant_name || transaction.description)}</div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium text-white">${escapeHtml(transaction.description || transaction.merchant_name || 'Transaction')}</span>
              ${categoryBadge(transaction.category)}
            </div>
            <div class="mt-1 text-xs text-slate-500">${formatDate(transaction.date)} • ${escapeHtml(transaction.source === 'upi' ? (transaction.merchant_vpa || 'UPI') : (transaction.bank_name || 'Bank'))}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-sm font-semibold ${transaction.type === 'credit' ? 'text-emerald-400' : 'text-white'}">${transaction.type === 'credit' ? '+' : '-'}${formatCurrency(transaction.amount)}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml(transaction.upi_ref_no || transaction.reference_number || 'No reference')}</div>
        </div>
      </div>
    `).join('');
  }
  const info = document.getElementById('dashboardTxPaginationInfo');
  if (info) info.textContent = `${payload.total || 0} records`;
  const prev = document.getElementById('dashboardTxPrev');
  const next = document.getElementById('dashboardTxNext');
  if (prev) prev.disabled = state.dashboardTxPage <= 1;
  if (next) next.disabled = !payload.hasMore;
}

/**
 * Change the recent transaction feed page.
 * @param {number} delta - Page delta.
 * @returns {Promise<void>} Completion promise.
 */
async function changeDashboardTxPage(delta) {
  state.dashboardTxPage = Math.max(1, state.dashboardTxPage + delta);
  await loadDashboardTransactionFeed();
}

/**
 * Reload the recent transaction feed from page one.
 * @returns {Promise<void>} Completion promise.
 */
async function refreshTransactionFeed() {
  state.dashboardTxPage = 1;
  await loadDashboardTransactionFeed();
}

/**
 * Load the detailed banking transaction table.
 * @returns {Promise<void>} Completion promise.
 */
async function loadTransactions() {
  const params = new URLSearchParams({
    page: String(state.bankingPage),
    limit: String(state.bankingLimit),
    startDate: document.getElementById('txDateFrom')?.value || '',
    endDate: document.getElementById('txDateTo')?.value || '',
    type: document.getElementById('txType')?.value || '',
    category: document.getElementById('txCategory')?.value || '',
    search: document.getElementById('txSearch')?.value || ''
  });
  const payload = await apiRequest(`/api/banking/transactions?${params.toString()}`);
  const tbody = document.querySelector('#transactionsTable tbody');
  if (!tbody) {
    return;
  }
  tbody.innerHTML = payload.transactions.length
    ? payload.transactions.map((transaction) => `
        <tr>
          <td>${formatDate(transaction.date)}</td>
          <td>
            <div class="font-medium text-white">${escapeHtml(transaction.description || '-') }</div>
            <div class="text-xs text-slate-500">${escapeHtml(transaction.merchant_vpa || '')}</div>
          </td>
          <td><span class="text-xs uppercase tracking-wide text-slate-400">${escapeHtml(transaction.source)}</span></td>
          <td>${categoryBadge(transaction.category)}</td>
          <td><span class="text-xs ${transaction.type === 'credit' ? 'text-emerald-400' : 'text-slate-300'}">${escapeHtml(transaction.type)}</span></td>
          <td class="font-semibold text-white">${formatCurrency(transaction.amount)}</td>
          <td>${transaction.balance_after !== null && transaction.balance_after !== undefined ? formatCurrency(transaction.balance_after) : '-'}</td>
          <td class="text-xs text-slate-500">${escapeHtml(transaction.upi_ref_no || transaction.reference_number || '-')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="8" class="empty-state"><div class="empty-icon">🏛️</div>No transactions found.</td></tr>';
}

/**
 * Refresh all dashboard banking widgets.
 * @returns {Promise<void>} Completion promise.
 */
async function refreshDashboard() {
  await Promise.all([
    loadDashboardOverview(),
    loadLinkedAccounts()
  ]);
  await Promise.all([
    loadNetWorthWidget(),
    loadDashboardTransactionFeed(),
    loadTransactions(),
    loadNotifications()
  ]);
}

/**
 * Start the Setu consent flow.
 * @returns {Promise<void>} Completion promise.
 */
async function linkBankAccount() {
  const phone = window.prompt('Enter the mobile number registered with your bank account (+91XXXXXXXXXX):');
  if (!phone) {
    return;
  }
  const payload = await apiRequest('/api/banking/link', { method: 'POST', body: JSON.stringify({ phone_number: phone }) });
  showToast('Consent request created. Opening Setu consent page…', 'success');
  if (payload.redirectUrl) {
    window.location.href = payload.redirectUrl;
  }
}

/**
 * Trigger a live Setu sync.
 * @returns {Promise<void>} Completion promise.
 */
async function syncBankAccounts() {
  const payload = await apiRequest('/api/banking/sync', { method: 'POST', body: JSON.stringify({}) });
  showToast(`Sync completed: ${payload.imported || 0} new transactions`, 'success');
  await refreshDashboard();
}

/**
 * Save a manual bank account.
 * @returns {Promise<void>} Completion promise.
 */
async function saveBankAccount() {
  const body = {
    bank_name: document.getElementById('bankName')?.value,
    account_type: document.getElementById('bankType')?.value,
    account_number: document.getElementById('bankAccNum')?.value,
    ifsc_code: document.getElementById('bankIfsc')?.value,
    branch: document.getElementById('bankBranch')?.value,
    balance: document.getElementById('bankBalance')?.value,
    notes: document.getElementById('bankNotes')?.value
  };
  await apiRequest('/api/banking/accounts', { method: 'POST', body: JSON.stringify(body) });
  closeModal('bankAccountModal');
  showToast('Bank account saved', 'success');
  await refreshDashboard();
}

/**
 * Import a CSV statement.
 * @returns {Promise<void>} Completion promise.
 */
async function importBankCSV() {
  const fileInput = document.getElementById('importCsvFile');
  if (!fileInput?.files?.[0]) {
    showToast('Choose a CSV file first', 'error');
    return;
  }
  const form = new FormData();
  form.append('statement', fileInput.files[0]);
  form.append('bank_account_id', document.getElementById('importBankId')?.value || '');
  const response = await fetch('/api/banking/import', { method: 'POST', body: form, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'CSV import failed');
  }
  closeModal('importModal');
  showToast(`Imported ${payload.imported || 0} transactions`, 'success');
  await refreshDashboard();
}

/**
 * Generate a UPI payment link.
 * @returns {Promise<void>} Completion promise.
 */
async function generateUpiLink() {
  const payload = await apiRequest('/api/upi/generate', {
    method: 'POST',
    body: JSON.stringify({
      upi_id: document.getElementById('upiId')?.value,
      payee_name: document.getElementById('upiPayeeName')?.value,
      amount: document.getElementById('upiAmount')?.value,
      notes: document.getElementById('upiNotes')?.value
    })
  });
  document.getElementById('upiLinkDisplay')?.classList.remove('hidden');
  const linkText = document.getElementById('upiLinkText');
  if (linkText) linkText.textContent = payload.upiLink;
  showToast('UPI link generated', 'success');
}

/**
 * Save a manual UPI payment.
 * @returns {Promise<void>} Completion promise.
 */
async function saveUpiPayment() {
  await apiRequest('/api/upi/payment', {
    method: 'POST',
    body: JSON.stringify({
      upi_id: document.getElementById('upiModalId')?.value,
      payee_name: document.getElementById('upiModalPayee')?.value,
      amount: document.getElementById('upiModalAmount')?.value,
      status: document.getElementById('upiModalStatus')?.value,
      transaction_ref: document.getElementById('upiModalRef')?.value,
      notes: document.getElementById('upiModalNotes')?.value,
      date: document.getElementById('upiModalDate')?.value
    })
  });
  closeModal('upiModal');
  showToast('UPI payment saved', 'success');
  await loadTransactions();
  await loadDashboardTransactionFeed();
}

/**
 * Run an in-app DeepSearch query.
 * @returns {Promise<void>} Completion promise.
 */
async function runDeepSearch() {
  const query = document.getElementById('deepSearchInput')?.value;
  const payload = await apiRequest('/api/deepsearch/query', { method: 'POST', body: JSON.stringify({ query }) });
  document.getElementById('deepSearchResults')?.classList.remove('hidden');
  const intent = document.getElementById('searchIntent');
  if (intent) intent.textContent = payload.intent;
  const results = document.getElementById('searchResultsList');
  if (results) {
    results.innerHTML = payload.results.map((result) => `<div class="mb-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(result.label)}</div><div class="mt-1 text-sm font-medium text-white">${escapeHtml(String(result.value))}</div></div>`).join('');
  }
  const summary = document.getElementById('searchSummary');
  if (summary) summary.textContent = payload.summary || '';
  const recommendations = document.getElementById('searchRecommendations');
  if (recommendations) {
    recommendations.innerHTML = (payload.recommendations || []).map((item) => `<div class="mb-2 rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-300">• ${escapeHtml(item)}</div>`).join('');
  }
}

/**
 * Set the DeepSearch query input.
 * @param {string} query - Suggested query.
 * @returns {void}
 */
function setSearchQuery(query) {
  const input = document.getElementById('deepSearchInput');
  if (input) input.value = query;
}

/**
 * Logout the current user.
 * @returns {Promise<void>} Completion promise.
 */
async function logout() {
  await apiRequest('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

/**
 * Wire initial event handlers and load data.
 * @returns {Promise<void>} Completion promise.
 */
async function initDashboardApp() {
  try {
    document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => switchSection(item.dataset.section)));
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.addEventListener('click', (event) => {
      const dropdown = document.getElementById('notifDropdown');
      const bell = document.getElementById('notifBell');
      if (state.notificationsOpen && dropdown && bell && !dropdown.contains(event.target) && !bell.contains(event.target)) {
        state.notificationsOpen = false;
        dropdown.classList.remove('open');
      }
    });
    await loadCurrentUser();
    await refreshDashboard();
    const params = new URLSearchParams(window.location.search);
    if (params.get('bankingLink') === 'success') {
      showToast('Bank account consent approved. You can sync now.', 'success');
    }
    if (params.get('bankingLink') === 'failed') {
      showToast(params.get('message') || 'Bank link failed', 'error');
    }
  } catch (error) {
    if (/User not found|Not authenticated/i.test(error.message)) {
      window.location.href = '/';
      return;
    }
    showToast(error.message, 'error');
  }
}

['openImportModal', 'openBankModal', 'openUpiModal'].forEach((name) => {
  window[name] = () => openModal(name === 'openImportModal' ? 'importModal' : name === 'openBankModal' ? 'bankAccountModal' : 'upiModal');
});

const stubbedFunctions = [
  'openExpenseModal', 'loadExpenses', 'clearExpenseFilters', 'expChangePage', 'openBudgetModal', 'loadBudgetStatus', 'openBillModal',
  'filterBills', 'detectRecurring', 'openSubModal', 'openShoppingModal', 'loadShopping', 'openTravelModal', 'openHealthModal',
  'openEducationModal', 'openInsuranceModal', 'openSavingsModal', 'copyUpiLink', 'saveUpiAsPayment', 'loadReportsCharts', 'exportCSV',
  'exportPDF', 'exportJSON', 'saveProfile', 'savePreferences', 'importJSON', 'toggleRecurringField', 'saveExpense', 'saveBudget',
  'saveBill', 'saveSubscription', 'savePurchase', 'saveTravel', 'saveHealth', 'saveEducation', 'saveInsurance', 'saveGoal', 'submitDeposit'
];
stubbedFunctions.forEach((name) => {
  if (!window[name]) {
    window[name] = () => showToast('This dashboard action is not wired in this patch.', 'info');
  }
});

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.switchSection = switchSection;
window.toggleNotifDropdown = toggleNotifDropdown;
window.markAllNotifRead = () => markAllNotifRead().catch((error) => showToast(error.message, 'error'));
window.refreshDashboard = () => refreshDashboard().catch((error) => showToast(error.message, 'error'));
window.linkBankAccount = () => linkBankAccount().catch((error) => showToast(error.message, 'error'));
window.syncBankAccounts = () => syncBankAccounts().catch((error) => showToast(error.message, 'error'));
window.loadTransactions = () => loadTransactions().catch((error) => showToast(error.message, 'error'));
window.changeDashboardTxPage = (delta) => changeDashboardTxPage(delta).catch((error) => showToast(error.message, 'error'));
window.refreshTransactionFeed = () => refreshTransactionFeed().catch((error) => showToast(error.message, 'error'));
window.saveBankAccount = () => saveBankAccount().catch((error) => showToast(error.message, 'error'));
window.importBankCSV = () => importBankCSV().catch((error) => showToast(error.message, 'error'));
window.generateUpiLink = () => generateUpiLink().catch((error) => showToast(error.message, 'error'));
window.saveUpiPayment = () => saveUpiPayment().catch((error) => showToast(error.message, 'error'));
window.runDeepSearch = () => runDeepSearch().catch((error) => showToast(error.message, 'error'));
window.setSearchQuery = setSearchQuery;
window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener('DOMContentLoaded', initDashboardApp);
