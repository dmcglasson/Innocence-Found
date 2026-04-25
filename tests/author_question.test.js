import { jest } from "@jest/globals";

const getSupabaseClientMock = jest.fn();

jest.unstable_mockModule("../js/modules/supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

const { getAuthorQuestionByChapter, submitAuthorQuestionVote } = await import(
  "../js/modules/author_question.js"
);

function buildQuestionQuery(rows) {
  const limit = jest.fn().mockResolvedValue({ data: rows, error: null });
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  return { query: { select }, select, eq, order, limit };
}

describe("author_question module", () => {
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  test("getAuthorQuestionByChapter normalizes option text, votes, and saved selection", async () => {
    const { query, eq, order, limit } = buildQuestionQuery([
      {
        id: "12",
        chapter_id: "4",
        "main question": "  Which theme stood out?  ",
        options_texts: [" Justice ", "", "Family", null, "Courage"],
        options_votes: ["2", -4, "bad"],
      },
    ]);
    const from = jest.fn(() => query);
    getSupabaseClientMock.mockReturnValue({ from });

    const result = await getAuthorQuestionByChapter("4", 2);

    expect(result).toEqual({
      ok: true,
      data: {
        id: 12,
        chapterId: 4,
        title: "Author Question",
        question: "Which theme stood out?",
        options: ["Justice", "Family", "Courage"],
        voteCounts: [2, 0, 0],
        selectedOption: 2,
      },
    });
    expect(from).toHaveBeenCalledWith("Author Question");
    expect(eq).toHaveBeenCalledWith("chapter_id", 4);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  test("getAuthorQuestionByChapter rejects invalid chapter ids without querying", async () => {
    const from = jest.fn();
    getSupabaseClientMock.mockReturnValue({ from });

    await expect(getAuthorQuestionByChapter("chapter-one")).resolves.toEqual({
      ok: false,
      data: null,
      message: "Invalid chapter id",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("getAuthorQuestionByChapter returns null data for rows without usable options", async () => {
    const { query } = buildQuestionQuery([
      {
        id: 15,
        chapter_id: 8,
        "main question": "Pick one",
        options_texts: [" ", null],
        options_votes: [1, 2],
      },
    ]);
    getSupabaseClientMock.mockReturnValue({ from: jest.fn(() => query) });

    await expect(getAuthorQuestionByChapter(8)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  test("submitAuthorQuestionVote increments the selected option", async () => {
    let updatedVotes = null;
    const existingRow = {
      id: 22,
      chapter_id: 6,
      "main question": "Choose the strongest motive",
      options_texts: ["Justice", "Safety", "Truth"],
      options_votes: [3, 1, 0],
    };
    const maybeSingleFetch = jest.fn().mockResolvedValue({ data: existingRow, error: null });
    const maybeSingleUpdate = jest.fn(() =>
      Promise.resolve({
        data: { ...existingRow, options_votes: updatedVotes },
        error: null,
      })
    );
    const selectAfterUpdate = jest.fn(() => ({ maybeSingle: maybeSingleUpdate }));
    const updateEq = jest.fn(() => ({ select: selectAfterUpdate }));
    const update = jest.fn((payload) => {
      updatedVotes = payload.options_votes;
      return { eq: updateEq };
    });
    const fetchEq = jest.fn(() => ({ maybeSingle: maybeSingleFetch }));
    const select = jest.fn(() => ({ eq: fetchEq }));
    const from = jest.fn(() => ({ select, update }));

    getSupabaseClientMock.mockReturnValue({ from });

    const result = await submitAuthorQuestionVote({
      questionId: "22",
      selectedOptionIndex: "2",
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 22,
        selectedOption: 2,
        voteCounts: [3, 1, 1],
      }),
    });
    expect(update).toHaveBeenCalledWith({ options_votes: [3, 1, 1] });
    expect(updateEq).toHaveBeenCalledWith("id", 22);
  });

  test("submitAuthorQuestionVote validates ids and selected option range before updating", async () => {
    getSupabaseClientMock.mockReturnValue({ from: jest.fn() });

    await expect(
      submitAuthorQuestionVote({ questionId: 0, selectedOptionIndex: 1 })
    ).resolves.toEqual({
      ok: false,
      data: null,
      message: "Invalid question id",
    });

    const existingRow = {
      id: 30,
      chapter_id: 7,
      "main question": "Pick one",
      options_texts: ["A", "B"],
      options_votes: [0, 0],
    };
    const update = jest.fn();
    getSupabaseClientMock.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: existingRow, error: null }),
          })),
        })),
        update,
      })),
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 30, selectedOptionIndex: 4 })
    ).resolves.toEqual({
      ok: false,
      data: null,
      message: "Vote option out of range",
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("submitAuthorQuestionVote returns optimistic totals when update does not return a row", async () => {
    const existingRow = {
      id: 44,
      chapter_id: 6,
      "main question": "Choose one",
      options_texts: ["First", "Second"],
      options_votes: [2, 3],
    };
    const maybeSingleFetch = jest.fn().mockResolvedValue({ data: existingRow, error: null });
    const maybeSingleUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
    const selectAfterUpdate = jest.fn(() => ({ maybeSingle: maybeSingleUpdate }));
    const updateEq = jest.fn(() => ({ select: selectAfterUpdate }));
    const update = jest.fn(() => ({ eq: updateEq }));
    const fetchEq = jest.fn(() => ({ maybeSingle: maybeSingleFetch }));
    const select = jest.fn(() => ({ eq: fetchEq }));

    getSupabaseClientMock.mockReturnValue({
      from: jest.fn(() => ({ select, update })),
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 44, selectedOptionIndex: 1 })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        selectedOption: 1,
        voteCounts: [2, 4],
      }),
    });
  });
});
