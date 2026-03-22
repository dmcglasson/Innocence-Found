import { jest } from "@jest/globals";

//FIX alert BEFORE anything runs
window.alert = jest.fn();

global.alert = jest.fn();

const BOOK_ONE = "../book reader/books/book1.pdf";

function buildBookReaderDom() {
  document.body.innerHTML = `
    <main class="background-area">
      <div class="book-container">
        <div class="book-selector">
          <select id="bookSelect">
            <option value="${BOOK_ONE}">Book 1 (PDF)</option>
            <option value="../book reader/books/book2.pdf">Book 2 (PDF)</option>
            <option value="locked">Locked Chapter</option>
          </select>
        </div>
        <div class="book">
          <div class="page left-page"><canvas id="leftPage"></canvas></div>
          <div class="page right-page"><canvas id="rightPage"></canvas></div>
        </div>
        <div class="controls">
          <button id="prevPage">Previous</button>
          <span id="pageInfo">Page 1-2</span>
          <button id="nextPage">Next</button>
        </div>
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
      getViewport: () => ({ height: 100, width: 80 }),
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

function findCommentCardByAuthor(author) {
  return [...document.querySelectorAll(".comment-card")].find((card) =>
    card.textContent.includes(`${author} -`)
  );
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function firstCommentAuthor() {
  const meta = document.querySelector(".comment-card .comment-meta");
  if (!meta) return "";
  return meta.textContent.split(" - ")[0];
}

describe("bookreader comments", () => {
  let initBookReader;

  beforeEach(async () => {
    jest.resetModules();
    window.alert = jest.fn();
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
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
    }));

    ({ initBookReader } = await import("../js/modules/bookreader.js"));
  });

  test("allows subscriber to post a new comment", async () => {
    await initBookReader();

    const startingCount = document.querySelectorAll(".comment-card").length;
    const input = document.getElementById("newCommentText");
    const submit = document.getElementById("submitComment");

    input.value = "This is a new test comment";
    submit.click();
    await flush();

    expect(document.querySelectorAll(".comment-card")).toHaveLength(
      startingCount + 1
    );
    expect(document.getElementById("commentsList").textContent).toContain(
      "This is a new test comment"
    );
    expect(input.value).toBe("");
  });

  test("adds reply to the selected parent comment even when sorted", async () => {
    await initBookReader();

    const filter = document.getElementById("filterComments");
    filter.value = "popular";
    filter.dispatchEvent(new Event("change"));

    const targetAuthor = "Marco";
    const replyText = "Reply meant for Marco only";

    const marcoCard = findCommentCardByAuthor(targetAuthor);
    expect(marcoCard).toBeTruthy();

    const replyButton = marcoCard.querySelector(".reply-btn");
    replyButton.click();

    const replyInput = marcoCard.querySelector(".reply-form textarea");
    const replySubmit = marcoCard.querySelector(".reply-form button");
    replyInput.value = replyText;
    replySubmit.click();

    await flush();

    const marcoCardAfter = findCommentCardByAuthor(targetAuthor);
    const priyaCardAfter = findCommentCardByAuthor("Priya");

    expect(marcoCardAfter.textContent).toContain(replyText);
    expect(priyaCardAfter.textContent).not.toContain(replyText);
  });

  test("does not add a blank comment", async () => {
    await initBookReader();

    const startingCount = document.querySelectorAll(".comment-card").length;
    const input = document.getElementById("newCommentText");
    const submit = document.getElementById("submitComment");

    input.value = "   ";
    submit.click();

    expect(document.querySelectorAll(".comment-card")).toHaveLength(startingCount);
  });

  test("changes display order when sort is switched to oldest first", async () => {
    await initBookReader();

    expect(firstCommentAuthor()).toBe("Jules");

    const filter = document.getElementById("filterComments");
    filter.value = "asc";
    filter.dispatchEvent(new Event("change"));

    expect(firstCommentAuthor()).toBe("Priya");
  });

  test("updates comments when switching from Book 1 to Book 2", async () => {
    await initBookReader();

    const select = document.getElementById("bookSelect");
    select.value = "../book reader/books/book2.pdf";
    select.dispatchEvent(new Event("change"));
    await flush();
    await flush();

    const commentText = document.getElementById("commentsList").textContent;
    expect(commentText).toContain("Anita -");
    expect(commentText).not.toContain("Priya -");
    expect(document.getElementById("commentsTitle").textContent).toContain("Book 2");
  });

  test("keeps comment posting available when PDF.js initialization fails", async () => {
    document.head.innerHTML = "";
    buildBookReaderDom();

    const existingScript = document.createElement("script");
    existingScript.id = "pdfjs-cdn";
    existingScript._loadingPromise = Promise.resolve();
    document.head.appendChild(existingScript);
    window.pdfjsLib = undefined;

    global.requestAnimationFrame = (cb) => cb();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
    }));

    ({ initBookReader } = await import("../js/modules/bookreader.js"));
    await initBookReader();

    expect(document.getElementById("pageInfo").textContent).toBe(
      "Reader unavailable"
    );

    const input = document.getElementById("newCommentText");
    const submit = document.getElementById("submitComment");
    input.value = "Comment works without PDF";
    submit.click();

    expect(document.getElementById("commentsList").textContent).toContain(
      "Comment works without PDF"
    );
  });
});
