/**
 * Application Configuration
 *
 * Client-side code reads public values from window.ENV,
 * initialized by env.js before app bootstrap.
 */

const envVars = window.ENV || {};
const IS_LOCAL_DEV =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// Supabase Configuration
export const SUPABASE_CONFIG = {
  URL: envVars.SUPABASE_URL || "YOUR_SUPABASE_URL_HERE",
  ANON_KEY: envVars.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY_HERE",
};





// Application Settings
export const APP_CONFIG = {
  DEFAULT_PAGE: "home",
  SCREENS_PATH: "screens/",
  CACHE_ENABLED: !IS_LOCAL_DEV,
  FREE_CHAPTER_COUNT: 2,
  TOTAL_CHAPTERS: 10,
};

// Worksheets Settings
export const WORKSHEETS_CONFIG = {
  TABLE: "worksheets",
  BUCKET: envVars.SUPABASE_WORKSHEETS_BUCKET || "worksheets",
  SIGNED_URL_EXPIRES_IN: 60 * 5, // 5 minutes
  FUNCTIONS_BASE_URL: "https://khiwkbnqjjycmwonbhqu.supabase.co/functions/v1",
};

// Validation for debugging (does not break the app)
if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
  console.error(" Missing Supabase credentials in config.js or window.ENV");
}

// Security Warning (kept from old version)
if (
  window.location.protocol !== "https:" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1" &&
  !window.location.hostname.startsWith("192.168.")
) {
  console.warn("Use HTTPS in production");
}
