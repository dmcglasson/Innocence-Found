import { jest } from "@jest/globals";

import { APP_CONFIG } from "../js/config.js";
import {
  clearScreenCache,
  initPageFromHash,
  loadScreen,
  setGlobalOnLoadCallback,
  setScreenLoadCallback,
  showPage,
} from "../js/modules/navigation.js";

function buildBaseDom() {
  document.body.innerHTML = `
    <main>
      <div id="pageContainer"></div>
      <a data-page="dashboard" id="dashboardLink">Dashboard</a>
      <a data-page="admin-upload" id="uploadLink">Upload</a>
    </main>
  `;
}

function mockFetchOk(html) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => html,
  });
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("navigation module", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    buildBaseDom();

    // Default fetch mock prevents hashchange side effects from calling real fetch.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "<div></div>",
    });

    global.requestAnimationFrame = (cb) => cb();
    global.setTimeout = (cb) => {
      cb();
      return 0;
    };
    window.scrollTo = jest.fn();

    window.location.hash = "";
    window.history.replaceState({}, "", "/");

    APP_CONFIG.CACHE_ENABLED = false;
    APP_CONFIG.DEFAULT_PAGE = "home";
    APP_CONFIG.SCREENS_PATH = "screens/";

    setGlobalOnLoadCallback(null);
    setScreenLoadCallback(null);
    clearScreenCache();
  });

  // Ensures path traversal and malformed screen names are rejected.
  test("loadScreen throws on invalid screen name", async () => {
    await expect(loadScreen("../secret")).rejects.toThrow("Invalid screen name");
  });

  // Verifies loaded HTML is sanitized before being returned.
  test("loadScreen sanitizes script/iframe/javascript protocol", async () => {
    mockFetchOk(`
      <section>
        <script>alert('xss')</script>
        <iframe src="https://evil.test"></iframe>
        <a href="javascript:alert('xss')">bad</a>
        <p>safe</p>
      </section>
    `);

    const html = await loadScreen("about");

    expect(html).toContain("safe");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("javascript:");
    expect(fetch).toHaveBeenCalledWith("screens/about.html");
  });

  // Confirms graceful fallback HTML when a screen request fails.
  test("loadScreen returns fallback HTML when fetch fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => "" });

    const html = await loadScreen("home");

    expect(html).toContain("Error loading page. Please try again.");
  });

  // Checks that showPage paints the screen and triggers the per-call callback.
  test("showPage renders content and calls callback", async () => {
    mockFetchOk("<section id='loaded'>Loaded page</section>");
    const onLoad = jest.fn();

    await showPage("home", onLoad);

    const container = document.getElementById("pageContainer");
    expect(container.classList.contains("active")).toBe(true);
    expect(container.innerHTML).toContain("Loaded page");
    expect(document.body.classList.contains("screen-home")).toBe(true);
    expect(onLoad).toHaveBeenCalledWith("home");
  });

  // Confirms dashboard/admin-upload nav link visibility rules are applied.
  test("showPage toggles nav links on dashboard and admin-upload", async () => {
    mockFetchOk("<div>Dashboard</div>");

    await showPage("dashboard");
    expect(document.getElementById("dashboardLink").style.display).toBe("none");
    expect(document.getElementById("uploadLink").style.display).toBe("inline-block");

    await showPage("admin-upload");
    expect(document.getElementById("dashboardLink").style.display).toBe("inline-block");
    expect(document.getElementById("uploadLink").style.display).toBe("none");
  });

  // Verifies global screen callback runs after each screen load.
  test("setScreenLoadCallback runs for screen loads", async () => {
    mockFetchOk("<div>Profile</div>");
    const globalCb = jest.fn();

    setScreenLoadCallback(globalCb);
    await showPage("profile");

    expect(globalCb).toHaveBeenCalledWith("profile");
  });

  // Unknown routes should resolve to the configured default page.
  test("initPageFromHash falls back to default on unknown hash", async () => {
    mockFetchOk("<div>Home screen</div>");
    window.location.hash = "#not-a-real-screen";

    await initPageFromHash();

    expect(fetch).toHaveBeenCalledWith("screens/home.html");
    expect(document.body.classList.contains("screen-home")).toBe(true);
  });

  // Hash route parsing should ignore query strings.
  test("initPageFromHash strips query string from hash", async () => {
    mockFetchOk("<div>About screen</div>");
    window.location.hash = "#about?from=home";

    await initPageFromHash();

    expect(fetch).toHaveBeenCalledWith("screens/about.html");
    expect(document.body.classList.contains("screen-about")).toBe(true);
  });

  // Clearing cache should force a subsequent network fetch.
  test("clearScreenCache forces refetch when cache is enabled", async () => {
    APP_CONFIG.CACHE_ENABLED = true;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "<div>First</div>" })
      .mockResolvedValueOnce({ ok: true, text: async () => "<div>Second</div>" });

    const first = await loadScreen("home");
    const second = await loadScreen("home");

    expect(first).toContain("First");
    expect(second).toContain("First");
    expect(fetch).toHaveBeenCalledTimes(1);

    clearScreenCache();

    const third = await loadScreen("home");
    expect(third).toContain("Second");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // Hash changes should trigger navigation for known routes.
  test("hashchange listener loads known screen", async () => {
    mockFetchOk("<div>Contact screen</div>");

    window.location.hash = "#contact";
    await flushAsync();

    expect(fetch).toHaveBeenCalledWith("screens/contact.html");
    expect(document.body.classList.contains("screen-contact")).toBe(true);
    expect(document.getElementById("pageContainer").innerHTML).toContain("Contact screen");
  });
});
