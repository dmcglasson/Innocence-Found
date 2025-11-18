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

  // Initialize page from URL hash
  await initPageFromHash();

  // Check authentication state
  await checkAuthState();

  // Initialize auth state listener
  initAuthStateListener();

  // Set up event listeners
  setupEventListeners();

  // Set up screen initialization callback
  setupScreenInitialization();
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

  // Logout button
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'logoutBtn' || (e.target.closest && e.target.closest('#logoutBtn'))) {
      e.preventDefault();
      await handleLogout();
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
      password: { required: true, type: 'password', minLength: 6 }
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
async function initializeScreen(pageId) {
  if (pageId === 'dashboard') {
    // Wait for dashboard elements to load
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

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

