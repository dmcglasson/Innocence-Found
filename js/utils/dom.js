/**
 * DOM Utilities
 * 
 * Helper functions for DOM manipulation and element selection.
 */

/**
 * Get element by ID with error handling
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with ID "${id}" not found`);
  }
  return element;
}

/**
 * Get multiple elements by IDs
 * @param {string[]} ids - Array of element IDs
 * @returns {Object} Object with element IDs as keys
 */
export function getElements(ids) {
  const elements = {};
  ids.forEach(id => {
    elements[id] = getElement(id);
  });
  return elements;
}

/**
 * Wait for element to appear in DOM
 * @param {string} selector - CSS selector or element ID
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<HTMLElement>}
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = typeof selector === 'string' && selector.startsWith('#')
      ? document.getElementById(selector.substring(1))
      : document.querySelector(selector);

    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = typeof selector === 'string' && selector.startsWith('#')
        ? document.getElementById(selector.substring(1))
        : document.querySelector(selector);

      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Remove all event listeners from an element by cloning it
 * @param {HTMLElement} element - Element to clean
 * @returns {HTMLElement} Cloned element without listeners
 */
export function removeEventListeners(element) {
  if (!element) return null;
  return element.cloneNode(true);
}

