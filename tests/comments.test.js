import { jest } from "@jest/globals";

const getSupabaseClientMock = jest.fn();

jest.unstable_mockModule("../js/modules/supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

const { submitComment, getCommentsByChapter } = await import("../js/modules/comments.js");

describe("comments module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("submitComment trims messages and inserts the authenticated user comment", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "reader-123" } },
        }),
      },
      from: jest.fn(() => ({ insert })),
    });

    const result = await submitComment({
      chapterId: "42",
      message: "  This chapter surprised me.  ",
      parentCommentId: 7,
    });

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      uid: "reader-123",
      chapter_id: 42,
      message: "This chapter surprised me.",
      comment_id: 7,
    });
  });

  test("submitComment blocks unauthenticated and blank comments before inserting", async () => {
    const insert = jest.fn();
    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
      from: jest.fn(() => ({ insert })),
    });

    await expect(submitComment({ chapterId: 1, message: "hello" })).resolves.toEqual({
      ok: false,
      status: 401,
      message: "Not authenticated",
    });
    expect(insert).not.toHaveBeenCalled();

    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "reader-123" } },
        }),
      },
      from: jest.fn(() => ({ insert })),
    });

    await expect(submitComment({ chapterId: 1, message: "   " })).resolves.toEqual({
      ok: false,
      status: 400,
      message: "Message cannot be empty.",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  test("getCommentsByChapter fetches comments and attaches profile usernames", async () => {
    const commentsOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          uid: "reader-1",
          message: "First",
          created_at: "2026-04-01T12:00:00.000Z",
          chapter_id: 9,
          comment_id: null,
        },
        {
          id: 2,
          uid: "reader-2",
          message: "Second",
          created_at: "2026-04-02T12:00:00.000Z",
          chapter_id: 9,
          comment_id: null,
        },
      ],
      error: null,
    });
    const commentsEq = jest.fn(() => ({ order: commentsOrder }));
    const commentsSelect = jest.fn(() => ({ eq: commentsEq }));
    const profilesIn = jest.fn().mockResolvedValue({
      data: [{ user_id: "reader-1", username: "Asha" }],
      error: null,
    });
    const profilesSelect = jest.fn(() => ({ in: profilesIn }));
    const from = jest.fn((table) => {
      if (table === "Comments") return { select: commentsSelect };
      if (table === "profiles") return { select: profilesSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    getSupabaseClientMock.mockReturnValue({ from });

    const result = await getCommentsByChapter("9");

    expect(result).toEqual({
      ok: true,
      data: [
        expect.objectContaining({ uid: "reader-1", username: "Asha" }),
        expect.objectContaining({ uid: "reader-2", username: null }),
      ],
    });
    expect(commentsEq).toHaveBeenCalledWith("chapter_id", 9);
    expect(commentsOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(profilesIn).toHaveBeenCalledWith("user_id", ["reader-1", "reader-2"]);
  });

  test("getCommentsByChapter handles empty and failed comment queries", async () => {
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ order })),
        })),
      })),
    });

    await expect(getCommentsByChapter(3)).resolves.toEqual({ ok: true, data: [] });

    order.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(getCommentsByChapter(3)).resolves.toEqual({
      ok: false,
      data: [],
      message: "permission denied",
    });
  });
  test("submitComment returns 500 when supabase is not initialized", async () => {
    getSupabaseClientMock.mockReturnValue(null);

    const result = await submitComment({ chapterId: 1, message: "hello" });

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: "Supabase not initialized",
    });
  });

  test("submitComment returns 403 when insert fails", async () => {
    const insert = jest.fn().mockResolvedValue({
      error: { message: "permission denied" },
    });
    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "reader-123" } },
        }),
      },
      from: jest.fn(() => ({ insert })),
    });

    const result = await submitComment({ chapterId: 1, message: "hi" });

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "permission denied",
    });
  });

  test("getCommentsByChapter returns error when supabase is not initialized", async () => {
    getSupabaseClientMock.mockReturnValue(null);

    const result = await getCommentsByChapter(1);

    expect(result).toEqual({
      ok: false,
      data: [],
      message: "Supabase not initialized",
    });
  });
}); 
