/**
 * UI Module
 * 
 * Handles UI updates and DOM manipulation.
 * This module provides functions to update the user interface based on state.
 */

import { showPage } from './navigation.js';

// DOM element references (will be initialized)
let userNameNav, userMenu, authNavItem, loginNavLink;

/**
 * Initialize UI module with DOM element references
 */
export function initUI() {
  userNameNav = document.getElementById("userNameNav");
  userMenu = document.getElementById("userMenu");
  authNavItem = document.getElementById("authNavItem");
  loginNavLink = document.getElementById("loginNavLink");
}

/**
 * Update navigation for logged in user
 * @param {Object} user - User object from Supabase
 */
export function updateNavForLoggedIn(user) {
  if (userMenu && userNameNav && authNavItem && loginNavLink) {
    const displayName =
      user.user_metadata?.name || user.email?.split("@")[0] || "User";
    userNameNav.textContent = displayName;
    userMenu.style.display = "flex";
    authNavItem.style.display = "none";
  }
}

/**
 * Update navigation for logged out user
 */
export function updateNavForLoggedOut() {
  if (userMenu && authNavItem) {
    userMenu.style.display = "none";
    authNavItem.style.display = "block";
  }
}

/**
 * Update user info in dashboard
 * @param {Object} user - User object from Supabase
 */
export function updateDashboardUserInfo(user) {
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");

  if (userName && userEmail) {
    userName.textContent =
      user.user_metadata?.name || user.email?.split("@")[0] || "User";
    userEmail.textContent = user.email || "";
  }
}

/**
 * Show message to user
 * @param {string} elementId - ID of the message element
 * @param {string} message - Message text
 * @param {string} type - Message type: 'success' or 'error'
 */
export function showMessage(elementId, message, type = "success") {
  const messageEl = document.getElementById(elementId);
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
  }
}

/**
 * Clear message
 * @param {string} elementId - ID of the message element
 */
export function clearMessage(elementId) {
  const messageEl = document.getElementById(elementId);
  if (messageEl) {
    messageEl.textContent = "";
    messageEl.className = "message";
  }
}

/**
 * Toggle between login and signup forms
 * @param {string} formType - 'login' or 'signup'
 */
export function toggleAuthForm(formType) {
  const loginBox = document.getElementById("loginBox");
  const signupBox = document.getElementById("signupBox");

  if (!loginBox || !signupBox) return;

  if (formType === "login") {
    loginBox.style.display = "block";
    signupBox.style.display = "none";
    clearMessage("loginMessage");
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.reset();
  } else if (formType === "signup") {
    loginBox.style.display = "none";
    signupBox.style.display = "block";
    clearMessage("signupMessage");
    const signupForm = document.getElementById("signupForm");
    if (signupForm) signupForm.reset();
  }
}

