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
  'subscribe',
  'profile',
  'dashboard',
  'admin-upload',
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

function resetScrollPosition() {
  const scrollingEl = document.scrollingElement || document.documentElement;

  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (scrollingEl) {
    scrollingEl.scrollTop = 0;
    scrollingEl.scrollLeft = 0;
  }

  document.documentElement.scrollTop = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollTop = 0;
  document.body.scrollLeft = 0;

  const pageContainer = document.getElementById('pageContainer');
  if (pageContainer) {
    pageContainer.scrollTop = 0;
    pageContainer.scrollLeft = 0;
  }

  const mainEl = document.querySelector('main');
  if (mainEl) {
    mainEl.scrollTop = 0;
    mainEl.scrollLeft = 0;
  }
}

function resetScrollOnNavigation(pageId = '') {
  resetScrollPosition();

  requestAnimationFrame(() => {
    resetScrollPosition();
  });

  setTimeout(() => {
    resetScrollPosition();
  }, 0);
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

/**
 * Load a screen HTML file
 * @param {string} screenName - Name of the screen to load
 * @returns {Promise<string>} HTML content of the screen
 */
export async function loadScreen(screenName) {
  // Validate screen name to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(screenName)) {
    throw new Error('Invalid screen name');
  }

  // Check cache first if enabled
  if (APP_CONFIG.CACHE_ENABLED && screenCache[screenName]) {
    return screenCache[screenName];
  }

  try {
    const url = `${APP_CONFIG.SCREENS_PATH}${screenName}.html`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load screen: ${screenName}`);
    }
    const html = await response.text();

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

/**
 * Show a page by loading its screen
 * @param {string} pageId - ID of the page to show
 * @param {Function} onLoadCallback - Optional callback after screen loads
 * @returns {Promise<void>}
 */
export async function showPage(pageId, onLoadCallback = null) {
  const pageContainer = document.getElementById("pageContainer");
  if (!pageContainer) {
    console.error("Page container not found");
    return;
  }

  pageId = normalizePageId(pageId);
  if (!pageId) {
    console.error("Invalid page ID");
    return;
  }

  applyScreenStyle(pageId);
  resetScrollOnNavigation(pageId);

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

    // Some screens add content after initial paint; enforce top position again.
    resetScrollOnNavigation(pageId);
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

/**
 * Clear the screen cache (useful for development)
 */
export function clearScreenCache() {
  Object.keys(screenCache).forEach(key => delete screenCache[key]);
}

// Listen for hash changes
window.addEventListener("hashchange", async () => {
  const hash = window.location.hash.substring(1) || APP_CONFIG.DEFAULT_PAGE;
const pageOnly = hash.split('?')[0];
const sanitized = pageOnly.replace(/[^a-zA-Z0-9_-]/g, '');
if (!isKnownScreen(sanitized)) {
  return;
}

resetScrollOnNavigation(sanitized || APP_CONFIG.DEFAULT_PAGE);
await showPage(sanitized || APP_CONFIG.DEFAULT_PAGE);
});

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}
