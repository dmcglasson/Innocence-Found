/**
 * Stripe Checkout via Supabase Edge Function (authenticated users only).
 */

import { getSupabaseClient } from "./supabase.js";
import { SUPABASE_CONFIG, getSupabaseFunctionsBaseUrl } from "../config.js";

export async function createStripeCheckoutSession() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "App is not connected. Please try again later." };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return { success: false, message: "Please sign in to subscribe." };
  }

  const base = getSupabaseFunctionsBaseUrl();
  if (!base) {
    return { success: false, message: "Subscription service is not configured." };
  }

  const res = await fetch(`${base}/create-checkout-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_CONFIG.ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan: "paid",
      client_origin: typeof window !== "undefined" ? window.location.origin : "",
    }),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok) {
    return {
      success: false,
      message: payload.error || "Could not start checkout. Please try again.",
    };
  }

  if (payload.url) {
    return { success: true, url: payload.url };
  }

  return { success: false, message: "Could not start checkout. Please try again." };
}
