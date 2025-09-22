importScripts("config.js");

let currentCategory = null; // Currently locked category object
let isPaused = false; // Pause flag for scraper
let isStopped = false; // Stop flag for scraper
let urlQueue = [];  // Queue of listing URLs to open
let processing = false; // Tracks if queue processing is running

// Constants
const API_BASE_URL = CONFIG.API_BASE_URL;
const CATEGORY_NEXT_ENDPOINT = `${API_BASE_URL}/category/next`;
const CATEGORY_UNLOCK_ENDPOINT = `${API_BASE_URL}/category/unlock`;

// -----------------------------------------------
// Change according to need
const TAB_OPEN_DELAY = 500;
// -----------------------------------------------

// When the extension is installed, generate and store a device ID
function saveFlagsToStorage() {
  chrome.storage.local.set(
    { scraperFlags: { isPaused, isStopped } },
    () => console.log("Saved flags:", { isPaused, isStopped })
  );
}

// Listen for messages from popup or content
async function loadFlagsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["scraperFlags"], (data) => {
      const flags = data.scraperFlags || {};
      isPaused = !!flags.isPaused;
      isStopped = !!flags.isStopped;
      resolve(flags);
    });
  });
}

// ------------------ Scraper Control ------------------
function stopScraping() {
  // Stop everything and clear queues/progress
  isStopped = true;
  isPaused = false;
  urlQueue = [];              
  processing = false;         
  saveFlagsToStorage();

  chrome.storage.local.remove(["currentCategory", "progress"], () => {
  });
}

function enqueueUrls(urls) {
  // Add URLs to the queue and start processing if not already
  if (isStopped) return; 
  urlQueue.push(...urls);
  if (!processing) processQueue();
}

async function processQueue() {
  // Process queued URLs one by one with respect to pause/stop flags
  if (processing) return;
  processing = true;

  while (urlQueue.length > 0) {
    // Reload flags dynamically so user actions are respected mid-run
    const flags = await new Promise((resolve) => {
      chrome.storage.local.get(["scraperFlags"], (data) => {
        resolve(data.scraperFlags || { isPaused: false, isStopped: false });
      });
    });

    if (flags.isStopped) {
      urlQueue = [];
      break;
    }

    if (flags.isPaused) {
      await new Promise((res) => setTimeout(res, 1000)); 
      continue; 
    }

    const url = urlQueue.shift();
    if (!url) continue;

    // Open tab in background
    await new Promise((resolve) =>
      chrome.tabs.create({ url, active: false }, () => resolve())
    );

    // Wait before opening next tab
    await new Promise((res) => setTimeout(res, TAB_OPEN_DELAY));
  }

  processing = false;
}

// ------------------ Extension Setup ------------------
loadFlagsFromStorage();

// Generate a unique deviceId when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("deviceId", (result) => {
    if (!result.deviceId) {
      const newDeviceId = crypto.randomUUID();
      chrome.storage.local.set({ deviceId: newDeviceId }, () => {
      });
    }
  });
});

// Track parent category URL for resuming purposes
let parentUrl = null;

// Unified message listener for all runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    // ------------------ Scraper Control ------------------
    case "START_SCRAPING":
      isPaused = false;
      isStopped = false;
      saveFlagsToStorage();
      startCategoryScraping();
      break;

    case "PAUSE_SCRAPING":
      isPaused = true;
      saveFlagsToStorage();
      break;

    case "RESUME_SCRAPING_DATA":
      isPaused = false;
      saveFlagsToStorage();
      chrome.storage.local.get("lastOpened", (data) => {
        if (data?.lastOpened?.parentUrl) {
          chrome.tabs.create({ url: data.lastOpened.parentUrl, active: true });
        } else {
          console.warn("⚠️ No parentUrl found in storage. Cannot resume category properly.");
        }
      });
      break;

    case "STOP_SCRAPING":
      stopScraping();
      break;

    case "RESUME_SCRAPING1":
      chrome.storage.local.get("lastOpened", (data) => {
        if (data?.lastOpened?.parentUrl) {
          chrome.tabs.create({ url: data.lastOpened.parentUrl });
        }
      });
      break;

    // ------------------ URL Handling ------------------
    case "OPEN_URLS":
      openUrlsInBatches(message.urls);
      break;

    case "SET_PARENT":
      // Save parent category URL for resuming
      parentUrl = message.parentUrl;
      console.log("Parent URL set:", parentUrl);
      break;

    // ------------------ Progress Tracking ------------------
    case "LISTINGS_COUNT":
      chrome.storage.local.get("progress", (data) => {
        const progress = data.progress || {};
        progress.totalListings = message.count;
        progress.lastUpdated = new Date().toISOString();
        chrome.storage.local.set({ progress });
      });
      break;

    case "SCRAPE_SUCCESS":
      updateProgress("scraped");
      break;

    case "SCRAPE_FAILED":
      updateProgress("failed");
      break;

    // ------------------ Device ID ------------------
    case "GET_DEVICE_ID":
      chrome.storage.local.get("deviceId", (result) => {
        sendResponse({ deviceId: result.deviceId });
      });
      return true; // keep message channel open

    default:
      console.warn("⚠️ Unknown message type received:", message.type);
  }
});

// ------------------ Category Handling ------------------
async function startCategoryScraping() {
  // Lock next category for this device and begin scraping
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
        chrome.storage.local.set({ currentCategory }, () => {
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
  // Unlock current category and move to next
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

// ------------------ URL Handling ------------------

// Open listing URLs in new tabs, one at a time with delay
function openUrlsInBatches(urls) {

  // Defensive: ensure array
  const incoming = Array.isArray(urls) ? urls : [];

  // Dedupe incoming against current queue to avoid duplicates
  const newUrls = incoming.filter((u) => !urlQueue.includes(u));

  if (newUrls.length === 0) {
    return;
  }

  urlQueue = urlQueue.concat(newUrls);

  let index = 0;

  function openNext() {
    if (urlQueue.length === 0) return;
    chrome.storage.local.get(["scraperFlags"], ({ scraperFlags }) => {
      const paused = scraperFlags?.isPaused;
      const stopped = scraperFlags?.isStopped;
      if (stopped) {
        urlQueue = [];
        return;
      }

      if (paused) {
        setTimeout(openNext, 1000);
        return;
      }

      const url = urlQueue.shift();
      if (!url) return;

      // Open tab in background
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
      // Wait before opening next tab
      setTimeout(openNext, TAB_OPEN_DELAY);
    });
  }

  // start if not already processing
  if (!processing) {
    processing = true;
    // Start opening URLs
    openNext();
    // processQueue() can remain as a fallback for other flows
  } else {
    // If processing is already true, the queue will be consumed by processQueue/openNext loop
    console.log("Queue already processing; new URLs will be opened in turn.");
  }
}

// ------------------ Progress Tracking ------------------
chrome.runtime.onConnect.addListener((port) => {

  port.onMessage.addListener((message) => {

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
