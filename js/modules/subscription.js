/**
 * Subscription Module
 * 
 * Handles subscription activation and retrieval of subscription status.
 * Uses Supabase with RLS policies enforcing user-level access.
 */

import { getSupabaseClient } from "./supabase.js";

const supabase = getSupabaseClient();

/**
 * Activate subscription for the authenticated user
 * @param {string} plan - subscription plan/tier identifier
 * @returns {Promise<Object>} result object
 */
export async function activateSubscription(plan) {
  try {
    if (!supabase) throw new Error("Supabase client not initialized");

    // Get authenticated user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { status: 401, message: "User not authenticated" };
    }

    // Validate subscription plan
    const validPlans = ["basic", "premium"];
    if (!validPlans.includes(plan)) {
      return { status: 400, message: "Invalid subscription plan" };
    }

    // Check if user already has an active subscription
    const { data: existingSubscription, error: checkError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingSubscription) {
      return {
        status: 409,
        message: "User already has an active subscription",
      };
    }

    // Insert new subscription
    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        status: "active",
        started_at: new Date(),
        end_date: null,
      })
      .single();

    if (error) throw error;

    return {
      status: 200,
      message: "Subscription activated successfully",
      data,
    };
  } catch (error) {
    console.error("Error activating subscription:", error);
    return {
      status: 500,
      message: error.message || "Failed to activate subscription",
    };
  }
}

/**
 * Get subscription status for the authenticated user
 * @returns {Promise<Object|null>}
 */
export async function getSubscriptionStatus() {
  try {
    if (!supabase) throw new Error("Supabase client not initialized");

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    return null;
  }
}