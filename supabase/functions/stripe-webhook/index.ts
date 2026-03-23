import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const stripe = new Stripe(stripeSecret);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { error: claimError } = await supabaseAdmin.from("stripe_processed_events").insert({ id: event.id });

  if (claimError) {
    const code = (claimError as { code?: string }).code;
    if (code === "23505") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        await activateSubscription(stripe, supabaseAdmin, session);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await deactivateSubscription(supabaseAdmin, sub.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Processing failed";
    await supabaseAdmin.from("stripe_processed_events").delete().eq("id", event.id);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function setSubscriberMetadata(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  planId: string,
  periodStartIso: string,
  active: boolean,
) {
  const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getUserError || !userData?.user) {
    throw new Error(getUserError?.message ?? "User not found for subscription");
  }

  const prevMeta = userData.user.user_metadata ?? {};
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...prevMeta,
      subscriber: active,
      subscription: active ? "active" : "inactive",
      subscription_plan: active ? planId : null,
      subscription_started_at: active ? periodStartIso : null,
    },
  });
}

async function activateSubscription(
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  const userId = session.metadata?.supabase_user_id;
  const planId = session.metadata?.plan_id;
  if (!userId || !planId) {
    throw new Error("Missing supabase_user_id or plan_id on checkout session metadata");
  }

  const stripeSubId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!stripeSubId) {
    throw new Error("Checkout session missing subscription id");
  }

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, plan_id, status, current_period_start")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();

  if (existing?.status === "active") {
    const started =
      existing.current_period_start ??
      new Date().toISOString();
    await setSubscriberMetadata(supabaseAdmin, existing.user_id, existing.plan_id, started, true);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubId);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active");

  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : new Date().toISOString();

  const { error: insertError } = await supabaseAdmin.from("subscriptions").insert({
    user_id: userId,
    plan_id: planId,
    status: "active",
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: stripeSubId,
    stripe_checkout_session_id: session.id,
    current_period_start: periodStart,
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === "23505") {
      const { data: row } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_id, current_period_start")
        .eq("stripe_subscription_id", stripeSubId)
        .maybeSingle();
      if (row?.user_id) {
        const started = row.current_period_start ?? periodStart;
        await setSubscriberMetadata(supabaseAdmin, row.user_id, row.plan_id, started, true);
      }
      return;
    }
    throw insertError;
  }

  await setSubscriberMetadata(supabaseAdmin, userId, planId, periodStart, true);
}

async function deactivateSubscription(
  supabaseAdmin: ReturnType<typeof createClient>,
  stripeSubscriptionId: string,
) {
  const { data: row } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, plan_id, current_period_start")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (!row?.user_id) return;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  const started = row.current_period_start ?? new Date().toISOString();
  await setSubscriberMetadata(supabaseAdmin, row.user_id, row.plan_id, started, false);
}
