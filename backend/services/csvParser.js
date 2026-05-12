const fs = require('fs');
const { categorizeDescriptionSync } = require('./categorizerService');

/**
 * Finds the first matching CSV column index.
 * @param {string[]} headers
 * @param {...string} names
 * @returns {number}
 */
function findColumn(headers, ...names) {
  for (const name of names) {
    const index = headers.findIndex((header) => header.includes(name));
    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

/**
 * Parses a CSV bank statement into transaction rows.
 * @param {string} filePath
 * @returns {Array<{ date: string, description: string, amount: number, type: string, balance: number|null, referenceNumber: string|null }>}
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase().replace(/['"]/g, ''));
  const rows = [];
  const dateIdx = findColumn(headers, 'date', 'txn date', 'transaction date', 'value date');
  const descIdx = findColumn(headers, 'description', 'narration', 'particulars', 'remarks', 'details');
  const amountIdx = findColumn(headers, 'amount');
  const debitIdx = findColumn(headers, 'debit', 'withdrawal');
  const creditIdx = findColumn(headers, 'credit', 'deposit');
  const balanceIdx = findColumn(headers, 'balance', 'closing balance');
  const referenceIdx = findColumn(headers, 'reference', 'utr', 'ref no', 'cheque no');

  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(',').map((column) => column.trim().replace(/^["']|["']$/g, ''));
    if (columns.length < 2) continue;

    let amount = 0;
    let type = 'debit';

    if (amountIdx !== -1) {
      const parsedAmount = Number.parseFloat((columns[amountIdx] || '0').replace(/[^0-9.-]/g, '')) || 0;
      amount = Math.abs(parsedAmount);
      type = parsedAmount < 0 ? 'debit' : 'credit';
    } else {
      const debit = debitIdx !== -1 ? Number.parseFloat((columns[debitIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
      const credit = creditIdx !== -1 ? Number.parseFloat((columns[creditIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
      if (debit > 0) {
        amount = debit;
        type = 'debit';
      } else if (credit > 0) {
        amount = credit;
        type = 'credit';
      }
    }

    const rawDate = dateIdx !== -1 ? columns[dateIdx] : '';
    const parsedDate = new Date(rawDate);
    const date = Number.isNaN(parsedDate.getTime()) ? rawDate : parsedDate.toISOString().split('T')[0];
    rows.push({
      date,
      description: descIdx !== -1 ? columns[descIdx] : '',
      amount,
      type,
      balance: balanceIdx !== -1 ? Number.parseFloat((columns[balanceIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : null,
      referenceNumber: referenceIdx !== -1 ? columns[referenceIdx] || null : null
    });
  }

  return rows.filter((row) => row.amount > 0 && row.date);
}

/**
 * Returns a rule-based category for CSV imports.
 * @param {string} description
 * @returns {string}
 */
function autoCategory(description) {
  return categorizeDescriptionSync(description).category;
}

module.exports = { parseCSV, autoCategory };
