/**
 * Navigation Module
 * 
 * Handles page navigation, screen loading, and URL routing.
 * This module manages the single-page application routing.
 */

import { APP_CONFIG } from '../config.js';

// Cache for loaded screens
const screenCache = {};

/**
 * Sanitize HTML to prevent XSS attacks
 * Removes script tags and dangerous attributes
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHTML(html) {
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
    const response = await fetch(`${APP_CONFIG.SCREENS_PATH}${screenName}.html`);
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

  // Validate pageId
  if (!pageId || typeof pageId !== 'string') {
    console.error('Invalid page ID');
    return;
  }

  // Show loading state
  pageContainer.textContent = 'Loading...'; // Use textContent instead of innerHTML for safety
  pageContainer.classList.add("active");

  // Update URL hash
  window.location.hash = pageId;

  try {
    // Load the screen
    const screenHtml = await loadScreen(pageId);
    pageContainer.innerHTML = screenHtml;

    // Call the callback if provided (for initializing screen-specific logic)
    if (onLoadCallback && typeof onLoadCallback === 'function') {
      await onLoadCallback(pageId);
    }
  } catch (error) {
    console.error("Error showing page:", error);
    pageContainer.textContent = 'Error loading page.'; // Use textContent for safety
  }
}

/**
 * Initialize page from URL hash
 */
export async function initPageFromHash() {
  const hash = window.location.hash.substring(1) || APP_CONFIG.DEFAULT_PAGE;
  // Sanitize hash to prevent XSS
  const sanitizedHash = hash.replace(/[^a-zA-Z0-9_-]/g, '');
  await showPage(sanitizedHash || APP_CONFIG.DEFAULT_PAGE);
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
  // Sanitize hash
  const sanitizedHash = hash.replace(/[^a-zA-Z0-9_-]/g, '');
  await showPage(sanitizedHash || APP_CONFIG.DEFAULT_PAGE);
});
