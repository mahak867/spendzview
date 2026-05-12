const { runDeepSearchQuery } = require('./deepsearchService');

const CATEGORY_RULES = [
  { category: 'Food', keywords: ['swiggy', 'zomato', 'blinkit', 'zepto cafe', 'starbucks', 'dominos', 'mcdonald', 'restaurant', 'cafe', 'eatery'] },
  { category: 'Transport', keywords: ['uber', 'ola', 'rapido', 'metro', 'train', 'taxi', 'cab', 'fuel', 'petrol', 'diesel', 'parking', 'toll'] },
  { category: 'Subscription', keywords: ['netflix', 'spotify', 'prime video', 'youtube premium', 'chatgpt', 'adobe', 'github', 'subscription', 'renewal'] },
  { category: 'Bills', keywords: ['airtel', 'jio', 'bsnl', 'electricity', 'water', 'gas', 'internet', 'broadband', 'mobile recharge', 'utility'] },
  { category: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'nykaa', 'ajio', 'meesho', 'mall', 'store'] },
  { category: 'Health', keywords: ['apollo', 'pharmacy', 'medical', 'hospital', 'clinic', 'doctor', 'health'] },
  { category: 'Education', keywords: ['udemy', 'coursera', 'college', 'school', 'university', 'course', 'tuition'] },
  { category: 'Travel', keywords: ['makemytrip', 'goibibo', 'hotel', 'resort', 'airbnb', 'trip', 'holiday'] },
  { category: 'Entertainment', keywords: ['bookmyshow', 'cinema', 'game', 'entertainment', 'music'] },
  { category: 'Insurance', keywords: ['insurance', 'policy', 'premium', 'lic'] },
  { category: 'Income', keywords: ['salary', 'bonus', 'interest', 'refund', 'cashback', 'credited'] }
];

/**
 * Resolve a category from deterministic merchant rules.
 * @param {string} merchantName - Merchant-like text.
 * @param {string} description - Additional narration text.
 * @returns {string|null} Matching category.
 */
function categorizeByRules(merchantName, description = '') {
  const sample = `${merchantName || ''} ${description || ''}`.toLowerCase();
  if (!sample.trim()) {
    return null;
  }

  const rule = CATEGORY_RULES.find((entry) => entry.keywords.some((keyword) => sample.includes(keyword)));
  return rule ? rule.category : null;
}

/**
 * Categorize a transaction, falling back to the in-app DeepSearch engine.
 * @param {{userId:number, merchantName?:string, description?:string, amount?:number, type?:string}} payload - Transaction context.
 * @returns {Promise<{category:string, source:string}>} Resolved category and source.
 */
async function categorizeTransaction(payload) {
  const merchantName = payload?.merchantName || '';
  const description = payload?.description || '';
  const ruleBased = categorizeByRules(merchantName, description);
  if (ruleBased) {
    return { category: ruleBased, source: 'rules' };
  }

  if (!payload?.userId) {
    return { category: 'Other', source: 'fallback' };
  }

  const deepSearch = runDeepSearchQuery(
    payload.userId,
    `Categorize merchant "${merchantName || description || 'Unknown merchant'}" for a ${payload?.type || 'bank'} transaction of ₹${Math.abs(Number(payload?.amount || 0)).toFixed(2)}.`
  );
  const category = deepSearch?.results?.find((result) => result.type === 'category')?.value || 'Other';
  return { category, source: category === 'Other' ? 'fallback' : 'deepsearch' };
}

module.exports = {
  categorizeByRules,
  categorizeTransaction
};
