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
/**
 * Navigation Module
 * 
 * Handles page navigation, screen loading, and URL routing.
 * This module manages the single-page application routing.
 */

import { APP_CONFIG } from '../config.js';

// Cache for loaded screens
const screenCache = {};
// Global screen init callback (set once from main.js)
let globalOnLoadCallback = null;
// Optional callback API used by setScreenLoadCallback
let globalScreenLoadCallback = null;

const KNOWN_SCREENS = new Set([
  'home',
  'about',
  'contact',
  'login',
  'profile',
  'dashboard',
  'bookreader',
  'chapters',
  'chapter-reader',
  'worksheets',
  'worksheet-reader'
]);

export function setGlobalOnLoadCallback(cb) {
  globalOnLoadCallback = cb;
}

function normalizePageId(pageId) {
  return String(pageId || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function isKnownScreen(pageId) {
  return KNOWN_SCREENS.has(pageId);
}

function normalizeIndexUrl() {
  const pathname = window.location.pathname || '';
  if (!pathname.endsWith('/index.html')) {
    return;
  }

  const cleanPath = pathname.slice(0, -'index.html'.length) || '/';
  const cleanUrl = `${cleanPath}${window.location.search}${window.location.hash}`;

  // Keep SPA state but clean the visible URL.
  window.history.replaceState(window.history.state, '', cleanUrl);
}

function applyScreenStyle(pageId) {
  const body = document.body;
  if (!body) return;

  const classPrefix = 'screen-';
  [...body.classList]
    .filter(cls => cls.startsWith(classPrefix))
    .forEach(cls => body.classList.remove(cls));

  body.classList.add(`${classPrefix}${pageId}`);
}

/**
 * Sanitize HTML to prevent XSS attacks
 * Removes script tags and dangerous attributes
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  try {
    // Use DOMParser for better control
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove script tags
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // Remove iframe tags (potential XSS vector)
    const iframes = doc.querySelectorAll('iframe');
    iframes.forEach(iframe => iframe.remove());

    // Remove dangerous event handlers from all elements
    const allElements = doc.querySelectorAll('*');
    const dangerousAttrs = [
      'onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur',
      'onchange', 'onsubmit', 'onreset', 'onselect', 'onunload',
      'onabort', 'onkeydown', 'onkeypress', 'onkeyup', 'onmousedown',
      'onmousemove', 'onmouseout', 'onmouseup'
    ];

    allElements.forEach(el => {
      // Remove event handler attributes
      dangerousAttrs.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });

      // Remove javascript: protocol from href/src
      ['href', 'src', 'action'].forEach(attr => {
        const value = el.getAttribute(attr);
        if (value && value.toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr);
        }
      });
    });

    return doc.body.innerHTML;
  } catch (error) {
    console.error('Error sanitizing HTML:', error);
    // Fallback: escape HTML if parsing fails
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
  }
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
    const url = `${APP_CONFIG.SCREENS_PATH}${screenName}.html`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load screen: ${screenName}`);
    }
    const html = await response.text();

    console.log("📄 loaded HTML length for", screenName, "=", html.length);
    // Sanitize HTML before caching/using
    const sanitizedHtml = sanitizeHTML(html);

    // Cache the screen if caching is enabled
    if (APP_CONFIG.CACHE_ENABLED) {
      screenCache[screenName] = sanitizedHtml;
    }

    return sanitizedHtml;
  } catch (error) {
    console.error(`Error loading screen ${screenName}:`, error);
    return `<div class="content-section"><p>Error loading page. Please try again.</p></div>`;
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
  pageId = normalizePageId(pageId);
  if (!pageId) {
    console.error("Invalid page ID");
    return;
  }

  applyScreenStyle(pageId);

  // Show loading state
  pageContainer.textContent = 'Loading...'; // Use textContent instead of innerHTML for safety
  pageContainer.classList.add("active");

  try {
    // Load the screen
    const screenHtml = await loadScreen(pageId);
    pageContainer.innerHTML = screenHtml;

    // Hide current page nav button
    const worksheetBtn = document.querySelector('[data-page="dashboard"]');
    const uploadBtn = document.querySelector('[data-page="admin-upload"]');

    if (worksheetBtn) worksheetBtn.style.display = 'inline-block';
    if (uploadBtn) uploadBtn.style.display = 'inline-block';

    if (pageId === "dashboard" && worksheetBtn) {
      worksheetBtn.style.display = "none";
    }

    if (pageId === "admin-upload" && uploadBtn) {
      uploadBtn.style.display = "none";
    }

    // Call the callback (screen init). Prefer the passed callback, otherwise use global one.
    const cb = onLoadCallback || globalOnLoadCallback;

    if (cb && typeof cb === 'function') {
      await cb(pageId);
    }

    // Call global callback for all screen loads (including hash navigation)
    if (
      globalScreenLoadCallback &&
      typeof globalScreenLoadCallback === "function" &&
      globalScreenLoadCallback !== onLoadCallback
    ) {
      await globalScreenLoadCallback(pageId);
    }
  } catch (error) {
    console.error("Error showing page:", error);
    pageContainer.textContent = 'Error loading page.'; // Use textContent for safety
  }
}

/**
 * Register a global callback to run after every screen load
 * @param {Function|null} callback - Callback with signature (pageId) => Promise<void>|void
 */
export function setScreenLoadCallback(callback) {
  globalScreenLoadCallback =
    typeof callback === "function" ? callback : null;
}

/**
 * Initialize page from URL hash
 */
export async function initPageFromHash() {
  normalizeIndexUrl();

  const hash = window.location.hash.substring(1) || APP_CONFIG.DEFAULT_PAGE;

  // remove query string from hash (anything after ?)
  const pageOnly = hash.split('?')[0];

// sanitize only the page name
const sanitized = pageOnly.replace(/[^a-zA-Z0-9_-]/g, '');
const initialPage = sanitized || APP_CONFIG.DEFAULT_PAGE;

await showPage(isKnownScreen(initialPage) ? initialPage : APP_CONFIG.DEFAULT_PAGE);
}

  return output;
}

export { sanitizeHTML };
// Listen for hash changes
window.addEventListener("hashchange", async () => {
  const hash = window.location.hash.substring(1) || APP_CONFIG.DEFAULT_PAGE;
const pageOnly = hash.split('?')[0];
const sanitized = pageOnly.replace(/[^a-zA-Z0-9_-]/g, '');
if (!isKnownScreen(sanitized)) {
  return;
}

await showPage(sanitized || APP_CONFIG.DEFAULT_PAGE);
});
