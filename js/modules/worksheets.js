/**
 * Worksheets API Module
 *
 * Provides metadata retrieval and secure file access for worksheets.
 * Relies on Supabase database + storage with RLS policies enforcing access.
 */

import { getSupabaseClient } from "./supabase.js";
import { WORKSHEETS_CONFIG } from "../config.js";

const ALLOWED_PROTECTED_ROLES = ["admin", "parent", "subscriber"];

function hasProtectedAccess(user) {
  if (!user) return false;

  const role =
    user.app_metadata?.role ||
    user.user_metadata?.role ||
    user.user_metadata?.account_type ||
    null;

  const isSubscriber =
    user.app_metadata?.is_subscriber ||
    user.user_metadata?.is_subscriber ||
    user.user_metadata?.subscription === "active";

  return ALLOWED_PROTECTED_ROLES.includes(role) || Boolean(isSubscriber);
}

/**
 * Fetch worksheet metadata visible to the current user.
 * @param {Object} options
 * @param {boolean} options.includeAnswerKeys - Include answer keys if authorized
 * @returns {Promise<{success: boolean, data?: Array, message?: string}>}
 */
export async function fetchWorksheetMetadata(options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  const { includeAnswerKeys = false } = options;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user || null;
    const canAccessProtected = hasProtectedAccess(user);

    let query = supabase
      .from(WORKSHEETS_CONFIG.TABLE)
      .select(
        "id,title,description,file_path,is_protected,is_answer_key,grade_level,created_at,updated_at"
      )
      .order("created_at", { ascending: false });

    if (!canAccessProtected) {
      query = query.eq("is_protected", false);
    }

    if (!includeAnswerKeys || !canAccessProtected) {
      query = query.eq("is_answer_key", false);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch worksheet metadata",
    };
  }
}

/**
 * Get a public or signed URL for a worksheet file.
 * @param {string|number} worksheetId
 * @param {Object} options
 * @param {number} options.expiresIn - Signed URL expiry (seconds)
 * @returns {Promise<{success: boolean, data?: {url: string}, message?: string}>}
 */
export async function getWorksheetFileUrl(worksheetId, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user || null;
    const canAccessProtected = hasProtectedAccess(user);

    const { data: rows, error: lookupError } = await supabase
      .from(WORKSHEETS_CONFIG.TABLE)
      .select("id,file_path,is_protected,is_answer_key")
      .eq("id", worksheetId)
      .limit(1);

    if (lookupError) {
      return { success: false, message: lookupError.message };
    }

    const worksheet = rows && rows.length ? rows[0] : null;
    if (!worksheet || !worksheet.file_path) {
      return { success: false, message: "Worksheet file not found" };
    }

    const isProtected = worksheet.is_protected || worksheet.is_answer_key;
    if (isProtected && !canAccessProtected) {
      return { success: false, message: "Not authorized to access this file" };
    }

    if (isProtected) {
      const expiresIn =
        options.expiresIn || WORKSHEETS_CONFIG.SIGNED_URL_EXPIRES_IN;
      const { data, error } = await supabase.storage
        .from(WORKSHEETS_CONFIG.BUCKET)
        .createSignedUrl(worksheet.file_path, expiresIn);

      if (error) {
        return { success: false, message: error.message };
      }

      return { success: true, data: { url: data.signedUrl } };
    }

    const { data } = supabase.storage
      .from(WORKSHEETS_CONFIG.BUCKET)
      .getPublicUrl(worksheet.file_path);

    return { success: true, data: { url: data.publicUrl } };
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to retrieve worksheet file URL",
    };
  }
}
