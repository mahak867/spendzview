const bankingState = {
  accounts: [],
  transactionsPage: 1,
  transactionsTotalPages: 1
};

/**
 * Performs a JSON API request.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<any>}
 */
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Escapes HTML content.
 * @param {string} value
 * @returns {string}
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
 * Formats a number as INR currency.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(amount || 0));
}

/**
 * Returns a CSS badge class for a category or status.
 * @param {string} value
 * @returns {string}
 */
function badgeClass(value) {
  const normalized = String(value || 'other').toLowerCase();
  const aliases = {
    subscription: 'badge-entertainment',
    travel: 'badge-travel',
    transport: 'badge-transport',
    food: 'badge-food',
    shopping: 'badge-shopping',
    bills: 'badge-bills',
    health: 'badge-health',
    education: 'badge-education',
    entertainment: 'badge-entertainment',
    insurance: 'badge-insurance',
    income: 'badge-income',
    debit: 'badge-debit',
    credit: 'badge-credit',
    bank: 'badge-info',
    upi: 'badge-warning',
    completed: 'badge-success',
    generated: 'badge-info',
    failed: 'badge-danger'
  };
  return aliases[normalized] || 'badge-other';
}

/**
 * Displays a toast message.
 * @param {string} message
 * @param {'success'|'error'} type
 * @returns {void}
 */
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.borderColor = type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)';
  toast.innerHTML = `<div class="font-medium text-sm ${type === 'error' ? 'text-red-300' : 'text-emerald-300'}">${escapeHtml(message)}</div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/**
 * Opens a modal by id.
 * @param {string} id
 * @returns {void}
 */
function openModal(id) {
  const element = document.getElementById(id);
  if (element) {
    element.classList.add('open');
  }
}

/**
 * Closes a modal by id.
 * @param {string} id
 * @returns {void}
 */
function closeModal(id) {
  const element = document.getElementById(id);
  if (element) {
    element.classList.remove('open');
  }
}

/**
 * Updates the profile UI.
 * @returns {Promise<void>}
 */
async function loadProfile() {
  try {
    const { user } = await apiRequest('/api/auth/me');
    const initials = (user.name || 'U').trim().charAt(0).toUpperCase();
    ['sidebarUserAvatar', 'navUserAvatar'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = initials;
      }
    });
    const nameTargets = ['sidebarUserName', 'navUserName'];
    nameTargets.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = user.name || 'User';
      }
    });
    const email = document.getElementById('sidebarUserEmail');
    if (email) {
      email.textContent = user.email || '';
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/**
 * Loads notifications into the dropdown.
 * @returns {Promise<void>}
 */
async function loadNotifications() {
  try {
    const { notifications } = await apiRequest('/api/notifications?is_read=0');
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    if (!badge || !list) {
      return;
    }
    badge.textContent = notifications.length;
    badge.classList.toggle('hidden', notifications.length === 0);
    list.innerHTML = notifications.length
      ? notifications.map((notification) => `
          <div class="notif-item unread">
            <div class="font-medium text-sm text-white mb-1">${escapeHtml(notification.title)}</div>
            <div class="text-xs text-slate-400">${escapeHtml(notification.message || '')}</div>
          </div>
        `).join('')
      : '<div class="text-center py-6 text-slate-500 text-sm">No notifications</div>';
  } catch (error) {
    console.error(error);
  }
}

/**
 * Loads banking accounts and net worth widgets.
 * @returns {Promise<void>}
 */
async function loadLinkedAccounts() {
  const payload = await apiRequest('/api/banking/accounts');
  bankingState.accounts = payload.accounts || [];
  const accountsList = document.getElementById('bankAccountsList');
  const importSelect = document.getElementById('importBankId');
  const updated = document.getElementById('linkedAccountsUpdatedAt');
  const liveBalance = bankingState.accounts.reduce((sum, account) => sum + Number(account.live_balance || 0), 0);

  document.getElementById('linkedAccountsCount').textContent = String(bankingState.accounts.length);
  document.getElementById('bankingLiveBalance').textContent = formatCurrency(liveBalance);
  document.getElementById('bankingNetWorth').textContent = formatCurrency(payload.netWorth || 0);
  document.getElementById('bankingSavingsProgress').textContent = `Savings goals progress: ${Math.round(payload.savingsProgress || 0)}%`;
  document.getElementById('bankingSavingsBar').style.width = `${Math.max(0, Math.min(100, payload.savingsProgress || 0))}%`;
  const savingsTotal = document.getElementById('dashSavingsTotal');
  const savingsGoals = document.getElementById('dashSavingsGoals');
  if (savingsTotal) {
    savingsTotal.textContent = formatCurrency(payload.totalSavings || 0);
  }
  if (savingsGoals) {
    savingsGoals.textContent = `${bankingState.accounts.length} linked accounts`;
  }

  if (accountsList) {
    accountsList.innerHTML = bankingState.accounts.length
      ? bankingState.accounts.map((account) => `
          <div class="stat-card">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="text-white font-semibold text-sm">${escapeHtml(account.bank_name)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(account.account_number_masked || 'Manual account')}</div>
              </div>
              <span class="badge ${account.is_linked ? 'badge-info' : 'badge-other'}">${account.is_linked ? 'Setu' : 'Manual'}</span>
            </div>
            <div class="text-xl font-bold ${Number(account.live_balance || 0) < 500 ? 'text-red-400' : 'text-emerald-400'}">${formatCurrency(account.live_balance || 0)}</div>
            <div class="text-xs text-slate-500 mt-2 flex items-center justify-between gap-2">
              <span>${escapeHtml(account.account_type || 'savings')}</span>
              <span>${escapeHtml(account.last_synced || account.last_balance_at || 'Not synced')}</span>
            </div>
          </div>
        `).join('')
      : '<div class="empty-state"><div class="empty-icon">🏦</div>No linked accounts yet. Link Setu or add one manually.</div>';
  }

  if (importSelect) {
    importSelect.innerHTML = '<option value="">Select account</option>' + bankingState.accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.bank_name)} (${escapeHtml(account.account_number_masked || 'manual')})</option>`).join('');
  }

  if (updated) {
    const lastSync = bankingState.accounts.map((account) => account.last_synced || account.last_balance_at).filter(Boolean).sort().reverse()[0];
    updated.textContent = lastSync ? `Last updated ${lastSync}` : 'Awaiting sync';
  }
}

/**
 * Renders the transactions table.
 * @param {Array<object>} transactions
 * @returns {void}
 */
function renderTransactions(transactions) {
  const table = document.querySelector('#transactionsTable tbody');
  if (!table) {
    return;
  }
  table.innerHTML = transactions.length
    ? transactions.map((transaction) => `
        <tr>
          <td>${escapeHtml(transaction.date)}</td>
          <td>
            <div class="font-medium text-white flex items-center gap-2"><span>${escapeHtml(transaction.merchant_icon || '🏦')}</span><span>${escapeHtml(transaction.merchant_name || transaction.description || 'Transaction')}</span></div>
            <div class="text-xs text-slate-500 mt-1">${escapeHtml(transaction.description || transaction.reference_number || '')}</div>
          </td>
          <td><span class="badge ${badgeClass(transaction.category)}">${escapeHtml(transaction.category || 'Other')}</span></td>
          <td><span class="badge ${badgeClass(transaction.source)}">${escapeHtml(transaction.source)}</span></td>
          <td class="${transaction.type === 'credit' ? 'text-emerald-400' : 'text-red-400'} font-semibold">${transaction.type === 'credit' ? '+' : '-'}${formatCurrency(transaction.amount || 0)}</td>
          <td>${transaction.balance_after !== null && transaction.balance_after !== undefined ? formatCurrency(transaction.balance_after) : '—'}</td>
          <td><span class="badge ${badgeClass(transaction.status || (transaction.is_duplicate ? 'failed' : transaction.type))}">${transaction.status ? escapeHtml(transaction.status) : transaction.is_duplicate ? 'Duplicate' : escapeHtml(transaction.type)}</span></td>
        </tr>
      `).join('')
    : '<tr><td colspan="7" class="empty-state"><div class="empty-icon">🏛️</div>No transactions match your filters.</td></tr>';
}

/**
 * Loads paginated transactions.
 * @param {number} page
 * @returns {Promise<void>}
 */
async function loadTransactions(page = bankingState.transactionsPage) {
  bankingState.transactionsPage = Math.max(1, page);
  const params = new URLSearchParams({ page: String(bankingState.transactionsPage), limit: '8' });
  [['txDateFrom', 'startDate'], ['txDateTo', 'endDate'], ['txType', 'type'], ['txCategory', 'category'], ['txSearch', 'search']].forEach(([id, key]) => {
    const element = document.getElementById(id);
    if (element && element.value) {
      params.set(key, element.value);
    }
  });
  const payload = await apiRequest(`/api/banking/transactions?${params.toString()}`);
  renderTransactions(payload.transactions || []);
  bankingState.transactionsTotalPages = payload.pagination?.totalPages || 1;
  document.getElementById('transactionsPageMeta').textContent = `Page ${payload.pagination?.page || 1} of ${bankingState.transactionsTotalPages}`;
  document.getElementById('txResultsMeta').textContent = `${payload.pagination?.total || 0} results`;
  document.getElementById('txPrevBtn').disabled = bankingState.transactionsPage <= 1;
  document.getElementById('txNextBtn').disabled = bankingState.transactionsPage >= bankingState.transactionsTotalPages;
}

/**
 * Changes the current transaction page.
 * @param {number} delta
 * @returns {void}
 */
function changeTransactionsPage(delta) {
  const nextPage = bankingState.transactionsPage + delta;
  if (nextPage >= 1 && nextPage <= bankingState.transactionsTotalPages) {
    loadTransactions(nextPage).catch((error) => showToast(error.message, 'error'));
  }
}

/**
 * Starts a Setu account linking flow.
 * @returns {Promise<void>}
 */
async function startSetuLink() {
  try {
    const payload = await apiRequest('/api/banking/link', { method: 'POST', body: JSON.stringify({}) });
    if (payload.consent?.consent_url) {
      window.location.href = payload.consent.consent_url;
      return;
    }
    showToast('Consent created. Use the returned Setu URL to continue.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/**
 * Syncs linked accounts on demand.
 * @returns {Promise<void>}
 */
async function syncLinkedAccounts() {
  try {
    await apiRequest('/api/banking/sync', { method: 'POST', body: JSON.stringify({}) });
    showToast('Linked accounts synced successfully.');
    await Promise.all([loadLinkedAccounts(), loadTransactions(1), loadNotifications()]);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/**
 * Opens the manual bank account modal.
 * @returns {void}
 */
function openBankModal() {
  document.getElementById('bankEditId').value = '';
  openModal('bankAccountModal');
}

/**
 * Opens the CSV import modal.
 * @returns {void}
 */
function openImportModal() {
  openModal('importModal');
}

/**
 * Saves a manual bank account.
 * @returns {Promise<void>}
 */
async function saveBankAccount() {
  try {
    const id = document.getElementById('bankEditId').value;
    const body = {
      bank_name: document.getElementById('bankName').value,
      account_type: document.getElementById('bankType').value,
      account_number: document.getElementById('bankAccNum').value,
      ifsc_code: document.getElementById('bankIfsc').value,
      branch: document.getElementById('bankBranch').value,
      balance: document.getElementById('bankBalance').value,
      notes: document.getElementById('bankNotes').value
    };
    await apiRequest(id ? `/api/banking/accounts/${id}` : '/api/banking/accounts', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    closeModal('bankAccountModal');
    showToast('Bank account saved.');
    await loadLinkedAccounts();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/**
 * Imports a CSV statement.
 * @returns {Promise<void>}
 */
async function importBankCSV() {
  try {
    const fileInput = document.getElementById('importCsvFile');
    if (!fileInput.files.length) {
      throw new Error('Select a CSV statement first');
    }
    const formData = new FormData();
    formData.append('statement', fileInput.files[0]);
    const accountId = document.getElementById('importBankId').value;
    if (accountId) {
      formData.append('bank_account_id', accountId);
    }
    const response = await fetch('/api/banking/import', { method: 'POST', body: formData, credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'CSV import failed');
    }
    closeModal('importModal');
    showToast(`Imported ${payload.imported} transaction(s).`);
    await Promise.all([loadLinkedAccounts(), loadTransactions(1), loadNotifications()]);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/**
 * Toggles the sidebar on mobile layouts.
 * @returns {void}
 */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('translate-x-0');
  document.getElementById('sidebarOverlay').style.display = document.getElementById('sidebar').classList.contains('translate-x-0') ? 'block' : 'none';
}

/**
 * Closes the mobile sidebar.
 * @returns {void}
 */
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('translate-x-0');
  document.getElementById('sidebarOverlay').style.display = 'none';
}

/**
 * Toggles the notification dropdown.
 * @returns {void}
 */
function toggleNotifDropdown() {
  document.getElementById('notifDropdown').classList.toggle('open');
}

/**
 * Marks all notifications as read.
 * @returns {Promise<void>}
 */
async function markAllNotifRead() {
  await apiRequest('/api/notifications/read-all', { method: 'PUT' });
  await loadNotifications();
}

/**
 * Refreshes dashboard widgets that are implemented in this file.
 * @returns {Promise<void>}
 */
async function refreshDashboard() {
  await Promise.all([loadLinkedAccounts(), loadTransactions(1), loadNotifications()]);
}

/**
 * Initializes left-nav page switching.
 * @returns {void}
 */
function initNavigation() {
  const params = new URLSearchParams(window.location.search);
  const activeSection = params.get('section') || 'banking';
  const sections = document.querySelectorAll('.page-section');
  const navItems = document.querySelectorAll('.nav-item');

  const activate = (sectionName) => {
    sections.forEach((section) => section.classList.toggle('active', section.id === `section-${sectionName}`));
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.section === sectionName));
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) {
      breadcrumb.textContent = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
    }
  };

  navItems.forEach((item) => item.addEventListener('click', () => activate(item.dataset.section)));
  activate(activeSection);
}

/**
 * Initializes auth/logout bindings.
 * @returns {void}
 */
function initLogout() {
  const button = document.getElementById('logoutBtn');
  if (!button) {
    return;
  }
  button.addEventListener('click', async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initLogout();
  await Promise.allSettled([loadProfile(), loadNotifications(), loadLinkedAccounts(), loadTransactions(1)]);
  const params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'linked') {
    showToast('Bank account linked successfully.');
  } else if (params.get('status') === 'failed') {
    showToast('Bank linking failed. Check notifications for details.', 'error');
  }
});

window.closeModal = closeModal;
window.openBankModal = openBankModal;
window.openImportModal = openImportModal;
window.saveBankAccount = saveBankAccount;
window.importBankCSV = importBankCSV;
window.loadTransactions = loadTransactions;
window.changeTransactionsPage = changeTransactionsPage;
window.startSetuLink = startSetuLink;
window.syncLinkedAccounts = syncLinkedAccounts;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toggleNotifDropdown = toggleNotifDropdown;
window.markAllNotifRead = markAllNotifRead;
window.refreshDashboard = refreshDashboard;
