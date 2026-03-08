import { getSupabaseClient } from "./supabase.js";

export async function submitComment({ chapterId, message, parentCommentId = null }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, status: 500, message: "Supabase not initialized" };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, status: 401, message: "Not authenticated" };

  console.log("AUTH USER:", userData.user);
  const trimmed = (message ?? "").trim();
  if (!trimmed) return { ok: false, status: 400, message: "Message cannot be empty." };


  const { error } = await supabase.from("Comments").insert({
    uid: userData.user.id,
    chapter_id: Number(chapterId),
    message: trimmed,
    comment_id: parentCommentId,
  });

  if (error) return { ok: false, status: 403, message: error.message };
  return { ok: true };
}

export async function getCommentsByChapter(chapterId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: [], message: "Supabase not initialized" };

  const { data, error } = await supabase
    .from("Comments")
    .select("id, message, created_at, uid, chapter_id, comment_id")
    .eq("chapter_id", Number(chapterId))
    .order("created_at", { ascending: false });

  if (error) return { ok: false, data: [], message: error.message };
  return { ok: true, data };
}