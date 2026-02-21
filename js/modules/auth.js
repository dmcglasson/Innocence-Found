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
import { hashPassword } from '../utils/password-encryption.js';   // <-- ADDED

let authStateListeners = [];

/**
 * Check if user is authenticated
 * @returns {Promise<Object|null>} Session object or null
 */
export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error("Error getting session:", error);
      return null;
    }
    return session;
  } catch (error) {
    console.error("Error checking auth state:", error);
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
    // Only redirect to dashboard if on login page
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
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Result object with success status and message
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
  } catch (error) {
    return { success: false, message: error.message || "Failed to sign in" };
  }
}

/**
 * Sign up a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} firstName - User first name
 * @param {string} lastName - User last name
 * @param {boolean} parent - Indicates if the user is a parent
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function signUp(email, password, firstName, lastName, parent) {
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
          first_name: firstName,
          last_name: lastName,
          parent: parent,
          subscriber: false, // Default to false, can be updated later
          admin: false // Default to false, can be updated later
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
  } catch (error) {
    return { success: false, message: error.message || "Failed to create account" };
  }
}

/**
 * Sign out the current user
 * @returns {Promise<Object>} Result object with success status and message
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
  } catch (error) {
    return { success: false, message: error.message || "Failed to sign out" };
  }
}

/**
 * Initialize auth state listener
 * @param {Function} callback - Callback function for auth state changes
 */
export function initAuthStateListener(callback) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      updateNavForLoggedIn(session.user);
      showPage("dashboard");
    } else if (event === "SIGNED_OUT") {
      updateNavForLoggedOut();
      showPage("home");
    }

    // Call custom callback if provided
    if (callback && typeof callback === 'function') {
      callback(event, session);
    }
  });
}
