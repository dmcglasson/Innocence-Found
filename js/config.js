/**
 * Application Configuration
 *
 * Uses window.ENV if available, otherwise falls back to hard-coded
 * local development values.
 */

const envVars = window.ENV || {};

// Supabase configuration
export const SUPABASE_CONFIG = {
  URL:
    envVars.SUPABASE_URL ||
    "https://khiwbknqjjycmwonbhqu.supabase.co",
  ANON_KEY:
    envVars.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaXdib25xamp5Y213b25iaHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI1ODU1MjUsImV4cCI6MjA0ODE2MTUyNX0.8CskMuU3IY-A7b6CxwLRXQNCtLF-hOaI9Tu8j0SWaU",
};

// App-level settings
export const APP_CONFIG = {
  DEFAULT_PAGE: "home",
  SCREENS_PATH: "screens/",
  CACHE_ENABLED: true,
};

// Helpful log
if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
  console.error(
    "ERROR: Supabase credentials not configured!\n" +
      "Please either:\n" +
      "1. Create a .env file and fill in your credentials\n" +
      "2. Or update the values in js/config.js directly\n" +
      "3. Or set window.ENV = { SUPABASE_URL: '...', SUPABASE_ANON_KEY: '...' } before loading the app"
  );
} else {
  console.log("Supabase config loaded.");
}
