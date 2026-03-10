
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

/**
 * Initialize screen-specific logic after a screen loads
 */
async function initializeScreen(pageId) {
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
const confirmBtn = target.closest && target.closest('#confirmPaymentBtn');
if (confirmBtn) {
  e.preventDefault();

  // Mark user as subscriber
  localStorage.setItem("isSubscriber", "true");

  // Update navbar badge immediately
  updateSubscriberBadge();

  // Go to success page
  await window.showPage('payment-success');
  return;
}

    const logoutBtn = target.closest && target.closest("#logoutBtn");
    if (logoutBtn) {
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

  if (!nameInput || !emailInput || !passwordInput || !signupBtn) return;

  const name = sanitizeString(nameInput.value);
  const email = sanitizeString(emailInput.value);
  const password = passwordInput.value;

  const validation = validateForm(
    { name, email, password },
    {
      name: { required: true, minLength: 2 },
      email: { required: true, type: "email" },
      password: { required: true, type: "password", minLength: 8, pattern: /\d/ },
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

/**
 * Init
 */
async function init() {
  await new Promise((r) => setTimeout(r, 100));

  const client = getSupabaseClient();

  initUI();
  updateSubscriberBadge();
  setupScreenInitialization();

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
