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
      window.location.hash = "home";
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

    if (data.user) {
      const profileEmail = String(email || '').trim();
      if (!profileEmail) {
        return { success: false, message: "Email is required to create a profile" };
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: data.user.id,
        email: profileEmail,
        role: "free",
        username: null,
      });

      if (profileError) {
        return { success: false, message: profileError.message };
      }
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
        window.location.hash = "home";
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
    .maybeSingle();

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
 * Subscriber status: prefers `subscriptions.status === 'active'`, then user_metadata.subscriber.
 */
export async function getSubscriberStatus() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return { isSubscriber: false };

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return { isSubscriber: false };

    const user = userData?.user;
    const userId = user?.id;

    const appMeta = user?.app_metadata || {};
    const userMeta = user?.user_metadata || {};
    const roleMeta = String(
      userMeta.role || appMeta.role || ""
    ).trim().toLowerCase();

    let role = roleMeta;
    let hasActiveSubscription = false;

    if (userId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profileError && profile?.role) {
        role = String(profile.role).trim().toLowerCase();
      }

      const { data: subscription, error: subscriptionError } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (!subscriptionError && !!subscription) {
        hasActiveSubscription = true;
      }
    }

    const rawSubscriberValue =
      userMeta.subscriber ??
      userMeta.is_subscriber ??
      appMeta.is_subscriber ??
      userMeta.subscription;

    const isSubscriber =
      hasActiveSubscription ||
      ["admin", "parent", "subscriber"].includes(role) ||
      rawSubscriberValue === true ||
      rawSubscriberValue === 1 ||
      (typeof rawSubscriberValue === "string" &&
        ["true", "1", "subscriber", "active", "paid"].includes(rawSubscriberValue.trim().toLowerCase()));

    return { isSubscriber, role, hasActiveSubscription };
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

  const cleanMessage = String(newMessage || '').trim();

  const { error } = await supabase
    .from('Comments')
    .update({ message: cleanMessage })
    .eq('id', commentId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: 'Response updated successfully.' };
}

export async function getAllUsers() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, data: [], message: "No client" };
  }

  const primary = await supabase
    .from('profiles')
    .select('user_id, role, email');

  if (!primary.error) {
    return { success: true, data: primary.data || [] };
  }

  const message = String(primary.error?.message || '').toLowerCase();
  const missingEmailColumn =
    message.includes('email') &&
    (message.includes('column') || message.includes('does not exist'));

  if (!missingEmailColumn) {
    return { success: false, data: [], message: primary.error.message };
  }

  const fallback = await supabase
    .from('profiles')
    .select('user_id, role');

  if (!fallback.error) {
    const rows = (fallback.data || []).map((row) => ({
      ...row,
      email: '',
    }));
    return { success: true, data: rows };
  }

  return { success: false, data: [], message: fallback.error.message };
}

export async function deleteUserById(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized' };
  }

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: 'User deleted successfully.' };
}