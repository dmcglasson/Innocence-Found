
import { getSupabaseClient } from "./modules/supabase.js";
import { initPageFromHash, showPage } from "./modules/navigation.js";
import {
  checkAuthState,
  initAuthStateListener,
  signIn,
  signUp,
  signOut,
  getCurrentSession,
} from "./modules/auth.js";
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from "./modules/ui.js";
import { waitForElement } from "./utils/dom.js";
import { validateForm, sanitizeString } from "./utils/validators.js";

import { getSupabaseClient, isSupabaseInitialized } from './modules/supabase.js';
import { initPageFromHash, showPage, setGlobalOnLoadCallback } from './modules/navigation.js';
import { checkAuthState, initAuthStateListener, signIn, signUp, signOut, getCurrentSession } from './modules/auth.js';
import { initializeProfileScreen } from './modules/profile.js';
import { initializeChaptersScreen, initializeChapterReaderScreen, handleLockedChapter } from './modules/chapters.js';
import { initializeWorksheetsScreen, initializeWorksheetReaderScreen, handleLockedWorksheet } from './modules/worksheets.js';
import { initUI, toggleAuthForm, showMessage, updateDashboardUserInfo } from './modules/ui.js';
import { waitForElement } from './utils/dom.js';
import { validateForm, sanitizeString } from './utils/validators.js';
import { fetchWorksheetMetadata, downloadWorksheet } from "./modules/worksheets.js";
let worksheetsLoadToken = 0;
/**
 * Initialize screen-specific logic after a screen loads
 */
async function initializeScreen(pageId) {

  if (pageId === "payment-confirmation") {
  const planData = JSON.parse(localStorage.getItem("selectedPlan"));

  if (planData) {
    const nameEl = document.getElementById("planName");
    const priceEl = document.getElementById("planPrice");

    if (nameEl) nameEl.textContent = planData.name;
    if (priceEl) priceEl.textContent = planData.price;
  }
}
  if (pageId === "dashboard") {
    try {
      await waitForElement("#userName", 1000);
      await waitForElement("#userEmail", 1000);

      const session = await getCurrentSession();
      if (session?.user) updateDashboardUserInfo(session.user);
    } catch (e) { }
  }

  if (pageId === "login") {
    try {
      await waitForElement("#loginBox", 1000);
      // default to login view
      toggleAuthForm("login");
    } catch (e) { }
  }
}

/**
 * Expose a safe global showPage that always runs initializeScreen
 */
function setupScreenInitialization() {
  window.showPage = async (pageId) => {
    await showPage(pageId, initializeScreen);
  };
const APP_CONFIG = window.APP_CONFIG || {
  FREE_CHAPTER_COUNT: 2,
  TOTAL_CHAPTERS: 8
};

const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
async function init() {
  // Wait a moment for env vars to be available
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check Supabase initialization
  const client = getSupabaseClient();
  if (!client) {
    console.warn("Supabase client unavailable; continuing with screen routing only.");
  }

  // Initialize UI
  initUI();
  setGlobalOnLoadCallback(initializeScreen);

  // Set up navigation handlers before first route render
  setupScreenInitialization();

  // Render initial route
  await initPageFromHash();

  // Check authentication state only when backend client is available
  if (client) {
    await checkAuthState();
  }

  // Initialize auth state listener
  initAuthStateListener(async (event) => {
    const currentPage = window.location.hash.substring(1) || 'home';
    if (currentPage !== 'profile') return;

    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
      await initializeProfileScreen();
      return;
    }

    if (event === 'SIGNED_OUT') {
      await initializeProfileScreen();
    }
  });

  // Set up event listeners
  setupEventListeners();
}

/**
 * Event listeners
 */
function setupEventListeners() {
  document.addEventListener("submit", async (e) => {
    if (e.target.id === "loginForm") {
      e.preventDefault();
      await handleLogin(e.target);
      return;
    }

    if (e.target.id === "signupForm") {
      e.preventDefault();
      await handleSignup(e.target);
      return;
    }
  });

  document.addEventListener("click", async (e) => {
    const target = e.target;

    const pageLink = target.closest && target.closest("[data-page]");
    if (pageLink) {
      e.preventDefault();
      const pageId = pageLink.getAttribute("data-page");
      if (pageId) await window.showPage(pageId);
      return;
    }

    const paidPlanBtn = target.closest && target.closest("#select-paid-plan");
if (paidPlanBtn) {
  e.preventDefault();

  // STORE selected plan
  localStorage.setItem("selectedPlan", JSON.stringify({
    name: "Paid Plan",
    price: "$4.99 / month"
  }));

  const session = await getCurrentSession();
  if (session) {
    await window.showPage("payment-confirmation");
  } else {
    await window.showPage("login");
  }
  return;
}

    // ADD THIS RIGHT HERE ↓↓↓

    // IF-96: Confirm payment button -> success page
if (confirmBtn) {
  e.preventDefault();

const text = confirmBtn.querySelector("#btnText");
const spinner = confirmBtn.querySelector("#btnSpinner");

if (text) text.textContent = "LOADING...";
if (spinner) spinner.style.display = "inline-block";

confirmBtn.style.pointerEvents = "none";

  setTimeout(async () => {
    localStorage.setItem("isSubscriber", "true");
    updateSubscriberBadge();
    await window.showPage('payment-success');
  }, 3000);

  return;
}

    const logoutBtn = target.closest && target.closest("#logoutBtn");
    if (logoutBtn) {
  // Login form
  document.addEventListener('submit', async (e) => {
  if (e.target.id === 'loginForm') {
    e.preventDefault();
    await handleLogin(e.target);
  } else if (e.target.id === 'signupForm') {
    e.preventDefault();
    await handleSignup(e.target);
  } else if (e.target.id === 'uploadWorksheetForm') {
    e.preventDefault();
    await handleWorksheetUpload(e.target);
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

    const logoutLink = target.closest && target.closest("#logoutLink");
    if (logoutLink) {
      e.preventDefault();
      await handleLogout();
      return;
    }

    const signupSwitch = target.closest && target.closest("#signupSwitchLink");
    if (signupSwitch) {
      e.preventDefault();
      toggleAuthForm("signup");
      return;
    }

    const loginSwitch = target.closest && target.closest("#loginSwitchLink");
    if (loginSwitch) {
      e.preventDefault();
      toggleAuthForm("login");
      return;
    }
  });
}

/**
 * Login
 */
async function handleLogin(form) {
  const emailInput = form.querySelector("#loginEmail");
  const passwordInput = form.querySelector("#loginPassword");
  const loginBtn = form.querySelector("#loginBtn");

  if (!emailInput || !passwordInput || !loginBtn) return;

  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;

  const validation = validateForm(
    { email, password },
    {
      email: { required: true, type: "email" },
      password: { required: true, type: "password", minLength: 6 },
    }
  );

  if (!validation.isValid) {
    showMessage("loginMessage", Object.values(validation.errors)[0], "error");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";
  showMessage("loginMessage", "", "success");

  try {
    const result = await signIn(email, password);
    if (result.success) {
      showMessage("loginMessage", result.message, "success");
      setTimeout(async () => {
        await window.showPage("subscribe");
      }, 400);
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
      showMessage("loginMessage", result.message, "error");
    }
  } catch (err) {
    showMessage("loginMessage", err?.message || "Failed to sign in", "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

/**
 * Signup
 */
async function handleSignup(form) {
  const nameInput = form.querySelector("#signupName");
  const emailInput = form.querySelector("#signupEmail");
  const passwordInput = form.querySelector("#signupPassword");
  const signupBtn = form.querySelector("#signupBtn");
  const fNameInput = form.querySelector('#signupFirstName');
  const lNameInput = form.querySelector('#signupLastName');
  const emailInput = form.querySelector('#signupEmail');
  const passwordInput = form.querySelector('#signupPassword');
  const parentInput = form.querySelector('#signupParent');
  const signupBtn = form.querySelector('#signupBtn');
  const signupMsg = document.getElementById('signupMessage');

  if (!fNameInput || !lNameInput || !emailInput || !passwordInput || !parentInput || !signupBtn) return;

  const name = sanitizeString(nameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;
  // Sanitize and get input values
  const firstName = sanitizeString(fNameInput.value);
  const lastName = sanitizeString(lNameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password, but validate
  const parent = parentInput.checked;

  const validation = validateForm(
    { firstName, lastName, email, password, parent },
    {
      name: { required: true, minLength: 2 },
      email: { required: true, type: "email" },
      password: { required: true, type: "password", minLength: 8, pattern: /\d/ },
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
    showMessage("signupMessage", Object.values(validation.errors)[0], "error");
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Creating account...";
  showMessage("signupMessage", "", "success");

  try {
    const result = await signUp(email, password, name);
    const result = await signUp(email, password, firstName, lastName, parent);

    if (result.success) {
      showMessage("signupMessage", result.message, "success");
      form.reset();
      setTimeout(() => toggleAuthForm("login"), 700);
    } else {
      showMessage("signupMessage", result.message, "error");
    }
  } catch (err) {
    showMessage("signupMessage", err?.message || "Failed to create account", "error");
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
}

/**
 * Logout
 */
async function handleLogout() {
  try {
    await signOut();
    await window.showPage("home");
  } catch (e) {
    alert("Error signing out");
  }
}

function updateSubscriberBadge() {
  const badge = document.getElementById("subscriberBadge");
  if (!badge) return;

  const isSubscriber = localStorage.getItem("isSubscriber") === "true";
  badge.style.display = isSubscriber ? "inline-block" : "none";
}

async function handleWorksheetUpload(form) {
  const titleInput = form.querySelector('#worksheetTitle');
  const descriptionInput = form.querySelector('#worksheetDescription');
  const fileInput = form.querySelector('#worksheetFile');
  const uploadMsg = document.getElementById('uploadMessage');
  const uploadBtn = form.querySelector('button[type="submit"]');

  if (!titleInput || !descriptionInput || !fileInput || !uploadBtn) {
    console.error('Upload form elements not found');
    return;
  }

  const file = fileInput.files?.[0];

  if (!file) {
    if (uploadMsg) uploadMsg.textContent = 'Please choose a PDF file.';
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  if (uploadMsg) uploadMsg.textContent = '';

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const safeFileName = `${Date.now()}-${file.name}`;

    const { error: storageError } = await supabase.storage
      .from('Worksheets')
      .upload(safeFileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (storageError) {
      throw storageError;
    }

    const { error: dbError } = await supabase
      .from('worksheets')
      .insert([
        {
          title: titleInput.value.trim(),
          description: descriptionInput.value.trim(),
          file_path: safeFileName
        }
      ]);

    if (dbError) {
      throw dbError;
    }

    if (uploadMsg) uploadMsg.textContent = 'Worksheet uploaded successfully.';
    form.reset();

    const wsBox = document.getElementById('worksheetsContainer');
    if (wsBox) {
      wsBox.dataset.loaded = 'false';
    }

    await initializeScreen('dashboard');
  } catch (error) {
    console.error('Worksheet upload error:', error);
    if (uploadMsg) uploadMsg.textContent = error.message || 'Upload failed.';
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Worksheet';
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
  if (pageId === 'profile') {
    await initializeProfileScreen();
  }

  // Bookreader screen (supports direct hash and DOM detection)
  if (pageId === 'bookreader' || document.getElementById('bookSelect')) {
    try {
      const { initBookReader } = await import('./modules/bookreader.js');
      await initBookReader();
    } catch (error) {
      console.warn('Bookreader screen failed to initialize:', error);
    }
  }

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
  if (pageId === 'chapter-reader') {
    await initializeChapterReaderScreen();
  }

  if (pageId === 'worksheet-reader') {
    await initializeWorksheetReaderScreen();
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

  if (pageId === 'chapters') {
    await initializeChaptersScreen();
  }

  if (pageId === 'worksheets') {
    await initializeWorksheetsScreen();
  }
}

/**
 * Init
 */
async function init() {
  await new Promise((r) => setTimeout(r, 100));

  const client = getSupabaseClient();

  initUI();
  updateSubscriberBadge();
  setupScreenInitialization();
function navigateToPage(pageId) {
  const safePage = String(pageId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safePage) return;

  const nextHash = `#${safePage}`;

  // If hash is unchanged, hashchange will not fire, so render directly.
  if (window.location.hash === nextHash) {
    showPage(safePage);
    return;
  }

  window.location.hash = safePage;
}

function setupScreenInitialization() {
  // Expose globally for onclick handlers and navigation
  window.showPage = navigateToPage;

  // Set up navigation event delegation
  document.addEventListener('click', (e) => {
    const pageLink = e.target.closest('[data-page]');
    if (pageLink) {
      const pageId = pageLink.getAttribute('data-page');
      const href = pageLink.getAttribute('href') || '';

      // For normal hash anchors (ex: #about), let browser update the URL.
      if (href.startsWith('#')) {
        // If user clicks the current hash, manually re-render because hashchange won't fire.
        if (window.location.hash === href && pageId) {
          e.preventDefault();
          showPage(pageId);
        }
        return;
      }

      // Fallback for non-anchor or non-hash navigation triggers.
      e.preventDefault();
      if (pageId) {
        navigateToPage(pageId);
      }
      return;
    }

    if (e.target.id === "logoutLink" || e.target.closest("#logoutLink")) {
      e.preventDefault();
      handleLogout();
    }
  });

}

// Global functions for programmatic access
window.showLogin = () => {
  navigateToPage('login');
  setTimeout(() => toggleAuthForm('login'), 100);
};

window.showSignup = () => {
  navigateToPage('login');
  setTimeout(() => toggleAuthForm('signup'), 100);
};
window.handleLogout = handleLogout;
window.handleLockedChapter = handleLockedChapter;
window.handleLockedWorksheet = handleLockedWorksheet;

  await initPageFromHash(initializeScreen);

  if (client) {
    await checkAuthState();
    initAuthStateListener();
  }

  setupEventListeners();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ===== Hide header on scroll =====
let lastScrollY = window.scrollY;

window.addEventListener("scroll", () => {
  const header = document.getElementById("siteHeader");
  if (!header) return;

  if (window.scrollY > lastScrollY) {
    // scrolling down → hide
    header.classList.add("header-hidden");
  } else {
    // scrolling up → show
    header.classList.remove("header-hidden");
  }

  lastScrollY = window.scrollY;
});
}
