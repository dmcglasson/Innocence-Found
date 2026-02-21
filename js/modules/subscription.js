/**
 * Subscription Module
 *
 * Checks whether the current user has an active subscription so they can
 * access locked chapters. Subscription status is validated on the backend (RLS)
 * before chapter content is returned.
 */

import { getSupabaseClient } from './supabase.js';

/**
 * Check if the given user (or current user) has an active subscription.
 * @param {string} [userId] - Optional; defaults to current auth user
 * @returns {Promise<boolean>}
 */
export async function hasActiveSubscription(userId = null) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  let uid = userId;
  if (!uid) {
    const { data: { session } } = await supabase.auth.getSession();
    uid = session?.user?.id ?? null;
  }
  if (!uid) return false;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, end_date')
    .eq('user_id', uid)
    .maybeSingle();

  if (error || !data) return false;
  if (data.status !== 'active') return false;
  if (data.end_date && new Date(data.end_date) <= new Date()) return false;
  return true;
}

/**
 * Get current user's subscription status for UI (e.g. subscription page).
 * @returns {Promise<{ active: boolean, endDate: string|null, status: string }>}
 */
export async function getSubscriptionStatus() {
  const supabase = getSupabaseClient();
  if (!supabase) return { active: false, endDate: null, status: null };

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id ?? null;
  if (!uid) return { active: false, endDate: null, status: null };

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, end_date')
    .eq('user_id', uid)
    .maybeSingle();

  if (error || !data) return { active: false, endDate: null, status: null };
  const active =
    data.status === 'active' &&
    (!data.end_date || new Date(data.end_date) > new Date());
  return {
    active,
    endDate: data.end_date ?? null,
    status: data.status,
  };
}

/**
 * Create or reactivate subscription for the current user (e.g. after payment or for demo).
 * RLS allows INSERT/UPDATE only for own user_id.
 * @param {Object} [options] - { endDate: ISO string or null for no end }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function createSubscriptionForCurrentUser(options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'Not configured' };

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id ?? null;
  if (!uid) return { success: false, message: 'Sign in first' };

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: uid,
        status: 'active',
        end_date: options.endDate || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Subscription active' };
}
