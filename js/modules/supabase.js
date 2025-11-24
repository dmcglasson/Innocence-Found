/**
 * Supabase Client Module
 *
 * Handles initialization and management of the Supabase client.
 * Provides a singleton Supabase client instance.
 */

import { SUPABASE_CONFIG } from "../config.js";

let supabaseClient = null;

/**
 * Initialize and return the Supabase client
 * @returns {Object|null} Supabase client instance or null if initialization fails
 */
export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    // Basic check: do we actually have credentials?
    if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
      console.error(
        "Supabase credentials not configured. Check .env file or js/config.js"
      );
      return null;
    }

    const supabaseLib = window.supabase || window.supabase;
    if (supabaseLib && typeof supabaseLib.createClient === "function") {
      supabaseClient = supabaseLib.createClient(
        SUPABASE_CONFIG.URL,
        SUPABASE_CONFIG.ANON_KEY
      );
      console.log("Supabase client initialized.");
      return supabaseClient;
    } else {
      console.error(
        "Supabase library not found. Make sure the CDN script is loaded."
      );
      return null;
    }
  } catch (error) {
    console.error("Error initializing Supabase:", error);
    return null;
  }
}

/**
 * Check if Supabase client is initialized
 * @returns {boolean}
 */
export function isSupabaseInitialized() {
  return supabaseClient !== null;
}
