/**
 * Environment Variable Loader
 *
 * Uses only browser runtime configuration from window.ENV.
 * This avoids trying to fetch private .env files from static hosts.
 */

function isPlaceholderValue(value) {
  if (typeof value !== "string") return true;

  const normalized = value.trim().toUpperCase();
  return (
    normalized.length === 0 ||
    normalized === "YOUR_SUPABASE_URL" ||
    normalized === "YOUR_SUPABASE_URL_HERE" ||
    normalized === "YOUR_SUPABASE_ANON_KEY" ||
    normalized === "YOUR_SUPABASE_ANON_KEY_HERE"
  );
}

function hasSupabaseEnv() {
  const env = window.ENV;

  return (
    env &&
    !isPlaceholderValue(env.SUPABASE_URL) &&
    !isPlaceholderValue(env.SUPABASE_ANON_KEY)
  );
}

/**
 * Initialize environment variables and set them on window.ENV
 * Call this before loading the main application
 */
export async function initEnv() {
  if (!window.ENV) window.ENV = {};

  if (!hasSupabaseEnv()) {
    console.warn(
      "Supabase ENV missing. Set public values in env.js or inject window.ENV before app bootstrap."
    );
  }

  return window.ENV;
}