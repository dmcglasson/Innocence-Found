/**
 * Main Application Entry Point
 * 
 * This file initializes the application and sets up all modules.
 * It coordinates between different modules and handles the application lifecycle.
 */

import { getSupabaseClient, isSupabaseInitialized } from './modules/supabase.js';
import { initPageFromHash, showPage } from './modules/navigation.js';
import { checkAuthState, initAuthStateListener, signIn, signUp, signOut, getCurrentSession } from './modules/auth.js';
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from './modules/ui.js';
import { getSubscriptionStatus, hasActiveSubscription, createSubscriptionForCurrentUser } from './modules/subscription.js';
import { getBooks, getChapters, getChapterContent, getChapterMeta } from './modules/chapters.js';
import { waitForElement } from './utils/dom.js';
import { validateForm, sanitizeString } from './utils/validators.js';

/**
 * Initialize the application
 */
async function init() {
  // Wait a moment for env vars to be available
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check Supabase initialization
  const client = getSupabaseClient();
  if (!client) {
    console.error("Failed to initialize Supabase client. Check your .env file or config.");
    // Show user-friendly error
    const pageContainer = document.getElementById("pageContainer");
    if (pageContainer) {
      pageContainer.innerHTML = `
        <div class="content-section">
          <h2>Configuration Error</h2>
          <p>Supabase credentials not configured. Please:</p>
          <ol>
            <li>Create a <code>.env</code> file (copy from <code>.env.example</code>)</li>
            <li>Add your <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code></li>
            <li>Refresh this page</li>
          </ol>
        </div>
      `;
    }
    return;
  }

  // Initialize UI
  initUI();

  // Set up screen initialization and wrap showPage so hash-based loads run init
  setupScreenInitialization();

  // Initialize page from URL hash (uses wrapped showPage so read/library/subscribe init runs)
  await initPageFromHash();

  // Check authentication state
  await checkAuthState();

  // Initialize auth state listener
  initAuthStateListener();

  // Set up event listeners
  setupEventListeners();
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Login form
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'loginForm') {
      e.preventDefault();
      await handleLogin(e.target);
    } else if (e.target.id === 'signupForm') {
      e.preventDefault();
      await handleSignup(e.target);
    }
  });

    // Click handlers (logout + switch between login/signup)
  document.addEventListener('click', async (e) => {
    const target = e.target;

    // Logout button
    if (target.id === 'logoutBtn' || (target.closest && target.closest('#logoutBtn'))) {
      e.preventDefault();
      await handleLogout();
      return;
    }

    // Switch to signup form
    if (target.id === 'signupSwitchLink' || (target.closest && target.closest('#signupSwitchLink'))) {
      e.preventDefault();
      toggleAuthForm('signup');
      return;
    }

    // Switch to login form
    if (target.id === 'loginSwitchLink' || (target.closest && target.closest('#loginSwitchLink'))) {
      e.preventDefault();
      toggleAuthForm('login');
      return;
    }
  });

}

/**
 * Handle login form submission
 * @param {HTMLFormElement} form - Login form element
 */
async function handleLogin(form) {
  const emailInput = form.querySelector('#loginEmail');
  const passwordInput = form.querySelector('#loginPassword');
  const loginBtn = form.querySelector('#loginBtn');
  const loginMsg = document.getElementById('loginMessage');

  if (!emailInput || !passwordInput || !loginBtn) return;

  // Sanitize and get input values
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password, but validate length

  // Validate form
  const validation = validateForm(
    { email, password },
    {
      email: { required: true, type: 'email' },
      password: { required: true, type: 'password', minLength: 6 }
    }
  );

  if (!validation.isValid) {
    showMessage('loginMessage', Object.values(validation.errors)[0], 'error');
    return;
  }

  // Update UI
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";
  showMessage('loginMessage', '', 'success');

  try {
    const result = await signIn(email, password);

    if (result.success) {
      showMessage('loginMessage', result.message, 'success');
      setTimeout(() => {
        showPage('dashboard');
      }, 1000);
    } else {
      showMessage('loginMessage', result.message, 'error');
    }
  } catch (error) {
    showMessage('loginMessage', error.message || 'Failed to sign in', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

/**
 * Handle signup form submission
 * @param {HTMLFormElement} form - Signup form element
 */
async function handleSignup(form) {
  const nameInput = form.querySelector('#signupName');
  const emailInput = form.querySelector('#signupEmail');
  const passwordInput = form.querySelector('#signupPassword');
  const signupBtn = form.querySelector('#signupBtn');
  const signupMsg = document.getElementById('signupMessage');

  if (!nameInput || !emailInput || !passwordInput || !signupBtn) return;

  // Sanitize and get input values
  const name = sanitizeString(nameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password, but validate

  // Validate form
  const validation = validateForm(
    { name, email, password },
    {
      name: { required: true, minLength: 2 },
      email: { required: true, type: 'email' },
      password: { 
        required: true, 
        type: 'password', 
        minLength: 8,
        pattern: /\d/ // must include at least one number
      }
    }
  );

  if (!validation.isValid) {
    showMessage('signupMessage', Object.values(validation.errors)[0], 'error');
    return;
  }

  // Update UI
  signupBtn.disabled = true;
  signupBtn.textContent = "Creating account...";
  showMessage('signupMessage', '', 'success');

  try {
    const result = await signUp(email, password, name);

    if (result.success) {
      showMessage('signupMessage', result.message, 'success');
      form.reset();
      setTimeout(() => {
        toggleAuthForm('login');
      }, 2000);
    } else {
      showMessage('signupMessage', result.message, 'error');
    }
  } catch (error) {
    showMessage('signupMessage', error.message || 'Failed to create account', 'error');
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    const result = await signOut();
    if (!result.success) {
      alert("Error signing out: " + result.message);
    }
    // Navigation is handled by auth state listener
  } catch (error) {
    alert("Error signing out: " + error.message);
  }
}

/**
 * Initialize screen-specific logic after screen loads
 * @param {string} pageId - ID of the loaded page
 */
/**
 * Initialize screen-specific logic after screen loads
 * @param {string} pageId - ID of the loaded page
 */
async function initializeScreen(pageId) {
  // Dashboard screen
  if (pageId === 'dashboard') {
    try {
      await waitForElement('#userName', 1000);
      await waitForElement('#userEmail', 1000);
      
      const session = await getCurrentSession();
      if (session && session.user) {
        updateDashboardUserInfo(session.user);
      }
    } catch (error) {
      console.warn('Dashboard elements not found:', error);
    }
  }

  // Login / Signup screen
  if (pageId === 'login') {
    try {
      await waitForElement('#loginBox', 1000);
      const signupLink = document.getElementById('signupSwitchLink');
      const loginLink  = document.getElementById('loginSwitchLink');
      if (signupLink) {
        signupLink.addEventListener('click', (e) => { e.preventDefault(); toggleAuthForm('signup'); });
      }
      if (loginLink) {
        loginLink.addEventListener('click', (e) => { e.preventDefault(); toggleAuthForm('login'); });
      }
    } catch (error) {
      console.warn('Auth screen elements not found:', error);
    }
  }

  // Subscribe screen
  if (pageId === 'subscribe') {
    try {
      await waitForElement('#subscriptionStatus', 500);
      const statusEl = document.getElementById('subscriptionStatus');
      const ctaEl = document.getElementById('subscriptionCTA');
      const statusTextEl = document.getElementById('subscriptionStatusText');
      const endDateEl = document.getElementById('subscriptionEndDate');
      const session = await getCurrentSession();
      const status = await getSubscriptionStatus();
      if (session && status.active && statusTextEl) {
        statusEl.style.display = 'block';
        ctaEl.style.display = 'none';
        statusTextEl.textContent = "You have an active subscription. You can read all locked chapters.";
        if (status.endDate && endDateEl) {
          endDateEl.style.display = 'block';
          endDateEl.textContent = 'Renews: ' + new Date(status.endDate).toLocaleDateString();
        }
      } else if (session) {
        const notLoggedIn = document.getElementById('subscribeActionsNotLoggedIn');
        const loggedIn = document.getElementById('subscribeActionsLoggedIn');
        if (notLoggedIn) notLoggedIn.style.display = 'none';
        if (loggedIn) loggedIn.style.display = 'flex';
        const activateBtn = document.getElementById('activateSubscriptionBtn');
        if (activateBtn) {
          activateBtn.onclick = async () => {
            activateBtn.disabled = true;
            const result = await createSubscriptionForCurrentUser();
            if (result.success) {
              window.showPage('subscribe', initializeScreen);
            } else {
              const msg = document.getElementById('subscribeMessage');
              if (msg) { msg.style.display = 'block'; msg.textContent = result.message; }
            }
            activateBtn.disabled = false;
          };
        }
      }
      document.querySelectorAll('#subscriptionCTA [data-page]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const page = el.getAttribute('data-page');
          if (page) window.showPage(page);
        });
      });
    } catch (err) {
      console.warn('Subscribe screen init:', err);
    }
  }

  // Reader screen: enforce login + subscription for locked chapters, then load content
  if (pageId === 'read') {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const chapterId = params.get('chapter') || params.get('chapterId');
      const bookId = params.get('book') || params.get('bookId');
      const loadingEl = document.getElementById('readerLoading');
      const errorEl = document.getElementById('readerError');
      const contentEl = document.getElementById('readerContent');
      const errorMsgEl = document.getElementById('readerErrorMessage');
      const errorActionEl = document.getElementById('readerErrorAction');

      const showError = (msg, goToSubscribe = false) => {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'block';
        if (errorMsgEl) errorMsgEl.textContent = msg;
        if (errorActionEl) {
          errorActionEl.textContent = goToSubscribe ? 'Go to Subscribe' : 'Go back';
          errorActionEl.onclick = (e) => {
            e.preventDefault();
            window.showPage(goToSubscribe ? 'subscribe' : 'library');
          };
        }
      };

      if (!chapterId) {
        showError('No chapter specified.');
        return;
      }

      const session = await getCurrentSession();
      if (!session) {
        window.showPage('login');
        return;
      }

      const meta = await getChapterMeta(chapterId);
      if (!meta) {
        showError('Chapter not found or not yet released.');
        return;
      }

      if (!meta.is_free) {
        const active = await hasActiveSubscription();
        if (!active) {
          window.showPage('subscribe');
          return;
        }
      }

      const chapter = await getChapterContent(chapterId);
      if (!chapter || chapter.content == null) {
        window.showPage('subscribe');
        return;
      }

      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';

      const titleEl = document.getElementById('readerChapterTitle');
      const articleEl = document.getElementById('readerArticle');
      if (titleEl) titleEl.textContent = chapter.title;
      if (articleEl) {
        const text = chapter.content || '';
        articleEl.innerHTML = text.split(/\n\n+/).map(p => '<p>' + escapeHtml(p) + '</p>').join('');
      }

      const backLink = document.getElementById('readerBackLink');
      const backBtn = document.getElementById('readerBackBtn');
      if (backLink) {
        backLink.onclick = (e) => { e.preventDefault(); window.showPage('library'); };
      }
      if (backBtn) {
        backBtn.onclick = (e) => { e.preventDefault(); window.showPage('library'); };
      }
    } catch (err) {
      console.error('Reader init error:', err);
      const errorEl = document.getElementById('readerError');
      const errorMsgEl = document.getElementById('readerErrorMessage');
      const loadingEl = document.getElementById('readerLoading');
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
      if (errorMsgEl) errorMsgEl.textContent = 'Something went wrong. Please try again.';
    }
  }

  // Library screen: list books and chapters with Read links
  if (pageId === 'library') {
    try {
      const loadingEl = document.getElementById('libraryLoading');
      const emptyEl = document.getElementById('libraryEmpty');
      const listEl = document.getElementById('libraryList');
      const books = await getBooks();
      if (loadingEl) loadingEl.style.display = 'none';
      if (books.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';
      if (listEl) {
        listEl.style.display = 'block';
        let html = '';
        for (const book of books) {
          const chapters = await getChapters(book.id);
          const chapterRows = chapters.map(ch => {
            const badge = ch.is_free ? '<span class="chapter-badge">Free</span>' : '<span class="chapter-badge locked">Subscribers</span>';
            return `<li>
              <span class="chapter-title">${escapeHtml(ch.title)}</span>
              ${badge}
              <a href="#" class="btn btn-read btn-primary" data-book-id="${escapeHtml(book.id)}" data-chapter-id="${escapeHtml(ch.id)}">Read</a>
            </li>`;
          }).join('');
          html += `<div class="book-card">
            <h2>${escapeHtml(book.title)}</h2>
            ${book.description ? `<p class="book-description">${escapeHtml(book.description)}</p>` : ''}
            <ul class="chapter-list">${chapterRows}</ul>
          </div>`;
        }
        listEl.innerHTML = html;
        listEl.querySelectorAll('[data-book-id][data-chapter-id]').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const bid = link.getAttribute('data-book-id');
            const cid = link.getAttribute('data-chapter-id');
            if (bid && cid) window.showReader(bid, cid);
          });
        });
      }
    } catch (err) {
      console.error('Library init error:', err);
      const loadingEl = document.getElementById('libraryLoading');
      const emptyEl = document.getElementById('libraryEmpty');
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Unable to load library. Please try again.';
      }
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


/**
 * Set up screen initialization callback for navigation
 */
function setupScreenInitialization() {
  // Wrap showPage to include screen initialization
  const originalShowPage = showPage;
  const wrappedShowPage = async (pageId) => {
    await originalShowPage(pageId, initializeScreen);
  };
  
  // Expose globally for onclick handlers and navigation
  window.showPage = wrappedShowPage;
  
  // Set up navigation event delegation
  document.addEventListener('click', (e) => {
    const pageLink = e.target.closest('[data-page]');
    if (pageLink) {
      e.preventDefault();
      const pageId = pageLink.getAttribute('data-page');
      if (pageId) {
        wrappedShowPage(pageId);
      }
    }
    
    // Handle logout link
    if (e.target.id === 'logoutLink' || e.target.closest('#logoutLink')) {
      e.preventDefault();
      handleLogout();
    }
  });
}

// Global functions for programmatic access
window.showLogin = () => {
  showPage('login').then(() => {
    setTimeout(() => toggleAuthForm('login'), 100);
  });
};
window.showSignup = () => {
  showPage('login').then(() => {
    setTimeout(() => toggleAuthForm('signup'), 100);
  });
};
window.handleLogout = handleLogout;

/**
 * Open the interactive reader for a chapter. Uses URL search params for book and chapter.
 * Access control (login + subscription for locked chapters) runs when the read screen loads.
 */
window.showReader = (bookId, chapterId) => {
  const params = new URLSearchParams();
  if (bookId) params.set('book', bookId);
  if (chapterId) params.set('chapter', chapterId);
  const query = params.toString();
  const url = window.location.pathname + (query ? '?' + query : '') + '#read';
  window.history.replaceState(null, '', url);
  showPage('read', initializeScreen);
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
