/** @jest-environment jsdom */

import { jest } from "@jest/globals";

const BOOK_ONE = "https://cdn.example.com/book-1-ch-1.pdf";
const BOOK_TWO = "https://cdn.example.com/book-2-ch-1.pdf";

const submitCommentMock = jest.fn();
const getCommentsByChapterMock = jest.fn();
const fetchBookReaderEntriesMock = jest.fn();
const getSubscriberStatusMock = jest.fn();
const getSupabaseClientMock = jest.fn();

jest.unstable_mockModule("../js/modules/comments.js", () => ({
  submitComment: submitCommentMock,
  getCommentsByChapter: getCommentsByChapterMock,
}));

jest.unstable_mockModule("../js/modules/chapters.js", () => ({
  fetchBookReaderEntries: fetchBookReaderEntriesMock,
}));

jest.unstable_mockModule("../js/modules/auth.js", () => ({
  getSubscriberStatus: getSubscriberStatusMock,
}));

jest.unstable_mockModule("../js/modules/supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

const { initBookReader } = await import("../js/modules/bookreader.js");

function buildBookReaderDom() {
  document.body.innerHTML = `
    <main class="background-area">
      <div class="book-container">
        <div class="book-selector">
          <select id="bookSelect">
            <option value="${BOOK_ONE}">Book 1 (PDF)</option>
            <option value="${BOOK_TWO}">Book 2 (PDF)</option>
            <option value="locked">Locked Chapter</option>
          </select>
        </div>

        <div class="reader-view-controls">
          <button id="doublePageViewBtn" type="button">Double page</button>
          <button id="singlePageViewBtn" type="button">Single page</button>
        </div>

        <section class="reader-shell">
          <p id="readerError" class="hidden"></p>
          <div class="book" id="bookFrame">
            <div class="page left-page"><canvas id="leftPage"></canvas></div>
            <div class="page right-page"><canvas id="rightPage"></canvas></div>
          </div>
        </section>

        <div class="controls">
          <button id="prevPage">Previous</button>
          <span id="pageInfo">Page 1-2</span>
          <button id="nextPage">Next</button>
          <button id="jumpToDiscussion" type="button">Jump</button>
        </div>

        <section class="poll-panel">
          <h3 id="pollTitle">Reader Poll</h3>
          <p id="pollQuestion"></p>
          <fieldset id="pollOptions"></fieldset>
          <button id="submitPollVote" type="button">Submit vote</button>
          <p id="pollStatus"></p>
        </section>

        <section class="comments-panel">
          <h3 id="commentsTitle">Book 1 - Section</h3>
          <p id="commentsMeta">All pages</p>
          <select id="filterComments">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
            <option value="popular">Most replies</option>
          </select>
          <button id="refreshComments" type="button">Refresh</button>
          <div id="commentsList"></div>
          <div id="commentsError" class="hidden"></div>
          <div id="noComments" class="hidden"></div>
          <div id="subscriberNotice" class="hidden"></div>
          <div id="newCommentArea">
            <textarea id="newCommentText"></textarea>
            <button id="submitComment" type="button">Post comment</button>
          </div>
        </section>
      </div>
    </main>
  `;
}

function mockPdfJs() {
  const existingScript = document.createElement("script");
  existingScript.id = "pdfjs-cdn";
  existingScript._loadingPromise = Promise.resolve();
  document.head.appendChild(existingScript);

  const render = jest.fn(() => ({ promise: Promise.resolve() }));
  const getPage = jest.fn(() =>
    Promise.resolve({
      getViewport: ({ scale = 1 } = {}) => ({
        width: 600 * scale,
        height: 900 * scale,
      }),
      render,
    })
  );

  window.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: jest.fn(() => ({
      promise: Promise.resolve({
        numPages: 6,
        getPage,
      }),
    })),
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("bookreader module", () => {
  const chapterComments = {
    11: [
      {
        uid: "reader-b",
        message: "Newest chapter 1",
        created_at: "2026-03-12T10:00:00.000Z",
      },
      {
        uid: "user-1",
        message: "Oldest chapter 1",
        created_at: "2026-03-10T08:00:00.000Z",
      },
    ],
    21: [
      {
        uid: "reader-z",
        message: "Book 2 comment",
        created_at: "2026-03-11T12:00:00.000Z",
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    document.head.innerHTML = "";

    buildBookReaderDom();
    mockPdfJs();

    await jest.unstable_mockModule("../js/modules/supabase.js", () => {
      const commentsByBook = {
        "../book reader/books/book1.pdf": [
          { id: 3, author: "Jules", content: "Jules comment", parent_id: null, replies: 0 },
          { id: 2, author: "Marco", content: "Marco comment", parent_id: null, replies: 0 },
          { id: 1, author: "Priya", content: "Priya comment", parent_id: null, replies: 0 }
        ],
        "../book reader/books/book2.pdf": [
          { id: 4, author: "Anita", content: "Anita comment", parent_id: null, replies: 0 }
        ]
      };

      let currentRows = commentsByBook["../book reader/books/book1.pdf"];

      const query = {
        select: jest.fn(() => query),
        eq: jest.fn((field, value) => {
          if (field === "chapter_path" && commentsByBook[value]) {
            currentRows = commentsByBook[value];
          }
          return query;
        }),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        order: jest.fn(async () => ({ data: currentRows, error: null })),
        insert: jest.fn((rows) => {
          const row = Array.isArray(rows) ? rows[0] : rows;
          const newRow = {
            id: Date.now(),
            author: row.author ?? "Test User",
            content: row.content,
            parent_id: row.parent_id ?? null,
            replies: 0
          };
          currentRows.push(newRow);
          return {
            select: jest.fn(() => ({
              single: jest.fn(async () => ({ data: newRow, error: null }))
            }))
          };
        })
      };

      return {
        getSupabaseClient: jest.fn(() => ({
          from: jest.fn(() => query),
          auth: {
            getUser: jest.fn(async () => ({
              data: { user: { id: "test-user" } },
              error: null
            }))
          }
        }))
      };
    });

    await jest.unstable_mockModule("../js/modules/comments.js", () => {
      const commentsByBook = {
        "../book reader/books/book1.pdf": [
          { id: 3, author: "Jules", content: "Jules comment", parent_id: null, replies: 0 },
          { id: 2, author: "Marco", content: "Marco comment", parent_id: null, replies: 0 },
          { id: 1, author: "Priya", content: "Priya comment", parent_id: null, replies: 0 }
        ],
        "../book reader/books/book2.pdf": [
          { id: 4, author: "Anita", content: "Anita comment", parent_id: null, replies: 0 }
        ]
      };

      let currentBook = "../book reader/books/book1.pdf";

      return {
        getCommentsByChapter: jest.fn(async (chapterId) => {
          const bookPath =
            chapterId === 14
              ? currentBook
              : "../book reader/books/book1.pdf";

          const rows = (commentsByBook[bookPath] || []).map((item, index) => ({
            id: item.id ?? index + 1,
            uid: item.author === "Test User" ? "test-user" : "other-user",
            created_at: `2026-02-${10 + index}T10:00:00`,
            message: item.content
          }));

          return {
            ok: true,
            data: rows
          };
        }),
        addComment: jest.fn(async (comment) => {
          const newComment = {
            id: Date.now(),
            author: "Test User",
            content: comment.content,
            parent_id: comment.parent_id ?? null,
            replies: 0
          };
          if (!commentsByBook[currentBook]) {
            commentsByBook[currentBook] = [];
          }
          commentsByBook[currentBook].push(newComment);
          return newComment;
        }),

        addReply: jest.fn(async (reply) => {
          const newReply = {
            id: Date.now(),
            author: "Test User",
            content: reply.content,
            parent_id: reply.parent_id,
            replies: 0
          };
          if (!commentsByBook[currentBook]) {
            commentsByBook[currentBook] = [];
          }
          commentsByBook[currentBook].push(newReply);
          return newReply;
        }),

        submitComment: jest.fn(async (comment) => {
          const newComment = {
            id: Date.now(),
            author: "Test User",
            content: comment.content,
            parent_id: comment.parent_id ?? null,
            replies: 0
          };
          if (!commentsByBook[currentBook]) {
            commentsByBook[currentBook] = [];
          }
          commentsByBook[currentBook].push(newComment);
          return newComment;
        })
      };
    });

    global.requestAnimationFrame = (cb) => cb();
    window.matchMedia = jest.fn(() => ({
      matches: false,
      media: "(max-width: 760px)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    window.alert = jest.fn();

    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      setTransform: jest.fn(),
    }));

    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 11 },
                error: null,
              }),
            })),
          })),
        })),
      })),
    });

    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: true });
    submitCommentMock.mockResolvedValue({ ok: true });
    fetchBookReaderEntriesMock.mockResolvedValue({
      ok: true,
      data: [
        {
          chapterId: 11,
          chapterNum: 1,
          bookId: 1,
          free: true,
          url: BOOK_ONE,
          label: "Book 1 - Chapter 1",
        },
        {
          chapterId: 21,
          chapterNum: 1,
          bookId: 2,
          free: true,
          url: BOOK_TWO,
          label: "Book 2 - Chapter 1",
        },
      ],
    });
    getCommentsByChapterMock.mockImplementation(async (chapterId) => ({
      ok: true,
      data: chapterComments[Number(chapterId)] || [],
    }));
  });

  test("loads book options from backend and renders chapter metadata", async () => {
    await initBookReader();
    await flush();

    const select = document.getElementById("bookSelect");
    expect(select.options).toHaveLength(2);
    expect(select.options[0].textContent).toContain("Book 1 - Chapter 1");
    expect(document.getElementById("commentsMeta").textContent).toBe("Chapter 1");
  });

  test("posts a subscriber comment and clears compose box", async () => {
    await initBookReader();
    await flush();

    const input = document.getElementById("newCommentText");
    input.value = "Posting from test";
    document.getElementById("submitComment").click();
    await flush();

    expect(submitCommentMock).toHaveBeenCalledWith({
      chapterId: 11,
      message: "Posting from test",
      parentCommentId: null,
    });
    expect(input.value).toBe("");
  });

  test("shows comments in ascending order when sort is switched", async () => {
    await initBookReader();
    await flush();

    const firstBefore = document.querySelector(".comment-card .comment-text");
    expect(firstBefore.textContent).toBe("Newest chapter 1");

    const filter = document.getElementById("filterComments");
    filter.value = "asc";
    filter.dispatchEvent(new Event("change"));
    await flush();

    const firstAfter = document.querySelector(".comment-card .comment-text");
    expect(firstAfter.textContent).toBe("Oldest chapter 1");
  });

  test("shows subscriber gating for comments and poll voting", async () => {
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: false });

    await initBookReader();
    await flush();

    expect(document.getElementById("newCommentArea").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("subscriberNotice").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("submitPollVote").disabled).toBe(true);
  });

  test("shows only free chapters in dropdown for free users", async () => {
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: false });
    fetchBookReaderEntriesMock.mockResolvedValue({
      ok: true,
      data: [
        {
          chapterId: 11,
          chapterNum: 1,
          bookId: 1,
          free: true,
          url: BOOK_ONE,
          label: "Book 1 - Chapter 1",
        },
        {
          chapterId: 17,
          chapterNum: 7,
          bookId: 1,
          free: false,
          url: "https://cdn.example.com/book-1-ch-7.pdf",
          label: "Book 1 - Chapter 7 (Subscribers)",
        },
      ],
    });

    await initBookReader();
    await flush();

    const select = document.getElementById("bookSelect");
    const labels = Array.from(select.options).map((option) => option.textContent);
    expect(labels).toEqual(["Book 1 - Chapter 1"]);
  });

  test("shows comments error state when comments API fails", async () => {
    getCommentsByChapterMock.mockResolvedValue({ ok: false, data: [], message: "network error" });

    await initBookReader();
    await flush();

    const errorBox = document.getElementById("commentsError");
    expect(errorBox.classList.contains("hidden")).toBe(false);
    expect(errorBox.textContent).toContain("could not be loaded");
  });

  test("updates chapter comments when switching to a different book option", async () => {
    await initBookReader();
    await flush();

    const select = document.getElementById("bookSelect");
    select.value = BOOK_TWO;
    select.dispatchEvent(new Event("change"));
    await flush();

    expect(document.getElementById("commentsTitle").textContent).toContain("Book 2");
    expect(document.getElementById("commentsList").textContent).toContain("Book 2 comment");
  });

  test("preselects chapter option from activeChapter session value", async () => {
    sessionStorage.setItem("activeChapter", "1");
    fetchBookReaderEntriesMock.mockResolvedValue({
      ok: true,
      data: [
        {
          chapterId: 31,
          chapterNum: 3,
          bookId: 1,
          free: true,
          url: "https://cdn.example.com/book-1-ch-3.pdf",
          label: "Book 1 - Chapter 3",
        },
        {
          chapterId: 11,
          chapterNum: 1,
          bookId: 1,
          free: true,
          url: BOOK_ONE,
          label: "Book 1 - Chapter 1",
        },
      ],
    });

    await initBookReader();
    await flush();

    const select = document.getElementById("bookSelect");
    expect(select.value).toBe(BOOK_ONE);
    expect(document.getElementById("commentsMeta").textContent).toBe("Chapter 1");
    expect(sessionStorage.getItem("activeChapter")).toBeNull();
  });

  test("switches between single and double page view", async () => {
    await initBookReader();
    await flush();

    const frame = document.getElementById("bookFrame");
    const singleBtn = document.getElementById("singlePageViewBtn");
    const doubleBtn = document.getElementById("doublePageViewBtn");

    singleBtn.click();
    await flush();
    expect(frame.classList.contains("single-page-mode")).toBe(true);
    expect(localStorage.getItem("bookreaderViewMode.v1")).toBe("single");

    doubleBtn.click();
    await flush();
    expect(frame.classList.contains("single-page-mode")).toBe(false);
    expect(localStorage.getItem("bookreaderViewMode.v1")).toBe("double");
  });
});
