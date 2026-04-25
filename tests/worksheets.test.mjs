/** @jest-environment jsdom */

import { jest } from "@jest/globals";

// Shared dependency mocks injected before importing the module under test.
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
    FREE_CHAPTER_COUNT: 6,
    FREE_WORKSHEET_COUNT: 1,
    TOTAL_CHAPTERS: 10,
    SUPABASE_URL: "https://example.supabase.co",
  },
  WORKSHEETS_CONFIG: {
    TABLE: "worksheets",
    BUCKET: "worksheets",
    SIGNED_URL_EXPIRES_IN: 300,
    FUNCTIONS_BASE_URL: "https://example.supabase.co/functions/v1",
  },
  SUPABASE_CONFIG: {
    URL: "https://example.supabase.co",
    ANON_KEY: "test-anon-key",
  },
}));

jest.unstable_mockModule("../js/utils/dom.js", () => ({
  waitForElement: waitForElementMock,
}));

const {
  handleLockedWorksheet,
  initializeWorksheetsScreen,
  initializeWorksheetReaderScreen,
} = await import("../js/modules/worksheets.js");

// Minimal DOM for the worksheet list screen.
// Only the container required by initializeWorksheetsScreen is needed.
function buildWorksheetsListDom() {
  document.body.innerHTML = '<div id="worksheetList"></div>';
}

// Mocks table reads for worksheet list rendering.
function createSupabaseStub({ worksheets } = {}) {
  const listData =
    worksheets ||
    [
      {
        id: 1,
        title: "Worksheet 1",
        description: "Intro activity",
        file_path: "Worksheets/ws-1.pdf",
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: 2,
        title: "Worksheet 2",
        description: "Comprehension",
        file_path: "Worksheets/ws-2.pdf",
        created_at: "2025-01-02T00:00:00Z",
      },
      {
        id: 3,
        title: "Worksheet 3",
        description: "Subscribers",
        file_path: "Worksheets/ws-3.pdf",
        created_at: "2025-01-03T00:00:00Z",
      },
    ];

  const orderMock = jest.fn().mockResolvedValue({
    data: listData,
    error: null,
  });

  const selectMock = jest.fn(() => ({ order: orderMock }));

  const fromTableMock = jest.fn(() => ({
    select: selectMock,
  }));

  return {
    from: fromTableMock,
  };
}

// Access-control tests for direct worksheet download flow.
describe("handleLockedWorksheet", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const anchorClickMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    getSupabaseClientMock.mockReturnValue({});

    URL.createObjectURL = jest.fn(() => "blob:worksheet");
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = anchorClickMock;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
    });
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  test("redirects worksheet to login when user is not signed in", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    const result = await handleLockedWorksheet(3);

    // Worksheet access should preserve intent and route to login flow.
    expect(result).toEqual({ success: false });
    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("#worksheets");
    expect(sessionStorage.getItem("requestedWorksheetId")).toBe("3");
    expect(sessionStorage.getItem("activeWorksheetId")).toBeNull();
  });

  test("blocks worksheet download for signed-in non-subscriber", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: false });

    const result = await handleLockedWorksheet(2);

    expect(result).toEqual({ success: false, message: "Subscribers only." });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("downloads worksheet for signed-in subscriber", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { id: "user-1" },
      access_token: "session-token",
    });
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: true });

    const result = await handleLockedWorksheet(1);

    expect(result).toEqual({ success: true, message: "Download started" });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/download-worksheet?id=1",
      expect.objectContaining({ method: "GET" })
    );
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).not.toBe("#worksheet-reader");
  });
});

// Tests list rendering and requested worksheet handoff after auth redirect.
describe("initializeWorksheetsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    buildWorksheetsListDom();
  });

  test("renders worksheet buttons as subscriber-only for free users", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeWorksheetsScreen();

    // All worksheets should be locked when the user is not a subscriber.
    expect(waitForElementMock).toHaveBeenCalledWith("#worksheetList", 1000);
    const buttons = Array.from(document.querySelectorAll(".worksheet-button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain("Subscribers Only");
    expect(buttons[2].textContent).toContain("Subscribers Only");

    const tags = Array.from(document.querySelectorAll(".worksheet-card__tag")).map((el) => el.textContent || "");
    expect(tags.some((tag) => tag.includes("PDF"))).toBe(true);
  });

  test("renders download buttons for subscribers", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getSubscriberStatusMock.mockResolvedValue({ isSubscriber: true });
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeWorksheetsScreen();

    const buttons = Array.from(document.querySelectorAll(".worksheet-button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain("Download PDF");
    expect(buttons[1].textContent).toContain("Download PDF");
  });

  test("handles requested worksheet after rendering", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());
    sessionStorage.setItem("requestedWorksheetId", "1");

    await initializeWorksheetsScreen();

    // Anonymous access should re-stage the request for post-login continuation.
    expect(sessionStorage.getItem("requestedWorksheetId")).toBe("1");
    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("activeWorksheetId")).toBeNull();
  });
});

// Reader route is deprecated and should immediately redirect.
describe("initializeWorksheetReaderScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "worksheet-reader";
    window.showLogin = jest.fn();
    URL.revokeObjectURL = jest.fn();
  });

  test("redirects immediately to worksheets", async () => {
    await initializeWorksheetReaderScreen();
    expect(window.location.hash).toBe("#worksheets");
    expect(waitForElementMock).not.toHaveBeenCalled();
  });
});
