// === PDF.js Book Viewer (SPA-friendly) ===
const PDF_JS_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js";
const PDF_JS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js";

let pdfjsLib = null;
let pdfDoc = null;
let currentPage = 1;
let currentUrl = "../book reader/books/book1.pdf";
const subscriber = true; // toggle: true = can post/reply, false = read-only

let canvasLeft;
let canvasRight;
let ctxLeft;
let ctxRight;
let pageInfo;
let bookSelect;
let commentsTitle;
let commentsMeta;
let commentsList;
let noComments;
let refreshCommentsBtn;
let filterComments;
let newCommentArea;
let newCommentText;
let submitComment;
let subscriberNotice;
let listenersAttached = false;
let lastBoundCanvasLeft = null;

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

function cacheDom() {
  canvasLeft = document.getElementById("leftPage");
  canvasRight = document.getElementById("rightPage");
  pageInfo = document.getElementById("pageInfo");
  bookSelect = document.getElementById("bookSelect");
  commentsTitle = document.getElementById("commentsTitle");
  commentsMeta = document.getElementById("commentsMeta");
  commentsList = document.getElementById("commentsList");
  noComments = document.getElementById("noComments");
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
  return true;
}

function loadDocument(url) {
  if (!pdfjsLib) return;
  canvasLeft.style.opacity = "0";
  canvasRight.style.opacity = "0";
  pageInfo.textContent = "Loading...";

  pdfjsLib
    .getDocument(url)
    .promise.then((pdf) => {
      pdfDoc = pdf;
      currentPage = 1;
      currentUrl = url;
      renderPages();
    })
    .catch((err) => {
      console.error("Failed to load document", err);
      pageInfo.textContent = "Failed to load book";
    });
}

function renderPage(pageNum, canvas, ctx) {
  return pdfDoc.getPage(pageNum).then((page) => {
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };
    return page.render(renderContext).promise;
  });
}

function renderPages() {
  if (!pdfDoc) return;

  canvasLeft.style.opacity = "0";
  canvasRight.style.opacity = "0";

  const tasks = [renderPage(currentPage, canvasLeft, ctxLeft)];

  let rightRender = Promise.resolve();
  if (currentPage + 1 <= pdfDoc.numPages) {
    rightRender = renderPage(currentPage + 1, canvasRight, ctxRight);
    pageInfo.textContent = `Page ${currentPage}-${currentPage + 1}`;
  } else {
    ctxRight.clearRect(0, 0, canvasRight.width, canvasRight.height);
    pageInfo.textContent = `Page ${currentPage}`;
  }

  tasks.push(rightRender);

  Promise.all(tasks).then(() => {
    requestAnimationFrame(() => {
      canvasLeft.style.opacity = "1";
      canvasRight.style.opacity = "1";
    });
    renderComments();
  });
}

function setCommentHeader() {
  if (!commentsTitle || !commentsMeta) return;
  const label = bookSelect.options[bookSelect.selectedIndex].text.replace(
    /\s*\(PDF\)/i,
    ""
  );
  commentsTitle.textContent = `${label} - Section`;
  commentsMeta.textContent = `All pages`;
}

function renderComments() {
  if (!commentsList || !noComments) return;
  setCommentHeader();
  commentsList.innerHTML = "";
  const section = ensureSectionStore();
  const entries = section.map((entry, index) => ({ entry, index }));

  const selected = filterComments?.value || "desc";
  entries.sort((a, b) => {
    const aEntry = a.entry;
    const bEntry = b.entry;
    if (selected === "asc") {
      return toTime(aEntry.date) - toTime(bEntry.date);
    }
    if (selected === "popular") {
      const countA = Array.isArray(aEntry.replies) ? aEntry.replies.length : 0;
      const countB = Array.isArray(bEntry.replies) ? bEntry.replies.length : 0;
      if (countB !== countA) return countB - countA;
      return toTime(bEntry.date) - toTime(aEntry.date);
    }
    // default newest first
    return toTime(bEntry.date) - toTime(aEntry.date);
  });
  if (!entries.length) {
    noComments.classList.remove("hidden");
    return;
  }
  noComments.classList.add("hidden");

  entries.forEach(({ entry, index }) => {
    const { author, date, text, replies = [] } = entry;
    const card = document.createElement("article");
    card.className = "comment-card";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.textContent = `${author} - ${date}`;
    card.appendChild(meta);

    const body = document.createElement("p");
    body.className = "comment-text";
    body.textContent = text;
    card.appendChild(body);

    if (subscriber) {
      const actions = document.createElement("div");
      actions.className = "comment-actions";
      const replyBtn = document.createElement("button");
      replyBtn.className = "reply-btn";
      replyBtn.textContent = "Reply";
      actions.appendChild(replyBtn);
      card.appendChild(actions);

      const replyForm = document.createElement("div");
      replyForm.className = "reply-form hidden";
      const replyInput = document.createElement("textarea");
      replyInput.rows = 2;
      replyInput.placeholder = "Write a reply...";
      const replySubmit = document.createElement("button");
      replySubmit.type = "button";
      replySubmit.textContent = "Post reply";
      replyForm.appendChild(replyInput);
      replyForm.appendChild(replySubmit);
      card.appendChild(replyForm);

      replyBtn.addEventListener("click", () => {
        replyForm.classList.toggle("hidden");
        if (!replyForm.classList.contains("hidden")) {
          replyInput.focus();
        }
      });

      replySubmit.addEventListener("click", () => {
        const value = replyInput.value.trim();
        if (!value) return;
        appendReply(index, value);
      });
    }

    if (replies.length) {
      const repliesWrap = document.createElement("div");
      repliesWrap.className = "replies";
      replies.forEach((reply) => {
        const r = document.createElement("div");
        r.className = "reply";
        const rMeta = document.createElement("div");
        rMeta.className = "comment-meta";
        rMeta.textContent = `${reply.author} - ${reply.date}`;
        const rText = document.createElement("p");
        rText.className = "comment-text";
        rText.textContent = reply.text;
        r.appendChild(rMeta);
        r.appendChild(rText);
        repliesWrap.appendChild(r);
      });
      card.appendChild(repliesWrap);
    }

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
  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (pdfDoc && currentPage + 2 <= pdfDoc.numPages) {
      currentPage += 2;
      renderPages();
    }
  });

  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (pdfDoc && currentPage - 2 >= 1) {
      currentPage -= 2;
      renderPages();
    }
  });

  canvasRight?.addEventListener("click", () => {
    if (pdfDoc && currentPage + 2 <= pdfDoc.numPages) {
      currentPage += 2;
      renderPages();
    }
  });

  canvasLeft?.addEventListener("click", () => {
    if (pdfDoc && currentPage - 2 >= 1) {
      currentPage -= 2;
      renderPages();
    }
  });

  // Book selector change
  bookSelect?.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "locked") {
      window.location.href = "../index.html";
      return;
    }
    loadDocument(val);
  });

  refreshCommentsBtn?.addEventListener("click", renderComments);

  submitComment?.addEventListener("click", () => {
    if (!subscriber) return;
    const text = newCommentText.value.trim();
    if (!text) return;
    appendComment(text);
    newCommentText.value = "";
  });

  filterComments?.addEventListener("change", renderComments);
}

export async function initBookReader() {
  if (!cacheDom()) return;

  // Default to the first option if available
  currentUrl = bookSelect?.value || currentUrl;

  if (!listenersAttached) {
    attachEventHandlers();
    listenersAttached = true;
  }
  updateCommentUIAccess();
  renderComments();

  try {
    await ensurePdfJs();
    loadDocument(currentUrl);
  } catch (error) {
    console.warn("PDF.js failed to initialize. Comments remain available.", error);
    pageInfo.textContent = "Reader unavailable";
  }
}
