import { createClient } from "@supabase/supabase-js";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Resolves the public site base URL for Stripe success/cancel redirects.
 * 1) Validated localhost `client_origin` from the browser (local dev; overrides SITE_URL).
 * 2) SITE_URL secret (production).
 * 3) Origin header (localhost or https).
 */
function getSiteUrl(req: Request, body: { client_origin?: string }): string {
  const co = body.client_origin?.replace(/\/$/, "") ?? "";
  if (co && LOCAL_ORIGIN_RE.test(co)) {
    return co;
  }

  const envUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
  if (envUrl) return envUrl;

  const origin = req.headers.get("Origin")?.replace(/\/$/, "") ?? "";
  if (origin && LOCAL_ORIGIN_RE.test(origin)) {
    return origin;
  }
  if (origin && /^https:\/\//.test(origin)) {
    return origin;
  }

  throw new Error(
    "SITE_URL is not configured. Add it in Supabase Edge Function secrets, or open the app from http://localhost or http://127.0.0.1.",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_ID_PAID");

    if (!stripeSecretKey || !priceId) {
      console.error("Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID_PAID");
      return new Response(JSON.stringify({ error: "Subscription checkout is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { plan?: string; client_origin?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (body.plan !== "paid") {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = getSiteUrl(req, body);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/index.html#payment-success`,
      cancel_url: `${siteUrl}/index.html#payment-cancelled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      customer_email: user.email ?? undefined,
    });

    if (!session.url) {
      return new Response(JSON.stringify({ error: "Could not create checkout session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("create-checkout-session:", e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
