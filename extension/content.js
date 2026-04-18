/**
 * Content script — auto-detects purchase amounts on e-commerce sites.
 * Works on: Amazon India, Flipkart, Swiggy, Zomato
 */
(function() {
  const host = window.location.hostname;
  let amount = null;
  let description = '';

  try {
    if (host.includes('amazon.in')) {
      const priceEl = document.querySelector('.a-price-whole, #priceblock_ourprice, .a-offscreen');
      const titleEl = document.querySelector('#productTitle');
      if (priceEl) amount = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
      if (titleEl) description = titleEl.textContent.trim().substring(0, 80);
    } else if (host.includes('flipkart.com')) {
      const priceEl = document.querySelector('._30jeq3._16Jk6d, ._1vC4OE._3qQ9m1');
      const titleEl = document.querySelector('.B_NuCI, ._35KyD6');
      if (priceEl) amount = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
      if (titleEl) description = titleEl.textContent.trim().substring(0, 80);
    } else if (host.includes('swiggy.com')) {
      const totalEl = document.querySelector('[class*="totalAmount"], [class*="bill-total"]');
      if (totalEl) amount = parseFloat(totalEl.textContent.replace(/[^0-9.]/g, ''));
      description = 'Swiggy Order';
    } else if (host.includes('zomato.com')) {
      const totalEl = document.querySelector('[class*="totalAmount"], [data-testid="bill-total"]');
      if (totalEl) amount = parseFloat(totalEl.textContent.replace(/[^0-9.]/g, ''));
      description = 'Zomato Order';
    }
  } catch (e) {}

  if (amount && amount > 0) {
    // Add a floating button to quick-add this as an expense
    const btn = document.createElement('button');
    btn.textContent = `💰 Add to SpendSense (₹${amount})`;
    btn.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #6366f1; color: white; border: none; padding: 10px 16px;
      border-radius: 25px; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 20px rgba(99,102,241,0.4); font-family: -apple-system, sans-serif;
    `;
    btn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'PREFILL_EXPENSE', amount, description });
      btn.textContent = '✓ Opening SpendSense...';
      setTimeout(() => btn.remove(), 2000);
    };
    document.body.appendChild(btn);
  }
})();
