// Background service worker for SpendSense Pro extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('SpendSense Pro extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PREFILL_EXPENSE') {
    chrome.storage.local.set({ autoAmount: msg.amount, autoDesc: msg.description }, () => {
      chrome.action.openPopup();
    });
  }
  return true;
});
