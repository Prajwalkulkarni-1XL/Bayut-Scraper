let currentCategory = null;
let isPaused = false;
let isStopped = false;
let urlQueue = [];
let processing = false;

const API_BASE_URL = "http://localhost:8000/api";
const CATEGORY_NEXT_ENDPOINT = `${API_BASE_URL}/category/next`;
const CATEGORY_UNLOCK_ENDPOINT = `${API_BASE_URL}/category/unlock`;

const TAB_OPEN_DELAY = 500;

function saveFlagsToStorage() {
  chrome.storage.local.set(
    { scraperFlags: { isPaused, isStopped } },
    () => console.log("Saved flags:", { isPaused, isStopped })
  );
}

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

function stopScraping() {
  isStopped = true;
  isPaused = false;
  urlQueue = [];              
  processing = false;         
  saveFlagsToStorage();
  console.log("🛑 STOPPED: queue cleared, scraping halted");

  chrome.storage.local.remove(["currentCategory", "progress"], () => {
    console.log("Cleared currentCategory and progress from storage");
  });
}

function enqueueUrls(urls) {
  if (isStopped) return; 
  urlQueue.push(...urls);
  if (!processing) processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  console.log("🔁 processQueue started");

  while (urlQueue.length > 0) {
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
      await new Promise((res) => setTimeout(res, 1000)); 
      continue; 
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received:", message);

  if (message.type === "START_SCRAPING") {
    isPaused = false;
    isStopped = false;
    saveFlagsToStorage();
    startCategoryScraping();
  }

   if (message.type === "PAUSE_SCRAPING") {
    isPaused = true;
    saveFlagsToStorage();
  
  }

  if (message.type === "RESUME_SCRAPING_DATA") {
    isPaused = false;
    saveFlagsToStorage();
     chrome.storage.local.get("lastOpened", (data) => {
    if (data?.lastOpened?.parentUrl) {
      chrome.tabs.create({ url: data.lastOpened.parentUrl, active: true });
      console.log("🔄 Resuming from category:", data.lastOpened.parentUrl);
    } else {
      console.warn("⚠️ No parentUrl found in storage. Cannot resume category properly.");
    }
  });
  }

  if (message.type === "STOP_SCRAPING") {
     stopScraping();
  }

  if (message.type === "RESUME_SCRAPING1") {
    chrome.storage.local.get("lastOpened", (data) => {
    chrome.tabs.create({ url: data.lastOpened.parentUrl });
    });
  }

  if (message.type === "OPEN_URLS") {
    openUrlsInBatches(message.urls);
  }

  if (message.type === "LISTINGS_COUNT") {
    chrome.storage.local.get("progress", (data) => {
      const progress = data.progress || {};
      progress.totalListings = message.count;  // 👈 overwrite instead of accumulate
      // progress.totalListings = (progress.totalListings || 0) + message.count;
      progress.lastUpdated = new Date().toISOString();
      chrome.storage.local.set({ progress });
    });
  }
  
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_DEVICE_ID") {
    chrome.storage.local.get("deviceId", (result) => {
      sendResponse({ deviceId: result.deviceId });
    });
    return true; 
  }
});

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

function openCurrentCategory(category) {
  chrome.tabs.create({ url: category.categoryUrl }, (tab) => {
    const tabId = tab.id;

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

function openUrlsInBatches(urls) {
  console.log(`Request to open ${urls.length} URLs...`);

  // Defensive: ensure array
  const incoming = Array.isArray(urls) ? urls : [];

  // Dedupe incoming against current queue to avoid duplicates
  const newUrls = incoming.filter((u) => !urlQueue.includes(u));

  if (newUrls.length === 0) {
    console.log("No new URLs to add (all duplicates).");
    return;
  }

  urlQueue = urlQueue.concat(newUrls);

  console.log(`Adding ${newUrls.length} new URLs to queue (queue length now ${urlQueue.length})`);

  let index = 0;

  function openNext() {
    if (urlQueue.length === 0) return;
    chrome.storage.local.get(["scraperFlags"], ({ scraperFlags }) => {
      const paused = scraperFlags?.isPaused;
      const stopped = scraperFlags?.isStopped;
      if (stopped) {
        console.log("🛑 Stopped (persisted): no more URLs will be opened.");
        urlQueue = [];
        return;
      }

      if (paused) {
        setTimeout(openNext, 1000);
        return;
      }

      const url = urlQueue.shift();
      if (!url) return;

      chrome.tabs.create({ url, active: false }, () => {
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

      index++;
      setTimeout(openNext, TAB_OPEN_DELAY);
    });
  }

  // start if not already processing
  if (!processing) {
    processing = true;
    openNext();
    // processQueue() can remain as a fallback for other flows
  } else {
    // If processing is already true, the queue will be consumed by processQueue/openNext loop
    console.log("Queue already processing; new URLs will be opened in turn.");
  }
}

chrome.runtime.onConnect.addListener((port) => {
  console.log("🧲 Port connected:", port.name);

  port.onMessage.addListener((message) => {
    console.log("📨 Message on port:", message);

    if (message.type === "CATEGORY_DONE") {
      unlockAndMoveToNextCategory().then(() => {
        port.postMessage({ status: "done" }); 
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


