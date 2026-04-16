import { submitComment as submitCommentToDB, getCommentsByChapter } from "./comments.js";
import { getSupabaseClient } from "./supabase.js";
import { fetchBookReaderEntries } from "./chapters.js";
import { getSubscriberStatus } from "./auth.js";
// === PDF.js Book Viewer (SPA-friendly) ===
const PDF_JS_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js";
const PDF_JS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js";
const MOBILE_SINGLE_PAGE_MEDIA_QUERY = "(max-width: 760px)";
const VIEW_MODE_STORAGE_KEY = "bookreaderViewMode.v1";


let pdfjsLib = null;
let pdfDoc = null;
let currentPage = 1;
let currentUrl = "../book reader/books/book1.pdf";
let subscriber = false;
let currentUserId = null;
let currentBookId = 1;       
let currentChapterRowId = null;  
let currentChapterNum = 1;    
const chapterMetaByUrl = new Map();
let isSinglePageMode = false;
let preferredViewMode = loadPreferredViewMode();

async function refreshAuthState() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    currentUserId = null;
    subscriber = false;
    updateCommentUIAccess();
    return;
  }

  const { data } = await supabase.auth.getUser();
  currentUserId = data?.user?.id ?? null;
  if (!currentUserId) {
    subscriber = false;
    updateCommentUIAccess();
    return;
  }

  const subInfo = await getSubscriberStatus();
  subscriber = !!subInfo?.isSubscriber;
  updateCommentUIAccess();
}

function getCurrentSelectionMeta() {
  return chapterMetaByUrl.get(currentUrl) || null;
}

function syncCurrentSelectionMeta() {
  const meta = getCurrentSelectionMeta();
  if (!meta) return;

  const bookId = Number(meta.bookId);
  const chapterNum = Number(meta.chapterNum);
  const chapterId = Number(meta.chapterId);

  if (Number.isInteger(bookId) && bookId > 0) currentBookId = bookId;
  if (Number.isInteger(chapterNum) && chapterNum > 0) currentChapterNum = chapterNum;
  if (Number.isInteger(chapterId) && chapterId > 0) currentChapterRowId = chapterId;
}

function getCurrentChapterId() {
  const meta = getCurrentSelectionMeta();
  const chapterId = Number(meta?.chapterId);
  if (Number.isInteger(chapterId) && chapterId > 0) return chapterId;

  const fallback = Number(currentChapterRowId);
  return Number.isInteger(fallback) && fallback > 0 ? fallback : null;
}

function getCurrentPollKey() {
  const meta = getCurrentSelectionMeta();
  const chapterNum = Number(meta?.chapterNum);
  const bookId = Number(meta?.bookId);
  if (Number.isInteger(bookId) && bookId > 0 && Number.isInteger(chapterNum) && chapterNum > 0) {
    return `book-${bookId}-chapter-${chapterNum}`;
  }

  if (Number.isInteger(bookId) && bookId > 0) {
    return `book-${bookId}`;
  }

  if (currentUrl.includes("book1")) return "book-1";
  if (currentUrl.includes("book2")) return "book-2";
  return currentUrl;
}

let canvasLeft;
let canvasRight;
let ctxLeft;
let ctxRight;
let pageInfo;
let bookSelect;
let commentsTitle;
let commentsMeta;
let commentsList;
let commentsError;
let noComments;
let pollTitleEl;
let pollQuestionEl;
let pollOptionsEl;
let submitPollVoteBtn;
let pollStatusEl;
let refreshCommentsBtn;
let filterComments;
let newCommentArea;
let newCommentText;
let submitComment;
let subscriberNotice;
let readerError;
let jumpToDiscussionBtn;
let bookFrame;
let commentsPanel;
let doublePageViewBtn;
let singlePageViewBtn;
let listenersAttached = false;
let lastBoundCanvasLeft = null;
let resizeListenerAttached = false;
let touchStartX = null;
const POLL_STORAGE_KEY = "bookreaderPollVotes.v1";
const pollDataByBook = {
  "book-1-chapter-1": {
    title: "Chapter 1 Poll",
    question: "What is motivating the lead character most in this chapter?",
    options: [
      "Protecting family at any cost",
      "Seeking justice through the legal system",
      "Escaping a painful past",
    ],
  },
  "book-1": {
    title: "Book 1 Poll",
    question: "Which choice best describes what motivates the lead character right now?",
    options: [
      "Protecting family at any cost",
      "Seeking justice through the legal system",
      "Escaping a painful past",
    ],
  },
  "book-2": {
    title: "Book 2 Poll",
    question: "What should the protagonist prioritize in the next chapter?",
    options: [
      "Reveal the hidden evidence immediately",
      "Build trust with allies first",
      "Confront the antagonist directly",
    ],
  },
};
let pollVoteState = loadPollVoteState();

// Demo store keyed by book URL (match the option values in book selector)
const commentStore = {
  "../book reader/books/book1.pdf": [
    {
      author: "Priya",
      date: "2026-02-10 09:30",
      text: "Love the hook here; pacing feels perfect.",
      replies: [
        { author: "Alex", date: "2026-02-15 14:05", text: "Agree, the tempo really works." },
      ],
    },
    {
      author: "Marco",
      date: "2026-02-12 11:10",
      text: "Noticed the foreshadowing of the trial scene.",
      replies: [],
    },
    {
      author: "Jules",
      date: "2026-02-14 17:45",
      text: "Dialogue lands well; maybe trim the exposition.",
      replies: [],
    },
  ],
  "../book reader/books/book2.pdf": [
    {
      author: "Anita",
      date: "2026-02-09 08:20",
      text: "Opening tension is great--kept me turning pages.",
      replies: [],
    },
  ],
};

function loadScriptOnce(src, id) {
  const existing = id ? document.getElementById(id) : document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return existing._loadingPromise || Promise.resolve();
  }

  const script = document.createElement("script");
  script.src = src;
  script.defer = true;
  if (id) script.id = id;

  const promise = new Promise((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
  });

  script._loadingPromise = promise;
  document.head.appendChild(script);
  return promise;
}

async function ensurePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  await loadScriptOnce(PDF_JS_SRC, "pdfjs-cdn");
  pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  if (!pdfjsLib) {
    throw new Error("PDF.js failed to load");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER;
  return pdfjsLib;
}

function loadPreferredViewMode() {
  try {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return raw === "single" || raw === "double" ? raw : "auto";
  } catch {
    return "auto";
  }
}

function savePreferredViewMode() {
  try {
    if (preferredViewMode === "auto") {
      localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, preferredViewMode);
  } catch (error) {
    console.warn("Unable to save reader view mode:", error);
  }
}

function shouldUseSinglePageMode() {
  if (preferredViewMode === "single") return true;
  if (preferredViewMode === "double") return false;
  return window.matchMedia(MOBILE_SINGLE_PAGE_MEDIA_QUERY).matches;
}

function normalizeCurrentPageForLayout() {
  if (!pdfDoc) return;

  if (isSinglePageMode) {
    currentPage = Math.min(Math.max(1, currentPage), pdfDoc.numPages);
    return;
  }

  if (currentPage % 2 === 0) {
    currentPage = Math.max(1, currentPage - 1);
  }
}

function syncReaderLayoutMode() {
  const nextMode = shouldUseSinglePageMode();
  isSinglePageMode = nextMode;
  bookFrame?.classList.toggle("single-page-mode", isSinglePageMode);
  normalizeCurrentPageForLayout();
  updateViewModeControls();
}

function updateViewModeControls() {
  const singleActive = isSinglePageMode;
  singlePageViewBtn?.classList.toggle("active", singleActive);
  doublePageViewBtn?.classList.toggle("active", !singleActive);

  singlePageViewBtn?.setAttribute("aria-pressed", String(singleActive));
  doublePageViewBtn?.setAttribute("aria-pressed", String(!singleActive));
}

function setPreferredViewMode(mode) {
  if (mode !== "single" && mode !== "double") return;
  preferredViewMode = mode;
  savePreferredViewMode();

  const previousMode = isSinglePageMode;
  syncReaderLayoutMode();

  if (!pdfDoc) return;
  if (previousMode !== isSinglePageMode) {
    renderPages();
    return;
  }

  // Re-render to apply canvas/page layout changes even if mode boolean is unchanged.
  renderPages();
}

function setReaderErrorMessage(message = "") {
  if (!readerError) return;
  readerError.textContent = message;
  readerError.classList.toggle("hidden", !message);
}

function getPageTurnStep() {
  return isSinglePageMode ? 1 : 2;
}

function goToNextPage() {
  if (!pdfDoc) return;
  const step = getPageTurnStep();
  if (currentPage + step > pdfDoc.numPages) return;
  currentPage += step;
  renderPages();
}

function goToPreviousPage() {
  if (!pdfDoc) return;
  const step = getPageTurnStep();
  if (currentPage - step < 1) return;
  currentPage -= step;
  renderPages();
}

function renderCommentSkeleton(count = 3) {
  if (!commentsList) return;
  commentsList.classList.add("is-loading");
  commentsList.innerHTML = Array.from({ length: count })
    .map(
      () => `
        <article class="comment-card-skeleton" aria-hidden="true">
          <div class="skeleton-line skeleton-meta"></div>
          <div class="skeleton-line skeleton-body"></div>
          <div class="skeleton-line skeleton-body short"></div>
        </article>
      `
    )
    .join("");
}

function formatCommentAuthor(row) {
  if (row.uid === currentUserId) return "You";
  if (typeof row.username === "string" && row.username.trim()) return row.username.trim();
  if (row.uid) return `User ${String(row.uid).slice(0, 8)}`;
  return "Reader";
}

function formatCommentTimestamp(createdAt) {
  const value = createdAt ? new Date(createdAt) : null;
  if (!value || Number.isNaN(value.getTime())) return "Unknown time";
  return value.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function cacheDom() {
  canvasLeft = document.getElementById("leftPage");
  canvasRight = document.getElementById("rightPage");
  pageInfo = document.getElementById("pageInfo");
  bookSelect = document.getElementById("bookSelect");
  readerError = document.getElementById("readerError");
  jumpToDiscussionBtn = document.getElementById("jumpToDiscussion");
  bookFrame = document.getElementById("bookFrame");
  doublePageViewBtn = document.getElementById("doublePageViewBtn");
  singlePageViewBtn = document.getElementById("singlePageViewBtn");
  ensurePollMarkupExists();
  pollTitleEl = document.getElementById("pollTitle");
  pollQuestionEl = document.getElementById("pollQuestion");
  pollOptionsEl = document.getElementById("pollOptions");
  submitPollVoteBtn = document.getElementById("submitPollVote");
  pollStatusEl = document.getElementById("pollStatus");
  commentsTitle = document.getElementById("commentsTitle");
  commentsMeta = document.getElementById("commentsMeta");
  commentsList = document.getElementById("commentsList");
  commentsError = document.getElementById("commentsError");
  noComments = document.getElementById("noComments");
  commentsPanel = document.querySelector(".comments-panel");
  refreshCommentsBtn = document.getElementById("refreshComments");
  filterComments = document.getElementById("filterComments");
  newCommentArea = document.getElementById("newCommentArea");
  newCommentText = document.getElementById("newCommentText");
  submitComment = document.getElementById("submitComment");
  subscriberNotice = document.getElementById("subscriberNotice");

  if (!canvasLeft || !canvasRight || !pageInfo || !bookSelect) {
    console.warn("Bookreader DOM elements not found; skipping init.");
    return false;
  }

  // Reset listener flag if we are binding to a new DOM instance
  if (canvasLeft !== lastBoundCanvasLeft) {
    listenersAttached = false;
    lastBoundCanvasLeft = canvasLeft;
  }

  ctxLeft = canvasLeft.getContext("2d");
  ctxRight = canvasRight.getContext("2d");
  syncReaderLayoutMode();
  return true;
}

function ensurePollMarkupExists() {
  if (document.getElementById("pollTitle")) {
    return;
  }

  const commentsPanel = document.querySelector(".comments-panel");
  if (!commentsPanel || !commentsPanel.parentElement) {
    return;
  }

  commentsPanel.insertAdjacentHTML(
    "beforebegin",
    `
      <section class="poll-panel" aria-labelledby="pollTitle">
        <div class="poll-header">
          <p class="eyebrow">Author question</p>
          <h3 id="pollTitle" class="poll-title">Reader Poll</h3>
          <p id="pollQuestion" class="poll-question">
            Choose the answer that best matches your perspective.
          </p>
        </div>

        <fieldset id="pollOptions" class="poll-options"></fieldset>

        <div class="poll-actions">
          <button id="submitPollVote" type="button">Submit vote</button>
          <p id="pollStatus" class="poll-status" aria-live="polite"></p>
        </div>
      </section>
    `
  );
}

async function loadBookOptionsFromBackend() {
  if (!bookSelect) return;

  const currentSelection = bookSelect.value || currentUrl;
  const requestedChapterNum = Number.parseInt(
    sessionStorage.getItem("activeChapter") || "",
    10
  );
  const response = await fetchBookReaderEntries();
  if (!response?.ok || !Array.isArray(response.data) || response.data.length === 0) {
    return;
  }

  const visibleEntries = response.data.filter((entry) => {
    if (!entry?.url) return false;
    const isFreeEntry =
      entry.free === true ||
      entry.free === 1 ||
      String(entry.free).toLowerCase() === "true";
    return subscriber || isFreeEntry;
  });

  if (!visibleEntries.length) {
    return;
  }

  chapterMetaByUrl.clear();
  bookSelect.innerHTML = "";

  visibleEntries.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.url;
    option.textContent = entry.label || `Book ${entry.bookId || 1} - Chapter ${entry.chapterNum || 1}`;
    bookSelect.appendChild(option);
    chapterMetaByUrl.set(entry.url, entry);
  });

  if (!bookSelect.options.length) {
    return;
  }

  const firstValue = bookSelect.options[0].value;
  const requestedEntry = Number.isInteger(requestedChapterNum) && requestedChapterNum > 0
    ? visibleEntries.find((entry) => Number(entry?.chapterNum) === requestedChapterNum)
    : null;

  let nextValue = firstValue;
  if (requestedEntry?.url && chapterMetaByUrl.has(requestedEntry.url)) {
    nextValue = requestedEntry.url;
  } else if (chapterMetaByUrl.has(currentSelection)) {
    nextValue = currentSelection;
  }

  bookSelect.value = nextValue;
  currentUrl = nextValue;
  syncCurrentSelectionMeta();

  if (requestedEntry?.url) {
    sessionStorage.removeItem("activeChapter");
  }
}

function loadDocument(url) {
  if (!pdfjsLib) return;
  setReaderErrorMessage("");
  canvasLeft.style.opacity = "0";
  canvasRight.style.opacity = "0";
  pageInfo.textContent = "Loading...";

  pdfjsLib
    .getDocument(url)
    .promise.then((pdf) => {
      pdfDoc = pdf;
      currentPage = 1;
      currentUrl = url;
      syncCurrentSelectionMeta();
      syncReaderLayoutMode();
      renderPages();
    })
    .catch((err) => {
      console.error("Failed to load document", err);
      pageInfo.textContent = "Failed to load book";
      setReaderErrorMessage("We could not load this chapter right now. Please try again.");
    });
}

function renderPage(pageNum, canvas, ctx) {
  return pdfDoc.getPage(pageNum).then((page) => {
    const baseViewport = page.getViewport({ scale: 1 });
    let scale = 1.5;
    let renderTransform = null;

    if (isSinglePageMode) {
      const container = canvas.parentElement;
      const computed = container ? window.getComputedStyle(container) : null;
      const paddingX = computed
        ? (Number.parseFloat(computed.paddingLeft) || 0) + (Number.parseFloat(computed.paddingRight) || 0)
        : 0;
      const paddingY = computed
        ? (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0)
        : 0;
      const rawWidth = container?.clientWidth || canvas.clientWidth || baseViewport.width;
      const rawHeight = container?.clientHeight || canvas.clientHeight || baseViewport.height;
      const availableWidth = Math.max(1, rawWidth - paddingX);
      const availableHeight = Math.max(1, rawHeight - paddingY);
      const widthScale = availableWidth / baseViewport.width;
      const heightScale = availableHeight / baseViewport.height;
      const fitScale = Math.min(widthScale, heightScale);
      if (Number.isFinite(fitScale) && fitScale > 0) {
        scale = fitScale;
      }
    }

    const viewport = page.getViewport({ scale });
    if (isSinglePageMode) {
      const deviceScale = window.devicePixelRatio || 1;
      const outputScale = Math.min(3, Math.max(1, deviceScale * 1.35));

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTransform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];
    } else {
      canvas.height = Math.floor(viewport.height);
      canvas.width = Math.floor(viewport.width);
      canvas.style.width = "";
      canvas.style.height = "";
    }

    // Ensure previous transforms do not bleed into next render pass.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      transform: renderTransform,
    };
    return page.render(renderContext).promise;
  });
}

function renderPages() {
  if (!pdfDoc) return;
  normalizeCurrentPageForLayout();

  canvasLeft.style.opacity = "0";
  canvasRight.style.opacity = "0";

  const tasks = [renderPage(currentPage, canvasLeft, ctxLeft)];

  let rightRender = Promise.resolve();
  if (!isSinglePageMode && currentPage + 1 <= pdfDoc.numPages) {
    rightRender = renderPage(currentPage + 1, canvasRight, ctxRight);
    pageInfo.textContent = `Page ${currentPage}-${currentPage + 1}`;
  } else if (isSinglePageMode) {
    ctxRight.clearRect(0, 0, canvasRight.width, canvasRight.height);
    pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
  } else {
    ctxRight.clearRect(0, 0, canvasRight.width, canvasRight.height);
    pageInfo.textContent = `Page ${currentPage}`;
  }

  tasks.push(rightRender);

  Promise.all(tasks).then(() => {
    requestAnimationFrame(() => {
      canvasLeft.style.opacity = "1";
      canvasRight.style.opacity = isSinglePageMode ? "0" : "1";
    });
    renderComments();
  }).catch((error) => {
    console.error("Failed to render pages:", error);
    setReaderErrorMessage("Chapter render failed. Please refresh and try again.");
  });
}

function setCommentHeader() {
  if (!commentsTitle || !commentsMeta) return;
  const label = bookSelect.options[bookSelect.selectedIndex].text.replace(
    /\s*\(PDF\)|\s*\(Subscribers\)/i,
    ""
  );
  commentsTitle.textContent = `${label} - Section`;
  const chapterNum = Number(getCurrentSelectionMeta()?.chapterNum);
  commentsMeta.textContent = Number.isInteger(chapterNum) ? `Chapter ${chapterNum}` : "All pages";
}

function loadPollVoteState() {
  try {
    const raw = localStorage.getItem(POLL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePollVoteState() {
  try {
    localStorage.setItem(POLL_STORAGE_KEY, JSON.stringify(pollVoteState));
  } catch (error) {
    console.warn("Unable to save poll votes:", error);
  }
}

function getPollData() {
  const pollKey = getCurrentPollKey();
  const chapterPoll = pollDataByBook[pollKey];
  if (chapterPoll) return chapterPoll;

  const chapterMatch = /^book-(\d+)-chapter-\d+$/.exec(pollKey);
  if (chapterMatch) {
    return pollDataByBook[`book-${chapterMatch[1]}`] || null;
  }

  return pollDataByBook[pollKey] || null;
}

function ensurePollBookState(bookUrl, optionCount) {
  const existing = pollVoteState[bookUrl];
  const safeOptionCount = Math.max(0, Number(optionCount) || 0);

  if (!existing || !Array.isArray(existing.counts)) {
    const next = { counts: Array(safeOptionCount).fill(0), selected: null };
    pollVoteState[bookUrl] = next;
    return next;
  }

  const nextCounts = Array(safeOptionCount).fill(0);
  for (let i = 0; i < safeOptionCount; i += 1) {
    const value = Number(existing.counts[i]) || 0;
    nextCounts[i] = value > 0 ? Math.floor(value) : 0;
  }

  const selected = Number.isInteger(existing.selected) &&
    existing.selected >= 0 &&
    existing.selected < safeOptionCount
    ? existing.selected
    : null;

  const normalized = { counts: nextCounts, selected };
  pollVoteState[bookUrl] = normalized;
  return normalized;
}

function getCheckedPollIndex() {
  if (!pollOptionsEl) return null;
  const checked = pollOptionsEl.querySelector('input[name="bookPollOption"]:checked');
  if (!checked) return null;

  const parsed = Number.parseInt(checked.value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function renderPoll() {
  if (!pollTitleEl || !pollQuestionEl || !pollOptionsEl || !pollStatusEl || !submitPollVoteBtn) {
    return;
  }

  const pollKey = getCurrentPollKey();
  const poll = getPollData();
  if (!poll) {
    pollTitleEl.textContent = "Author Question";
    pollQuestionEl.textContent = "No question posted for this chapter yet.";
    pollOptionsEl.innerHTML = "";
    pollStatusEl.textContent = "Check back soon for a chapter question.";
    submitPollVoteBtn.disabled = true;
    return;
  }

  submitPollVoteBtn.disabled = false;
  pollTitleEl.textContent = poll.title;
  pollQuestionEl.textContent = poll.question;

  const bookState = ensurePollBookState(pollKey, poll.options.length);
  const totalVotes = bookState.counts.reduce((sum, count) => sum + count, 0);

  pollOptionsEl.innerHTML = "";
  poll.options.forEach((optionText, index) => {
    const count = bookState.counts[index] || 0;
    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

    const label = document.createElement("label");
    label.className = "poll-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "bookPollOption";
    input.value = String(index);
    input.checked = bookState.selected === index;
    input.disabled = !subscriber;
    label.appendChild(input);

    const copy = document.createElement("span");
    copy.className = "poll-option-copy";

    const text = document.createElement("span");
    text.className = "poll-option-text";
    text.textContent = optionText;

    const result = document.createElement("span");
    result.className = "poll-option-result";
    result.textContent = `${count} vote${count === 1 ? "" : "s"} (${percent}%)`;

    copy.appendChild(text);
    copy.appendChild(result);
    label.appendChild(copy);
    pollOptionsEl.appendChild(label);
  });

  if (!subscriber) {
    submitPollVoteBtn.disabled = true;
    pollStatusEl.textContent = `Total votes: ${totalVotes} | Subscribers can vote on this question.`;
    return;
  }

  submitPollVoteBtn.disabled = false;
  if (bookState.selected === null) {
    pollStatusEl.textContent = `Total votes: ${totalVotes}`;
    return;
  }

  pollStatusEl.textContent = `Your vote: ${poll.options[bookState.selected]} | Total votes: ${totalVotes}`;
}

function handlePollSubmit() {
  const pollKey = getCurrentPollKey();
  const poll = getPollData();
  if (!poll || !pollStatusEl) return;

  if (!subscriber) {
    pollStatusEl.textContent = "Subscribers only: upgrade to vote on this question.";
    return;
  }

  const selectedIndex = getCheckedPollIndex();
  if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= poll.options.length) {
    pollStatusEl.textContent = "Select one answer before submitting your vote.";
    return;
  }

  const bookState = ensurePollBookState(pollKey, poll.options.length);
  if (Number.isInteger(bookState.selected) && bookState.selected >= 0 && bookState.selected < bookState.counts.length) {
    if (bookState.counts[bookState.selected] > 0) {
      bookState.counts[bookState.selected] -= 1;
    }
  }

  bookState.selected = selectedIndex;
  bookState.counts[selectedIndex] += 1;
  savePollVoteState();
  renderPoll();
}

async function ensureChapterRow(bookId, chapterNum = 1) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  // Try to find existing chapter row
  let { data, error } = await supabase
    .from("Chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("chapter_num", chapterNum)
    .maybeSingle();

  if (error) {
    console.error("ensureChapterRow select error:", error);
    return null;
  }

  // If missing, create it
  if (!data) {
    const insertRes = await supabase
      .from("Chapters")
      .insert({ book_id: bookId, chapter_num: chapterNum, free: true })
      .select("id")
      .single();

    if (insertRes.error) {
      console.error("ensureChapterRow insert error:", insertRes.error);
      return null;
    }
    data = insertRes.data;
  }

  return data.id;
}
async function renderComments() {
  if (!commentsList || !noComments) return;

  setCommentHeader();
  noComments.classList.add("hidden");
  commentsError?.classList.add("hidden");
  renderCommentSkeleton();

  const chapterId = getCurrentChapterId();
  if (!chapterId) {
    commentsList.classList.remove("is-loading");
    commentsList.innerHTML = "";
    noComments.classList.remove("hidden");
    return;
  }

  const result = await getCommentsByChapter(chapterId);
  commentsList.classList.remove("is-loading");

  if (!result.ok) {
    commentsList.innerHTML = "";
    if (commentsError) {
      commentsError.textContent = "Comments could not be loaded. Tap refresh to try again.";
      commentsError.classList.remove("hidden");
    }
    return;
  }

  if (!result.data?.length) {
    commentsList.innerHTML = "";
    noComments.classList.remove("hidden");
    return;
  }
  noComments.classList.add("hidden");
  commentsList.innerHTML = "";

  const selected = filterComments?.value || "desc";
  const rows = [...result.data];

  // Sort by created_at
  rows.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return selected === "asc" ? ta - tb : tb - ta;
  });

  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "comment-card";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const who = formatCommentAuthor(row);
    const when = formatCommentTimestamp(row.created_at);
    meta.textContent = `${who} | ${when}`;
    card.appendChild(meta);

    const body = document.createElement("p");
    body.className = "comment-text";
    body.textContent = row.message; // ✅ XSS-safe
    card.appendChild(body);

    commentsList.appendChild(card);
  });
}

function updateCommentUIAccess() {
  if (subscriber) {
    newCommentArea?.classList.remove("hidden");
    subscriberNotice?.classList.add("hidden");
  } else {
    newCommentArea?.classList.add("hidden");
    subscriberNotice?.classList.remove("hidden");
  }
}

function ensureSectionStore() {
  if (!commentStore[currentUrl]) commentStore[currentUrl] = [];
  return commentStore[currentUrl];
}

function appendComment(text) {
  const section = ensureSectionStore();
  section.push({
    author: "You",
    date: nowDateTime(),
    text,
    replies: [],
  });
  renderComments();
}

function appendReply(commentIndex, text) {
  const section = ensureSectionStore();
  if (!section[commentIndex]) return;
  if (!section[commentIndex].replies) section[commentIndex].replies = [];
  section[commentIndex].replies.push({
    author: "You",
    date: nowDateTime(),
    text,
  });
  renderComments();
}

function nowDateTime() {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function toTime(dateString) {
  if (!dateString) return 0;
  // Ensure ISO format for reliable parsing across browsers
  const normalized = dateString.includes("T")
    ? dateString
    : dateString.replace(" ", "T");
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? 0 : t;
}

function attachEventHandlers() {
  document.getElementById("nextPage")?.addEventListener("click", goToNextPage);
  document.getElementById("prevPage")?.addEventListener("click", goToPreviousPage);

  canvasRight?.addEventListener("click", () => {
    if (!isSinglePageMode) {
      goToNextPage();
    }
  });

  canvasLeft?.addEventListener("click", (event) => {
    if (!pdfDoc) return;

    if (!isSinglePageMode) {
      goToPreviousPage();
      return;
    }

    const rect = canvasLeft.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const nextThreshold = rect.width * 0.55;
    const prevThreshold = rect.width * 0.45;

    if (clickX >= nextThreshold) {
      goToNextPage();
      return;
    }

    if (clickX <= prevThreshold) {
      goToPreviousPage();
    }
  });

  const handleTouchStart = (event) => {
    touchStartX = event.changedTouches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX === null) return;
    const touchEndX = event.changedTouches?.[0]?.clientX;
    if (typeof touchEndX !== "number") return;

    const deltaX = touchEndX - touchStartX;
    touchStartX = null;

    if (Math.abs(deltaX) < 36) return;
    if (deltaX < 0) {
      goToNextPage();
      return;
    }
    goToPreviousPage();
  };

  canvasLeft?.addEventListener("touchstart", handleTouchStart, { passive: true });
  canvasLeft?.addEventListener("touchend", handleTouchEnd, { passive: true });
  canvasRight?.addEventListener("touchstart", handleTouchStart, { passive: true });
  canvasRight?.addEventListener("touchend", handleTouchEnd, { passive: true });

  // Book selector change
  bookSelect?.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "locked") {
      window.location.href = "../index.html";
      return;
    }
    currentUrl = val;
    syncCurrentSelectionMeta();
    renderPoll();
    renderComments();
    loadDocument(val);
  });

  submitPollVoteBtn?.addEventListener("click", handlePollSubmit);
  refreshCommentsBtn?.addEventListener("click", renderComments);
  doublePageViewBtn?.addEventListener("click", () => {
    setPreferredViewMode("double");
  });
  singlePageViewBtn?.addEventListener("click", () => {
    setPreferredViewMode("single");
  });
  jumpToDiscussionBtn?.addEventListener("click", () => {
    commentsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

submitComment?.addEventListener("click", async () => {
  // Not logged in
  if (!currentUserId) {
    alert("Please log in to view comments.");
    return;
  }

  // Logged in but not subscribed
  if (!subscriber) {
    alert("You must be subscribed to comment.");
    return;
  }

  const text = newCommentText.value.trim();
  if (!text) return;

  const chapterId = getCurrentChapterId();
  if (!chapterId) {
    alert("No chapter is selected for comments yet.");
    return;
  }

  const res = await submitCommentToDB({
    chapterId,
    message: text,
    parentCommentId: null,
  });

  if (!res.ok) {
    const msg = (res.message || "").toLowerCase();
    if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("policy")) {
      alert("You must be subscribed to comment.");
    } else {
      alert(res.message || "Failed to post comment.");
    }
    return;
  }

  newCommentText.value = "";
  await renderComments();
});
  filterComments?.addEventListener("change", renderComments);

  if (!resizeListenerAttached) {
    window.addEventListener("resize", () => {
      const previousMode = isSinglePageMode;
      syncReaderLayoutMode();
      if (pdfDoc && previousMode !== isSinglePageMode) {
        renderPages();
      }
    });
    resizeListenerAttached = true;
  }
}

export async function initBookReader() {
  if (!cacheDom()) return;
  syncReaderLayoutMode();

  await refreshAuthState();
  await loadBookOptionsFromBackend();

  // Default to the first option if available
  currentUrl = bookSelect?.value || currentUrl;
  syncCurrentSelectionMeta();

  if (!getCurrentChapterId()) {
    currentChapterRowId = await ensureChapterRow(currentBookId, currentChapterNum);
  }

  if (!listenersAttached) {
    attachEventHandlers();
    listenersAttached = true;
  }

  renderPoll();
  updateCommentUIAccess();
  await renderComments();     // optional but cleaner

  try {
    await ensurePdfJs();
    loadDocument(currentUrl);
  } catch (error) {
    console.warn("PDF.js failed to initialize. Comments remain available.", error);
    pageInfo.textContent = "Reader unavailable";
    setReaderErrorMessage("Reader is currently unavailable on this device. Please try again later.");
  }
}
