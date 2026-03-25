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
  handleLockedChapter,
  initializeChaptersScreen,
  initializeChapterReaderScreen,
} = await import("../js/modules/chapters.js");

// Minimal DOM container used by the chapters listing screen.
function buildChaptersListDom() {
  document.body.innerHTML = '<div id="chapterList"></div>';
}

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
    expect(window.location.hash).toBe("#chapter-reader");
  });

  test("redirects locked chapter to login when user is not signed in", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await handleLockedChapter(3);

    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("#chapters");
    expect(sessionStorage.getItem("requestedChapter")).toBe("3");
    expect(sessionStorage.getItem("activeChapter")).toBeNull();
  });
});

// Rendering and post-render behavior for the chapters list page.
describe("initializeChaptersScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    buildChaptersListDom();
  });

  test("renders chapter buttons for free users", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await initializeChaptersScreen();

    expect(waitForElementMock).toHaveBeenCalledWith("#chapterList", 1000);
    const buttons = Array.from(document.querySelectorAll(".chapter-button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain("Read for Free");
    expect(buttons[2].textContent).toContain("Subscribers Only");
  });

  test("handles requested chapter after rendering", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    sessionStorage.setItem("requestedChapter", "2");

    await initializeChaptersScreen();

    expect(sessionStorage.getItem("requestedChapter")).toBeNull();
    expect(sessionStorage.getItem("activeChapter")).toBe("2");
    expect(window.location.hash).toBe("#chapter-reader");
  });
});

// Reader page behavior: routing guards and PDF embed rendering.
describe("initializeChapterReaderScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    buildChapterReaderDom();

    URL.createObjectURL = jest.fn(() => "blob:chapter");
    URL.revokeObjectURL = jest.fn();
  });

  test("redirects to chapters when no active chapter is selected", async () => {
    await initializeChapterReaderScreen();

    expect(window.location.hash).toBe("#chapters");
  });

  test("redirects locked chapter to login for anonymous users", async () => {
    sessionStorage.setItem("activeChapter", "3");
    getCurrentSessionMock.mockResolvedValue(null);

    await initializeChapterReaderScreen();

    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("chapters");
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
});
