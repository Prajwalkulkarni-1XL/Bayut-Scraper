function updateProgressDisplay() {
  chrome.storage.local.get(["progress", "currentCategory", "scraperFlags"], (data) => {
    const { progress, currentCategory, scraperFlags } = data;

    const total = progress?.totalListings || 0;
    const scraped = progress?.scraped || 0;
    const failed = progress?.failed || 0;
    const completed = scraped + failed;

    const percent = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;

    // Update text fields
    document.getElementById("categoryName").textContent = currentCategory?.categoryName || "N/A";
    let statusText = progress?.status || "N/A";
    if (scraperFlags?.isStopped) statusText = "stopped";
    else if (scraperFlags?.isPaused) statusText = "paused";

    document.getElementById("status").textContent = progress?.status || "N/A";
    document.getElementById("total").textContent = total;
    document.getElementById("scraped").textContent = scraped;
    document.getElementById("failed").textContent = failed;
    document.getElementById("lastUpdated").textContent = `Last Updated: ${progress?.lastUpdated || "N/A"}`;
    
    // Update progress bar
    const fillEl = document.getElementById("progressFill");
    const percentEl = document.getElementById("progressPercent");

    fillEl.style.width = `${percent}%`;
    percentEl.textContent = `${percent}%`;
  });
}

// popup.js - cleaned and defensive version

document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM elements (may be null if omitted from HTML)
  const categoryNameEl = document.getElementById("categoryName");
  const statusEl = document.getElementById("status");
  const totalEl = document.getElementById("total");
  const scrapedEl = document.getElementById("scraped");
  const failedEl = document.getElementById("failed");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const progressFillEl = document.getElementById("progressFill");
  const progressPercentEl = document.getElementById("progressPercent");

  const startBtn = document.getElementById("startScraping");
  const pauseBtn = document.getElementById("pauseScraping");
  const resumeBtn = document.getElementById("resumeScraping");
  const stopBtn = document.getElementById("stopScraping"); // may be null in HTML
  const quickResumeBtn = document.getElementById("quickresumeScraping");
  const refreshBtn = document.getElementById("refreshProgress");

  // Utility: read persistent flags
  function loadFlagsToUI() {
    chrome.storage.local.get(["scraperFlags"], (data) => {
      const flags = data.scraperFlags || { isPaused: false, isStopped: false };
      applyFlagsToUI(flags);
    });
  }

  // Apply flags to the popup UI (show/hide buttons and status text)
  function applyFlagsToUI(flags) {
    if (pauseBtn) pauseBtn.style.display = flags?.isPaused ? "none" : "block";
    if (resumeBtn) resumeBtn.style.display = flags?.isPaused ? "block" : "none";

    if (flags?.isStopped) {
      if (pauseBtn) pauseBtn.style.display = "none";
      if (resumeBtn) resumeBtn.style.display = "none";
      if (statusEl) statusEl.textContent = "stopped (persisted)";
      return;
    }

    if (flags?.isPaused) {
      if (statusEl) statusEl.textContent = "paused (persisted)";
    } else {
      if (statusEl) statusEl.textContent = "running";
    }
  }

  // Single progress display updater
  function updateProgressDisplay() {
    chrome.storage.local.get(["progress", "currentCategory", "scraperFlags"], (data) => {
      const { progress = {}, currentCategory = null, scraperFlags = {} } = data;

      const total = progress.totalListings || 0;
      const scraped = progress.scraped || 0;
      const failed = progress.failed || 0;
      const completed = scraped + failed;
      const percent = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;

      if (categoryNameEl) categoryNameEl.textContent = currentCategory?.categoryName || "N/A";
      if (statusEl) {
        let statusText = progress?.status || "N/A";
        if (scraperFlags?.isStopped) statusText = "stopped";
        else if (scraperFlags?.isPaused) statusText = "paused";
        statusEl.textContent = statusText;
      }
      if (totalEl) totalEl.textContent = total;
      if (scrapedEl) scrapedEl.textContent = scraped;
      if (failedEl) failedEl.textContent = failed;

      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = progress?.lastUpdated
          ? `Last Updated: ${new Date(progress.lastUpdated).toLocaleString()}`
          : "Last Updated: N/A";
      }

      if (progressFillEl) progressFillEl.style.width = `${percent}%`;
      if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    });
  }

  // Event listeners (only attach if element exists)
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "START_SCRAPING" });
      chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
        applyFlagsToUI({ isPaused: false, isStopped: false });
        updateProgressDisplay();
      });
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "PAUSE_SCRAPING", persistent: true });
      chrome.storage.local.set({ scraperFlags: { isPaused: true, isStopped: false } }, () => {
        applyFlagsToUI({ isPaused: true, isStopped: false });
        updateProgressDisplay();
      });
    });
  }

  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "RESUME_SCRAPING_DATA", persistent: true });
      chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
        applyFlagsToUI({ isPaused: false, isStopped: false });
        updateProgressDisplay();
      });
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_SCRAPING" });
      chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: true } }, () => {
        applyFlagsToUI({ isPaused: false, isStopped: true });
        updateProgressDisplay();
      });
    });
  } else {
    // If stop button not present, ensure we don't break anything else — no-op
    console.debug("stopScraping button not found in DOM (expected if commented out in HTML).");
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", updateProgressDisplay);
  }

  if (quickResumeBtn) {
    quickResumeBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "RESUME_SCRAPING1" });
    });

    // Show/hide quick resume based on lastOpened existence (safe)
    chrome.storage.local.get(["lastOpened"], (data) => {
      const exists = data?.lastOpened?.parentUrl;
      quickResumeBtn.style.display = exists ? "block" : "none";
    });
  }

  // Update UI on storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.scraperFlags) {
      applyFlagsToUI(changes.scraperFlags.newValue || {});
    }
    if (changes.progress || changes.currentCategory) {
      updateProgressDisplay();
    }
  });

  // Initial load
  loadFlagsToUI();
  updateProgressDisplay();
});
