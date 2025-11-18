/**
 * Supabase Client Module
 * ----------------------------------------------------
 * Handles initialization and management of a singleton Supabase client.
 * Uses ES Module import for @supabase/supabase-js directly from CDN.
 *
 * This automatically connects using credentials from config.js.
 * If config.js is missing or misconfigured, a console error will appear.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_CONFIG } from "./config.js";

// Keep a single shared instance
let supabaseClient = null;

/**
 * Get or initialize the Supabase client.
 * If already initialized, returns the existing client.
 */
export function getSupabaseClient() {
  // Return existing instance if already created
  if (supabaseClient) return supabaseClient;

  // Validate configuration
  const url = SUPABASE_CONFIG?.URL?.trim();
  const anonKey = SUPABASE_CONFIG?.ANON_KEY?.trim();

  if (!url || !anonKey) {
    console.error(
      "[Supabase] Missing configuration — please check your config.js or environment variables."
    );
    return null;
  }

  // Initialize new client
  try {
    supabaseClient = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    console.log("Supabase initialized successfully:", url);
    return supabaseClient;
  } catch (error) {
    console.error("[Supabase] Initialization failed:", error);
    return null;
  }
}

/**
 * Check if Supabase client is already initialized.
 */
export function isSupabaseInitialized() {
  return !!supabaseClient;
}

/**
 * Reset Supabase client (useful for hot reload or config changes)
 */
export function resetSupabaseClient() {
  supabaseClient = null;
  console.log("Supabase client reset.");
}
