document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startScraping").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_SCRAPING" });
  });

  document.getElementById("refreshProgress").addEventListener("click", () => {
    updateProgressDisplay();
  });

  updateProgressDisplay();
});

function updateProgressDisplay() {
  chrome.storage.local.get(["progress", "currentCategory"], (data) => {
    const { progress, currentCategory } = data;

    const total = progress?.totalListings || 0;
    const scraped = progress?.scraped || 0;
    const failed = progress?.failed || 0;
    const completed = scraped + failed;

    const percent = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;

    // Update text fields
    document.getElementById("categoryName").textContent = currentCategory?.categoryName || "N/A";
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
