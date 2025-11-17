/**
 * Application Configuration
 *
 * This file contains all configuration settings for the application.
 *
 * IMPORTANT: Do NOT commit actual API keys to the repository!
 *
 * For local development:
 * 1. Copy .env.example to .env (optional)
 * 2. Fill in your actual Supabase credentials in .env or directly in this file
 * 3. The keys will be loaded automatically
 *
 * SECURITY NOTES:
 * - The SUPABASE_ANON_KEY is intentionally public and safe to expose in client-side code
 * - This key is restricted by Row Level Security (RLS) policies in Supabase
 * - NEVER expose the service_role key in client-side code (server-side only)
 * - Always use HTTPS in production
 */

// Load environment variables from window.ENV (set by env-loader.js)
// The env-loader.js runs before this module and populates window.ENV
const envVars = window.ENV || {};

//Supabase Configuration (with real keys for local dev)
export const SUPABASE_CONFIG = {
  // Your Supabase project URL
  URL:
    envVars.SUPABASE_URL ||
    "https://khiwkbnqjjycmwonbhqu.supabase.co",

  // Safe-to-use public anon key
  ANON_KEY:
    envVars.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaXdrYm5xamp5Y213b25iaHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MjM1NDYsImV4cCI6MjA3ODI5OTU0Nn0.SHCSkMuUl3IY-A76cGXwLRXQNcLF-hOa19Tu8jOSWaU",
};

// Application Settings
export const APP_CONFIG = {
  DEFAULT_PAGE: "home",
  SCREENS_PATH: "screens/",
  CACHE_ENABLED: true,
};

// Validation - Check if keys are configured
if (
  SUPABASE_CONFIG.URL === "YOUR_SUPABASE_URL" ||
  SUPABASE_CONFIG.ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
) {
  console.error(
    " ERROR: Supabase credentials not configured!\n" +
      "Please either:\n" +
      "1. Create a .env file (copy from .env.example) and fill in your credentials\n" +
      "2. Or update the values in js/config.js directly\n" +
      "3. Or set window.ENV = { SUPABASE_URL: '...', SUPABASE_ANON_KEY: '...' } before loading the app"
  );
}

// Security: Ensure we're using HTTPS in production
if (
  window.location.protocol !== "https:" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1" &&
  !window.location.hostname.startsWith("192.168.")
) {
  console.warn(
    "Security Warning: This application should use HTTPS in production"
  );
}
