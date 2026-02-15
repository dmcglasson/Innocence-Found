// js/utils/password-encryption.js
// Simple password hashing helper using Web Crypto API (SHA-256)

/**
 * Hash a plain-text password using SHA-256.
 * Returns a hex string.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Convert bytes to hex string
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}
