/**
 * Supabase Client Module
 *
 * Handles initialization and management of the Supabase client.
 * This module provides a singleton instance of the Supabase client.
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
    const invalidUrl =
      !SUPABASE_CONFIG?.URL ||
      SUPABASE_CONFIG.URL === "YOUR_SUPABASE_URL" ||
      SUPABASE_CONFIG.URL === "YOUR_SUPABASE_URL_HERE";

    const invalidAnonKey =
      !SUPABASE_CONFIG?.ANON_KEY ||
      SUPABASE_CONFIG.ANON_KEY === "YOUR_SUPABASE_ANON_KEY" ||
      SUPABASE_CONFIG.ANON_KEY === "YOUR_SUPABASE_ANON_KEY_HERE";

    if (invalidUrl || invalidAnonKey) {
      console.error(
        "Supabase credentials not configured. Set public values in env.js or config.js."
      );
      return null;
    }

    const supabaseLib = window.supabase;

    if (!supabaseLib || typeof supabaseLib.createClient !== "function") {
      console.error(
        "Supabase library not found. Make sure the CDN script is loaded before this module runs."
      );
      return null;
    }

    const cleanedUrl = String(SUPABASE_CONFIG.URL).replace(/\/+$/, "");

    supabaseClient = supabaseLib.createClient(
      cleanedUrl,
      SUPABASE_CONFIG.ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    window.__supabaseClient = supabaseClient;

    return supabaseClient;
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