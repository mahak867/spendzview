const DEFAULT_BASE_URL = 'https://fiu-sandbox.setu.co';
const REQUEST_TIMEOUT_MS = 20000;

const PATHS = {
  createConsent: ['/api/consents', '/api/aa/consents', '/consents'],
  getConsent: (consentId) => [`/api/consents/${consentId}`, `/api/aa/consents/${consentId}`, `/consents/${consentId}`],
  getAccounts: (consentId) => [
    `/api/accounts?consentId=${encodeURIComponent(consentId)}`,
    `/api/aa/accounts?consentId=${encodeURIComponent(consentId)}`,
    `/accounts?consentId=${encodeURIComponent(consentId)}`
  ],
  getBalance: (accountId, consentId) => [
    `/api/accounts/${encodeURIComponent(accountId)}/balance?consentId=${encodeURIComponent(consentId)}`,
    `/api/accounts/balance?accountId=${encodeURIComponent(accountId)}&consentId=${encodeURIComponent(consentId)}`,
    `/accounts/${encodeURIComponent(accountId)}/balance?consentId=${encodeURIComponent(consentId)}`
  ],
  getStatement: (accountId, consentId, fromDate, toDate) => [
    `/api/accounts/${encodeURIComponent(accountId)}/statements?consentId=${encodeURIComponent(consentId)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    `/api/statements?accountId=${encodeURIComponent(accountId)}&consentId=${encodeURIComponent(consentId)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    `/accounts/${encodeURIComponent(accountId)}/statements?consentId=${encodeURIComponent(consentId)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`
  ]
};

/**
 * Returns the configured Setu base URL.
 * @returns {string}
 */
function getBaseUrl() {
  return (process.env.SETU_AA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

/**
 * Returns HTTP headers for Setu requests.
 * @returns {Record<string, string>}
 */
function getHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  if (process.env.SETU_CLIENT_ID && process.env.SETU_CLIENT_SECRET) {
    const token = Buffer.from(`${process.env.SETU_CLIENT_ID}:${process.env.SETU_CLIENT_SECRET}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
    headers['x-client-id'] = process.env.SETU_CLIENT_ID;
    headers['x-client-secret'] = process.env.SETU_CLIENT_SECRET;
  }

  return headers;
}

/**
 * Parses a fetch response body.
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

/**
 * Executes a Setu API request.
 * @param {string} method
 * @param {string} path
 * @param {any} body
 * @returns {Promise<any>}
 */
async function request(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `Setu request failed with status ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Tries a list of candidate endpoints until one succeeds.
 * @param {string} method
 * @param {string[]} paths
 * @param {any} body
 * @returns {Promise<any>}
 */
async function requestCandidates(method, paths, body) {
  let lastError;

  for (const path of paths) {
    try {
      return await request(method, path, body);
    } catch (error) {
      lastError = error;
      if (error.status && ![404, 405].includes(error.status)) {
        break;
      }
    }
  }

  throw lastError || new Error('Setu request failed');
}

/**
 * Normalizes a Setu consent response.
 * @param {any} payload
 * @returns {{ consentId: string|null, consentUrl: string|null, status: string, raw: any }}
 */
function mapConsent(payload) {
  return {
    consentId: payload?.id || payload?.consentId || payload?.data?.id || payload?.data?.consentId || null,
    consentUrl: payload?.url || payload?.consentUrl || payload?.redirectUrl || payload?.data?.url || payload?.data?.consentUrl || null,
    status: payload?.status || payload?.data?.status || 'pending',
    raw: payload
  };
}

/**
 * Normalizes Setu account objects.
 * @param {any} payload
 * @returns {Array<object>}
 */
function mapAccounts(payload) {
  const accounts = payload?.accounts || payload?.data?.accounts || payload?.linkedAccounts || payload?.fiAccounts || [];
  return accounts.map((account) => ({
    providerAccountId: account.id || account.accountId || account.linkRefNumber || account.refNumber,
    bankName: account.bankName || account.bank || account.fipName || 'Linked Bank',
    accountNumber: account.accountNumber || account.maskedAccNumber || account.maskedAccountNumber || null,
    maskedAccountNumber: account.maskedAccNumber || account.maskedAccountNumber || account.accountNumber || null,
    accountType: account.accountType || account.type || 'savings',
    ifscCode: account.ifsc || account.ifscCode || null,
    branch: account.branch || null,
    status: account.status || 'linked',
    metadata: account
  })).filter((account) => account.providerAccountId);
}

/**
 * Normalizes a Setu balance response.
 * @param {any} payload
 * @returns {{ balance: number, raw: any }}
 */
function mapBalance(payload) {
  const source = payload?.data || payload;
  const rawBalance = source?.currentBalance ?? source?.availableBalance ?? source?.balance ?? 0;
  return {
    balance: Number.parseFloat(rawBalance) || 0,
    raw: payload
  };
}

/**
 * Normalizes Setu transaction objects.
 * @param {any} payload
 * @returns {Array<object>}
 */
function mapTransactions(payload) {
  const transactions = payload?.transactions || payload?.data?.transactions || payload?.statement || payload?.entries || [];
  return transactions.map((transaction) => {
    const signedAmount = Number.parseFloat(transaction.amount ?? transaction.value ?? transaction.transactionAmount ?? 0) || 0;
    const type = transaction.type || transaction.txnType || transaction.mode || transaction.direction || (signedAmount < 0 ? 'debit' : 'credit');
    const amount = Math.abs(signedAmount);
    const dateValue = transaction.date || transaction.txnDate || transaction.valueDate || transaction.transactionTimestamp || transaction.createdAt;
    const date = new Date(dateValue);

    return {
      externalId: transaction.id || transaction.txnId || transaction.transactionId || transaction.referenceNumber || transaction.utr || `${dateValue || ''}:${amount}:${transaction.description || transaction.narration || ''}`,
      referenceNumber: transaction.referenceNumber || transaction.utr || transaction.ref || null,
      amount,
      type: /credit|cr/i.test(type) ? 'credit' : 'debit',
      description: transaction.description || transaction.narration || transaction.remarks || transaction.txnNarration || '',
      date: Number.isNaN(date.getTime()) ? String(dateValue || '').slice(0, 10) : date.toISOString().split('T')[0],
      balanceAfter: Number.parseFloat(transaction.balanceAfter ?? transaction.currentBalance ?? transaction.balance ?? 0) || null,
      raw: transaction
    };
  }).filter((transaction) => transaction.amount > 0 && transaction.date);
}

/**
 * Creates a Setu consent request.
 * @param {{ phone?: string, redirectUrl?: string, purpose?: string, consentDurationDays?: number, fromDate?: string, toDate?: string }} input
 * @returns {Promise<{ consentId: string|null, consentUrl: string|null, status: string, raw: any }>}
 */
async function initiateConsent(input = {}) {
  const now = new Date();
  const fromDate = input.fromDate || new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).toISOString().split('T')[0];
  const toDate = input.toDate || now.toISOString().split('T')[0];
  const payload = {
    redirectUrl: input.redirectUrl || process.env.SETU_REDIRECT_URL,
    phone: input.phone || null,
    purpose: input.purpose || 'Personal finance management and expense insights',
    consentDurationDays: Number.parseInt(input.consentDurationDays, 10) || 180,
    dataRange: { from: fromDate, to: toDate }
  };

  const response = await requestCandidates('POST', PATHS.createConsent, payload);
  return mapConsent(response);
}

/**
 * Fetches a Setu consent by id.
 * @param {string} consentId
 * @returns {Promise<{ consentId: string|null, consentUrl: string|null, status: string, raw: any }>}
 */
async function getConsent(consentId) {
  const response = await requestCandidates('GET', PATHS.getConsent(consentId));
  return mapConsent(response);
}

/**
 * Fetches linked accounts for a consent.
 * @param {string} consentId
 * @returns {Promise<Array<object>>}
 */
async function getAccounts(consentId) {
  const response = await requestCandidates('GET', PATHS.getAccounts(consentId));
  return mapAccounts(response);
}

/**
 * Fetches live balance for a linked account.
 * @param {string} accountId
 * @param {string} consentId
 * @returns {Promise<{ balance: number, raw: any }>}
 */
async function getBalance(accountId, consentId) {
  const response = await requestCandidates('GET', PATHS.getBalance(accountId, consentId));
  return mapBalance(response);
}

/**
 * Fetches bank statements for a linked account.
 * @param {string} accountId
 * @param {string} consentId
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<Array<object>>}
 */
async function getStatements(accountId, consentId, fromDate, toDate) {
  const response = await requestCandidates('GET', PATHS.getStatement(accountId, consentId, fromDate, toDate));
  return mapTransactions(response);
}

module.exports = {
  initiateConsent,
  getConsent,
  getAccounts,
  getBalance,
  getStatements
};
