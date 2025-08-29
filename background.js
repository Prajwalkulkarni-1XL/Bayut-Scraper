let currentCategory = null;

// Constants
const API_BASE_URL = "http://localhost:8000/api";
const CATEGORY_NEXT_ENDPOINT = `${API_BASE_URL}/category/next`;
const CATEGORY_UNLOCK_ENDPOINT = `${API_BASE_URL}/category/unlock`;

// -----------------------------------------------
// Change according to need
const TAB_OPEN_DELAY = 1000;
// -----------------------------------------------

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
    startCategoryScraping();
  }

  if (message.type === "OPEN_URLS") {
    // Open listing URLs in tabs
    openUrlsInBatches(message.urls);
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

// Open listing URLs in new tabs, one at a time with delay
function openUrlsInBatches(urls) {
  console.log(`Opening ${urls.length} URLs...`);
  let index = 0;

  function openNext() {
    if (index >= urls.length) return;

    const url = urls[index];

    chrome.tabs.create({ url, active: false }, (tab) => { });

    index++;
    // Wait before opening next tab
    setTimeout(openNext, TAB_OPEN_DELAY);
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
        startCategoryScraping();
      });
    }
  });
});
