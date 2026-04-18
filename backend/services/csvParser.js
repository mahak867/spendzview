const fs = require('fs');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const rows = [];

  const findCol = (...names) => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateIdx = findCol('date', 'txn date', 'transaction date', 'value date');
  const descIdx = findCol('description', 'narration', 'particulars', 'remarks', 'details');
  const amtIdx = findCol('amount');
  const debitIdx = findCol('debit', 'withdrawal');
  const creditIdx = findCol('credit', 'deposit');
  const balIdx = findCol('balance', 'closing balance');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;

    let amount = 0;
    let type = 'debit';

    if (amtIdx !== -1) {
      const val = parseFloat(cols[amtIdx]?.replace(/[^0-9.-]/g, '') || '0');
      amount = Math.abs(val);
      type = val < 0 ? 'debit' : 'credit';
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = parseFloat(cols[debitIdx]?.replace(/[^0-9.]/g, '') || '0');
      const credit = parseFloat(cols[creditIdx]?.replace(/[^0-9.]/g, '') || '0');
      if (debit > 0) { amount = debit; type = 'debit'; }
      else if (credit > 0) { amount = credit; type = 'credit'; }
    }

    const rawDate = dateIdx !== -1 ? cols[dateIdx] : '';
    let date = rawDate;
    // Try to parse common date formats
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      date = d.toISOString().split('T')[0];
    }

    rows.push({
      date,
      description: descIdx !== -1 ? cols[descIdx] : '',
      amount,
      type,
      balance: balIdx !== -1 ? parseFloat(cols[balIdx]?.replace(/[^0-9.]/g, '') || '0') : null
    });
  }

  return rows.filter(r => r.amount > 0 && r.date);
}

function autoCategory(description) {
  const d = (description || '').toLowerCase();
  if (/swiggy|zomato|uber\s*eat|food|restaurant|cafe|domino|mcdonald|pizza|kfc/.test(d)) return 'Food';
  if (/uber|ola|rapido|cab|taxi|metro|bus|train|flight|railway/.test(d)) return 'Transport';
  if (/netflix|spotify|amazon\s*prime|hotstar|youtube|disney|hbo|apple\s*tv/.test(d)) return 'Entertainment';
  if (/hospital|medical|pharmacy|apollo|doctor|clinic|health|medicine/.test(d)) return 'Health';
  if (/electricity|water|gas|internet|broadband|airtel|jio|bsnl|mobile|recharge/.test(d)) return 'Bills';
  if (/amazon|flipkart|myntra|nykaa|meesho|shop|store|mall/.test(d)) return 'Shopping';
  if (/school|college|university|tuition|course|udemy|coursera|book/.test(d)) return 'Education';
  if (/insurance|lic|policy|premium/.test(d)) return 'Insurance';
  if (/salary|credited|neft|imps|rtgs/.test(d)) return 'Income';
  return 'Other';
}

module.exports = { parseCSV, autoCategory };