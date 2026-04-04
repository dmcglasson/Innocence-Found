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

    // If user was trying to go back somewhere (ex: #chapters), go there
    const returnTo = sessionStorage.getItem("returnTo");
    if (returnTo) {
      sessionStorage.removeItem("returnTo");
      window.location.hash = returnTo; // ex: "#chapters"
      return;
    }

    const currentPage = window.location.hash.substring(1) || "home";
    if (currentPage === "login") {
      window.location.hash = "bookreader";
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
          name: [firstName, lastName].filter(Boolean).join(' '),
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

      const returnTo = sessionStorage.getItem("returnTo");
      if (returnTo) {
        sessionStorage.removeItem("returnTo");
        window.location.hash = returnTo; // ex: "#chapters"
        return;
      }

      // Only force dashboard if user is currently on login (or no hash)
      const currentPage = window.location.hash.substring(1) || "home";
      if (currentPage === "login") {
        window.location.hash = "bookreader";
      }
      // otherwise: do nothing, let the current hash page stay (ex: chapters)
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

export async function isCurrentUserAdmin() {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;

  return data.role === 'admin';
}

export async function getAllChapters() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, data: [], message: 'Supabase client not initialized' };
  }

  const { data, error } = await supabase
    .from('Chapters')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    return { success: false, data: [], message: error.message };
  }

  return { success: true, data };
}

export async function getCommentsByChapter(chapterId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, data: [], message: 'Supabase client not initialized' };
  }

  const { data, error } = await supabase
    .from('Comments')
    .select('id, message, created_at, uid, chapter_id')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, data: [], message: error.message };
  }

  return { success: true, data };
}
/**
 * Read subscriber status from Supabase Auth user_metadata
 * NOTE: Right now your user_metadata has NO subscriber key.
 * This function safely returns false unless a known key exists.
 */
export async function getSubscriberStatus() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return { isSubscriber: false };

    const { data, error } = await supabase.auth.getUser();
    if (error) return { isSubscriber: false };

    const meta = data?.user?.user_metadata || {};
    const val = meta.subscriber;

    const isSubscriber =
      val === true ||
      val === 1 ||
      (typeof val === "string" &&
        ["true", "1", "subscriber", "active", "paid"].includes(val.trim().toLowerCase()));

    return { isSubscriber };
  } catch (e) {
    console.error("getSubscriberStatus() error:", e);
    return { isSubscriber: false };
  }
}
export async function deleteCommentById(commentId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized' };
  }

  const { error } = await supabase
    .from('Comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: 'Response deleted successfully.' };
}

export async function updateCommentById(commentId, newMessage) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized' };
  }

  const { error } = await supabase
    .from('Comments')
    .update({ message: newMessage })
    .eq('id', commentId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: 'Response updated successfully.' };
}
