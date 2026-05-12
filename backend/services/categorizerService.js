const CATEGORY_RULES = [
  { pattern: /swiggy|zomato|domino|pizza|kfc|mcdonald|restaurant|cafe|food/i, category: 'Food', icon: '🍔' },
  { pattern: /uber|ola|rapido|metro|bus|train|railway|flight|airport|travel/i, category: 'Travel', icon: '🚕' },
  { pattern: /netflix|spotify|amazon\s*prime|hotstar|youtube|sony liv|disney/i, category: 'Subscription', icon: '🎬' },
  { pattern: /amazon|flipkart|myntra|nykaa|meesho|store|mart|shop/i, category: 'Shopping', icon: '🛍️' },
  { pattern: /electricity|water|gas|internet|broadband|airtel|jio|bsnl|mobile|recharge|utility/i, category: 'Bills', icon: '💡' },
  { pattern: /apollo|pharmacy|hospital|clinic|medical|medicine|health/i, category: 'Health', icon: '🏥' },
  { pattern: /school|college|university|tuition|course|udemy|coursera|education/i, category: 'Education', icon: '📚' },
  { pattern: /lic|insurance|policy|premium/i, category: 'Insurance', icon: '🛡️' },
  { pattern: /salary|credited|refund|interest|cashback|dividend|income/i, category: 'Income', icon: '💰' },
  { pattern: /movie|cinema|playstation|steam|bookmyshow|entertain/i, category: 'Entertainment', icon: '🎮' },
  { pattern: /fuel|petrol|diesel|parking|toll|cab|transport/i, category: 'Transport', icon: '⛽' }
];

const CATEGORY_ICON_MAP = {
  Food: '🍔',
  Travel: '✈️',
  Subscription: '🎬',
  Shopping: '🛍️',
  Bills: '💡',
  Health: '🏥',
  Education: '📚',
  Insurance: '🛡️',
  Income: '💰',
  Entertainment: '🎮',
  Transport: '🚕',
  Other: '🏦'
};

/**
 * Normalizes merchant or narration text.
 * @param {string} text
 * @returns {string}
 */
function normalizeMerchant(text) {
  return String(text || '')
    .replace(/\b(?:upi|neft|imps|rtgs|txn|utr|ref|payment|transfer|credited|debited)\b/gi, ' ')
    .replace(/[0-9]{6,}/g, ' ')
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps free-form text to a category using local rules.
 * @param {string} text
 * @returns {{ category: string, merchant: string, icon: string, source: string }}
 */
function categorizeDescriptionSync(text) {
  const merchant = normalizeMerchant(text);
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(merchant)) {
      return {
        category: rule.category,
        merchant,
        icon: rule.icon,
        source: 'rules'
      };
    }
  }

  return {
    category: 'Other',
    merchant,
    icon: CATEGORY_ICON_MAP.Other,
    source: 'fallback'
  };
}

/**
 * Infers a category from a DeepSearch response body.
 * @param {any} payload
 * @returns {string|null}
 */
function resolveCategoryFromPayload(payload) {
  const candidates = [
    payload?.category,
    payload?.summary,
    ...(Array.isArray(payload?.results) ? payload.results.map((result) => `${result.label || ''} ${result.value || ''}`) : []),
    ...(Array.isArray(payload?.recommendations) ? payload.recommendations : [])
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = String(candidate).toLowerCase();
    for (const category of Object.keys(CATEGORY_ICON_MAP)) {
      if (normalized.includes(category.toLowerCase())) {
        return category;
      }
    }
  }

  return null;
}

/**
 * Returns the application base URL for server-side API calls.
 * @returns {string}
 */
function getAppBaseUrl() {
  return process.env.APP_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/**
 * Calls the DeepSearch endpoint to classify an unknown merchant.
 * @param {string} description
 * @param {string|undefined} cookie
 * @returns {Promise<string|null>}
 */
async function queryDeepSearchCategory(description, cookie) {
  if (!cookie) {
    return null;
  }

  const response = await fetch(`${getAppBaseUrl()}/api/deepsearch/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      query: `Classify merchant "${description}" into exactly one category: Food, Travel, Subscription, Shopping, Bills, Health, Education, Insurance, Income, Entertainment, Transport, Other.`
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return resolveCategoryFromPayload(payload);
}

/**
 * Categorizes a transaction description using rules first and DeepSearch second.
 * @param {{ description: string, cookie?: string }} input
 * @returns {Promise<{ category: string, merchant: string, icon: string, source: string }>}
 */
async function categorizeDescription(input) {
  const text = input?.description || '';
  const cookie = input?.cookie;
  const local = categorizeDescriptionSync(text);
  if (local.category !== 'Other') {
    return local;
  }

  try {
    const aiCategory = await queryDeepSearchCategory(local.merchant || text, cookie);
    if (aiCategory && CATEGORY_ICON_MAP[aiCategory]) {
      return {
        category: aiCategory,
        merchant: local.merchant,
        icon: CATEGORY_ICON_MAP[aiCategory],
        source: 'deepsearch'
      };
    }
  } catch (error) {
    // Ignore DeepSearch fallback errors and return Other.
  }

  return local;
}

/**
 * Resolves an icon for a category or description.
 * @param {string} category
 * @param {string} description
 * @returns {string}
 */
function getMerchantIcon(category, description) {
  const local = categorizeDescriptionSync(description);
  if (local.icon && local.category !== 'Other') {
    return local.icon;
  }

  return CATEGORY_ICON_MAP[category] || CATEGORY_ICON_MAP.Other;
}

module.exports = {
  categorizeDescription,
  categorizeDescriptionSync,
  getMerchantIcon,
  normalizeMerchant,
  resolveCategoryFromPayload
};
