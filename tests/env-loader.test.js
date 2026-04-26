import { jest } from "@jest/globals";
import { initEnv } from "../js/utils/env-loader.js";

describe("env-loader", () => {
  let warnSpy;

  beforeEach(() => {
    delete window.ENV;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("initializes window.ENV to empty object when not set", async () => {
    const env = await initEnv();

    expect(window.ENV).toBeDefined();
    expect(env).toBe(window.ENV);
  });

  test("warns when Supabase env is missing", async () => {
    await initEnv();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Supabase ENV missing")
    );
  });

  test("does not warn when valid Supabase env is present", async () => {
    window.ENV = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "valid-anon-key",
    };

    await initEnv();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("warns when env values are placeholder strings", async () => {
    window.ENV = {
      SUPABASE_URL: "YOUR_SUPABASE_URL",
      SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
    };

    await initEnv();

    expect(warnSpy).toHaveBeenCalled();
  });

  test("preserves existing window.ENV properties", async () => {
    window.ENV = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "valid-key",
      EXTRA: "custom-value",
    };

    const env = await initEnv();

    expect(env.EXTRA).toBe("custom-value");
  });
});