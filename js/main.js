/**
 * Main Application Entry Point
 * 
 * This file initializes the application and sets up all modules.
 * It coordinates between different modules and handles the application lifecycle.
 */

console.log("✅ main.js loaded");
console.log("✅ imports finished, about to run init()");
import { getSupabaseClient, isSupabaseInitialized } from './modules/supabase.js';
import { initPageFromHash, showPage, setGlobalOnLoadCallback } from './modules/navigation.js';
import { checkAuthState, initAuthStateListener, signIn, signUp, signOut, getCurrentSession, getSubscriberStatus } from './modules/auth.js';
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from './modules/ui.js';
import { waitForElement } from './utils/dom.js';
import { validateForm, sanitizeString } from './utils/validators.js';
import { fetchWorksheetMetadata, downloadWorksheet } from "./modules/worksheets.js";
let worksheetsLoadToken = 0;
/**
 * Initialize the application
 */
const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
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
  // Set up screen initialization FIRST
  setupScreenInitialization();

  // Initialize page from URL hash
  await window.showPage(window.location.hash.replace('#', '') || 'home');

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

    // Download worksheet button
    const dlBtn = target.closest && target.closest(".downloadWorksheetBtn");
    if (dlBtn) {
      e.preventDefault();
      const id = dlBtn.getAttribute("data-id");
      const result = await downloadWorksheet(id);

      if (!result.success) {
        alert(result.message);
      }
      return;
    }

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
        const returnTo = sessionStorage.getItem('returnTo');

        if (returnTo) {
          sessionStorage.removeItem('returnTo');
          window.location.hash = returnTo.replace(/^#/, '');
        } else {
          window.location.hash = 'chapters';
        }
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
  const fNameInput = form.querySelector('#signupFirstName');
  const lNameInput = form.querySelector('#signupLastName');
  const emailInput = form.querySelector('#signupEmail');
  const passwordInput = form.querySelector('#signupPassword');
  const parentInput = form.querySelector('#signupParent');
  const signupBtn = form.querySelector('#signupBtn');
  const signupMsg = document.getElementById('signupMessage');

  if (!fNameInput || !lNameInput || !emailInput || !passwordInput || !parentInput || !signupBtn) return;

  // Sanitize and get input values
  const firstName = sanitizeString(fNameInput.value);
  const lastName = sanitizeString(lNameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password, but validate
  const parent = parentInput.checked;

  // Validate form
  const validation = validateForm(
    { firstName, lastName, email, password, parent },
    {
      firstName: { required: true, minLength: 2 },
      lastName: { required: true, minLength: 2 },
      email: { required: true, type: 'email' },
      password: {
        required: true,
        type: 'password',
        minLength: 8,
        pattern: /\d/ // must include at least one number
      },
      parent: { type: 'boolean' }
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
    const result = await signUp(email, password, firstName, lastName, parent);

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
  console.log("🔥 initializeScreen called with:", pageId);
  // Dashboard screen
  if (pageId === "dashboard") {
    try {
      await waitForElement("#userName", 1000);
      await waitForElement("#userEmail", 1000);

      const session = await getCurrentSession();
      if (session && session.user) {
        updateDashboardUserInfo(session.user);
      }
    } catch (error) {
      console.warn("Dashboard elements not found:", error);
    }

    try {
      await waitForElement("#worksheetsContainer", 2000);
      const wsBox = document.getElementById("worksheetsContainer");

      if (!wsBox) {
        console.warn("worksheetsContainer not found");
        return;
      }

      wsBox.dataset.loading = "true";
      const currentLoadToken = ++worksheetsLoadToken;

      // Always reload worksheets when entering dashboard
      wsBox.dataset.loaded = "false";

      wsBox.innerHTML = "<p>Loading worksheets...</p>";

      const res = await fetchWorksheetMetadata({ includeAnswerKeys: true });
      if (currentLoadToken !== worksheetsLoadToken) return;


      if (!res || !res.success) {
        wsBox.innerHTML = `<p>${res?.message || "Failed to load worksheets."}</p>`;
        wsBox.dataset.loading = "false";
        return;
      }

      if (!Array.isArray(res.data) || res.data.length === 0) {
        wsBox.innerHTML = "<p>No worksheets available.</p>";
        wsBox.dataset.loading = "false";
        return;
      }

      const worksheetHtml = res.data
        .map((w) => {
          const title = w?.title || "Worksheet";
          const description = w?.description || "";
          const id = w?.id || "";

          return `
        <div class="worksheet-item" style="margin-bottom:12px;">
          <div><strong>${title}</strong></div>
          <div style="font-size:14px; opacity:0.8;">${description}</div>
          <button class="btn btn-primary downloadWorksheetBtn" data-id="${id}">
            Download
          </button>
        </div>
      `;
        })
        .join("");

      wsBox.innerHTML = worksheetHtml;
      wsBox.dataset.loaded = "true";
      wsBox.dataset.loading = "false";

    } catch (err) {
      console.error("Worksheet load error:", err);

      const wsBox = document.getElementById("worksheetsContainer");
      if (wsBox) {
        wsBox.innerHTML = "<p>Failed to load worksheets.</p>";
      }
    }

    return;
  }

  // Login / Signup screen
  if (pageId === "login") {
    try {
      await waitForElement("#loginBox", 1000);

      const signupLink = document.getElementById("signupSwitchLink");
      const loginLink = document.getElementById("loginSwitchLink");

      if (signupLink) {
        signupLink.addEventListener("click", (e) => {
          e.preventDefault();
          toggleAuthForm("signup");
        });
      }


      if (loginLink) {
        loginLink.addEventListener("click", (e) => {
          e.preventDefault();
          toggleAuthForm("login");
        });
      }
    } catch (error) {
      console.warn("Auth screen elements not found:", error);
    }
  }
}

/**
 * Set up screen initialization callback for navigation
 */
function setupScreenInitialization() {
  const originalShowPage = showPage;

  window.showPage = async function (pageId) {
    await originalShowPage(pageId);
    await initializeScreen(pageId);
  };

  document.addEventListener("click", (e) => {
    const pageLink = e.target.closest("[data-page]");
    if (pageLink) {
      e.preventDefault();
      const pageId = pageLink.getAttribute("data-page");
      if (pageId) {
        window.showPage(pageId);
      }
      return;
    }

    if (e.target.id === "logoutLink" || e.target.closest("#logoutLink")) {
      e.preventDefault();
      handleLogout();
    }
  });

  window.addEventListener("hashchange", async () => {
    const pageId = window.location.hash.replace("#", "") || "home";
    await initializeScreen(pageId);
  });
}

// Global functions for programmatic access
window.showLogin = () => {
  window.showPage('login').then(() => {
    setTimeout(() => toggleAuthForm('login'), 100);
  });
};

window.showSignup = () => {
  window.showPage('login').then(() => {
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
function renderChapters({ isSubscriber = false } = {}) {
  const chapterList = document.getElementById("chapterList");
  if (!chapterList) return;

  let html = "";

  for (let i = 1; i <= APP_CONFIG.TOTAL_CHAPTERS; i++) {
    const isLocked = !isSubscriber && i > APP_CONFIG.FREE_CHAPTER_COUNT;
    html += `
      <div class="chapter-item">
        <h3>${isLocked ? "🔒 " : ""}Chapter ${i}</h3>
        <button 
  type="button" 
  class="chapter-button" 
  data-chapter="${i}"
>
  ${isLocked ? "Subscribers Only" : "Read for Free"}
</button>
      </div>
    `;
  }

  chapterList.innerHTML = html;
  //One click listener for all chapter buttons (no inline onclick)
  if (!chapterList.dataset.listenerAttached) {
    chapterList.addEventListener("click", (e) => {
      const btn = e.target.closest(".chapter-button");
      if (!btn) return;

      const chapterNumber = Number(btn.dataset.chapter);
      if (Number.isNaN(chapterNumber)) return;

      handleLockedChapter(chapterNumber);
    });

    chapterList.dataset.listenerAttached = "true";
  }
}

async function handleLockedChapter(chapterNumber) {
  // Chapters 1–2 are free
  const isFreeChapter = chapterNumber <= FREE_LIMIT;

  // Only require login for locked chapters (3+)
  if (!isFreeChapter) {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      sessionStorage.setItem('returnTo', '#chapters');
      sessionStorage.setItem('requestedChapter', String(chapterNumber));
      window.showLogin();
      return;
    }
  }

  // Open the chapter
  sessionStorage.setItem('activeChapter', String(chapterNumber));
  window.location.hash = 'chapter-reader';
}
window.handleLockedChapter = handleLockedChapter;