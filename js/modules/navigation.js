/**
 * navigation.js
 * Simple hash router that loads /screens/<page>.html into #pageContainer
 */

const CONTAINER_ID = 'pageContainer';
const SR_ANNOUNCER_ID = 'sr-announcer';

function container() {
  const el = document.getElementById(CONTAINER_ID);
  if (!el) throw new Error(`#${CONTAINER_ID} not found in index.html`);
  return el;
}

function srAnnouncer() {
  return document.getElementById(SR_ANNOUNCER_ID);
}

// Resolve a page fragment URL relative to index.html (works from any subpath)
function pageUrl(pageId) {
  return new URL(`screens/${pageId}.html`, window.location.href).toString();
}

// Fetch HTML safely
async function fetchFragment(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.text();
}

// Very small sanitizer for fragments (removes <script> tags)
function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('script').forEach(s => s.remove());
  return tpl.innerHTML;
}

function setActiveNav(pageId) {
  document.querySelectorAll('[data-page]').forEach(a => {
    if (a.getAttribute('data-page') === pageId) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  });
}

function announce(pageId) {
  const sr = srAnnouncer();
  if (sr) {
    sr.textContent = `Loaded ${pageId} page`;
    // Clear after a tick to re-announce next time
    setTimeout(() => (sr.textContent = ''), 250);
  }
}

/**
 * Loads a page fragment and inserts it into #pageContainer.
 * @param {string} pageId
 * @param {(pageId:string)=>void} [afterLoad] optional callback after insertion
 */
export async function showPage(pageId, afterLoad) {
  try {
    const html = await fetchFragment(pageUrl(pageId));
    container().innerHTML = sanitize(html);
    setActiveNav(pageId);
    announce(pageId);
    if (typeof afterLoad === 'function') {
      await afterLoad(pageId);
    }
  } catch (err) {
    console.error('[router] showPage error:', err);
    container().innerHTML = `
      <div class="error">
        <h2>Page not found</h2>
        <p>Could not load <code>${pageId}</code>. (${err.message})</p>
      </div>`;
  }
}

/**
 * Reads window.location.hash and loads the matching page.
 * Defaults to "home" if no hash.
 */
export async function initPageFromHash() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  const pageId = hash || 'home';
  await showPage(pageId);
}

// Listen for hash changes (in case main.js doesn’t already)
window.addEventListener('hashchange', () => {
  const hash = (window.location.hash || '').replace(/^#/, '') || 'home';
  showPage(hash);
});
