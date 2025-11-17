/**
 * Main Application Entry Point
 *
 * Initializes the SPA: navigation, auth, UI, and sound.
 */

// --- SOUND SETUP ---
import { initSound, playClick } from './modules/sound.js';

// --- CORE MODULES ---
import { getSupabaseClient } from './modules/supabase.js';
import { initPageFromHash, showPage } from './modules/navigation.js';
import {
  checkAuthState,
  initAuthStateListener,
  signIn,
  signUp,
  signOut,
  getCurrentSession,
} from './modules/auth.js';
import {
  initUI,
  toggleAuthForm,
  showMessage,
  updateDashboardUserInfo,
} from './modules/ui.js';
import { waitForElement } from './utils/dom.js';
import { validateForm, sanitizeString } from './utils/validators.js';

// --- Global click sound handler (links, buttons, .btn) ---
document.addEventListener('click', (e) => {
  const el = e.target.closest('a, button, .btn');
  if (!el) return;
  if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return;
  playClick();
});

/**
 * Initialize the application
 */
async function init() {
  // Give env-loader a moment to populate window.ENV (defensive)
  await new Promise((r) => setTimeout(r, 50));

  // 1) Base UI hooks (nav, refs)
  initUI();

  // 2) Sound (after DOM ready)
  try {
    initSound();
  } catch (e) {
    console.warn('Sound init failed:', e);
  }

  // 3) Backend (non-blocking if not configured)
  const client = getSupabaseClient();
  if (!client) {
    console.warn('Supabase not configured – continuing without backend.');
    const pageContainer = document.getElementById('pageContainer');
    if (pageContainer) {
      const banner = document.createElement('div');
      banner.style.cssText =
        'background:#fff7d6;border:1px solid #e7cf77;padding:10px;margin:10px 0;font-size:14px;';
      banner.textContent =
        '⚠️ Supabase credentials not set. Navigation works; connect backend later.';
      pageContainer.before(banner);
    }
  }

  // 4) First screen load from #hash (defaults to home)
  await initPageFromHash();

  // 5) Auth state (if backend exists)
  if (client) {
    await checkAuthState();
    initAuthStateListener();
  }

  // 6) Global listeners (forms, logout, nav wrapper)
  setupEventListeners();
  setupScreenInitialization();
}

/**
 * Global event listeners
 */
function setupEventListeners() {
  // Login/Signup (event delegation)
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'loginForm') {
      e.preventDefault();
      await handleLogin(e.target);
    } else if (e.target.id === 'signupForm') {
      e.preventDefault();
      await handleSignup(e.target);
    }
  });

  // Logout
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'logoutBtn' || (e.target.closest && e.target.closest('#logoutBtn'))) {
      e.preventDefault();
      await handleLogout();
    }
  });
}

/**
 * Login handler
 */
async function handleLogin(form) {
  const emailInput = form.querySelector('#loginEmail');
  const passwordInput = form.querySelector('#loginPassword');
  const loginBtn = form.querySelector('#loginBtn');
  if (!emailInput || !passwordInput || !loginBtn) return;

  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;

  const validation = validateForm(
    { email, password },
    {
      email: { required: true, type: 'email' },
      password: { required: true, type: 'password', minLength: 6 },
    }
  );
  if (!validation.isValid) {
    showMessage('loginMessage', Object.values(validation.errors)[0], 'error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';
  showMessage('loginMessage', '', 'success');

  try {
    const { success, message } = await signIn(email, password);
    if (success) {
      showMessage('loginMessage', message, 'success');
      setTimeout(() => showPage('dashboard'), 800);
    } else {
      showMessage('loginMessage', message, 'error');
    }
  } catch (err) {
    showMessage('loginMessage', err.message || 'Failed to sign in', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
}

/**
 * Signup handler
 */
async function handleSignup(form) {
  const nameInput = form.querySelector('#signupName');
  const emailInput = form.querySelector('#signupEmail');
  const passwordInput = form.querySelector('#signupPassword');
  const signupBtn = form.querySelector('#signupBtn');
  if (!nameInput || !emailInput || !passwordInput || !signupBtn) return;

  const name = sanitizeString(nameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;

  const validation = validateForm(
    { name, email, password },
    {
      name: { required: true, minLength: 2 },
      email: { required: true, type: 'email' },
      password: { required: true, type: 'password', minLength: 6 },
    }
  );
  if (!validation.isValid) {
    showMessage('signupMessage', Object.values(validation.errors)[0], 'error');
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = 'Creating account...';
  showMessage('signupMessage', '', 'success');

  try {
    const { success, message } = await signUp(email, password, name);
    if (success) {
      showMessage('signupMessage', message, 'success');
      form.reset();
      setTimeout(() => toggleAuthForm('login'), 1200);
    } else {
      showMessage('signupMessage', message, 'error');
    }
  } catch (err) {
    showMessage('signupMessage', err.message || 'Failed to create account', 'error');
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Create Account';
  }
}

/**
 * Logout handler
 */
async function handleLogout() {
  try {
    const { success, message } = await signOut();
    if (!success) alert('Error signing out: ' + message);
    // auth-state listener will re-route as needed
  } catch (err) {
    alert('Error signing out: ' + err.message);
  }
}

/**
 * Screen-specific initialization hook
 */
async function initializeScreen(pageId) {
  if (pageId === 'dashboard') {
    try {
      await waitForElement('#userName', 1000);
      await waitForElement('#userEmail', 1000);
      const session = await getCurrentSession();
      if (session?.user) updateDashboardUserInfo(session.user);
    } catch (e) {
      console.warn('Dashboard elements not found or session unavailable:', e);
    }
  }
}

/**
 * Wrap showPage to run initializeScreen after each load & wire nav clicks
 */
function setupScreenInitialization() {
  const originalShowPage = showPage;

  const wrappedShowPage = async (pageId) => {
    await originalShowPage(pageId, initializeScreen); // navigation.js should call cb(pageId) after load
  };

  // Expose globally if needed by inline handlers
  window.showPage = wrappedShowPage;

  // Delegate nav clicks (elements with data-page)
  document.addEventListener('click', (e) => {
    const pageLink = e.target.closest('[data-page]');
    if (!pageLink) return;

    const pageId = pageLink.getAttribute('data-page');
    if (!pageId) return;

    // Keep URL & history in sync; hashchange listener will load the page
    e.preventDefault();
    if (location.hash.replace(/^#/, '') !== pageId) {
      location.hash = pageId;
    } else {
      // If already on that hash (e.g., clicking active link), force load
      wrappedShowPage(pageId);
    }
  });

  // Hash route support
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'home';
    wrappedShowPage(hash);
  });
}

// Convenience globals for switching auth panels
window.showLogin = () => {
  showPage('login').then(() => setTimeout(() => toggleAuthForm('login'), 50));
};
window.showSignup = () => {
  showPage('login').then(() => setTimeout(() => toggleAuthForm('signup'), 50));
};
window.handleLogout = handleLogout;

// --- Boot app ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}