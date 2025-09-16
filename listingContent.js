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
// ✅ helper: wait until resumed
function waitUntilResumed(callback) {
  function check() {
    getPersistentFlags((flags) => {
      if (flags.isStopped) {
        console.log("Listing script: stopped, aborting wait.");
        return;
      }
      if (flags.isPaused) {
        setTimeout(check, 1000); // keep waiting
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

// Utility to read persistent flags (async)
function getPersistentFlags(callback) {
  chrome.storage.local.get(["scraperFlags"], (data) => {
    const flags = data.scraperFlags || { isPaused: false, isStopped: false };
    callback(flags);
  });
}

// Wait until listing links are available, then begin automation
function waitForListingsAndRunAutomation(retry = 0) {
  // check persistent flags first
  getPersistentFlags((flags) => {
    if (flags.isStopped) {
      console.log("Listing script: stopped (persisted). Won't start automation.");
      return;
    }

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
  });
}

// Extract all property detail URLs and open them in two batches
function runAutomation() {
  getPersistentFlags((flags) => {
    if (flags.isStopped) {
      console.log("Listing script: stopped (persisted). Aborting runAutomation.");
      isRunning = false;
      return;
    }
    if (flags.isPaused) {
      console.log("Listing script: paused (persisted). Will check again later.");
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

    chrome.runtime.sendMessage({
      type: "LISTINGS_COUNT",
      count: uniqueUrls.length,
    });

      chrome.runtime.sendMessage({
    type: "SET_PARENT",
    parentUrl: window.location.href,
  });
  
    chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: firstBatch });

    setTimeout(() => {
      openSecondBatch(secondBatch);
    }, BATCH_DELAY_MS);

    // schedule next page (pause-aware)
    setTimeout(() => {
      goToNextPagePauseAware();
    }, NEXT_PAGE_DELAY_MS);

    function openSecondBatch(secondBatch) {
      getPersistentFlags((flags) => {
        if (flags.isStopped) {
          console.log("⛔ Stopped: second batch not opened.");
          return;
        }
        if (flags.isPaused) {
          console.log("⏸ Paused: retrying second batch in 2s...");
          setTimeout(() => openSecondBatch(secondBatch), 2000);
          return;
        }
        if (secondBatch.length > 0) {
          console.log("▶️ Opening second batch...");
          chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
        }
      });
    }

    function goToNextPagePauseAware() {
      getPersistentFlags((flags) => {
        if (flags.isStopped) {
          console.log("⛔ Stopped: no navigation.");
          return;
        }
        if (flags.isPaused) {
          console.log("⏸ Paused: retrying next page in 2s...");
          setTimeout(goToNextPagePauseAware, 2000);
          return;
        }
        goToNextPage(); // your existing function
      });
    }

    setTimeout(() => {
      // check flags again before opening second batch
      getPersistentFlags((flags2) => {
        if (!flags2.isStopped && !flags2.isPaused && secondBatch.length > 0) {
          chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
        } else {
          console.log("Not opening second batch due to paused/stopped flags.");
        }
      });
    }, BATCH_DELAY_MS);

    setTimeout(() => {
      waitUntilResumed(() => {
        goToNextPage();
      });
      // goToNextPage();
    }, NEXT_PAGE_DELAY_MS);
  });
}

function goToNextPage() {
  getPersistentFlags((flags) => {
    if (flags.isStopped) {
      console.log("Listing script: stopped. Will not go to next page.");
      return;
    }
    if (flags.isPaused) {
      console.log("Listing script: paused. Waiting before next page...");
      setTimeout(goToNextPage, 2000);
      return;
    }

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
  });
}

