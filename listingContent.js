// -----------------------------------------------
// Change according to need
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;
const SPA_CHECK_INTERVAL_MS = 1000;
const BATCH_DELAY_MS = 2 * 60 * 1000;
const NEXT_PAGE_DELAY_MS = 5 * 60 * 1000;
// -----------------------------------------------

// Flags to control automation flow
let isRunning = false;
let lastUrl = location.href;

function waitUntilResumed(callback) {
  function check() {
    getPersistentFlags((flags) => {
      if (flags.isStopped) {
        return;
      }
      if (flags.isPaused) {
        setTimeout(check, 1000); 
      } else {
        callback();
      }
    });
  }
  check();
}

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

function getPersistentFlags(callback) {
  chrome.storage.local.get(["scraperFlags"], (data) => {
    const flags = data.scraperFlags || { isPaused: false, isStopped: false };
    callback(flags);
  });
}

// Wait until listing links are available, then begin automation
function waitForListingsAndRunAutomation(retry = 0) {
  getPersistentFlags((flags) => {
    if (flags.isStopped) {
      return;
    }

    if (isRunning) return;

    const listings = document.querySelectorAll("a[href*='/property/details-']");

    if (listings.length === 0 && retry < MAX_RETRIES) {
      setTimeout(() => waitForListingsAndRunAutomation(retry + 1), RETRY_DELAY_MS);
      return;
    }

    if (listings.length === 0) {
      console.warn("⚠️ No listings found after max retries.");
      return;
    }

    isRunning = true;
    runAutomation();
  });
}

// Extract all property detail URLs and open them in two batches
function runAutomation() {
  getPersistentFlags((flags) => {
    if (flags.isStopped) {
      isRunning = false;
      return;
    }
    if (flags.isPaused) {
      isRunning = false;
      setTimeout(() => waitForListingsAndRunAutomation(), 2000);
      return;
    }

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

    // Save metadata
    chrome.runtime.sendMessage({ type: "LISTINGS_COUNT", count: uniqueUrls.length });
    chrome.runtime.sendMessage({ type: "SET_PARENT", parentUrl: window.location.href });

    // Always open first batch immediately
    chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: firstBatch });

    // 🔑 Pause/stop-aware scheduler
    function scheduleAction(actionFn, delayMs) {
      setTimeout(() => {
        getPersistentFlags((flags2) => {
          if (flags2.isStopped) {
            return;
          }
          if (flags2.isPaused) {
            scheduleAction(actionFn, 2000);
            return;
          }
          actionFn();
        });
      }, delayMs);
    }

    // Open second batch (only once, pause/stop aware)
    if (secondBatch.length > 0) {
      scheduleAction(() => {
        chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
      }, BATCH_DELAY_MS);
    }

    // Navigate to next page (pause/stop aware)
    scheduleAction(() => {
      goToNextPage();
    }, NEXT_PAGE_DELAY_MS);
  });
}

// Navigate to next page OR notify background script if done
function goToNextPage() {

    const nextBtn = document.querySelector('a[title="Next"]');
    if (nextBtn && nextBtn.href) {
      isRunning = false;
      nextBtn.click();
    } else {
      const port = chrome.runtime.connect({ name: "category" });
      port.postMessage({ type: "CATEGORY_DONE" });
      port.onMessage.addListener((response) => {
      });
    }
}
