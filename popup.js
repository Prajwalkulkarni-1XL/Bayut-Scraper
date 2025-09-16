document.addEventListener("DOMContentLoaded", () => {
  const pauseBtn = document.getElementById("pauseScraping");
  const resumeBtn = document.getElementById("resumeScraping");

  document.getElementById("startScraping").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_SCRAPING" });
     chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
      pauseBtn.style.display = "block";
      resumeBtn.style.display = "none";
      updateProgressDisplay();
    });
  });
//written by Mr Manoj
  document.getElementById("resumeScraping1").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESUME_SCRAPING1" });
  });
  chrome.storage.local.get("lastOpened", (data) => {
    if (!data.lastOpened.parentUrl || data.lastOpened.parentUrl === "N/A") {
      document.getElementById("resumeScraping1").style.display = "none";
    }
  });

  pauseBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "PAUSE_SCRAPING", persistent: true });
    chrome.storage.local.set({ scraperFlags: { isPaused: true, isStopped: false } }, () => {
      pauseBtn.style.display = "none";
      resumeBtn.style.display = "block";
      updateProgressDisplay();
    });
  });

  resumeBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESUME_SCRAPING", persistent: true });
    chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
      pauseBtn.style.display = "block";
      resumeBtn.style.display = "none";
      updateProgressDisplay();
    });
  });

  //  document.getElementById("pauseScraping").addEventListener("click", () => {
  //   // chrome.runtime.sendMessage({ type: "PAUSE_SCRAPING" });
  //    // persistent pause
  //   chrome.runtime.sendMessage({ type: "PAUSE_SCRAPING", persistent: true });
  //   chrome.storage.local.set({ scraperFlags: { isPaused: true, isStopped: false } }, () => {
  //     updateProgressDisplay();
  //   });
  // });

  // document.getElementById("resumeScraping").addEventListener("click", () => {
  //   // chrome.runtime.sendMessage({ type: "RESUME_SCRAPING" });
  //    // persistent resume
  //   chrome.runtime.sendMessage({ type: "RESUME_SCRAPING", persistent: true });
  //   chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
  //     updateProgressDisplay();
  //   });
  // });

  document.getElementById("stopScraping").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "STOP_SCRAPING" });
    chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: true } }, () => {
      pauseBtn.style.display = "block";
      resumeBtn.style.display = "none";
      updateProgressDisplay();
    });
  });

//   setTimeout(() => {
//   getPersistentFlags((flags2) => {
//     if (!flags2.isStopped && !flags2.isPaused && secondBatch.length > 0) {
//       chrome.runtime.sendMessage({ type: "OPEN_URLS", urls: secondBatch });
//     } else {
//       console.log("⏹ Second batch skipped (paused/stopped).");
//     }
//   });
// }, BATCH_DELAY_MS);

  document.getElementById("refreshProgress").addEventListener("click", () => {
    updateProgressDisplay();
  });

  updateProgressDisplay();
  loadFlagsToUI();
});

// function loadFlagsToUI() {
//   chrome.storage.local.get(["scraperFlags"], (data) => {
//     const flags = data.scraperFlags || { isPaused: false, isStopped: false };
//     // update button states or progress status display (optional)
//     const statusEl = document.getElementById("status");
//     if (flags.isStopped) {
//       statusEl.textContent = "stopped (persisted)";
//     } else if (flags.isPaused) {
//       statusEl.textContent = "paused (persisted)";
//     } else {
//       // keep existing progress status
//       // do nothing here — updateProgressDisplay will set actual status from progress
//     }
//   });
// }

// function loadFlagsToUI() {
//   console.log('pause1')
//   chrome.storage.local.get(["scraperFlags"], (data) => {
//     const flags = data.scraperFlags || { isPaused: false, isStopped: false };
//     const pauseBtn = document.getElementById("pauseScraping");
//     const resumeBtn = document.getElementById("resumeScraping");

//     // if (flags.isPaused) {
//     //   pauseBtn.style.display = "none";
//     //   resumeBtn.style.display = "block";
//     // } else {
//     //   pauseBtn.style.display = "block";
//     //   resumeBtn.style.display = "none";
//     // }

//     // // status text (optional)
//     // const statusEl = document.getElementById("status");
//     // if (flags.isStopped) {
//     //   statusEl.textContent = "stopped (persisted)";
//     // } else if (flags.isPaused) {
//     //   statusEl.textContent = "paused (persisted)";
//     // }

  
//     if (scraperFlags?.isPaused) {
//       pauseBtn.style.display = "none";
//       resumeBtn.style.display = "block";
//     } else {
//       pauseBtn.style.display = "block";
//       resumeBtn.style.display = "none";
//     }
//   });
// }

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

// popup.js (replace your existing file)
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startScraping");
  const pauseBtn = document.getElementById("pauseScraping");
  const resumeBtn = document.getElementById("resumeScraping");
  const stopBtn = document.getElementById("stopScraping");
  const refreshBtn = document.getElementById("refreshProgress");

  startBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_SCRAPING" });
    chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
      applyFlagsToUI({ isPaused: false, isStopped: false });
      updateProgressDisplay();
    });
  });

  pauseBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "PAUSE_SCRAPING", persistent: true });
    chrome.storage.local.set({ scraperFlags: { isPaused: true, isStopped: false } }, () => {
      applyFlagsToUI({ isPaused: true, isStopped: false });
      updateProgressDisplay();
    });
  });

  resumeBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "resumeScraping", persistent: true });
    chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: false } }, () => {
      applyFlagsToUI({ isPaused: false, isStopped: false });
      updateProgressDisplay();
    });
  });

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "STOP_SCRAPING" });
    chrome.storage.local.set({ scraperFlags: { isPaused: false, isStopped: true } }, () => {
      // after a permanent stop we hide pause/resume
      applyFlagsToUI({ isPaused: false, isStopped: true });
      updateProgressDisplay();
    });
  });

  refreshBtn.addEventListener("click", updateProgressDisplay);

  // listen for storage changes and update UI live (useful if state changed elsewhere)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.scraperFlags) {
      const flags = changes.scraperFlags.newValue || {};
      applyFlagsToUI(flags);
    }
    if (changes.progress) {
      updateProgressDisplay();
    }
  });

  // initial load
  updateProgressDisplay();
  loadFlagsToUI();
});

function loadFlagsToUI() {
  console.log('pause2')
  chrome.storage.local.get(["scraperFlags"], (data) => {
    const flags = data.scraperFlags || { isPaused: false, isStopped: false };
    applyFlagsToUI(flags);
  });
}

// function applyFlagsToUI(flags) {
//   const pauseBtn = document.getElementById("pauseScraping");
//   const resumeBtn = document.getElementById("resumeScraping");
//   const statusEl = document.getElementById("status");

//   if (flags.isStopped) {
//     // permanent stop -> hide pause and resume (user must Start again)
//     if (pauseBtn) pauseBtn.style.display = "none";
//     if (resumeBtn) resumeBtn.style.display = "none";
//     if (statusEl) statusEl.textContent = "stopped (persisted)";
//     return;
//   }

//   if (flags.isPaused) {
//     if (pauseBtn) pauseBtn.style.display = "none";
//     if (resumeBtn) resumeBtn.style.display = "block";
//     if (statusEl) statusEl.textContent = "paused (persisted)";
//   } else {
//     if (pauseBtn) pauseBtn.style.display = "block";
//     if (resumeBtn) resumeBtn.style.display = "none";
//     if (statusEl) statusEl.textContent = "running";
//   }
// }

function applyFlagsToUI(flags) {
  const pauseBtn = document.getElementById("pauseScraping");
  const resumeBtn = document.getElementById("resumeScraping");
  const statusEl = document.getElementById("status");

  if (flags.isStopped) {
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";   // ✅ hide both
    if (statusEl) statusEl.textContent = "stopped (persisted)";
    return;
  }

  if (flags.isPaused) {
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "block";
    if (statusEl) statusEl.textContent = "paused (persisted)";
  } else {
    pauseBtn.style.display = "block";
    resumeBtn.style.display = "none";
    if (statusEl) statusEl.textContent = "running";
  }
}

function updateProgressDisplay() {
  chrome.storage.local.get(["progress", "currentCategory", "scraperFlags"], (data) => {
    const { progress, currentCategory, scraperFlags } = data;

    const total = progress?.totalListings || 0;
    const scraped = progress?.scraped || 0;
    const failed = progress?.failed || 0;
    const completed = scraped + failed;
    const percent = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;

    document.getElementById("categoryName").textContent = currentCategory?.categoryName || "N/A";
    let statusText = progress?.status || "N/A";
    if (scraperFlags?.isStopped) statusText = "stopped";
    else if (scraperFlags?.isPaused) statusText = "paused";
    document.getElementById("status").textContent = statusText;

    document.getElementById("total").textContent = total;
    document.getElementById("scraped").textContent = scraped;
    document.getElementById("failed").textContent = failed;
    document.getElementById("lastUpdated").textContent = `Last Updated: ${progress?.lastUpdated || "N/A"}`;

    const fillEl = document.getElementById("progressFill");
    const percentEl = document.getElementById("progressPercent");
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  });
}