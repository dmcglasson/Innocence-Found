import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "canceled";
  }
  return "incomplete";
}

function subscriberFromStatus(dbStatus: string): boolean {
  return dbStatus === "active" || dbStatus === "trialing";
}

async function upsertSubscription(
  supabaseAdmin: SupabaseClient,
  params: {
    userId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string;
    status: string;
    planType: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  },
) {
  const { error: upsertError } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      status: params.status,
      plan_type: params.planType,
      current_period_start: params.currentPeriodStart,
      current_period_end: params.currentPeriodEnd,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    throw upsertError;
  }

  const metaSubscriber = subscriberFromStatus(params.status);
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(params.userId, {
    user_metadata: {
      subscriber: metaSubscriber,
      subscription_status: params.status,
    },
  });

  if (authError) {
    console.error("updateUserById:", authError);
  }
}

async function applyStripeSubscription(
  supabaseAdmin: SupabaseClient,
  subscription: Stripe.Subscription,
  explicitUserId?: string | null,
) {
  let userId =
    explicitUserId ||
    subscription.metadata?.supabase_user_id ||
    null;

  if (!userId) {
    const { data: row } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    userId = row?.user_id ?? null;
  }

  if (!userId) {
    console.warn("stripe-webhook: no user for subscription", subscription.id);
    return;
  }

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;

  const dbStatus = mapStripeStatus(subscription.status);
  const start = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const end = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await upsertSubscription(supabaseAdmin, {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: dbStatus,
    planType: "paid",
    currentPeriodStart: start,
    currentPeriodEnd: end,
  });
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

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error("Missing STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, or Supabase secrets");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  const { data: existing, error: selErr } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (selErr) {
    console.error("stripe_webhook_events select:", selErr);
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (existing?.id) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        if (!userId) {
          throw new Error("checkout.session.completed missing user reference");
        }

        const subRef = session.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subId) {
          throw new Error("checkout.session.completed missing subscription id");
        }

        const subscription = await stripe.subscriptions.retrieve(subId);
        await applyStripeSubscription(supabaseAdmin, subscription, userId);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await applyStripeSubscription(supabaseAdmin, subscription);
        break;
      }
      default:
        break;
    }

    const { error: insErr } = await supabaseAdmin.from("stripe_webhook_events").insert({ id: event.id });
    if (insErr) {
      if (insErr.code === "23505") {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insErr;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Handler error";
    console.error("stripe-webhook processing:", e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
