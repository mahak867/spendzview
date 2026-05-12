/**
 * Normalize a currency amount string into a number.
 * @param {string|number|null|undefined} value - Raw amount value.
 * @returns {number|null} Parsed amount.
 */
function parseAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const amount = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

/**
 * Parse UPI details from SMS-like transaction text.
 * @param {string} text - Raw SMS or narration text.
 * @param {number|string|null} fallbackAmount - Optional fallback amount.
 * @returns {{upiRefNo:string|null, merchantVpa:string|null, merchantName:string|null, amount:number|null}|null} Parsed UPI details.
 */
function parseUpiTransaction(text, fallbackAmount = null) {
  const source = String(text || '').trim();
  if (!source) {
    return null;
  }

  const normalized = source.replace(/\s+/g, ' ');
  const upiRefMatch = normalized.match(/(?:UPI(?:\s+Ref(?:erence)?)?\s*(?:No|Number)?|UTR|Ref(?:erence)?)\s*[:#-]?\s*([A-Z0-9]{8,})/i)
    || normalized.match(/UPI\/(?:P2A|COLLECT|PAY)?\/?([A-Z0-9]{8,})/i);
  const merchantVpaMatch = normalized.match(/([a-z0-9._-]+@[a-z]{2,})/i);
  const merchantNameMatch = normalized.match(/(?:paid to|sent to|debited to|credited from|for)\s+([A-Za-z0-9 .&'-]{2,60}?)(?:\s+via\s+UPI|\s+UPI|\s+Ref|$)/i);
  const amountMatch = normalized.match(/(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i)
    || normalized.match(/amount\s*[:=-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);

  const parsed = {
    upiRefNo: upiRefMatch ? upiRefMatch[1].trim() : null,
    merchantVpa: merchantVpaMatch ? merchantVpaMatch[1].toLowerCase() : null,
    merchantName: merchantNameMatch ? merchantNameMatch[1].trim() : null,
    amount: parseAmount(amountMatch ? amountMatch[1] : fallbackAmount)
  };

  if (!parsed.upiRefNo && !parsed.merchantVpa && !/\bupi\b/i.test(normalized)) {
    return null;
  }

  return parsed;
}

module.exports = {
  parseUpiTransaction
};
