const DEFAULT_SERVER = 'http://localhost:3000';

let serverUrl = DEFAULT_SERVER;

async function init() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;

  // Load server URL from storage
  const stored = await chrome.storage.local.get(['serverUrl', 'autoAmount', 'autoDesc']);
  if (stored.serverUrl) serverUrl = stored.serverUrl;
  document.getElementById('serverDisplay').textContent = serverUrl.replace('http://', '').replace('https://', '');

  // Pre-fill from content script data if available
  if (stored.autoAmount) { document.getElementById('amount').value = stored.autoAmount; chrome.storage.local.remove('autoAmount'); }
  if (stored.autoDesc) { document.getElementById('description').value = stored.autoDesc; chrome.storage.local.remove('autoDesc'); }

  // Check login status
  try {
    const resp = await fetch(`${serverUrl}/api/auth/me`, { credentials: 'include' });
    if (!resp.ok) showLoginPrompt();
  } catch (e) {
    showStatus('Cannot connect to SpendSense Pro server', 'error');
  }
}

function showLoginPrompt() {
  document.getElementById('loginPrompt').classList.remove('hidden');
  document.getElementById('addForm').classList.add('hidden');
}

async function saveExpense() {
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value;
  const payment_method = document.getElementById('payment').value;

  if (!amount || amount <= 0) return showStatus('Please enter a valid amount', 'error');
  if (!date) return showStatus('Please select a date', 'error');

  const btn = document.getElementById('saveBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const resp = await fetch(`${serverUrl}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, date, category, description, payment_method })
    });

    if (resp.status === 401) { showLoginPrompt(); return; }
    if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to save');

    showStatus('✓ Expense saved successfully!', 'success');
    document.getElementById('amount').value = '';
    document.getElementById('description').value = '';
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    showStatus(e.message || 'Failed to save expense', 'error');
  } finally {
    btn.textContent = '+ Add Expense';
    btn.disabled = false;
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  setTimeout(() => { el.className = 'status hidden'; }, 3000);
}

function openDashboard() {
  chrome.tabs.create({ url: `${serverUrl}/dashboard` });
}

document.addEventListener('DOMContentLoaded', init);
