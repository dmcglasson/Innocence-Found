/**
 * Environment Variable Loader
 *
 * Loads env vars from window.ENV first (set in index.html).
 * If not present, tries to fetch ".env" and parse it.
 */

export async function initEnv() {
  // 1) Prefer window.ENV (works with Live Server)
  if (window.ENV?.SUPABASE_URL && window.ENV?.SUPABASE_ANON_KEY) {
    return window.ENV;
  }

  // 2) Fallback: try loading from .env (may 404 in Live Server)
  const envVars = await loadEnvVars();

  window.ENV = window.ENV || {};
  Object.assign(window.ENV, envVars);

  return window.ENV;
}

export async function loadEnvVars() {
  try {
    const response = await fetch(".env");
    if (!response.ok) return {};

    const text = await response.text();
    const env = {};

    text.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;

      const match = line.match(/^([^=]+)=(.*)$/);
      if (!match) return;

      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    });

    return env;
  } catch (err) {
    console.warn("env-loader: failed to load .env", err);
    return {};
  }
}