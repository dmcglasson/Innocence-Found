import { jest } from "@jest/globals";

describe("Config Module Tests", () => {
  beforeEach(() => {
    jest.resetModules();
    window.ENV = {};
    delete window.location;
    window.location = {
      hostname: "localhost",
      protocol: "http:"
    };
  });

  test("loads Supabase values from window.ENV", async () => {
    window.ENV = {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_ANON_KEY: "test-key",
      SUPABASE_WORKSHEETS_BUCKET: "test-bucket"
    };

    const config = await import("../js/config.js");

    expect(config.SUPABASE_CONFIG.URL).toBe("https://test.supabase.co");
    expect(config.SUPABASE_CONFIG.ANON_KEY).toBe("test-key");
    expect(config.WORKSHEETS_CONFIG.BUCKET).toBe("test-bucket");
  });

  test("uses placeholder values when window.ENV is missing", async () => {
    window.ENV = {};

    const config = await import("../js/config.js");

    expect(config.SUPABASE_CONFIG.URL).toBe("YOUR_SUPABASE_URL_HERE");
    expect(config.SUPABASE_CONFIG.ANON_KEY).toBe("YOUR_SUPABASE_ANON_KEY_HERE");
  });

  test("builds Supabase functions base URL", async () => {
    window.ENV = {
      SUPABASE_URL: "https://test.supabase.co/"
    };

    const config = await import("../js/config.js");

    expect(config.getSupabaseFunctionsBaseUrl()).toBe(
      "https://test.supabase.co/functions/v1"
    );
  });

  test("loads app config default values", async () => {
    const config = await import("../js/config.js");

    expect(config.APP_CONFIG.DEFAULT_PAGE).toBe("home");
    expect(config.APP_CONFIG.SCREENS_PATH).toBe("screens/");
    expect(config.APP_CONFIG.FREE_CHAPTER_COUNT).toBe(6);
    expect(config.APP_CONFIG.FREE_WORKSHEET_COUNT).toBe(1);
  });
});