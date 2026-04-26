import { getSupabaseClient } from "./supabase.js";

const AUTHOR_QUESTIONS_TABLE = "author_questions";
const AUTHOR_QUESTION_VOTES_TABLE = "author_question_votes";
const AUTHOR_QUESTION_VOTE_FUNCTION = "submit-author-question-vote";
const AUTHOR_QUESTION_COLUMNS =
  "id, created_at, question_text, option_1_text, option_2_text, option_3_text, chapter_id";
const AUTHOR_QUESTION_OPTION_COUNT = 3;

function normalizeOptionText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function aggregateVoteCounts(voteRows) {
  const counts = Array(AUTHOR_QUESTION_OPTION_COUNT).fill(0);

  (Array.isArray(voteRows) ? voteRows : []).forEach((row) => {
    const chosenOption = Number(row?.chosen_option);
    if (
      Number.isInteger(chosenOption) &&
      chosenOption >= 1 &&
      chosenOption <= AUTHOR_QUESTION_OPTION_COUNT
    ) {
      counts[chosenOption - 1] += 1;
    }
  });

  return counts;
}

function toSelectedOptionIndex(chosenOption) {
  const parsed = Number(chosenOption);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= AUTHOR_QUESTION_OPTION_COUNT
    ? parsed - 1
    : null;
}

function normalizeQuestionRow(row, { voteRows = [], selectedOption = null } = {}) {
  if (!row) return null;

  const question = normalizeOptionText(row.question_text);
  const options = [
    normalizeOptionText(row.option_1_text),
    normalizeOptionText(row.option_2_text),
    normalizeOptionText(row.option_3_text),
  ];

  if (!question || options.some((option) => !option)) {
    console.warn("[author_question] Row found but question_text or fixed option fields are missing:", row);
    return null;
  }

  const normalizedSelected =
    Number.isInteger(selectedOption) &&
    selectedOption >= 0 &&
    selectedOption < AUTHOR_QUESTION_OPTION_COUNT
      ? selectedOption
      : null;

  return {
    id: Number(row.id) || null,
    chapterId: Number(row.chapter_id) || null,
    title: "Author Question",
    question,
    options,
    voteCounts: aggregateVoteCounts(voteRows),
    selectedOption: normalizedSelected,
  };
}

async function getCurrentUserId(supabase) {
  if (!supabase?.auth || typeof supabase.auth.getUser !== "function") {
    return null;
  }

  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

async function getQuestionRowById(supabase, questionId) {
  const { data, error } = await supabase
    .from(AUTHOR_QUESTIONS_TABLE)
    .select(AUTHOR_QUESTION_COLUMNS)
    .eq("id", questionId)
    .maybeSingle();

  return { data, error };
}

async function getVoteRowsByQuestion(supabase, questionId) {
  const { data, error } = await supabase
    .from(AUTHOR_QUESTION_VOTES_TABLE)
    .select("chosen_option")
    .eq("question_id", questionId);

  return { data: Array.isArray(data) ? data : [], error };
}

async function getExistingVote(supabase, questionId, userId) {
  if (!userId) return { data: null, error: null };

  const { data, error } = await supabase
    .from(AUTHOR_QUESTION_VOTES_TABLE)
    .select("chosen_option")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();

  return { data, error };
}

async function buildQuestionResult(supabase, row, userId, selectedOptionOverride = null) {
  const questionId = Number(row?.id);
  if (!Number.isInteger(questionId) || questionId <= 0) {
    return { ok: false, data: null, message: "Author question not found" };
  }

  const [voteRowsResult, existingVoteResult] = await Promise.all([
    getVoteRowsByQuestion(supabase, questionId),
    getExistingVote(supabase, questionId, userId),
  ]);

  if (voteRowsResult.error) {
    return { ok: false, data: null, message: voteRowsResult.error.message };
  }

  if (existingVoteResult.error) {
    return { ok: false, data: null, message: existingVoteResult.error.message };
  }

  const existingSelected = toSelectedOptionIndex(existingVoteResult.data?.chosen_option);
  const selectedOption =
    Number.isInteger(selectedOptionOverride) &&
    selectedOptionOverride >= 0 &&
    selectedOptionOverride < AUTHOR_QUESTION_OPTION_COUNT
      ? selectedOptionOverride
      : existingSelected;
  const normalized = normalizeQuestionRow(row, {
    voteRows: voteRowsResult.data,
    selectedOption,
  });

  return { ok: true, data: normalized };
}

function getErrorStatus(error) {
  return Number(error?.status || error?.context?.status || error?.response?.status) || null;
}

function isFunctionUnavailable(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || error?.name || "").toLowerCase();
  return (
    status === 404 ||
    message.includes("not found") ||
    message.includes("function not found")
  );
}

function isFunctionRequestFailure(error) {
  const status = getErrorStatus(error);
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    !status &&
    (
      name.includes("functionsfetcherror") ||
      message.includes("failed to send a request to the edge function") ||
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("load failed")
    )
  );
}

function isUniqueViolation(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || message.includes("unique");
}

async function submitVoteWithFunction(supabase, questionId, selectedOptionIndex) {
  if (!supabase?.functions || typeof supabase.functions.invoke !== "function") {
    return null;
  }

  let response;
  try {
    response = await supabase.functions.invoke(AUTHOR_QUESTION_VOTE_FUNCTION, {
      body: {
        questionId,
        selectedOptionIndex,
        chosenOption: selectedOptionIndex + 1,
      },
    });
  } catch (error) {
    if (isFunctionRequestFailure(error)) return null;
    return {
      ok: false,
      data: null,
      message: error?.message || "Vote submission failed",
    };
  }

  const { data, error } = response;

  if (error) {
    if (isFunctionUnavailable(error) || isFunctionRequestFailure(error)) return null;
    return {
      ok: false,
      data: null,
      message: error.message || "Vote submission failed",
    };
  }

  if (data?.error) {
    return {
      ok: false,
      data: null,
      message: data.error,
    };
  }

  if (data?.question) {
    const normalized = normalizeQuestionRow(data.question, {
      voteRows: data.votes,
      selectedOption: toSelectedOptionIndex(data.selectedVote?.chosen_option) ?? selectedOptionIndex,
    });
    if (normalized) return { ok: true, data: normalized };
  }

  return {
    ok: false,
    data: null,
    message: "Vote was submitted, but the updated question could not be read.",
  };
}

export async function getAuthorQuestionByChapter(chapterId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: null, message: "Supabase not initialized" };

  const safeChapterId = Number(chapterId);
  if (!Number.isInteger(safeChapterId) || safeChapterId <= 0) {
    console.warn("[author_question] Invalid chapter id passed to getAuthorQuestionByChapter:", chapterId);
    return { ok: false, data: null, message: "Invalid chapter id" };
  }

  const [questionResult, userId] = await Promise.all([
    supabase
      .from(AUTHOR_QUESTIONS_TABLE)
      .select(AUTHOR_QUESTION_COLUMNS)
      .eq("chapter_id", safeChapterId)
      .order("created_at", { ascending: false })
      .limit(1),
    getCurrentUserId(supabase),
  ]);

  if (questionResult.error) {
    console.error("[author_question] Supabase query failed:", questionResult.error);
    return { ok: false, data: null, message: questionResult.error.message };
  }

  const row = Array.isArray(questionResult.data) ? questionResult.data[0] ?? null : null;
  if (!row) return { ok: true, data: null };

  return buildQuestionResult(supabase, row, userId);
}

export async function submitAuthorQuestionVote({
  questionId,
  selectedOptionIndex,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: null, message: "Supabase not initialized" };

  const safeQuestionId = Number(questionId);
  const safeSelectedIndex = Number(selectedOptionIndex);

  if (!Number.isInteger(safeQuestionId) || safeQuestionId <= 0) {
    return { ok: false, data: null, message: "Invalid question id" };
  }

  if (
    !Number.isInteger(safeSelectedIndex) ||
    safeSelectedIndex < 0 ||
    safeSelectedIndex >= AUTHOR_QUESTION_OPTION_COUNT
  ) {
    return { ok: false, data: null, message: "Invalid vote option" };
  }

  const functionResult = await submitVoteWithFunction(supabase, safeQuestionId, safeSelectedIndex);
  if (functionResult) return functionResult;

  const userId = await getCurrentUserId(supabase);
  if (!userId) {
    return { ok: false, data: null, message: "Please log in to submit a vote." };
  }

  const { data: existingRow, error: fetchError } = await getQuestionRowById(supabase, safeQuestionId);
  if (fetchError) return { ok: false, data: null, message: fetchError.message };

  const normalized = normalizeQuestionRow(existingRow);
  if (!normalized) {
    return { ok: false, data: null, message: "Author question not found" };
  }

  const existingVote = await getExistingVote(supabase, safeQuestionId, userId);
  if (existingVote.error) {
    return { ok: false, data: null, message: existingVote.error.message };
  }

  const existingSelected = toSelectedOptionIndex(existingVote.data?.chosen_option);
  if (existingSelected !== null) {
    return buildQuestionResult(supabase, existingRow, userId, existingSelected);
  }

  const chosenOption = safeSelectedIndex + 1;
  const { error: insertError } = await supabase
    .from(AUTHOR_QUESTION_VOTES_TABLE)
    .insert({
      question_id: safeQuestionId,
      user_id: userId,
      chosen_option: chosenOption,
    });

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return buildQuestionResult(supabase, existingRow, userId);
    }
    return { ok: false, data: null, message: insertError.message };
  }

  return buildQuestionResult(supabase, existingRow, userId, safeSelectedIndex);
}
