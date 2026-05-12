/**
 * Extracts a UPI reference number from free-form text.
 * @param {string} text
 * @returns {string|null}
 */
function extractReference(text) {
  const patterns = [
    /upi\s*(?:ref(?:erence)?\s*(?:no|number)?|utr)\s*[:\-]?\s*([A-Z0-9]{8,})/i,
    /(?:^|\W)(\d{10,18})(?:\W|$)/,
    /upi\/?([A-Z0-9]{8,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extracts a merchant VPA from free-form text.
 * @param {string} text
 * @returns {string|null}
 */
function extractVpa(text) {
  const match = text.match(/([a-z0-9._-]{2,}@[a-z]{2,}[a-z0-9.-]*)/i);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the first Rupee amount from free-form text.
 * @param {string} text
 * @returns {number|null}
 */
function extractAmount(text) {
  const match = text.match(/(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i);
  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1].replace(/,/g, ''));
}

/**
 * Parses common Indian UPI SMS or bank narration formats.
 * @param {string} message
 * @returns {{ referenceNumber: string|null, merchantVpa: string|null, merchantName: string|null, amount: number|null, isUpi: boolean }}
 */
function parseUPITransactionSms(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const isUpi = /\bupi\b|\bvpa\b|\bcollect\b|\bintent\b|@[a-z]/i.test(text);
  if (!text || !isUpi) {
    return {
      referenceNumber: null,
      merchantVpa: null,
      merchantName: null,
      amount: null,
      isUpi: false
    };
  }

  const merchantVpa = extractVpa(text);
  const referenceNumber = extractReference(text);
  const amount = extractAmount(text);

  let merchantName = null;
  const namePatterns = [
    /(?:paid to|sent to|to)\s+([^,.;]+?)(?:\s+(?:via|vpa|ref|utr|upi)|[,.;]|$)/i,
    /(?:merchant|payee|receiver)\s*[:\-]?\s*([^,.;]+?)(?:\s+(?:vpa|ref|utr|upi)|[,.;]|$)/i,
    /(?:from)\s+([^,.;]+?)(?:\s+(?:vpa|ref|utr|upi)|[,.;]|$)/i
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      merchantName = match[1].trim();
      break;
    }
  }

  if (!merchantName && merchantVpa) {
    merchantName = merchantVpa.split('@')[0].replace(/[._-]+/g, ' ');
  }

  if (!merchantName && lower.includes('upi/')) {
    const parts = text.split('/').map((part) => part.trim()).filter(Boolean);
    merchantName = parts.find((part) => /[a-z]/i.test(part) && !/upi/i.test(part) && !/^\d+$/.test(part)) || null;
  }

  return {
    referenceNumber,
    merchantVpa,
    merchantName,
    amount,
    isUpi: true
  };
}

module.exports = {
  parseUPITransactionSms
};
