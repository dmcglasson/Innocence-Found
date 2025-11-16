/**
 * Application Configuration (Repaired Old Structure)
 *
 * This version supports:
 * - window.ENV loading (optional)
 * - .env loader (optional)
 * - Direct fallback values that actually work
 *
 * This means:
 * ✔ If env loader runs → it uses that
 * ✔ If no env loader exists → it still works via hardcoded keys
 */

// Keep your old structure
const envVars = window.ENV || {};

// Supabase Configuration
export const SUPABASE_CONFIG = {
  // 1️⃣ First try window.ENV values (if provided)
  URL: envVars.SUPABASE_URL || "https://khiwkbnqjjycmwonbhqu.supabase.co",
  ANON_KEY: envVars.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaXdrYm5xamp5Y213b25iaHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MjM1NDYsImV4cCI6MjA3ODI5OTU0Nn0.SHCSkMuUl3IY-A76cGXwLRXQNcLF-hOa19Tu8jOSWaU",
};

// Application Settings
export const APP_CONFIG = {
  DEFAULT_PAGE: "home",
  SCREENS_PATH: "screens/",
  CACHE_ENABLED: true,
};

// Validation for debugging (does not break the app)
if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
  console.error("❌ Missing Supabase credentials in config.js or window.ENV");
}

// Security Warning (kept from old version)
if (
  window.location.protocol !== "https:" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1" &&
  !window.location.hostname.startsWith("192.168.")
) {
  console.warn("⚠️ Use HTTPS in production");
}
