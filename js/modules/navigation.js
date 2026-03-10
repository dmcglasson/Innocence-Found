// js/modules/navigation.js

const pageContainerId = "pageContainer";

// Map hash/pageId -> html file path
const PAGE_MAP = {
  home: "screens/home.html",
  about: "screens/about.html",
  contact: "screens/contact.html",
  login: "screens/login.html",
  dashboard: "screens/dashboard.html",
  profile: "screens/profile.html",

  // IF-96 pages
  subscribe: "screens/subscribe.html",
  "payment-confirmation": "screens/payment-confirmation.html",
  "payment-success": "screens/payment-success.html",
};

let afterLoadCallback = null;

function getPageIdFromHash() {
  const raw = window.location.hash || "#home";
  return raw.replace("#", "").trim() || "home";
}

export async function showPage(pageId, onAfterLoad) {
  const container = document.getElementById(pageContainerId);
  if (!container) {
    console.error(`Missing #${pageContainerId}`);
    return;
  }

  const safePageId = PAGE_MAP[pageId] ? pageId : "home";
  const path = PAGE_MAP[safePageId];

  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);

    const html = await res.text();
    container.innerHTML = html;

    // Force visible
    container.classList.add("page", "active");

    // Update hash without loop
    if (window.location.hash !== `#${safePageId}`) {
      history.replaceState(null, "", `#${safePageId}`);
    }

    // Save callback + run it
    if (typeof onAfterLoad === "function") {
      afterLoadCallback = onAfterLoad;
      await onAfterLoad(safePageId);
    } else if (typeof afterLoadCallback === "function") {
      await afterLoadCallback(safePageId);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="content-section" style="padding:24px;background:#fff;">
        <h2>Error loading page</h2>
        <p><strong>Page:</strong> ${pageId}</p>
        <p><strong>File:</strong> ${path}</p>
      </div>
    `;
    container.classList.add("page", "active");
  }
}

export async function initPageFromHash(onAfterLoad) {
  if (typeof onAfterLoad === "function") {
    afterLoadCallback = onAfterLoad;
  }
  const pageId = getPageIdFromHash();
  await showPage(pageId, afterLoadCallback);
}

window.addEventListener("hashchange", () => {
  initPageFromHash(afterLoadCallback);
});

function sanitizeHTML(input) {
  if (typeof input !== "string") return "";

  let output = input;

  // Remove script tags
  output = output.replace(/<script.*?>.*?<\/script>/gi, "");

  // Remove inline event handlers like onclick=""
  output = output.replace(/\son\w+=".*?"/gi, "");

  // Remove javascript: in href/src
  output = output.replace(/javascript:/gi, "");

  return output;
}

export { sanitizeHTML };