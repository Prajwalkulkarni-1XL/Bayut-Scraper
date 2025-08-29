// -----------------------------------------------
// Change according to need
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;
const SPA_CHECK_INTERVAL_MS = 1000;
const BATCH_DELAY_MS = 1 * 60 * 1000;
const NEXT_PAGE_DELAY_MS = 5 * 60 * 1000;
// -----------------------------------------------

// Flags to control automation flow
let isRunning = false;
let lastUrl = location.href;

console.log("🟢 Listing page script loaded");

// Start scraping process as soon as script loads
waitForListingsAndRunAutomation();

// Monitor for URL changes (SPA handling)
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    isRunning = false;
    waitForListingsAndRunAutomation();
  }
}, SPA_CHECK_INTERVAL_MS);

// Wait until listing links are available, then begin automation
function waitForListingsAndRunAutomation(retry = 0) {
  if (isRunning) return;

  const listings = document.querySelectorAll("a[href*='/property/details-']");

  if (listings.length === 0 && retry < MAX_RETRIES) {
    console.log("⏳ Waiting for listings... retry", retry);
    setTimeout(() => waitForListingsAndRunAutomation(retry + 1), RETRY_DELAY_MS);
    return;
  }

  if (listings.length === 0) {
    console.warn("⚠️ No listings found after max retries.");
    return;
  }

  isRunning = true;
  runAutomation();
}

// Extract all property detail URLs and open them in two batches
function runAutomation() {
  const links = [...document.querySelectorAll("a[href*='/property/details-']")];
  const uniqueUrls = [...new Set(
    links.map((a) => a.href).filter((url) =>
      url.match(/https:\/\/www\.bayut\.com\/property\/details-\d+\.html/)
    )
  )];

  if (uniqueUrls.length === 0) {
    console.warn("⚠️ No valid URLs found.");
    isRunning = false;
    return;
  }

  const half = Math.ceil(uniqueUrls.length / 2);
  const firstBatch = uniqueUrls.slice(0, half);
  const secondBatch = uniqueUrls.slice(half);

  chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: firstBatch });

  setTimeout(() => {
    if (secondBatch.length > 0) {
      chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
    }
  }, BATCH_DELAY_MS);

  setTimeout(() => {
    goToNextPage();
  }, NEXT_PAGE_DELAY_MS);
}

// Navigate to next page OR notify background script if done
function goToNextPage() {
  const nextBtn = document.querySelector('a[title="Next"]');

  if (nextBtn && nextBtn.href) {
    console.log("➡️ Moving to next page...");
    isRunning = false;
    nextBtn.click();
  } else {
    console.log("✅ No Next button, category done.");
    const port = chrome.runtime.connect({ name: "category" });
    port.postMessage({ type: "CATEGORY_DONE" });

    port.onMessage.addListener((response) => {
      console.log("✅ Background responded:", response);
    });
  }
}
