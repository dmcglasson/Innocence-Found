import { submitComment as submitCommentToDB, getCommentsByChapter } from "./comments.js";
import { getSupabaseClient } from "./supabase.js";
import { fetchBookReaderEntries } from "./chapters.js";
import { getAuthorQuestionByChapter, submitAuthorQuestionVote } from "./author_question.js";
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
let cachedComments = null;

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
let chapterLoadNotice;
let jumpToDiscussionBtn;
let bookFrame;
let commentsPanel;
let doublePageViewBtn;
let singlePageViewBtn;
let listenersAttached = false;
let lastBoundCanvasLeft = null;
let resizeListenerAttached = false;
let touchStartX = null;
let pendingRenderFrame = null;
let activeLeftRenderTask = null;
let activeRightRenderTask = null;
let renderCycleId = 0;
const POLL_STORAGE_KEY = "bookreaderViewPollVotes.v1";
let currentPollData = null;
let pollLoadState = "idle";
let pollLoadMessage = "";
let pollRequestId = 0;

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
  scheduleRenderPages(previousMode !== isSinglePageMode);
}

function setReaderErrorMessage(message = "") {
  if (!readerError) return;
  readerError.textContent = message;
  readerError.classList.toggle("hidden", !message);
}

function setChapterLoadNotice(message = "") {
  if (!chapterLoadNotice) return;
  chapterLoadNotice.textContent = message;
  chapterLoadNotice.classList.toggle("hidden", !message);
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
  chapterLoadNotice = document.getElementById("chapterLoadNotice");
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
    setChapterLoadNotice("Chapter list could not be loaded. Using fallback chapters where available.");
    return;
  }

  setChapterLoadNotice("");

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
    setChapterLoadNotice("No chapters are available right now.");
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
      scheduleRenderPages(true);
    })
    .catch((err) => {
      console.error("Failed to load document", err);
      pageInfo.textContent = "Failed to load book";
      setReaderErrorMessage("We could not load this chapter right now. Please try again.");
    });
}

function cancelRenderTask(task) {
  if (!task || typeof task.cancel !== "function") return;
  try {
    task.cancel();
  } catch {
    // Ignore cancellation failures; a newer render will replace this frame.
  }
}

function clearPendingRenderFrame() {
  if (pendingRenderFrame == null) return;
  cancelAnimationFrame(pendingRenderFrame);
  pendingRenderFrame = null;
}

function cancelActiveRenderTasks() {
  cancelRenderTask(activeLeftRenderTask);
  cancelRenderTask(activeRightRenderTask);
  activeLeftRenderTask = null;
  activeRightRenderTask = null;
}

function scheduleRenderPages(waitForLayout = false) {
  clearPendingRenderFrame();
  const framesToWait = waitForLayout ? 2 : 1;

  const run = (framesRemaining) => {
    pendingRenderFrame = requestAnimationFrame(() => {
      if (framesRemaining > 1) {
        run(framesRemaining - 1);
        return;
      }

      pendingRenderFrame = null;
      renderPages();
    });
  };

  run(framesToWait);
}

function renderPage(pageNum, canvas, ctx, cycleId) {
  return pdfDoc.getPage(pageNum).then((page) => {
    if (cycleId !== renderCycleId) return;

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
      const containerRect = container?.getBoundingClientRect?.();
      const rawWidth = containerRect?.width || container?.clientWidth || canvas.clientWidth || baseViewport.width;
      const rawHeight =
        containerRect?.height || container?.clientHeight || canvas.clientHeight || baseViewport.height;
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

    const renderTask = page.render(renderContext);
    if (canvas === canvasLeft) {
      activeLeftRenderTask = renderTask;
    } else if (canvas === canvasRight) {
      activeRightRenderTask = renderTask;
    }

    return renderTask.promise
      .catch((error) => {
        if (error?.name === "RenderingCancelledException") {
          return;
        }
        throw error;
      })
      .finally(() => {
        if (canvas === canvasLeft && activeLeftRenderTask === renderTask) {
          activeLeftRenderTask = null;
        } else if (canvas === canvasRight && activeRightRenderTask === renderTask) {
          activeRightRenderTask = null;
        }
      });
  });
}

function renderPages() {
  if (!pdfDoc) return;
  clearPendingRenderFrame();
  cancelActiveRenderTasks();
  renderCycleId += 1;
  const cycleId = renderCycleId;
  normalizeCurrentPageForLayout();

  canvasLeft.style.opacity = "0";
  canvasRight.style.opacity = "0";

  const tasks = [renderPage(currentPage, canvasLeft, ctxLeft, cycleId)];

  let rightRender = Promise.resolve();
  if (!isSinglePageMode && currentPage + 1 <= pdfDoc.numPages) {
    rightRender = renderPage(currentPage + 1, canvasRight, ctxRight, cycleId);
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
    if (cycleId !== renderCycleId) return;
    requestAnimationFrame(() => {
      if (cycleId !== renderCycleId) return;
      canvasLeft.style.opacity = "1";
      canvasRight.style.opacity = isSinglePageMode ? "0" : "1";
    });
    renderComments();
  }).catch((error) => {
    if (error?.name === "RenderingCancelledException") return;
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

function getPollData() {
  return currentPollData;
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

function savePollVoteState(state) {
  try {
    localStorage.setItem(POLL_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save poll votes:", error);
  }
}

function getPollStateKeyForQuestion(questionId) {
  const safeQuestionId = Number(questionId);
  const scope = currentUserId ? `user-${currentUserId}` : "guest";
  return Number.isInteger(safeQuestionId) && safeQuestionId > 0
    ? `author-question-${safeQuestionId}-${scope}`
    : `${currentUrl}-${scope}`;
}

function getSavedPollSelection(questionId, optionCount) {
  const state = loadPollVoteState();
  const key = getPollStateKeyForQuestion(questionId);
  const selected = Number(state[key]);
  return Number.isInteger(selected) && selected >= 0 && selected < optionCount ? selected : null;
}

function savePollSelection(questionId, selectedIndex) {
  const state = loadPollVoteState();
  const key = getPollStateKeyForQuestion(questionId);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
    delete state[key];
  } else {
    state[key] = selectedIndex;
  }
  savePollVoteState(state);
}

async function loadPoll() {
  pollRequestId += 1;
  const requestId = pollRequestId;
  const chapterId = getCurrentChapterId();

  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    currentPollData = null;
    pollLoadState = "empty";
    pollLoadMessage = "";
    renderPoll();
    return;
  }

  pollLoadState = "loading";
  pollLoadMessage = "";
  currentPollData = null;
  renderPoll();

  const result = await getAuthorQuestionByChapter(chapterId);
  if (requestId !== pollRequestId) return;

  if (!result.ok) {
    currentPollData = null;
    pollLoadState = "error";
    pollLoadMessage = result.message || "Author question could not be loaded right now.";
    renderPoll();
    return;
  }

  if (result.data) {
    const savedSelection = getSavedPollSelection(result.data.id, result.data.options.length);
    currentPollData = {
      ...result.data,
      selectedOption: savedSelection,
    };
  } else {
    currentPollData = null;
  }
  pollLoadState = result.data ? "ready" : "empty";
  pollLoadMessage = "";
  renderPoll();
}

function getPollVoteCounts(poll) {
  const optionCount = Array.isArray(poll?.options) ? poll.options.length : 0;
  return Array.from({ length: optionCount }, (_, index) => {
    const raw = Array.isArray(poll?.voteCounts) ? poll.voteCounts[index] : 0;
    return Math.max(0, Number(raw) || 0);
  });
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

  const poll = getPollData();
  if (pollLoadState === "loading") {
    pollTitleEl.textContent = "Author Question";
    pollQuestionEl.textContent = "Loading author question...";
    pollOptionsEl.innerHTML = '<div class="poll-empty-state">Checking whether this chapter has an author question.</div>';
    pollStatusEl.textContent = "Loading...";
    submitPollVoteBtn.classList.add("hidden");
    submitPollVoteBtn.disabled = true;
    return;
  }

  if (pollLoadState === "error") {
    pollTitleEl.textContent = "Author Question";
    pollQuestionEl.textContent = "The author question could not be loaded.";
    pollOptionsEl.innerHTML = '<div class="poll-empty-state">Please try again later or switch chapters and come back.</div>';
    pollStatusEl.textContent = pollLoadMessage || "Author question unavailable.";
    submitPollVoteBtn.classList.add("hidden");
    submitPollVoteBtn.disabled = true;
    return;
  }

  if (!poll) {
    pollTitleEl.textContent = "Author Question";
    pollQuestionEl.textContent = "This chapter does not have an author question.";
    pollOptionsEl.innerHTML = '<div class="poll-empty-state">The author has not added a question for this chapter yet.</div>';
    pollStatusEl.textContent = "No voting is available for this chapter.";
    submitPollVoteBtn.classList.add("hidden");
    submitPollVoteBtn.disabled = true;
    return;
  }

  submitPollVoteBtn.classList.remove("hidden");
  submitPollVoteBtn.disabled = false;
  pollTitleEl.textContent = poll.title || "Author Question";
  pollQuestionEl.textContent = poll.question;

  const voteCounts = getPollVoteCounts(poll);
  const totalVotes = voteCounts.reduce((sum, count) => sum + count, 0);
  const selectedOption =
    Number.isInteger(poll.selectedOption) && poll.selectedOption >= 0 && poll.selectedOption < poll.options.length
      ? poll.selectedOption
      : null;

  pollOptionsEl.innerHTML = "";
  poll.options.forEach((optionText, index) => {
    const count = voteCounts[index] || 0;
    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

    const label = document.createElement("label");
    label.className = "poll-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "bookPollOption";
    input.value = String(index);
    input.checked = selectedOption === index;
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
    submitPollVoteBtn.disabled = false;
    pollStatusEl.textContent = `Total votes: ${totalVotes} | Select an answer, then subscribe to submit your vote.`;
    return;
  }

  submitPollVoteBtn.disabled = false;
  if (selectedOption === null) {
    pollStatusEl.textContent = `Total votes: ${totalVotes}`;
    return;
  }

  pollStatusEl.textContent = `Your vote: ${poll.options[selectedOption]} | Total votes: ${totalVotes}`;
}

async function handlePollSubmit() {
  const poll = getPollData();
  if (!poll || !pollStatusEl) return;

  if (!currentUserId) {
    pollStatusEl.textContent = "Please log in to submit a vote.";
    return;
  }

  if (!subscriber) {
    pollStatusEl.textContent = "Subscribers only: your selection is visible, but you need a subscription to submit a vote.";
    return;
  }

  const selectedIndex = getCheckedPollIndex();
  if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= poll.options.length) {
    pollStatusEl.textContent = "Select one answer before submitting your vote.";
    return;
  }

  const questionId = Number(poll.id);
  if (!Number.isInteger(questionId) || questionId <= 0) {
    pollStatusEl.textContent = "This author question is missing a database id.";
    return;
  }

  const previousSelectedIndex = getSavedPollSelection(questionId, poll.options.length);
  submitPollVoteBtn.disabled = true;
  pollStatusEl.textContent = "Submitting your vote...";

  const result = await submitAuthorQuestionVote({
    questionId,
    selectedOptionIndex: selectedIndex,
    previousSelectedIndex,
  });

  if (!result.ok) {
    submitPollVoteBtn.disabled = false;
    pollStatusEl.textContent = result.message || "Vote submission failed.";
    return;
  }

  savePollSelection(questionId, selectedIndex);
  currentPollData = result.data;
  renderPoll();
}

async function renderComments(forceRefresh = true) {
  if (!commentsList || !noComments) return;

  setCommentHeader();
  noComments.classList.add("hidden");
  commentsError?.classList.add("hidden");

  if (forceRefresh) {
    renderCommentSkeleton();
    const chapterId = getCurrentChapterId();
    if (!chapterId) {
      commentsList.classList.remove("is-loading");
      commentsList.innerHTML = "";
      if (commentsError) {
        commentsError.textContent = "Comments are unavailable because this chapter could not be identified.";
        commentsError.classList.remove("hidden");
      }
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
    cachedComments = result.data ?? [];
  }

  if (!cachedComments?.length) {
    commentsList.innerHTML = "";
    noComments.classList.remove("hidden");
    return;
  }

  noComments.classList.add("hidden");
  commentsList.innerHTML = "";

  const selected = filterComments?.value || "desc";
  const roots = buildTree(cachedComments);

  roots.sort((a, b) => {
    if (selected === "popular") {
      return (b.children?.length || 0) - (a.children?.length || 0);
    }
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return selected === "asc" ? ta - tb : tb - ta;
  });

  roots.forEach((node) => {
    commentsList.appendChild(buildCommentCard(node, 0));
  });
}

function buildTree(comments) {
  const map = {};
  const roots = [];
  comments.forEach((c) => { map[c.id] = { ...c, children: [] }; });
  comments.forEach((c) => {
    if (c.comment_id && map[c.comment_id]) {
      map[c.comment_id].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  Object.values(map).forEach((node) => {
    node.children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  });
  return roots;
}

const MAX_DEPTH = 3;

function buildCommentCard(node, depth) {
  const card = document.createElement("article");
  card.className = "comment-card";
  if (depth > 0) card.dataset.depth = depth;

  const meta = document.createElement("div");
  meta.className = "comment-meta";
  meta.textContent = `${formatCommentAuthor(node)} | ${formatCommentTimestamp(node.created_at)}`;
  card.appendChild(meta);

  const body = document.createElement("p");
  body.className = "comment-text";
  body.textContent = node.message;
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "comment-actions";

  if (subscriber) {
    const replyBtn = document.createElement("button");
    replyBtn.className = "reply-btn";
    replyBtn.textContent = node.children?.length ? `↩ Reply (${node.children.length})` : "↩ Reply";
    replyBtn.addEventListener("click", () => {
      const existing = card.querySelector(":scope > .reply-form");
      if (existing) { existing.remove(); return; }
      const form = buildReplyForm(node.id);
      card.appendChild(form);
      form.querySelector("textarea").focus();
    });
    actions.appendChild(replyBtn);
  } else if (node.children?.length > 0) {
    const countLabel = document.createElement("span");
    countLabel.className = "reply-count-label";
    countLabel.textContent = `${node.children.length} ${node.children.length === 1 ? "reply" : "replies"}`;
    actions.appendChild(countLabel);
  }

  card.appendChild(actions);

  if (node.children?.length > 0) {
    const repliesEl = document.createElement("div");
    repliesEl.className = "replies";
    const nextDepth = depth + 1;

    if (depth >= MAX_DEPTH) {
      const continueBtn = document.createElement("button");
      continueBtn.className = "continue-thread-btn";
      continueBtn.textContent = "↪ Continue this thread";
      continueBtn.addEventListener("click", () => {
        continueBtn.remove();
        const threadContainer = document.createElement("div");
        threadContainer.className = "continued-thread";
        node.children.forEach((child) => {
          threadContainer.appendChild(buildCommentCard(child, 0));
        });
        repliesEl.appendChild(threadContainer);
      });
      repliesEl.appendChild(continueBtn);
    } else {
      const SHOW_INITIAL = 5;
      const visible = node.children.slice(0, SHOW_INITIAL);
      const hidden = node.children.slice(SHOW_INITIAL);

      visible.forEach((child) => {
        repliesEl.appendChild(buildCommentCard(child, nextDepth));
      });

      if (hidden.length > 0) {
        const showMoreBtn = document.createElement("button");
        showMoreBtn.className = "show-more-replies-btn";
        showMoreBtn.textContent = `Show ${hidden.length} more ${hidden.length === 1 ? "reply" : "replies"}`;
        showMoreBtn.addEventListener("click", () => {
          hidden.forEach((child) => {
            repliesEl.insertBefore(buildCommentCard(child, nextDepth), showMoreBtn);
          });
          showMoreBtn.remove();
        });
        repliesEl.appendChild(showMoreBtn);
      }
    }

    card.appendChild(repliesEl);
  }
  
  return card;
}
function buildReplyForm(parentId) {
  const form = document.createElement("div");
  form.className = "reply-form";

  const ta = document.createElement("textarea");
  ta.placeholder = "Write a reply…";
  ta.rows = 2;

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = "Post reply";

  submitBtn.addEventListener("click", async () => {
    const text = ta.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting…";
    const chapterId = getCurrentChapterId();
    const res = await submitCommentToDB({ chapterId, message: text, parentCommentId: parentId });
    if (!res.ok) {
      alert(res.message || "Failed to post reply.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Post reply";
      return;
    }
    await renderComments(true);
  });

  form.appendChild(ta);
  form.appendChild(submitBtn);
  return form;
}

function buildRepliesSection(commentId, replies) {
  const pageIdx = replyPageState.get(commentId) || 0;
  const totalPages = Math.ceil(replies.length / REPLIES_PER_PAGE);
  const pageReplies = replies.slice(pageIdx * REPLIES_PER_PAGE, (pageIdx + 1) * REPLIES_PER_PAGE);

  const container = document.createElement("div");
  container.className = "replies";

  pageReplies.forEach((reply) => {
    const r = document.createElement("div");
    r.className = "reply";

    const rMeta = document.createElement("div");
    rMeta.className = "comment-meta";
    rMeta.textContent = `${formatCommentAuthor(reply)} | ${formatCommentTimestamp(reply.created_at)}`;

    const rBody = document.createElement("p");
    rBody.className = "comment-text";
    rBody.textContent = reply.message;

    r.appendChild(rMeta);
    r.appendChild(rBody);
    container.appendChild(r);
  });

  if (totalPages > 1) {
    const pagination = document.createElement("div");
    pagination.className = "reply-pagination";

    if (pageIdx > 0) {
      const prev = document.createElement("button");
      prev.className = "reply-page-btn";
      prev.textContent = "← Prev";
      prev.addEventListener("click", () => {
        replyPageState.set(commentId, pageIdx - 1);
        renderComments(false);
      });
      pagination.appendChild(prev);
    }

    const pageLabel = document.createElement("span");
    pageLabel.textContent = `${pageIdx + 1} / ${totalPages}`;
    pagination.appendChild(pageLabel);

    if (pageIdx < totalPages - 1) {
      const next = document.createElement("button");
      next.className = "reply-page-btn";
      next.textContent = "Next →";
      next.addEventListener("click", () => {
        replyPageState.set(commentId, pageIdx + 1);
        renderComments(false);
      });
      pagination.appendChild(next);
    }

    container.appendChild(pagination);
  }

  return container;
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
    loadPoll();
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
      if (pdfDoc && (previousMode !== isSinglePageMode || isSinglePageMode)) {
        scheduleRenderPages(previousMode !== isSinglePageMode);
      }
    });
    resizeListenerAttached = true;
  }
}

export async function initBookReader() {
  if (!cacheDom()) return;
  // Reset module-level state so each initialization is deterministic.
  pdfDoc = null;
  currentPage = 1;
  currentUserId = null;
  currentBookId = 1;
  currentChapterRowId = null;
  currentChapterNum = 1;
  currentPollData = null;
  pollLoadState = "idle";
  pollLoadMessage = "";
  chapterMetaByUrl.clear();

  syncReaderLayoutMode();

  await refreshAuthState();
  await loadBookOptionsFromBackend();

  // Default to the first option if available
  currentUrl = bookSelect?.value || currentUrl;
  syncCurrentSelectionMeta();

  if (!getCurrentChapterId()) {
    currentChapterRowId = null;
    if (!chapterLoadNotice?.textContent) {
      setChapterLoadNotice("Chapter metadata is unavailable for the current selection.");
    }
  }

  if (!listenersAttached) {
    attachEventHandlers();
    listenersAttached = true;
  }

  await loadPoll();
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
