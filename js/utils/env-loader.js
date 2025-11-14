/**
 * Environment Variable Loader
 * 
 * Loads environment variables from .env file or window.ENV
 * 
 * Note: For vanilla JS, .env files can't be fetched directly.
 * This loader attempts to fetch, but falls back to window.ENV
 * which can be set in index.html before modules load.
 */

/**
 * Load environment variables from .env file
 * @returns {Promise<Object>} Environment variables as key-value pairs
 */
export async function loadEnvVars() {
  // Try to load from .env file (may fail if server doesn't serve it)
  try {
    const response = await fetch('.env');
    if (response.ok) {
      const text = await response.text();
      const env = {};
      
      // Parse .env file (basic parser)
      text.split('\n').forEach(line => {
        line = line.trim();
        // Skip comments and empty lines
        if (!line || line.startsWith('#')) {
          return;
        }
        
        // Parse KEY=VALUE format
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          env[key] = value;
        }
      });
      
      return env;
    }
  } catch (error) {
    // .env file not accessible via fetch (normal for vanilla JS)
    // This is expected - we'll use window.ENV instead
    console.log('Note: .env file not accessible via fetch (this is normal). Using window.ENV or direct config.');
  }
  
  return {};
}

/**
 * Initialize environment variables and set them on window.ENV
 * Call this before loading the main application
 */
export async function initEnv() {
  // Try to load from .env file first
  const envVars = await loadEnvVars();
  
  // Merge with any existing window.ENV (set in HTML if needed)
  if (!window.ENV) {
    window.ENV = {};
  }
  
  // Merge .env values into window.ENV (env file takes precedence)
  Object.assign(window.ENV, envVars);
  
  // If still no values, try to load from a config script tag
  // This allows setting credentials in HTML without committing to git
  if (!window.ENV.SUPABASE_URL && !window.ENV.SUPABASE_ANON_KEY) {
    // Check if there's a config script that sets window.ENV
    // This would be added manually in index.html for local dev
    console.log('No environment variables found. Please set window.ENV in index.html or use .env file.');
  }
  
  return window.ENV;
}
