describe("Config Module Tests", () => {
  test("should load ENV values", () => {
    window.ENV = {
      SUPABASE_URL: "test-url",
      SUPABASE_ANON_KEY: "test-key"
    };

    expect(window.ENV.SUPABASE_URL).toBe("test-url");
    expect(window.ENV.SUPABASE_ANON_KEY).toBe("test-key");
  });

  test("should handle missing ENV", () => {
    window.ENV = {};

    expect(window.ENV.SUPABASE_URL).toBeUndefined();
  });
});