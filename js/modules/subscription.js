/**
 * Stripe subscription checkout (Supabase Edge Functions).
 * Secrets stay on the server; the browser only receives a redirect URL.
 */

import { getSupabaseClient } from "./supabase.js";
import { SUPABASE_CONFIG } from "../config.js";

function functionsBaseUrl() {
  const base = String(SUPABASE_CONFIG.URL || "").replace(/\/+$/, "");
  return `${base}/functions/v1`;
}

/**
 * @param {"monthly"|"annual"} planId
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function startSubscriptionCheckout(planId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: "Supabase client not initialized" };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session) {
    sessionStorage.setItem("returnTo", "#subscribe");
    window.location.hash = "login";
    return { success: false, message: "Please sign in to subscribe." };
  }

  const res = await fetch(`${functionsBaseUrl()}/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_CONFIG.ANON_KEY,
    },
    body: JSON.stringify({ 
    plan: "paid",
    client_origin: window.location.origin,
}),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      success: false,
      message: json.error || json.details || `Checkout failed (${res.status})`,
    };
  }

  if (json.url) {
    window.location.href = json.url;
    return { success: true };
  }

  return { success: false, message: "No checkout URL returned." };
}

export async function initializeSubscribeScreen() {
  const { getCurrentSession } = await import("./auth.js");
  const session = await getCurrentSession();
  const hint = document.getElementById("subscribeAuthHint");
  if (hint) {
    hint.hidden = Boolean(session);
  }
}

/**
 * After Stripe redirects back, poll until the webhook activates the row (or timeout).
 */
export async function initializeSubscriptionSuccessScreen() {
  const supabase = getSupabaseClient();
  const statusEl = document.getElementById("paymentSuccessStatus");
  if (!supabase) {
    if (statusEl) statusEl.textContent = "Unable to verify subscription (app not configured).";
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    if (statusEl) statusEl.textContent = "Sign in to see your subscription status.";
    return;
  }

  const userId = sessionData.session.user.id;
  if (statusEl) statusEl.textContent = "Confirming your subscription…";

  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    await supabase.auth.refreshSession();

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("plan_type, current_period_start, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (!error && sub) {
      const started = sub.current_period_start
        ? new Date(sub.current_period_start).toLocaleDateString()
        : "";
      if (statusEl) {
        statusEl.textContent = `Your subscription is now active${started ? ` (started ${started})` : ""}.`;
      }
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  // Fallback — check profiles.role directly
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.role === "subscriber") {
    if (statusEl) statusEl.textContent = "Your subscription is now active.";
    return;
  }

  if (statusEl) {
    statusEl.innerHTML = `Payment received but still processing. <a href="#profile">Check your profile</a> in a moment or contact support.`;
  }
}

export async function initializeSubscriptionCancelScreen() {
  const el = document.getElementById("subscriptionCancelHint");
  if (el) {
    el.textContent = "No charge was made. You can choose a plan again whenever you like.";
  }
}
