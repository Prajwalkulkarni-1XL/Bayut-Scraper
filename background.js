let currentCategory = null;
let isPaused = false;
let isStopped = false;
let urlQueue = [];
let processing = false;

// Constants
const API_BASE_URL = "http://localhost:8000/api";
const CATEGORY_NEXT_ENDPOINT = `${API_BASE_URL}/category/next`;
const CATEGORY_UNLOCK_ENDPOINT = `${API_BASE_URL}/category/unlock`;

// -----------------------------------------------
// Change according to need
const TAB_OPEN_DELAY = 1000;
// -----------------------------------------------

// Save flags
function saveFlagsToStorage() {
  chrome.storage.local.set(
    { scraperFlags: { isPaused, isStopped } },
    () => console.log("Saved flags:", { isPaused, isStopped })
  );
}

// Ensure flags are loaded from storage on startup / service worker start
async function loadFlagsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["scraperFlags"], (data) => {
      const flags = data.scraperFlags || {};
      isPaused = !!flags.isPaused;
      isStopped = !!flags.isStopped;
      console.log("Loaded flags from storage:", { isPaused, isStopped });
      resolve(flags);
    });
  });
}

// Persist flags to storage
// function saveFlagsToStorage() {
//   chrome.storage.local.set({ scraperFlags: { isPaused: !!isPaused, isStopped: !!isStopped } }, () => {
//     console.log("Saved flags to storage:", { isPaused, isStopped });
//   });
// }

// function saveFlagsToStorage() {
//   chrome.storage.local.set(
//     { scraperFlags: { isPaused: !!isPaused, isStopped: !!isStopped } },
//     () => console.log("Saved flags:", { isPaused, isStopped })
//   );
// }


// STOP resets everything

function stopScraping() {
  isStopped = true;
  isPaused = false;
  urlQueue = [];              // ✅ empty queue permanently
  processing = false;         // ✅ break loop
  saveFlagsToStorage();
  console.log("🛑 STOPPED: queue cleared, scraping halted");

  chrome.storage.local.remove(["currentCategory", "progress"], () => {
    console.log("Cleared currentCategory and progress from storage");
  });
}

// Enqueue & process URLs
function enqueueUrls(urls) {
  if (isStopped) return; // ✅ don’t add if stopped
  urlQueue.push(...urls);
  if (!processing) processQueue();
}

// async function processQueue() {
//   processing = true;
//   while (urlQueue.length > 0) {
//     if (isStopped) {
//       urlQueue = [];
//       break;
//     }
//     if (isPaused) {
//       await new Promise(res => setTimeout(res, 1000));
//       continue;
//     }

//     const url = urlQueue.shift();
//     if (url) chrome.tabs.create({ url, active: false });

//     await new Promise(res => setTimeout(res, TAB_OPEN_DELAY));
//   }
//   processing = false;
// }
// On service worker start - load flags

async function processQueue() {
  if (processing) return;
  processing = true;
  console.log("🔁 processQueue started");

  while (urlQueue.length > 0) {
    // ⬇️ always check fresh flags from chrome.storage
    const flags = await new Promise((resolve) => {
      chrome.storage.local.get(["scraperFlags"], (data) => {
        resolve(data.scraperFlags || { isPaused: false, isStopped: false });
      });
    });

    if (flags.isStopped) {
      console.log("🛑 STOP detected -> clearing queue and exiting loop.");
      urlQueue = [];
      break;
    }

    if (flags.isPaused) {
      console.log("⏸ Paused: waiting...");
      await new Promise((res) => setTimeout(res, 1000)); // wait 1s
      continue; // loop again → re-check flags
    }

    const url = urlQueue.shift();
    if (!url) continue;

    console.log("Opening tab:", url);
    await new Promise((resolve) =>
      chrome.tabs.create({ url, active: false }, () => resolve())
    );

    await new Promise((res) => setTimeout(res, TAB_OPEN_DELAY));
  }

  processing = false;
  console.log("✅ processQueue finished");
}

loadFlagsFromStorage();

// When the extension is installed, generate and store a device ID
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("deviceId", (result) => {
    if (!result.deviceId) {
      const newDeviceId = crypto.randomUUID();
      chrome.storage.local.set({ deviceId: newDeviceId }, () => {
        console.log("New device ID saved:", newDeviceId);
      });
    }
  });
});

// Listen for messages from popup or content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received:", message);

  if (message.type === "START_SCRAPING") {
    // Start the scraping process
    isPaused = false;
    isStopped = false;
    saveFlagsToStorage();
    startCategoryScraping();
  }

   if (message.type === "PAUSE_SCRAPING") {
    isPaused = true;
    saveFlagsToStorage();
    // if (message.persistent) saveFlagsToStorage();
    // console.log("⏸️ Scraping paused (persistent:", !!message.persistent, ")");
  
  }

  if (message.type === "RESUME_SCRAPING_DATA") {
    isPaused = false;
    saveFlagsToStorage();
  }

  if (message.type === "STOP_SCRAPING") {
     stopScraping();
  }

  if (message.type === "RESUME_SCRAPING1") {
    chrome.storage.local.get("lastOpened", (data) => {
      console.log("lastOpened>>>>>>>>", data.lastOpened);
      //   data.parentUrl
      //     ? openCurrentCategory({ categoryUrl: data.parentUrl })
      chrome.tabs.create({ url: data.lastOpened.parentUrl });
    });
  }

  if (message.type === "OPEN_URLS") {
    // Open listing URLs in tabs
    openUrlsInBatches(message.urls);
  }

  if (message.type === "LISTINGS_COUNT") {
    chrome.storage.local.get("progress", (data) => {
      const progress = data.progress || {};
      progress.totalListings = (progress.totalListings || 0) + message.count;
      progress.lastUpdated = new Date().toISOString();
      chrome.storage.local.set({ progress });
    });
  }

});

// Listen for messages from popup or cotent and send device id
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_DEVICE_ID") {
    chrome.storage.local.get("deviceId", (result) => {
      sendResponse({ deviceId: result.deviceId });
    });
    return true; // keep message channel open
  }
});

// Fetch and lock one category to start scraping
async function startCategoryScraping() {
  chrome.storage.local.get("deviceId", async ({ deviceId }) => {
    try {

      if (!deviceId) {
        console.error("No deviceId found, scraping will not start.");
        return;
      }

      const res = await fetch(`${CATEGORY_NEXT_ENDPOINT}?deviceId=${deviceId}`);
      const json = await res.json();

      if (json.success && json.data) {
        currentCategory = json.data;
        console.log("Locked category:", currentCategory.categoryName);
        chrome.storage.local.set({ currentCategory }, () => {
          console.log("🔒 Category locked and stored:", currentCategory.categoryName);
        });
        openCurrentCategory(currentCategory);
        initProgressForCategory(json.data._id);
      } else {
        console.warn("No more categories.");
      }
    } catch (err) {
      console.error("Error locking category:", err);
    }
  });
}

// Unlock current category and start next
function unlockAndMoveToNextCategory() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["deviceId", "currentCategory"], ({ deviceId, currentCategory: storedCategory }) => {
      if (!deviceId || !storedCategory?._id) {
        reject("Missing device ID or current category.");
        return;
      }

      fetch(CATEGORY_UNLOCK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: storedCategory._id,
          deviceId: deviceId,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed with status ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("✅ Category unlocked:", storedCategory.categoryName);
          chrome.storage.local.remove("currentCategory");
          currentCategory = null;
          resolve();
        })
        .catch((err) => {
          console.error("Error unlocking category:", err);
          reject(err);
        });
    });
  });
}

// Open the category URL in a new tab and inject the automation script
function openCurrentCategory(category) {
  chrome.tabs.create({ url: category.categoryUrl }, (tab) => {
    const tabId = tab.id;

    // Wait for the tab to finish loading before injecting the script
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
      }
    });
  });
}

let parentUrl = null;
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SET_PARENT") {
    parentUrl = msg.parentUrl;
    console.log("parentUrl>>>>>>>>", parentUrl);
  }
});

// Open listing URLs in new tabs, one at a time with delay
function openUrlsInBatches(urls) {
  console.log(`Opening ${urls.length} URLs...`);
  let index = 0;

  urlQueue = urlQueue.concat(urls);

  function openNext() {
   if (urlQueue.length === 0) return; // ✅ nothing left
    chrome.storage.local.get(["scraperFlags"], ({ scraperFlags }) => {
      // const paused = !!(scraperFlags && scraperFlags.isPaused);
      // const stopped = !!(scraperFlags && scraperFlags.isStopped);
      const paused = scraperFlags?.isPaused;
      const stopped = scraperFlags?.isStopped;
     if (stopped) {
      console.log("🛑 Stopped (persisted): no more URLs will be opened.");
      urlQueue = []; // ✅ clear
      return;
    }

    // pause: keep waiting until resumed
    if (paused) {
      setTimeout(openNext, 1000); // retry check after 1 second
      return;
    }
    
     const url = urlQueue.shift(); // ✅ take next
      if (!url) return;

    // if (index >= urls.length) return;

    // const url = urls[index];

    // chrome.tabs.create({ url, active: false }, (tab) => { });

    // chrome.tabs.create({ url, active: false });
      // chrome.tabs.create({ url, active: false }, (tab) => { });
    chrome.tabs.create({ url, active: false }, () => {
      // 💾 Save the last opened URL + index
      chrome.storage.local.set(
        {
          lastOpened: {
            parentUrl: parentUrl,
            url,
            index,
            timestamp: new Date().toISOString(),
          },
        },
        () => {
          console.log("💾 Saved last opened:", url, "at index:", index);
        }
      );
    });
      setTimeout(openNext, TAB_OPEN_DELAY);
    index++;
    // Wait before opening next tab
    // setTimeout(openNext, TAB_OPEN_DELAY);
   });
  }

  // Start opening URLs
  openNext();
   
}

// If background message closed then communicate over port
// Especially when you are navigating to next category
chrome.runtime.onConnect.addListener((port) => {
  console.log("🧲 Port connected:", port.name);

  port.onMessage.addListener((message) => {
    console.log("📨 Message on port:", message);

    if (message.type === "CATEGORY_DONE") {
      unlockAndMoveToNextCategory().then(() => {
        port.postMessage({ status: "done" }); // respond
        markProgressAsDone();
        startCategoryScraping();
      });
    }
  });
});

function initProgressForCategory(categoryId) {
  const progress = {
    categoryId,
    totalListings: 0,
    scraped: 0,
    failed: 0,
    status: "running",
    lastUpdated: new Date().toISOString(),
  };
  chrome.storage.local.set({ progress });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCRAPE_SUCCESS") {
    updateProgress("scraped");
  }
  if (message.type === "SCRAPE_FAILED") {
    updateProgress("failed");
  }
});

function updateProgress(type) {
  chrome.storage.local.get("progress", (data) => {
    const progress = data.progress || {};
    if (!progress) return;

    if (type === "scraped") progress.scraped = (progress.scraped || 0) + 1;
    if (type === "failed") progress.failed = (progress.failed || 0) + 1;

    progress.lastUpdated = new Date().toISOString();

    chrome.storage.local.set({ progress });
  });
}

function markProgressAsDone() {
  chrome.storage.local.get("progress", (data) => {
    const progress = data.progress || {};
    progress.status = "done";
    progress.lastUpdated = new Date().toISOString();
    chrome.storage.local.set({ progress });
  });
}


