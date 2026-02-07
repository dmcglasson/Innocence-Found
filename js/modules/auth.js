/**
 * Authentication Module
 * 
 * Handles all authentication-related functionality including:
 * - User login
 * - User signup
 * - User logout
 * - Session management
 * - Auth state monitoring
 */

import { getSupabaseClient } from './supabase.js';
import { showPage } from './navigation.js';
import { updateNavForLoggedIn, updateNavForLoggedOut } from './ui.js';

/**
 * Check if user is authenticated
 * @returns {Promise<Object|null>} Session object or null
 */
export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Check authentication state and update UI
 */
export async function checkAuthState() {
  const session = await getCurrentSession();
  if (session) {
    updateNavForLoggedIn(session.user);
    const currentPage = window.location.hash.substring(1) || "home";
    if (currentPage === "login") {
      showPage("dashboard");
    }
  } else {
    updateNavForLoggedOut();
  }
}

/**
 * Sign in a user
 */
export async function signIn(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, data, message: "Login successful!" };
  } catch {
    return { success: false, message: "Failed to sign in" };
  }
}

/**
 * Sign up a new user
 */
export async function signUp(email, password, name) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return {
      success: true,
      data,
      message: "Account created successfully! Please check your email to verify your account.",
    };
  } catch {
    return { success: false, message: "Failed to create account" };
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: "Signed out successfully" };
  } catch {
    return { success: false, message: "Failed to sign out" };
  }
}

/**
 * Initialize auth state listener
 */
export function initAuthStateListener(callback) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      updateNavForLoggedIn(session.user);
      showPage("dashboard");
    }

    if (event === "SIGNED_OUT") {
      updateNavForLoggedOut();
      showPage("home");
    }

    if (callback) {
      callback(event, session);
    }
  });
}

/* ===============================
   Secure Password Update Helpers
================================ */
function needsReauth(error) {
  const msg = String(error?.message || "").toLowerCase();

  return (
    msg.includes("recent") ||
    msg.includes("reauth") ||
    msg.includes("re-auth") ||
    (msg.includes("login") && msg.includes("required"))
  );
}

function friendlyAuthError(error) {
  const msg = String(error?.message || "").toLowerCase();

  if (msg.includes("invalid")) {
    return "Current password is incorrect.";
  }

  if (msg.includes("password")) {
    return "New password does not meet the password requirements.";
  }

  if (msg.includes("expired")) {
    return "Your session expired. Please re-authenticate.";
  }

  return "Unable to update your password.";
}

/**
 * Secure password update with re-authentication
 */
export async function updatePasswordSecurely({ currentPassword, newPassword }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.email) {
    return { success: false, message: "You must be signed in to change your password." };
  }

  const email = userData.user.email;

  const firstTry = await supabase.auth.updateUser({ password: newPassword });
  if (!firstTry.error) {
    return { success: true, message: "Password updated successfully." };
  }

  if (!needsReauth(firstTry.error)) {
    return { success: false, message: friendlyAuthError(firstTry.error) };
  }

  const reauth = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (reauth.error) {
    return { success: false, message: friendlyAuthError(reauth.error) };
  }

  const secondTry = await supabase.auth.updateUser({ password: newPassword });
  if (secondTry.error) {
    return { success: false, message: friendlyAuthError(secondTry.error) };
  }

  return { success: true, message: "Password updated successfully." };
}
