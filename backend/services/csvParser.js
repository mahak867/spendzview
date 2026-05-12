const fs = require('fs');
const { categorizeByRules } = require('./categorizerService');

/**
 * Parse a CSV statement into normalized transaction rows.
 * @param {string} filePath - Uploaded CSV file path.
 * @returns {Array<{date:string,description:string,amount:number,type:string,balance:number|null}>} Parsed rows.
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase().replace(/['"]/g, ''));
  const rows = [];

  const findCol = (...names) => {
    for (const name of names) {
      const index = headers.findIndex((header) => header.includes(name));
      if (index !== -1) {
        return index;
      }
    }
    return -1;
  };

  const dateIdx = findCol('date', 'txn date', 'transaction date', 'value date');
  const descIdx = findCol('description', 'narration', 'particulars', 'remarks', 'details');
  const amtIdx = findCol('amount');
  const debitIdx = findCol('debit', 'withdrawal');
  const creditIdx = findCol('credit', 'deposit');
  const balIdx = findCol('balance', 'closing balance');

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cols = lines[lineIndex].split(',').map((column) => column.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) {
      continue;
    }

    let amount = 0;
    let type = 'debit';

    const description = descIdx !== -1 ? cols[descIdx] : '';

    if (amtIdx !== -1) {
      const value = Number.parseFloat((cols[amtIdx] || '0').replace(/[^0-9.-]/g, ''));
      amount = Math.abs(value);
      if (value < 0) {
        type = 'debit';
      } else if (/credit|credited|salary|refund|interest|cashback|deposit|received/i.test(description)) {
        type = 'credit';
      } else {
        type = 'debit';
      }
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = Number.parseFloat((cols[debitIdx] || '0').replace(/[^0-9.]/g, ''));
      const credit = Number.parseFloat((cols[creditIdx] || '0').replace(/[^0-9.]/g, ''));
      if (debit > 0) {
        amount = debit;
        type = 'debit';
      } else if (credit > 0) {
        amount = credit;
        type = 'credit';
      }
    }

    const rawDate = dateIdx !== -1 ? cols[dateIdx] : '';
    const parsedDate = new Date(rawDate);
    rows.push({
      date: Number.isNaN(parsedDate.getTime()) ? rawDate : parsedDate.toISOString().split('T')[0],
      description,
      amount,
      type,
      balance: balIdx !== -1 ? Number.parseFloat((cols[balIdx] || '0').replace(/[^0-9.]/g, '')) : null
    });
  }

  return rows.filter((row) => row.amount > 0 && row.date);
}

/**
 * Preserve the legacy auto-category helper for existing imports.
 * @param {string} description - Transaction narration.
 * @returns {string} Rule-based category.
 */
function autoCategory(description) {
  return categorizeByRules(description, description) || 'Other';
}

module.exports = { parseCSV, autoCategory };
