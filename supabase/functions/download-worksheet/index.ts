import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    const url = new URL(req.url);
    const worksheetId = url.searchParams.get("id");

    if (!worksheetId) {
      return new Response(JSON.stringify({ error: "Missing worksheet id" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const freeWorksheetCount = Number.parseInt(Deno.env.get("FREE_WORKSHEET_COUNT") || "1", 10) || 1;
    const worksheetBucket = (Deno.env.get("WORKSHEETS_BUCKET") || "worksheets").trim();

    // Optional authenticated client (used when an auth header is provided).
    const supabaseAuth = authHeader
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: authHeader,
            },
          },
        })
      : null;

    let user: { id: string } | null = null;
    if (supabaseAuth) {
      const {
        data: { user: authUser },
        error: userError,
      } = await supabaseAuth.auth.getUser();

      if (!userError && authUser) {
        user = { id: authUser.id };
      }
    }

    // Service-role client for DB + storage access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Find worksheet
    const { data: worksheet, error: worksheetError } = await supabaseAdmin
      .from("worksheets")
      .select("id, title, file_path, is_protected, is_answer_key, created_at")
      .eq("id", worksheetId)
      .single();

    if (worksheetError || !worksheet) {
      return new Response(JSON.stringify({ error: "Worksheet not found" }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const { data: worksheetRows, error: worksheetRowsError } = await supabaseAdmin
      .from("worksheets")
      .select("id")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (worksheetRowsError || !Array.isArray(worksheetRows)) {
      return new Response(JSON.stringify({ error: "Could not evaluate worksheet access order" }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const worksheetOrder = worksheetRows.findIndex((row) => String(row.id) === String(worksheet.id)) + 1;
    const isFreeByOrder = worksheetOrder > 0 && worksheetOrder <= freeWorksheetCount;
    const isAnswerKey = !!worksheet.is_answer_key;
    const isProtected = !!worksheet.is_protected || !isFreeByOrder;

    let role = "";
    let hasActiveSubscription = false;

    if (user?.id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      role = String(profile?.role || "").trim().toLowerCase();

      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      hasActiveSubscription = !!subscription;
    }

    const isAuthorizedForAnswerKeys = ["admin", "parent", "verified_parent"].includes(role);
    const isAuthorizedForProtectedContent =
      hasActiveSubscription || ["admin", "parent", "subscriber"].includes(role);

    if (isAnswerKey && !isAuthorizedForAnswerKeys) {
      return new Response(JSON.stringify({ error: "Forbidden: answer keys require parent/admin access" }), {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (isProtected && !isAuthorizedForProtectedContent) {
      return new Response(JSON.stringify({ error: "Forbidden: subscriber access required" }), {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // Download file from storage
    const { data: fileData, error: fileError } = await supabaseAdmin.storage
      .from(worksheetBucket)
      .download(worksheet.file_path);

    if (fileError || !fileData) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(fileData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${worksheet.file_path}"`,
      },
    });
  } 
  catch (error) {
  const message = error instanceof Error ? error.message : "Unknown server error";

  return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});