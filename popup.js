document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startScraping").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_SCRAPING" });
    console.log("📩 Sent START_SCRAPING");
  });
});
