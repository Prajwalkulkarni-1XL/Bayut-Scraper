const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const urlParams = new URLSearchParams(window.location.search);
const API_BASE_URL = "http://localhost:8000/api";

/**
 * Save errors locally in extension storage for review/debugging
 * @param {Error|string} error - The error object or message
 * @param {string} context - Descriptive context for where the error occurred
 */

function storeErrorInExtensionStorage(error, context = "General") {
  const newError = {
    context,
    error: error instanceof Error ? error.message : String(error),
    url: window.location.href,
    time: new Date().toISOString(),
  };

  chrome.storage.local.get(["scrapeErrors"], (result) => {
    const existingErrors = result.scrapeErrors || [];
    existingErrors.push(newError);
    chrome.storage.local.set({ scrapeErrors: existingErrors }, () => {
      console.log("📝 Error stored in extension storage:", newError);
    });
  });
}

async function scrapData(deviceId) {
  const text = (sel) => document.querySelector(sel)?.innerText?.trim() || null;

  const scrapeListSection = (headingTitle) => {
    const heading = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,h5,h6")
    ).find(
      (h) => h.textContent.trim().toLowerCase() === headingTitle.toLowerCase()
    );
    if (!heading) return {};
    const container = heading.closest("div._8a2b3961") || heading.parentElement;
    const ul = container.querySelector("ul");
    if (!ul) return {};
    const out = {};
    ul.querySelectorAll("li").forEach((li) => {
      const label = li.firstElementChild?.textContent?.trim();
      const value = li.lastElementChild?.textContent?.trim();
      if (label && value && !(label in out)) out[label] = value;
    });
    return out;
  };

  function robustScrapeListSection(headingTitle) {
    const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(
      (h) => h.textContent.trim().toLowerCase() === headingTitle.toLowerCase()
    );

    if (!heading) return {};

    let container = heading.parentElement;
    let ul = heading.nextElementSibling;

    if (!ul || ul.tagName !== "UL") {
      ul = container.querySelector("ul");
    }

    if (!ul) return {};

    const out = {};
    ul.querySelectorAll("li").forEach((li) => {
      const label = li.querySelector(".bbfa5352")?.textContent?.trim();
      const value = li.querySelector("._249434d2")?.textContent?.trim();

      if (label && value && !(label in out)) {
        out[label] = value;
      }
    });

    return out;
  }

  const getRegulatory = () => {
    const container =
      document.querySelector("div.ec122524._169c4895._07c05f81") ||
      document.querySelector("div._regulatory");
    if (!container) return {};
    const out = {};
    container.querySelectorAll("li").forEach((li) => {
      const label =
        li.querySelector("div._52bcc5bc")?.textContent?.trim() ||
        li.querySelector("span.bbfa5352")?.textContent?.trim();
      const value =
        li.querySelector("span._677f9d24")?.textContent?.trim() ||
        li.querySelector("span._249434d2")?.textContent?.trim();
      if (label && value && !(label in out)) out[label] = value;
    });
    return out;
  };

  const getAmenities = () => {
    const out = {};

    const moreAmenities = document.querySelector(
      'div._3fa26637[aria-label="More amenities"]'
    );

    if (moreAmenities) {
      document
        .querySelectorAll("div._791bcb34, div._amenities")
        .forEach((cat) => {
          const categoryName =
            cat.querySelector("div._668d7c5b")?.textContent?.trim();

          const items = Array.from(
            cat.querySelectorAll("div.c20d971e span.c0327f5b, .amenity .name")
          )
            .map((e) => e.textContent?.trim())
            .filter(Boolean);

          if (categoryName && items.length) {
            if (!out[categoryName]) {
              out[categoryName] = items;
            } else {
              out[categoryName].push(...items);
            }
          }
        });
    } else {
      const items = Array.from(
        document.querySelectorAll("div.c20d971e span.c0327f5b, .amenity .name")
      )
        .map((e) => e.textContent?.trim())
        .filter(Boolean);

      if (items.length) {
        out["Amenities"] = items;
      }
    }

    return out;
  };

  function realClick(el) {
    el.click(); 
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    el.dispatchEvent(evt);
    if (typeof el.onclick === "function") {
      el.onclick(evt);
    }
  }

  async function scrapeTransactions() {
    await wait(2000);
    const mainContainers = document.querySelectorAll("div._8a2b3961");
    let targetContainer = null;
    mainContainers.forEach((container) => {
      const heading = container
        .querySelector("h2._019d0fe7")
        ?.textContent.trim();
      if (heading === "Similar Property Transactions") {
        targetContainer = container;
      }
    });
    if (!targetContainer) {
      return;
    }
    const mainButtons = targetContainer.querySelectorAll("button.c6cb1d19");
    const allResults = [];

    const scrapeTable = (mainCategory, subCategory) => {
      const table = targetContainer.querySelector(".f6181c08");
      if (!table) return [];
      const headers = [...table.querySelectorAll("thead th")].map((h) =>
        h.innerText.trim()
      );
      const rows = table.querySelectorAll("tbody tr");
      return [...rows].map((row) => {
        const cols = row.querySelectorAll("td");
        const record = {
          mainCategory,
          subCategory,
        };
        headers.forEach((header, i) => {
          const key = header
            .toLowerCase()
            .replace(/\s*\(.*?\)/g, "")
            .trim();
          const normalizedKey = key.replace(/\s+/g, "_");
          record[normalizedKey] = cols[i]
            ? cols[i].innerText.replace(/\s+/g, " ").trim()
            : null;
        });
        return record;
      });
    };

    if (mainButtons.length > 0) {
      for (const mainBtn of mainButtons) {
        realClick(mainBtn);
        await wait(4000);
        const subButtons = targetContainer.querySelectorAll("._9771ddac span");
        for (const subBtn of subButtons) {
          realClick(subBtn);
          await wait(2500);
          const data = scrapeTable(mainBtn.innerText, subBtn.innerText);
          allResults.push(...data);
        }
      }
    } else {
      const subButtons = targetContainer.querySelectorAll("._9771ddac span");
      for (const subBtn of subButtons) {
        realClick(subBtn);
        await wait(2500);
        const data = scrapeTable("N/A", subBtn.innerText);
        allResults.push(...data);
      }
    }
    return allResults;
  }

  function extractImageUrls() {
    const imageUrls = new Set();

    const imageContainers = [
      document.querySelector("div._7be482e1"),
      document.querySelector("div._2e756e1e")
    ];

    imageContainers.forEach(container => {
      if (!container) return;

      container.querySelectorAll("img").forEach(img => {
        const src = img.getAttribute("src");
        if (src && src.startsWith("http")) {
          imageUrls.add(src);
        }
      });

      container.querySelectorAll("source").forEach(source => {
        const srcset = source.getAttribute("srcset");
        if (srcset && srcset.startsWith("http")) {
          imageUrls.add(srcset);
        }
      });
    });

    return Array.from(imageUrls);
  }

  const priceText = text("span[aria-label='Price']") || text("span._105b8a67");
  const priceNum = priceText
    ? parseInt(priceText.replace(/[^\d]/g, ""), 10)
    : null;

  const similarTransactions = await scrapeTransactions();
  const area = document.querySelector('[aria-label="Area"]').innerText;
  const beds = document.querySelector('[aria-label="Beds"]').innerText;
  const baths = document.querySelector('[aria-label="Baths"]').innerText;

  const areaNum = parseFloat((area || "").replace(/[^\d.]/g, "")) || null;
  const perSqft = priceNum && areaNum
    ? Number((Number(priceNum) / Number(areaNum)).toFixed(2))
    : null;

  const payload = {
    url: window.location.href,
    deviceId,
    data: {
      title: text("h1") || "No title",
      area: area,
      price: priceNum,
      priceText,
      priceCurrency: text("span[aria-label='Currency']") || "AED",
      beds,
      baths,
      totalPerSqft: perSqft,
      location:
        text("div[aria-label='Property header']") || text("div._4d1141a9"),
      description:
        text('[aria-label="Property description"]') || "No description",
      agent: text("a[aria-label='Agent name']") || text("div._91b12e4e"),
      offPlan: !!document.querySelector(
        "div[role='button'][aria-label*='Off-plan']"
      ),
      verified: !!document.querySelector("[aria-label='Property Verified Button']"),
      amenities: getAmenities(),
      propertyInformation: Object.keys(scrapeListSection("Property Information")).length === 0
        ? robustScrapeListSection("Property Information")
        : scrapeListSection("Property Information"),
      buildingInformation: scrapeListSection("Building Information"),
      validatedInformation: scrapeListSection("Validated Information"),
      projectInformation: scrapeListSection("Project Information"),
      regulatoryInformation: getRegulatory(),
      similarPropertyTransactions: similarTransactions,
      propertyId: window.location.pathname.split("-").pop().split(".")[0],
      imageUrls: extractImageUrls(),
      rawHtmlSnippet:
        document.querySelector("body")?.innerText?.slice(0, 2000) || null,
    },
  };

  console.log("📦 Extracted Full Payload:", payload);

  try {
    const response = await fetch(`${API_BASE_URL}/scrapData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("Sent to API:", result);
    reportScrapeSuccess();
    window.close();
  } catch (err) {
    console.error("Failed to send data to API:", err);
    storeErrorInExtensionStorage(err, "Failed to send data to API");

    await fetch(`${API_BASE_URL}/err`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          message: err.message || "Unknown error",
          stack: err.stack || null,
          url: window.location.href,
          time: new Date().toISOString(),
          context: "scrapData error",
        },
      }),
    });

    window.close();
  }
}

window.addEventListener("load", async () => {
  chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" }, (response) => {
    if (response?.deviceId) {
      scrapData(response.deviceId);
    } else {
      console.warn("No deviceId found");
    }
  });
});

function reportScrapeSuccess() {
  chrome.runtime.sendMessage({ type: "SCRAPE_SUCCESS" });
}

function reportScrapeFailure() {
  chrome.runtime.sendMessage({ type: "SCRAPE_FAILED" });
}
