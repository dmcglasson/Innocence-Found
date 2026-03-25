const PAGE_MAP = {
  home: "screens/home.html",
  about: "screens/about.html",
  contact: "screens/contact.html",
  login: "screens/login.html",
  dashboard: "screens/dashboard.html",
  profile: "screens/profile.html",
  subscribe: "screens/subscribe.html",
  "payment-confirmation": "screens/payment-confirmation.html",
  "payment-success": "screens/payment-success.html",
  chapters: "screens/chapters.html",
  "chapter-reader": "screens/chapter-reader.html",
  worksheets: "screens/worksheets.html",
  "worksheet-reader": "screens/worksheet-reader.html",
  bookreader: "screens/bookreader.html",
  "admin-upload": "screens/admin-upload.html",
};

let globalOnLoadCallback = null;

export function setGlobalOnLoadCallback(callback) {
  globalOnLoadCallback = callback;
}

export function getPageIdFromHash() {
  const raw = window.location.hash || "#home";
  return raw.replace(/^#/, "").trim() || "home";
}

export async function showPage(pageId, onLoadCallback = null) {
  const safePageId = String(pageId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const pagePath = PAGE_MAP[safePageId];

  if (!pagePath) {
    console.warn(`Unknown page: ${safePageId}`);
    return;
  }

  const container = document.getElementById("pageContainer");
  if (!container) {
    console.warn("pageContainer not found");
    return;
  }

  try {
    const response = await fetch(pagePath);
    if (!response.ok) {
      throw new Error(`Failed to load ${pagePath}`);
    }

    container.innerHTML = await response.text();
    window.location.hash = safePageId;

    if (typeof onLoadCallback === "function") {
      await onLoadCallback(safePageId);
    }

    if (typeof globalOnLoadCallback === "function") {
      await globalOnLoadCallback(safePageId);
    }
  } catch (error) {
    console.error("Error loading page:", error);
    container.innerHTML = `<p>Failed to load page.</p>`;
  }
}

export async function initPageFromHash(onLoadCallback = null) {
  const pageId = getPageIdFromHash();
  await showPage(pageId, onLoadCallback);
}

window.addEventListener("hashchange", async () => {
  const pageId = getPageIdFromHash();
  await showPage(pageId);
});