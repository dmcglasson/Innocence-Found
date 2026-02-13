/**
 * Profile module
 * This module handles the backend logic for the user profile page, including fetching and updating user information.
 * Relies on Supabase database with RLS policies enforcing access.
 */

import { getSupabaseClient } from "./supabase.js";

// Get Supabase client
const supabase = getSupabaseClient()

/**
 * Fetch user profile data from Supabase
 * @returns {Promise<Object>} User profile data
 * @throws {Error} If fetching fails
 */
export async function fetchUserProfile() {
  try {
    const user = supabase.auth.user();
    if (!user) throw new Error("User not authenticated");
    
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
}

/**
 * Update user profile data in Supabase
 * @param {Object} profileData - The profile data to update
 * @returns {Promise<Object>} Updated profile data
 * @throws {Error} If updating fails
 * */
export async function updateUserProfile(profileData) {
  try {
    const user = supabase.auth.user();
    if (!user) throw new Error("User not authenticated"); 
    const { data, error } = await supabase
      .from("profiles")
      .update(profileData)
      .eq("user_id", user.id)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
}

/**
 * Create a new user profile in Supabase
 * @param {*} userId - userId from auth.userId
 * @param {*} profileData The profile data to create {name, }
 * @returns 
 */
export async function createUserProfile(userId, profileData) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .insert({ user_id: userId, ...profileData })
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating user profile:", error);
    throw error;
  }
}