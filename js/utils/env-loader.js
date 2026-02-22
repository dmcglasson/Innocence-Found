/**
 * Environment Variable Loader
 *
 * Loads environment variables from .env file or window.ENV
 *
 * Live Server usually cannot serve .env, so if window.ENV already
 * has the needed values, we skip fetching .env entirely.
 */

function hasSupabaseEnv() {
  return (
    window.ENV &&
    typeof window.ENV.SUPABASE_URL === "string" &&
    window.ENV.SUPABASE_URL.trim().length > 0 &&
    typeof window.ENV.SUPABASE_ANON_KEY === "string" &&
    window.ENV.SUPABASE_ANON_KEY.trim().length > 0
  );
}

/**
 * Load environment variables from .env file
 * @returns {Promise<Object>} Environment variables as key-value pairs
 */
export async function loadEnvVars() {
  try {
    const response = await fetch(".env", { cache: "no-store" });

    // If .env isn't served (404), just return empty object silently
    if (!response.ok) return {};

    const text = await response.text();
    const env = {};

    text.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;

      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        env[key] = value;
      }
    });

    return env;
  } catch (error) {
    // Live Server may fail fetch; ignore and fall back to window.ENV
    return {};
  }
}

/**
 * Initialize environment variables and set them on window.ENV
 * Call this before loading the main application
 */
export async function initEnv() {
  // KEY FIX: If index.html already set window.ENV with Supabase values,
  // do NOT fetch .env at all (prevents 404 noise).
  if (hasSupabaseEnv()) return window.ENV;

  // Ensure window.ENV exists
  if (!window.ENV) window.ENV = {};

  // Otherwise try loading from .env (fallback only)
  const envVars = await loadEnvVars();

  // Merge .env values into window.ENV
  Object.assign(window.ENV, envVars);

  // If still missing, leave a small note (optional)
  if (!hasSupabaseEnv()) {
    console.warn(
      "Supabase ENV missing. Set window.ENV in index.html or provide a served .env file."
    );
  }

  return window.ENV;
}