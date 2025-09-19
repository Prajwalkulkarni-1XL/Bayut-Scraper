const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;
const SPA_CHECK_INTERVAL_MS = 1000;
const BATCH_DELAY_MS = 2 * 60 * 1000;
const NEXT_PAGE_DELAY_MS = 5 * 60 * 1000;

let isRunning = false;
let lastUrl = location.href;

console.log("🟢 Listing page script loaded");

function waitUntilResumed(callback) {
  function check() {
    getPersistentFlags((flags) => {
      if (flags.isStopped) {
        console.log("Listing script: stopped, aborting wait.");
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

waitForListingsAndRunAutomation();

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

function waitForListingsAndRunAutomation(retry = 0) {
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

// function runAutomation() {
//   getPersistentFlags((flags) => {
//     if (flags.isStopped) {
//       console.log("Listing script: stopped (persisted). Aborting runAutomation.");
//       isRunning = false;
//       return;
//     }
//     if (flags.isPaused) {
//       console.log("Listing script: paused (persisted). Will check again later.");
//       isRunning = false;
//       setTimeout(() => waitForListingsAndRunAutomation(), 2000);
//       return;
//     }

//     const links = [...document.querySelectorAll("a[href*='/property/details-']")];
//     const uniqueUrls = [...new Set(
//       links.map((a) => a.href).filter((url) =>
//         url.match(/https:\/\/www\.bayut\.com\/property\/details-\d+\.html/)
//       )
//     )];

//     if (uniqueUrls.length === 0) {
//       console.warn("⚠️ No valid URLs found.");
//       isRunning = false;
//       return;
//     }

//     console.log("unique", uniqueUrls)

//     const half = Math.ceil(uniqueUrls.length / 2);
//     const firstBatch = uniqueUrls.slice(0, half);
//     const secondBatch = uniqueUrls.slice(half);

//     chrome.runtime.sendMessage({
//       type: "LISTINGS_COUNT",
//       count: uniqueUrls.length,
//     });

//     chrome.runtime.sendMessage({
//     type: "SET_PARENT",
//     parentUrl: window.location.href,
//   });
  
//     chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: firstBatch });

//     // setTimeout(() => {
//     //   openSecondBatch(secondBatch);
//     // }, BATCH_DELAY_MS);

//     // setTimeout(() => {
//     //   goToNextPagePauseAware();
//     // }, NEXT_PAGE_DELAY_MS);

//     // function openSecondBatch(secondBatch) {
//     //   getPersistentFlags((flags) => {
//     //     if (flags.isStopped) {
//     //       console.log("⛔ Stopped: second batch not opened.");
//     //       return;
//     //     }
//     //     if (flags.isPaused) {
//     //       console.log("⏸ Paused: retrying second batch in 2s...");
//     //       setTimeout(() => openSecondBatch(secondBatch), 2000);
//     //       return;
//     //     }
//     //     if (secondBatch.length > 0) {
//     //       console.log("▶️ Opening second batch...");
//     //       chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
//     //     }
//     //   });
//     // }
 
//      setTimeout(() => {
//       getPersistentFlags((flags2) => {
//         if (flags2.isStopped) {
//           console.log("⛔ Stopped: second batch not opened.");
//           return;
//         }
//         if (flags2.isPaused) {
//           console.log("⏸ Paused: retrying second batch in 2s...");
//           setTimeout(() => openSecondBatch(secondBatch), 2000);
//           return;
//         }
//         if (secondBatch.length > 0) {
//           console.log("▶️ Opening second batch...");
//           chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
//         }
//       });
//     }, BATCH_DELAY_MS);

//     // function goToNextPagePauseAware() {
//     //   getPersistentFlags((flags) => {
//     //     if (flags.isStopped) {
//     //       console.log("⛔ Stopped: no navigation.");
//     //       return;
//     //     }
//     //     if (flags.isPaused) {
//     //       console.log("⏸ Paused: retrying next page in 2s...");
//     //       setTimeout(goToNextPagePauseAware, 2000);
//     //       return;
//     //     }
//     //     goToNextPage(); 
//     //   });
//     // }

//     // setTimeout(() => {
//     //   getPersistentFlags((flags2) => {
//     //     if (!flags2.isStopped && !flags2.isPaused && secondBatch.length > 0) {
//     //       chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
//     //     } else {
//     //       console.log("Not opening second batch due to paused/stopped flags.");
//     //     }
//     //   });
//     // }, BATCH_DELAY_MS);

//   //   setTimeout(() => {
//   //     waitUntilResumed(() => {
//   //       goToNextPage();
//   //     });
//   //   }, NEXT_PAGE_DELAY_MS);
//   // });

//   // Go to next page after delay
//     setTimeout(() => {
//       waitUntilResumed(() => goToNextPage());
//     }, NEXT_PAGE_DELAY_MS);
//   });

//   // Go to next page after delay (pause/stop aware)
// setTimeout(() => {
//   goToNextPagePauseAware();
// }, NEXT_PAGE_DELAY_MS);
// }

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

    console.log("unique", uniqueUrls);

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
            console.log("⛔ Stopped: skipping scheduled action.");
            return;
          }
          if (flags2.isPaused) {
            console.log("⏸ Paused: retrying scheduled action in 2s...");
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
        console.log("▶️ Opening second batch...");
        chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
      }, BATCH_DELAY_MS);
    }

    // Navigate to next page (pause/stop aware)
    scheduleAction(() => {
      goToNextPage();
    }, NEXT_PAGE_DELAY_MS);
  });
}

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

