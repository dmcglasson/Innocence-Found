/**
 * Chapters screen module.
 * Handles chapter list rendering, chapter access checks, and chapter-reader content.
 */

import { getCurrentSession, getSubscriberStatus } from "./auth.js";
import { getSupabaseClient } from "./supabase.js";
import { APP_CONFIG } from "../config.js";
import { waitForElement } from "../utils/dom.js";
import {
  submitComment as submitChapterComment,
  getCommentsByChapter,
} from "./comments.js";

const FREE_LIMIT = APP_CONFIG.FREE_CHAPTER_COUNT;
const CHAPTERS_TABLE = "Chapters";
const DEFAULT_CHAPTERS_BUCKET = "Chapters";
const CHAPTER_POLL_STORAGE_KEY = "chapterReaderPollVotes.v1";
const CHAPTER_POLL_QUESTIONS = {
  1: {
    title: "Chapter 1 Question",
    question: "What should the protagonist focus on first?",
    options: [
      "Finding stronger evidence",
      "Building trust with family",
      "Confronting the legal system now",
    ],
  },
  2: {
    title: "Chapter 2 Question",
    question: "Which clue feels most important at this stage?",
    options: [
      "A contradiction in testimony",
      "A missing timeline detail",
      "An overlooked witness statement",
    ],
  },
};
let activeChapterBlobUrl = null;

/**
 * Fetch chapter metadata from DB table.
 * Existing columns: id, chapter_num, free, book_id, created_at, chapter_id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} chapterNumber
 * @returns {Promise<{chapter_num:number,free:boolean,chapter_id:string}|null>}
 */
async function fetchChapterRecord(supabase, chapterNumber) {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select("id,chapter_num,free,chapter_id")
    .eq("chapter_num", chapterNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`Chapter table lookup failed: ${error.message}`);
  }

  if (!data || !data.chapter_id) return null;

  return data;
}

function getChapterPoll(chapterNumber) {
  return (
    CHAPTER_POLL_QUESTIONS[chapterNumber] || {
      title: `Chapter ${chapterNumber} Question`,
      question: "Which choice best reflects your interpretation of this chapter?",
      options: [
        "The main conflict escalated",
        "A key relationship changed",
        "The mystery became more complex",
      ],
    }
  );
}

function loadChapterPollVoteState() {
  try {
    const raw = localStorage.getItem(CHAPTER_POLL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveChapterPollVoteState(state) {
  try {
    localStorage.setItem(CHAPTER_POLL_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save chapter poll votes:", error);
  }
}

function ensureChapterPollState(chapterNumber, optionCount) {
  const allVotes = loadChapterPollVoteState();
  const key = String(chapterNumber);
  const existing = allVotes[key];
  const safeCount = Math.max(0, Number(optionCount) || 0);

  if (!existing || !Array.isArray(existing.counts)) {
    allVotes[key] = { counts: Array(safeCount).fill(0), selected: null };
    saveChapterPollVoteState(allVotes);
    return allVotes[key];
  }

  const normalizedCounts = Array(safeCount).fill(0);
  for (let i = 0; i < safeCount; i += 1) {
    const value = Number(existing.counts[i]) || 0;
    normalizedCounts[i] = value > 0 ? Math.floor(value) : 0;
  }

  const selected = Number.isInteger(existing.selected) &&
    existing.selected >= 0 &&
    existing.selected < safeCount
    ? existing.selected
    : null;

  allVotes[key] = { counts: normalizedCounts, selected };
  saveChapterPollVoteState(allVotes);
  return allVotes[key];
}

function renderChapterPoll(chapterNumber, canVote = false) {
  const titleEl = document.getElementById("chapterPollTitle");
  const questionEl = document.getElementById("chapterPollQuestion");
  const optionsEl = document.getElementById("chapterPollOptions");
  const voteBtn = document.getElementById("chapterPollVoteBtn");
  const statusEl = document.getElementById("chapterPollStatus");

  if (!titleEl || !questionEl || !optionsEl || !voteBtn || !statusEl) {
    return;
  }

  const poll = getChapterPoll(chapterNumber);
  const state = ensureChapterPollState(chapterNumber, poll.options.length);
  const totalVotes = state.counts.reduce((sum, n) => sum + n, 0);

  titleEl.textContent = poll.title;
  questionEl.textContent = poll.question;
  optionsEl.innerHTML = "";

  poll.options.forEach((optionText, index) => {
    const count = state.counts[index] || 0;
    const percent = totalVotes ? Math.round((count / totalVotes) * 100) : 0;

    const label = document.createElement("label");
    label.className = "chapter-poll-option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "chapterPollOption";
    radio.value = String(index);
    radio.checked = state.selected === index;
    radio.disabled = !canVote;
    label.appendChild(radio);

    const copy = document.createElement("span");
    copy.textContent = optionText;

    const meta = document.createElement("div");
    meta.className = "chapter-poll-meta";
    meta.textContent = `${count} vote${count === 1 ? "" : "s"} (${percent}%)`;
    copy.appendChild(meta);

    label.appendChild(copy);
    optionsEl.appendChild(label);
  });

  if (!canVote) {
    voteBtn.disabled = true;
    voteBtn.onclick = null;
    statusEl.textContent = `Total votes: ${totalVotes} | Subscribers can vote on this question.`;
    return;
  }

  voteBtn.disabled = false;
  statusEl.textContent =
    state.selected === null
      ? `Total votes: ${totalVotes}`
      : `Your vote: ${poll.options[state.selected]} | Total votes: ${totalVotes}`;

  voteBtn.onclick = () => {
    const checked = optionsEl.querySelector(
      'input[name="chapterPollOption"]:checked'
    );
    const selected = checked ? Number.parseInt(checked.value, 10) : null;

    if (!Number.isInteger(selected) || selected < 0 || selected >= poll.options.length) {
      statusEl.textContent = "Select one answer before submitting.";
      return;
    }

    const allVotes = loadChapterPollVoteState();
    const key = String(chapterNumber);
    const next = ensureChapterPollState(chapterNumber, poll.options.length);

    if (Number.isInteger(next.selected) && next.selected >= 0 && next.selected < next.counts.length) {
      if (next.counts[next.selected] > 0) {
        next.counts[next.selected] -= 1;
      }
    }

    next.selected = selected;
    next.counts[selected] += 1;
    allVotes[key] = next;
    saveChapterPollVoteState(allVotes);
    renderChapterPoll(chapterNumber, canVote);
  };
}

function setChapterCommentAccess(isLoggedIn) {
  const noticeEl = document.getElementById("chapterSubscriberNotice");
  const composeEl = document.getElementById("chapterNewCommentArea");

  if (!noticeEl || !composeEl) return;

  if (isLoggedIn) {
    composeEl.classList.remove("hidden");
    noticeEl.classList.add("hidden");
    return;
  }

  composeEl.classList.add("hidden");
  noticeEl.classList.remove("hidden");
}

async function renderChapterComments(chapterId, currentUserId) {
  const listEl = document.getElementById("chapterCommentsList");
  const emptyEl = document.getElementById("chapterNoComments");

  if (!listEl || !emptyEl) return;

  listEl.innerHTML = "";
  const result = await getCommentsByChapter(chapterId);

  if (!result.ok || !result.data?.length) {
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");

  result.data.forEach((row) => {
    const card = document.createElement("article");
    card.className = "chapter-comment-card";

    const meta = document.createElement("div");
    meta.className = "chapter-comment-meta";
    const who = row.uid === currentUserId ? "You" : "Reader";
    meta.textContent = `${who} - ${new Date(row.created_at).toLocaleString()}`;
    card.appendChild(meta);

    const text = document.createElement("p");
    text.textContent = row.message;
    card.appendChild(text);

    listEl.appendChild(card);
  });
}

async function initializeChapterDiscussion(chapterNumber, chapterId) {
  const session = await getCurrentSession();
  const userId = session?.user?.id ?? null;
  const subInfo = userId ? await getSubscriberStatus() : { isSubscriber: false };
  const canVote = !!subInfo?.isSubscriber;
  renderChapterPoll(chapterNumber, canVote);
  setChapterCommentAccess(!!userId);

  const refreshBtn = document.getElementById("chapterRefreshComments");
  const submitBtn = document.getElementById("chapterSubmitComment");
  const textEl = document.getElementById("chapterNewCommentText");

  if (refreshBtn) {
    refreshBtn.onclick = () => renderChapterComments(chapterId, userId);
  }

  if (submitBtn && textEl) {
    submitBtn.onclick = async () => {
      if (!userId) {
        alert("Please log in to post comments.");
        return;
      }

      const message = (textEl.value || "").trim();
      if (!message) return;

      const response = await submitChapterComment({
        chapterId,
        message,
        parentCommentId: null,
      });

      if (!response.ok) {
        alert(response.message || "Could not post comment.");
        return;
      }

      textEl.value = "";
      await renderChapterComments(chapterId, userId);
    };
  }

  await renderChapterComments(chapterId, userId);
}

/**
 * Resolve bucket/path from storage.objects by object id via public RPC.
 * This avoids client-side direct access to the storage schema.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} chapterObjectId
 * @returns {Promise<{bucket:string,path:string}|null>}
 */
async function fetchStorageObjectById(supabase, chapterObjectId) {
  const { data, error } = await supabase.rpc("get_storage_object_by_id", {
    p_object_id: chapterObjectId,
  });

  if (error) {
    throw new Error(
      `RPC get_storage_object_by_id failed for object ${chapterObjectId}: ${error.message}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.name) return null;

  return {
    bucket: row.bucket_id || DEFAULT_CHAPTERS_BUCKET,
    path: row.name,
  };
}

/**
 * Try to resolve a usable URL for a specific bucket/path pair.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<string|null>}
 */
async function resolveStorageUrl(supabase, bucket, path) {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;

  // Preferred: download blob and embed via local blob URL to avoid frame-ancestor/X-Frame-Options issues.
  const { data: blobData, error: blobError } = await supabase.storage
    .from(cleanBucket)
    .download(cleanPath);

  if (!blobError && blobData) {
    if (activeChapterBlobUrl) {
      URL.revokeObjectURL(activeChapterBlobUrl);
      activeChapterBlobUrl = null;
    }
    activeChapterBlobUrl = URL.createObjectURL(blobData);
    return activeChapterBlobUrl;
  }

  const { data, error } = await supabase.storage
    .from(cleanBucket)
    .createSignedUrl(cleanPath, 60 * 60);

  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  const publicData = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
  const publicUrl = publicData?.data?.publicUrl;
  if (publicUrl) {
    const isReadable = await isPublicUrlReadable(publicUrl);
    if (isReadable) return publicUrl;
  }

  return null;
}

/**
 * Probe whether a public URL is readable.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isPublicUrlReadable(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

/**
 * Resolve a signed URL for a chapter PDF in Supabase Storage.
 * @param {number} chapterNumber
 * @returns {Promise<string>}
 */
async function getChapterPdfUrl(chapterNumber) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  // Primary source: chapters table row with explicit bucket/path.
  const chapterRecord = await fetchChapterRecord(supabase, chapterNumber);
  if (!chapterRecord) {
    throw new Error(
      `No ${CHAPTERS_TABLE} row for chapter ${chapterNumber}. Add chapter_num and chapter_id.`
    );
  }

  const objectRef = await fetchStorageObjectById(supabase, chapterRecord.chapter_id);
  if (!objectRef) {
    throw new Error(
      `No storage.objects entry found for chapter_id ${chapterRecord.chapter_id} (chapter ${chapterNumber}).`
    );
  }

  const bucket = objectRef.bucket || DEFAULT_CHAPTERS_BUCKET;
  const path = objectRef.path;
  const tableUrl = await resolveStorageUrl(supabase, bucket, path);

  if (!tableUrl) {
    throw new Error(`Could not resolve chapter PDF at ${bucket}/${path}.`);
  }

  return tableUrl;
}

async function resolveStorageUrlForBookReader(supabase, bucket, path) {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;

  const { data, error } = await supabase.storage
    .from(cleanBucket)
    .createSignedUrl(cleanPath, 60 * 60);

  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  const publicData = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
  const publicUrl = publicData?.data?.publicUrl;
  if (publicUrl) {
    const isReadable = await isPublicUrlReadable(publicUrl);
    if (isReadable) return publicUrl;
  }

  return null;
}

/**
 * Fetch chapter records and resolve reader URLs for bookreader screen.
 * @returns {Promise<{ok:boolean,data:Array<{chapterId:number|null,chapterNum:number|null,bookId:number|null,free:boolean,url:string,label:string}>,message?:string}>}
 */
export async function fetchBookReaderEntries() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, data: [], message: "Supabase client not initialized." };
  }

  const session = await getCurrentSession();
  let canAccessLockedChapters = false;
  if (session?.user) {
    const subInfo = await getSubscriberStatus();
    canAccessLockedChapters = !!subInfo?.isSubscriber;
  }

  const { data: rows, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select("id,chapter_num,book_id,chapter_id,free")
    .order("book_id", { ascending: true })
    .order("chapter_num", { ascending: true });

  if (error) {
    return { ok: false, data: [], message: error.message };
  }

  const entries = [];
  for (const row of rows || []) {
    if (!row?.chapter_id) continue;

    const chapterNum = Number(row.chapter_num) || 1;
    const isFreeChapter = chapterNum <= FREE_LIMIT;

    if (!isFreeChapter && !canAccessLockedChapters) {
      continue;
    }

    try {
      const objectRef = await fetchStorageObjectById(supabase, row.chapter_id);
      if (!objectRef) continue;

      const url = await resolveStorageUrlForBookReader(
        supabase,
        objectRef.bucket || DEFAULT_CHAPTERS_BUCKET,
        objectRef.path
      );
      if (!url) continue;

      const bookId = Number(row.book_id) || 1;
      entries.push({
        chapterId: row.id ?? null,
        chapterNum,
        bookId,
        free: isFreeChapter,
        url,
        label: `Book ${bookId} - Chapter ${chapterNum}${isFreeChapter ? "" : " (Subscribers)"}`,
      });
    } catch (entryError) {
      console.warn("Skipping chapter entry due to URL resolution error:", entryError);
    }
  }

  return { ok: true, data: entries };
}

/**
 * Initialize the chapter-reader screen.
 * @returns {Promise<void>}
 */
export async function initializeChapterReaderScreen() {
  await waitForElement("#chapterTitle", 1000);

  const chapterNumber = Number(sessionStorage.getItem("activeChapter"));
  let discussionChapterId = chapterNumber;

  // If someone navigates to #chapter-reader directly without selecting a chapter.
  if (!chapterNumber) {
    window.location.hash = "chapters";
    return;
  }

  if (chapterNumber > FREE_LIMIT) {
    const session = await getCurrentSession();

    // Not logged in -> send to login.
    if (!session || !session.user) {
      sessionStorage.setItem("returnTo", "chapters");
      sessionStorage.setItem("requestedChapter", String(chapterNumber));
      window.showLogin();
      return;
    }

    // Logged in but not subscriber -> block.
    const subInfo = await getSubscriberStatus();
    if (!subInfo.isSubscriber) {
      alert("Subscribers only.");
      window.location.hash = "chapters";
      return;
    }
  }

  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const chapterRecord = await fetchChapterRecord(supabase, chapterNumber);
      if (chapterRecord?.id) {
        discussionChapterId = chapterRecord.id;
      }
    }
  } catch (error) {
    console.warn("Failed to resolve chapter table id for discussion:", error);
  }

  const titleEl = document.getElementById("chapterTitle");
  const bodyEl = document.getElementById("chapterBody");
  const backBtn = document.getElementById("backToChaptersBtn");

  if (titleEl) titleEl.textContent = `Chapter ${chapterNumber}`;

  if (bodyEl) {
    bodyEl.textContent = "Loading chapter...";

    try {
      const pdfUrl = await getChapterPdfUrl(chapterNumber);
      bodyEl.innerHTML = `
        <iframe
          title="Chapter ${chapterNumber} PDF"
          src="${pdfUrl}#toolbar=1&navpanes=0"
          style="width: 100%; min-height: 78vh; border: 1px solid #ddd; border-radius: 8px;"
        ></iframe>
        <p style="margin-top: 12px;">
          Having trouble viewing this file?
          <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer">Open chapter PDF in a new tab</a>.
        </p>
      `;
    } catch (error) {
      console.error(`Failed to load chapter ${chapterNumber} from storage:`, error);
      bodyEl.innerHTML = `
        <p><em>Chapter ${chapterNumber}</em></p>
        <p>This chapter PDF is not available yet. Please check back later.</p>
      `;
    }
  }

  if (backBtn) {
    backBtn.onclick = () => {
      if (activeChapterBlobUrl) {
        URL.revokeObjectURL(activeChapterBlobUrl);
        activeChapterBlobUrl = null;
      }
      window.location.hash = "chapters";
    };
  }

  await initializeChapterDiscussion(chapterNumber, discussionChapterId);
}

/**
 * Initialize the chapters listing screen.
 * @returns {Promise<void>}
 */
export async function initializeChaptersScreen() {
  await waitForElement("#chapterList", 1000);

  const session = await getCurrentSession();
  let isSubscriber = false;

  if (session && session.user) {
    const subInfo = await getSubscriberStatus();
    isSubscriber = subInfo.isSubscriber;
  }

  renderChapters({ isSubscriber });

  const requestedChapter = sessionStorage.getItem("requestedChapter");
  if (requestedChapter) {
    sessionStorage.removeItem("requestedChapter");
    await handleLockedChapter(Number(requestedChapter));
  }
}

/**
 * Render chapters list with lock state.
 * @param {{isSubscriber?: boolean}} options
 */
function renderChapters({ isSubscriber = false } = {}) {
  const chapterList = document.getElementById("chapterList");
  if (!chapterList) return;

  let html = "";

  for (let i = 1; i <= APP_CONFIG.TOTAL_CHAPTERS; i += 1) {
    const isLocked = !isSubscriber && i > FREE_LIMIT;
    html += `
      <div class="chapter-item">
        <h3>${isLocked ? "🔒 " : ""}Chapter ${i}</h3>
        <button type="button" class="chapter-button" data-chapter="${i}">
          ${isLocked ? "Subscribers Only" : "Read for Free"}
        </button>
      </div>
    `;
  }

  chapterList.innerHTML = html;

  // Attach one delegated listener for chapter buttons.
  if (!chapterList.dataset.listenerAttached) {
    chapterList.addEventListener("click", (e) => {
      const btn = e.target.closest(".chapter-button");
      if (!btn) return;

      const chapterNumber = Number(btn.dataset.chapter);
      if (Number.isNaN(chapterNumber)) return;

      handleLockedChapter(chapterNumber);
    });

    chapterList.dataset.listenerAttached = "true";
  }
}

/**
 * Handle chapter access checks and navigate to bookreader.
 * @param {number} chapterNumber
 * @returns {Promise<void>}
 */
export async function handleLockedChapter(chapterNumber) {
  const isFreeChapter = chapterNumber <= FREE_LIMIT;

  // Only require login for locked chapters.
  if (!isFreeChapter) {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      sessionStorage.setItem("returnTo", "#chapters");
      sessionStorage.setItem("requestedChapter", String(chapterNumber));
      window.showLogin();
      return;
    }

    const subInfo = await getSubscriberStatus();
    if (!subInfo?.isSubscriber) {
      alert("Subscribers only.");
      return;
    }
  }

  sessionStorage.setItem("activeChapter", String(chapterNumber));
  window.location.hash = "bookreader";
}
