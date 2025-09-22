// config.js
// Change these values depending on environment

const CONFIG = {
  API_BASE_URL: "http://localhost:8000/api", // dev
  // API_BASE_URL: "https://your-production-api.com/api", // prod
};

// Export for background/content scripts
if (typeof window !== "undefined") {
  window.CONFIG = CONFIG; // for content scripts
}
if (typeof self !== "undefined") {
  self.CONFIG = CONFIG; // for background service workers
}
