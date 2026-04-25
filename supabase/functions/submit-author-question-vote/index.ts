import { createClient } from "@supabase/supabase-js";

const AUTHOR_QUESTIONS_TABLE = "author_questions";
const AUTHOR_QUESTION_VOTES_TABLE = "author_question_votes";
const AUTHOR_QUESTION_COLUMNS =
  "id, created_at, question_text, option_1_text, option_2_text, option_3_text, chapter_id";
const AUTHOR_QUESTION_OPTION_COUNT = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isUniqueViolation(error: { code?: unknown; message?: unknown } | null) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique");
}

async function getQuestionState(
  supabaseAdmin: ReturnType<typeof createClient>,
  questionId: number,
  userId: string,
) {
  const { data: question, error: questionError } = await supabaseAdmin
    .from(AUTHOR_QUESTIONS_TABLE)
    .select(AUTHOR_QUESTION_COLUMNS)
    .eq("id", questionId)
    .maybeSingle();

  if (questionError) {
    return { error: questionError.message, status: 500 };
  }

  if (!question) {
    return { error: "Author question not found", status: 404 };
  }

  const { data: votes, error: votesError } = await supabaseAdmin
    .from(AUTHOR_QUESTION_VOTES_TABLE)
    .select("chosen_option")
    .eq("question_id", questionId);

  if (votesError) {
    return { error: votesError.message, status: 500 };
  }

  const { data: selectedVote, error: selectedVoteError } = await supabaseAdmin
    .from(AUTHOR_QUESTION_VOTES_TABLE)
    .select("chosen_option")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selectedVoteError) {
    return { error: selectedVoteError.message, status: 500 };
  }

  return {
    question,
    votes: Array.isArray(votes) ? votes : [],
    selectedVote,
  };
}

async function isSubscriber(
  supabaseAdmin: ReturnType<typeof createClient>,
  user: any,
) {
  const appMeta = user.app_metadata || {};
  const userMeta = user.user_metadata || {};
  let role = String(userMeta.role || appMeta.role || "").trim().toLowerCase();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role) {
    role = String(profile.role).trim().toLowerCase();
  }

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const rawSubscriberValue =
    userMeta.subscriber ??
    userMeta.is_subscriber ??
    appMeta.is_subscriber ??
    userMeta.subscription;

  return (
    !!subscription ||
    ["admin", "parent", "subscriber"].includes(role) ||
    rawSubscriberValue === true ||
    rawSubscriberValue === 1 ||
    (typeof rawSubscriberValue === "string" &&
      ["true", "1", "subscriber", "active", "paid"].includes(rawSubscriberValue.trim().toLowerCase()))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Supabase function environment is not configured" }, 500);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      questionId?: unknown;
      selectedOptionIndex?: unknown;
      chosenOption?: unknown;
    };
    const questionId = Number(body?.questionId);
    const selectedOptionIndex = Number(body?.selectedOptionIndex);
    const chosenOption = Number.isInteger(selectedOptionIndex)
      ? selectedOptionIndex + 1
      : Number(body?.chosenOption);

    if (!Number.isInteger(questionId) || questionId <= 0) {
      return jsonResponse({ error: "Invalid question id" }, 400);
    }

    if (
      !Number.isInteger(chosenOption) ||
      chosenOption < 1 ||
      chosenOption > AUTHOR_QUESTION_OPTION_COUNT
    ) {
      return jsonResponse({ error: "Invalid vote option" }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const allowed = await isSubscriber(supabaseAdmin, user);
    if (!allowed) {
      return jsonResponse({ error: "Forbidden: subscriber access required" }, 403);
    }

    const stateBeforeInsert = await getQuestionState(supabaseAdmin, questionId, user.id);
    if ("error" in stateBeforeInsert) {
      return jsonResponse({ error: stateBeforeInsert.error }, stateBeforeInsert.status);
    }

    if (stateBeforeInsert.selectedVote) {
      return jsonResponse(stateBeforeInsert);
    }

    const { error: insertError } = await supabaseAdmin
      .from(AUTHOR_QUESTION_VOTES_TABLE)
      .insert({
        question_id: questionId,
        user_id: user.id,
        chosen_option: chosenOption,
      });

    if (insertError && !isUniqueViolation(insertError)) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    const stateAfterInsert = await getQuestionState(supabaseAdmin, questionId, user.id);
    if ("error" in stateAfterInsert) {
      return jsonResponse({ error: stateAfterInsert.error }, stateAfterInsert.status);
    }

    return jsonResponse(stateAfterInsert);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return jsonResponse({ error: message }, 500);
  }
});
