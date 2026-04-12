import { getSupabaseClient } from "./supabase.js";

const AUTHOR_QUESTIONS_TABLE = "Author Question";

function normalizeQuestionRow(row, selectedOption = null) {
  if (!row) return null;

  const options = Array.isArray(row.options_texts)
    ? row.options_texts
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];

  if (!options.length) {
    console.warn("[author_question] Row found but options_texts is empty/invalid:", row);
    return null;
  }

  const voteCounts = Array.from({ length: options.length }, (_, index) => {
    const raw = Array.isArray(row.options_votes) ? row.options_votes[index] : 0;
    return Math.max(0, Number(raw) || 0);
  });

  const normalizedSelected =
    Number.isInteger(selectedOption) && selectedOption >= 0 && selectedOption < options.length
      ? selectedOption
      : null;

  return {
    id: Number(row.id) || null,
    chapterId: Number(row.chapter_id) || null,
    title: "Author Question",
    question: typeof row["main question"] === "string" ? row["main question"].trim() : "",
    options,
    voteCounts,
    selectedOption: normalizedSelected,
  };
}

export async function getAuthorQuestionByChapter(chapterId, selectedOption = null) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: null, message: "Supabase not initialized" };

  const safeChapterId = Number(chapterId);
  if (!Number.isInteger(safeChapterId) || safeChapterId <= 0) {
    console.warn("[author_question] Invalid chapter id passed to getAuthorQuestionByChapter:", chapterId);
    return { ok: false, data: null, message: "Invalid chapter id" };
  }

  const { data, error } = await supabase
    .from(AUTHOR_QUESTIONS_TABLE)
    .select("*")
    .eq("chapter_id", safeChapterId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[author_question] Supabase query failed:", error);
    return { ok: false, data: null, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] ?? null : null;
  const normalized = normalizeQuestionRow(row, selectedOption);
  return { ok: true, data: normalized };
}

export async function submitAuthorQuestionVote({
  questionId,
  selectedOptionIndex,
  previousSelectedIndex = null,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: null, message: "Supabase not initialized" };

  const safeQuestionId = Number(questionId);
  const safeSelectedIndex = Number(selectedOptionIndex);
  const safePreviousIndex = Number.isInteger(previousSelectedIndex) ? previousSelectedIndex : null;

  if (!Number.isInteger(safeQuestionId) || safeQuestionId <= 0) {
    return { ok: false, data: null, message: "Invalid question id" };
  }

  if (!Number.isInteger(safeSelectedIndex) || safeSelectedIndex < 0) {
    return { ok: false, data: null, message: "Invalid vote option" };
  }

  const { data: existingRow, error: fetchError } = await supabase
    .from(AUTHOR_QUESTIONS_TABLE)
    .select("*")
    .eq("id", safeQuestionId)
    .maybeSingle();

  if (fetchError) return { ok: false, data: null, message: fetchError.message };

  const normalized = normalizeQuestionRow(existingRow);
  if (!normalized) {
    return { ok: false, data: null, message: "Author question not found" };
  }

  if (safeSelectedIndex >= normalized.options.length) {
    return { ok: false, data: null, message: "Vote option out of range" };
  }

  const nextVotes = [...normalized.voteCounts];
  if (Number.isInteger(safePreviousIndex) && safePreviousIndex >= 0 && safePreviousIndex < nextVotes.length) {
    if (nextVotes[safePreviousIndex] > 0) {
      nextVotes[safePreviousIndex] -= 1;
    }
  }
  nextVotes[safeSelectedIndex] += 1;

  const { data: updatedRow, error: updateError } = await supabase
    .from(AUTHOR_QUESTIONS_TABLE)
    .update({ options_votes: nextVotes })
    .eq("id", safeQuestionId)
    .select("*")
    .maybeSingle();

  if (updateError) return { ok: false, data: null, message: updateError.message };
  return { ok: true, data: normalizeQuestionRow(updatedRow, safeSelectedIndex) };
}
