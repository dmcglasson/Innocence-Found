/** @jest-environment jsdom */

import { jest } from "@jest/globals";

// Shared dependency mocks injected before importing the module under test.
const getCurrentSessionMock = jest.fn();
const getSubscriberStatusMock = jest.fn();
const getSupabaseClientMock = jest.fn();
const waitForElementMock = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("./auth.js", () => ({
  getCurrentSession: getCurrentSessionMock,
  getSubscriberStatus: getSubscriberStatusMock,
}));

jest.unstable_mockModule("./supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

jest.unstable_mockModule("../config.js", () => ({
  APP_CONFIG: {
    FREE_CHAPTER_COUNT: 2,
    TOTAL_CHAPTERS: 10,
  },
}));

jest.unstable_mockModule("../utils/dom.js", () => ({
  waitForElement: waitForElementMock,
}));

const {
  handleLockedWorksheet,
  initializeWorksheetsScreen,
  initializeWorksheetReaderScreen,
} = await import("./worksheets.js");

// Minimal DOM for the worksheet list screen.
// Only the container required by initializeWorksheetsScreen is needed.
function buildWorksheetsListDom() {
  document.body.innerHTML = '<div id="worksheetList"></div>';
}

// Minimal DOM for the worksheet reader screen.
// Includes title/body targets and the back button target.
function buildWorksheetReaderDom() {
  document.body.innerHTML = `
    <h1 id="worksheetTitle"></h1>
    <div id="worksheetBody"></div>
    <button id="backToWorksheetsBtn" type="button">Back</button>
  `;
}

// Mocks table reads and storage download used by worksheet list/reader logic.
// This simulates both data-table queries and file retrieval without network calls.
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

  // maybeSingle mimics lookup for a single worksheet by id.
  const maybeSingleMock = jest.fn((filterId) => {
    const row = listData.find((item) => String(item.id) === String(filterId));
    return Promise.resolve({ data: row || null, error: null });
  });

  const eqMock = jest.fn((column, filterId) => ({
    maybeSingle: () => maybeSingleMock(filterId),
  }));

  const limitMock = jest.fn(() => ({ eq: eqMock }));
  const selectMock = jest.fn(() => ({ order: orderMock, limit: limitMock }));

  const fromTableMock = jest.fn(() => ({
    select: selectMock,
  }));

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
    storage: {
      from: fromBucketMock,
    },
  };
}

// Access-control tests for direct worksheet navigation logic.
describe("handleLockedWorksheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
  });

  test("opens a free worksheet without login", async () => {
    await handleLockedWorksheet(1, 1);

    // Free worksheets should navigate directly to reader.
    expect(sessionStorage.getItem("activeWorksheetId")).toBe("1");
    expect(window.location.hash).toBe("#worksheet-reader");
  });

  test("redirects locked worksheet to login when user is not signed in", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await handleLockedWorksheet(3, 3);

    // Locked worksheets should preserve intent and route to login flow.
    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("#worksheets");
    expect(sessionStorage.getItem("requestedWorksheetId")).toBe("3");
    expect(sessionStorage.getItem("activeWorksheetId")).toBeNull();
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

  test("renders worksheet buttons for free users", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeWorksheetsScreen();

    // First two are free, third is locked based on FREE_CHAPTER_COUNT=2.
    expect(waitForElementMock).toHaveBeenCalledWith("#worksheetList", 1000);
    const buttons = Array.from(document.querySelectorAll(".worksheet-button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain("Open Worksheet");
    expect(buttons[2].textContent).toContain("Subscribers Only");
  });

  test("handles requested worksheet after rendering", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());
    sessionStorage.setItem("requestedWorksheetId", "2");

    await initializeWorksheetsScreen();

    // A saved request should be consumed and forwarded to worksheet routing.
    expect(sessionStorage.getItem("requestedWorksheetId")).toBeNull();
    expect(sessionStorage.getItem("activeWorksheetId")).toBe("2");
    expect(window.location.hash).toBe("#worksheet-reader");
  });
});

// Tests reader route guards and PDF embed rendering behavior.
describe("initializeWorksheetReaderScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.hash = "";
    window.showLogin = jest.fn();
    buildWorksheetReaderDom();

    URL.createObjectURL = jest.fn(() => "blob:worksheet");
    URL.revokeObjectURL = jest.fn();
  });

  test("redirects to worksheets when no active worksheet is selected", async () => {
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeWorksheetReaderScreen();

    // Reader route requires a selected worksheet id in session storage.
    expect(window.location.hash).toBe("#worksheets");
  });

  test("redirects locked worksheet to login for anonymous users", async () => {
    sessionStorage.setItem("activeWorksheetId", "3");
    getCurrentSessionMock.mockResolvedValue(null);
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeWorksheetReaderScreen();

    // Locked worksheet access for anonymous users should force login.
    expect(window.showLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("returnTo")).toBe("worksheets");
    expect(sessionStorage.getItem("requestedWorksheetId")).toBe("3");
  });

  test("renders worksheet PDF iframe for accessible worksheet", async () => {
    sessionStorage.setItem("activeWorksheetId", "1");
    getSupabaseClientMock.mockReturnValue(createSupabaseStub());

    await initializeWorksheetReaderScreen();

    // Accessible worksheet should render an iframe pointing to the resolved blob URL.
    expect(document.getElementById("worksheetTitle").textContent).toBe("Worksheet 1");
    expect(document.querySelector("#worksheetBody iframe")).not.toBeNull();
    expect(document.getElementById("worksheetBody").innerHTML).toContain("blob:worksheet");
  });
});
