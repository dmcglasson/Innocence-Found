/** @jest-environment jsdom */

import { jest } from "@jest/globals";

const getCurrentSessionMock = jest.fn();
const getSubscriberStatusMock = jest.fn();
const getSupabaseClientMock = jest.fn();
const waitForElementMock = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../js/modules/auth.js", () => ({
  getCurrentSession: getCurrentSessionMock,
  getSubscriberStatus: getSubscriberStatusMock,
}));

jest.unstable_mockModule("../js/modules/supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

jest.unstable_mockModule("../js/config.js", () => ({
  APP_CONFIG: {
    FREE_CHAPTER_COUNT: 2,
    TOTAL_CHAPTERS: 3,
  },
}));

jest.unstable_mockModule("../js/utils/dom.js", () => ({
  waitForElement: waitForElementMock,
}));

const {
  fetchBookReaderEntries,
  handleLockedChapter,
  initializeChapterReaderScreen,
} = await import("../js/modules/chapters.js");

// Minimal DOM container used by the chapter reader screen.
function buildChapterReaderDom() {
  document.body.innerHTML = `
    <h1 id="chapterTitle"></h1>
    <div id="chapterBody"></div>
    <button id="backToChaptersBtn" type="button">Back</button>
  `;
}

function createSupabaseStub() {
  // Mocks the full data path used by getChapterPdfUrl:
  // chapters table -> RPC object lookup -> storage download.
  const maybeSingleMock = jest.fn().mockResolvedValue({
    data: { chapter_num: 1, free: true, chapter_id: "obj-1" },
    error: null,
  });

  const eqMock = jest.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = jest.fn(() => ({ eq: eqMock }));
  const fromTableMock = jest.fn(() => ({ select: selectMock }));

  const downloadMock = jest.fn().mockResolvedValue({
    data: new Blob(["pdf"], { type: "application/pdf" }),
    error: null,
  });

  const createSignedUrlMock = jest.fn().mockResolvedValue({
    data: { signedUrl: "https://example.com/fallback.pdf" },
    error: null,
  });

  const getPublicUrlMock = jest.fn(() => ({
    data: { publicUrl: "https://example.com/public.pdf" },
  }));

  const fromBucketMock = jest.fn(() => ({
    download: downloadMock,
    createSignedUrl: createSignedUrlMock,
    getPublicUrl: getPublicUrlMock,
  }));

  return {
    from: fromTableMock,
    rpc: jest.fn().mockResolvedValue({
      data: [{ bucket_id: "Chapters", name: "chapter-1.pdf" }],
      error: null,
    }),
    storage: {
      from: fromBucketMock,
    },
  };
}

function createBookReaderEntriesSupabaseStub() {
  const rows = [
    { id: 11, chapter_num: 1, book_id: 1, chapter_id: "obj-1", free: true },
    { id: 12, chapter_num: 2, book_id: 1, chapter_id: null, free: true }, // skipped
    { id: 21, chapter_num: 1, book_id: 2, chapter_id: "obj-2", free: false },
  ];

  const finalOrderMock = jest.fn().mockResolvedValue({ data: rows, error: null });
  const firstOrderMock = jest.fn(() => ({ order: finalOrderMock }));
  const selectMock = jest.fn(() => ({ order: firstOrderMock }));

  const fromTableMock = jest.fn((tableName) => {
    if (tableName !== "Chapters") {
      return {};
    }
    return { select: selectMock };
  });

  const createSignedUrlMock = jest.fn((path) =>
    Promise.resolve({
      data: { signedUrl: `https://example.com/${path}` },
      error: null,
    })
  );

  const fromBucketMock = jest.fn(() => ({
    createSignedUrl: createSignedUrlMock,
    getPublicUrl: jest.fn(() => ({ data: { publicUrl: "https://example.com/public.pdf" } })),
  }));

  const rpcMock = jest.fn((_fnName, payload) =>
    Promise.resolve({
      data: [{ bucket_id: "Chapters", name: `${payload?.p_object_id}.pdf` }],
      error: null,
    })
  );

  return {
    from: fromTableMock,
    rpc: rpcMock,
    storage: { from: fromBucketMock },
  };
}

// Access-control tests for direct chapter navigation logic.
describe("handleLockedChapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
  });

  test("opens a free chapter without login", async () => {
    await handleLockedChapter(1);

    expect(sessionStorage.getItem("activeChapter")).toBe("1");
    expect(window.location.hash).toBe("#bookreader");
  });

  test("redirects locked chapter to login when user is not signed in", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await handleLockedChapter(3);

    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("#bookreader");
    expect(sessionStorage.getItem("requestedChapter")).toBe("3");
    expect(sessionStorage.getItem("activeChapter")).toBeNull();
  });

  test("opens a locked chapter when user is signed in as subscriber", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "reader-1" } });
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: true });

    await handleLockedChapter(3);

    expect(sessionStorage.getItem("activeChapter")).toBe("3");
    expect(window.location.hash).toBe("#bookreader");
    expect(window.showLogin).not.toHaveBeenCalled();
  });
});

// Reader page behavior: routing guards and PDF embed rendering.
describe("initializeChapterReaderScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    window.alert = jest.fn();
    buildChapterReaderDom();

    URL.createObjectURL = jest.fn(() => "blob:chapter");
    URL.revokeObjectURL = jest.fn();
  });

  test("redirects to bookreader when no active chapter is selected", async () => {
    await initializeChapterReaderScreen();

    expect(window.location.hash).toBe("#bookreader");
  });

  test("redirects locked chapter to login for anonymous users", async () => {
    sessionStorage.setItem("activeChapter", "3");
    getCurrentSessionMock.mockResolvedValue(null);

    await initializeChapterReaderScreen();

    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("#bookreader");
    expect(sessionStorage.getItem("requestedChapter")).toBe("3");
  });

  test("renders chapter PDF iframe for accessible chapter", async () => {
    sessionStorage.setItem("activeChapter", "1");
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeChapterReaderScreen();

    expect(document.getElementById("chapterTitle").textContent).toBe("Chapter 1");
    expect(document.querySelector("#chapterBody iframe")).not.toBeNull();
    expect(document.getElementById("chapterBody").innerHTML).toContain("blob:chapter");
  });

  test("blocks locked chapter for logged-in non-subscribers", async () => {
    sessionStorage.setItem("activeChapter", "3");
    getCurrentSessionMock.mockResolvedValue({ user: { id: "reader-2" } });
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: false });

    await initializeChapterReaderScreen();

    expect(window.alert).toHaveBeenCalledWith("Subscribers only.");
    expect(window.location.hash).toBe("#bookreader");
  });
});

describe("fetchBookReaderEntries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns an error response when supabase client is missing", async () => {
    getSupabaseClientMock.mockReturnValue(null);

    const result = await fetchBookReaderEntries();

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.message).toContain("not initialized");
  });

  test("maps chapter rows to reader entries and skips invalid rows", async () => {
    getSupabaseClientMock.mockReturnValue(createBookReaderEntriesSupabaseStub());

    const result = await fetchBookReaderEntries();

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);

    expect(result.data[0]).toMatchObject({
      chapterId: 11,
      chapterNum: 1,
      bookId: 1,
      free: true,
      label: "Book 1 - Chapter 1",
    });

    expect(result.data[1]).toMatchObject({
      chapterId: 21,
      chapterNum: 1,
      bookId: 2,
      free: true,
      label: "Book 2 - Chapter 1",
    });

    expect(result.data[0].url).toContain("obj-1.pdf");
    expect(result.data[1].url).toContain("obj-2.pdf");
  });
});

describe("renderChapters UI", () => {

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="chapterList"></div>
    `;
  });

  test("renders chapters for non-subscriber with locks", async () => {
    const { initializeChaptersScreen } = await import("../js/modules/chapters.js");

    getCurrentSessionMock.mockResolvedValue(null);

    await initializeChaptersScreen();

    const html = document.getElementById("chapterList").innerHTML;

    expect(html).toContain("Chapter 1");
    expect(html).toContain("Chapter 2");
    expect(html).toContain("🔒 Chapter 3");
  });

  test("renders chapters for subscriber without locks", async () => {
    const { initializeChaptersScreen } = await import("../js/modules/chapters.js");

    getCurrentSessionMock.mockResolvedValue({ user: { id: "1" } });
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: true });

    await initializeChaptersScreen();

    const html = document.getElementById("chapterList").innerHTML;

    expect(html).toContain("Chapter 1");
    expect(html).toContain("Chapter 2");
    expect(html).toContain("Chapter 3");
  });

});

describe("handleLockedChapter edge cases", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    global.alert = jest.fn();
  });

 test("invalid chapter number still sets NaN as string", async () => {
  await handleLockedChapter(NaN);

  expect(sessionStorage.getItem("activeChapter")).toBe("NaN");
});

  test("free chapter always allowed", async () => {
    await handleLockedChapter(2);

    expect(sessionStorage.getItem("activeChapter")).toBe("2");
    expect(window.location.hash).toBe("#bookreader");
  });

});