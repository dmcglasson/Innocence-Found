import { jest } from "@jest/globals";

const getSupabaseClientMock = jest.fn();

jest.unstable_mockModule("../js/modules/supabase.js", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

const { getAuthorQuestionByChapter, submitAuthorQuestionVote } = await import(
  "../js/modules/author_question.js"
);

function buildQuestionListQuery(rows) {
  const limit = jest.fn().mockResolvedValue({ data: rows, error: null });
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  return { query: { select }, select, eq, order, limit };
}

function buildQuestionListErrorQuery(message) {
  const limit = jest.fn().mockResolvedValue({ data: null, error: { message } });
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  return { query: { select }, select, eq, order, limit };
}

function buildQuestionSingleQuery(row) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  return { query: { select }, select, eq, maybeSingle };
}

function buildVoteRowsQuery(rows) {
  const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
  const select = jest.fn(() => ({ eq }));
  return { query: { select }, select, eq };
}

function buildExistingVoteQuery(row) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
  const userEq = jest.fn(() => ({ maybeSingle }));
  const questionEq = jest.fn(() => ({ eq: userEq }));
  const select = jest.fn(() => ({ eq: questionEq }));
  return { query: { select }, select, questionEq, userEq, maybeSingle };
}

function buildInsertVoteQuery() {
  const insert = jest.fn().mockResolvedValue({ error: null });
  return { query: { insert }, insert };
}

function buildInsertVoteErrorQuery(error) {
  const insert = jest.fn().mockResolvedValue({ error });
  return { query: { insert }, insert };
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

  test("getAuthorQuestionByChapter normalizes fixed options, vote totals, and existing user vote", async () => {
    const questionRow = {
      id: "12",
      chapter_id: "4",
      question_text: "  Which theme stood out?  ",
      option_1_text: " Justice ",
      option_2_text: "Family",
      option_3_text: "Courage",
    };
    const questionQuery = buildQuestionListQuery([questionRow]);
    const voteRowsQuery = buildVoteRowsQuery([
      { chosen_option: 1 },
      { chosen_option: 1 },
      { chosen_option: 3 },
      { chosen_option: 99 },
    ]);
    const existingVoteQuery = buildExistingVoteQuery({ chosen_option: 3 });
    const from = jest
      .fn()
      .mockImplementationOnce(() => questionQuery.query)
      .mockImplementationOnce(() => voteRowsQuery.query)
      .mockImplementationOnce(() => existingVoteQuery.query);
    getSupabaseClientMock.mockReturnValue({
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    const result = await getAuthorQuestionByChapter("4");

    expect(result).toEqual({
      ok: true,
      data: {
        id: 12,
        chapterId: 4,
        title: "Author Question",
        question: "Which theme stood out?",
        options: ["Justice", "Family", "Courage"],
        voteCounts: [2, 0, 1],
        selectedOption: 2,
      },
    });
    expect(from).toHaveBeenNthCalledWith(1, "author_questions");
    expect(from).toHaveBeenNthCalledWith(2, "author_question_votes");
    expect(from).toHaveBeenNthCalledWith(3, "author_question_votes");
    expect(questionQuery.eq).toHaveBeenCalledWith("chapter_id", 4);
    expect(questionQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(questionQuery.limit).toHaveBeenCalledWith(1);
    expect(voteRowsQuery.eq).toHaveBeenCalledWith("question_id", 12);
    expect(existingVoteQuery.questionEq).toHaveBeenCalledWith("question_id", 12);
    expect(existingVoteQuery.userEq).toHaveBeenCalledWith("user_id", "user-1");
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

  test("getAuthorQuestionByChapter returns null data for rows without all fixed options", async () => {
    const questionQuery = buildQuestionListQuery([
      {
        id: 15,
        chapter_id: 8,
        question_text: "Pick one",
        option_1_text: "First",
        option_2_text: "",
        option_3_text: "Third",
      },
    ]);
    const voteRowsQuery = buildVoteRowsQuery([]);
    const existingVoteQuery = buildExistingVoteQuery(null);
    getSupabaseClientMock.mockReturnValue({
      from: jest
        .fn()
        .mockImplementationOnce(() => questionQuery.query)
        .mockImplementationOnce(() => voteRowsQuery.query)
        .mockImplementationOnce(() => existingVoteQuery.query),
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    await expect(getAuthorQuestionByChapter(8)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  test("getAuthorQuestionByChapter returns the Supabase query error without fetching votes", async () => {
    const questionQuery = buildQuestionListErrorQuery("permission denied");
    const from = jest.fn(() => questionQuery.query);
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    getSupabaseClientMock.mockReturnValue({
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    await expect(getAuthorQuestionByChapter(4)).resolves.toEqual({
      ok: false,
      data: null,
      message: "permission denied",
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  test("submitAuthorQuestionVote inserts a vote row and refreshes aggregated totals", async () => {
    const questionRow = {
      id: 22,
      chapter_id: 6,
      question_text: "Choose the strongest motive",
      option_1_text: "Justice",
      option_2_text: "Safety",
      option_3_text: "Truth",
    };
    const fetchQuestionQuery = buildQuestionSingleQuery(questionRow);
    const noExistingVoteQuery = buildExistingVoteQuery(null);
    const insertVoteQuery = buildInsertVoteQuery();
    const refreshedVoteRowsQuery = buildVoteRowsQuery([
      { chosen_option: 1 },
      { chosen_option: 2 },
      { chosen_option: 3 },
      { chosen_option: 3 },
    ]);
    const refreshedExistingVoteQuery = buildExistingVoteQuery({ chosen_option: 3 });
    const from = jest
      .fn()
      .mockImplementationOnce(() => fetchQuestionQuery.query)
      .mockImplementationOnce(() => noExistingVoteQuery.query)
      .mockImplementationOnce(() => insertVoteQuery.query)
      .mockImplementationOnce(() => refreshedVoteRowsQuery.query)
      .mockImplementationOnce(() => refreshedExistingVoteQuery.query);

    getSupabaseClientMock.mockReturnValue({
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    const result = await submitAuthorQuestionVote({
      questionId: "22",
      selectedOptionIndex: "2",
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 22,
        selectedOption: 2,
        voteCounts: [1, 1, 2],
      }),
    });
    expect(insertVoteQuery.insert).toHaveBeenCalledWith({
      question_id: 22,
      user_id: "user-1",
      chosen_option: 3,
    });
  });

  test("submitAuthorQuestionVote uses the vote edge function when available", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
        question: {
          id: 55,
          chapter_id: 12,
          question_text: "Choose one",
          option_1_text: "First",
          option_2_text: "Second",
          option_3_text: "Third",
        },
        votes: [
          { chosen_option: 1 },
          { chosen_option: 2 },
          { chosen_option: 2 },
        ],
        selectedVote: { chosen_option: 2 },
      },
      error: null,
    });
    const from = jest.fn();

    getSupabaseClientMock.mockReturnValue({
      functions: { invoke },
      from,
    });

    const result = await submitAuthorQuestionVote({
      questionId: 55,
      selectedOptionIndex: 1,
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 55,
        selectedOption: 1,
        voteCounts: [1, 2, 0],
      }),
    });
    expect(invoke).toHaveBeenCalledWith("submit-author-question-vote", {
      body: {
        questionId: 55,
        selectedOptionIndex: 1,
        chosenOption: 2,
      },
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("submitAuthorQuestionVote returns edge function business errors without direct fallback", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: { error: "Forbidden: subscriber access required" },
      error: null,
    });
    const from = jest.fn();

    getSupabaseClientMock.mockReturnValue({
      functions: { invoke },
      from,
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 55, selectedOptionIndex: 1 })
    ).resolves.toEqual({
      ok: false,
      data: null,
      message: "Forbidden: subscriber access required",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("submitAuthorQuestionVote falls back to direct insert when the edge function request cannot be sent", async () => {
    const questionRow = {
      id: 66,
      chapter_id: 14,
      question_text: "Choose one",
      option_1_text: "First",
      option_2_text: "Second",
      option_3_text: "Third",
    };
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: {
        name: "FunctionsFetchError",
        message: "Failed to send a request to the Edge Function",
      },
    });
    const fetchQuestionQuery = buildQuestionSingleQuery(questionRow);
    const noExistingVoteQuery = buildExistingVoteQuery(null);
    const insertVoteQuery = buildInsertVoteQuery();
    const refreshedVoteRowsQuery = buildVoteRowsQuery([
      { chosen_option: 1 },
      { chosen_option: 2 },
    ]);
    const refreshedExistingVoteQuery = buildExistingVoteQuery({ chosen_option: 2 });
    const from = jest
      .fn()
      .mockImplementationOnce(() => fetchQuestionQuery.query)
      .mockImplementationOnce(() => noExistingVoteQuery.query)
      .mockImplementationOnce(() => insertVoteQuery.query)
      .mockImplementationOnce(() => refreshedVoteRowsQuery.query)
      .mockImplementationOnce(() => refreshedExistingVoteQuery.query);

    getSupabaseClientMock.mockReturnValue({
      functions: { invoke },
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    const result = await submitAuthorQuestionVote({
      questionId: 66,
      selectedOptionIndex: 1,
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 66,
        selectedOption: 1,
        voteCounts: [1, 1, 0],
      }),
    });
    expect(invoke).toHaveBeenCalled();
    expect(insertVoteQuery.insert).toHaveBeenCalledWith({
      question_id: 66,
      user_id: "user-1",
      chosen_option: 2,
    });
  });

  test("submitAuthorQuestionVote falls back when the edge function throws a fetch error", async () => {
    const questionRow = {
      id: 67,
      chapter_id: 14,
      question_text: "Choose one",
      option_1_text: "First",
      option_2_text: "Second",
      option_3_text: "Third",
    };
    const invoke = jest.fn().mockRejectedValue(
      Object.assign(new Error("Failed to fetch"), { name: "FunctionsFetchError" })
    );
    const fetchQuestionQuery = buildQuestionSingleQuery(questionRow);
    const noExistingVoteQuery = buildExistingVoteQuery(null);
    const insertVoteQuery = buildInsertVoteQuery();
    const refreshedVoteRowsQuery = buildVoteRowsQuery([{ chosen_option: 3 }]);
    const refreshedExistingVoteQuery = buildExistingVoteQuery({ chosen_option: 3 });
    const from = jest
      .fn()
      .mockImplementationOnce(() => fetchQuestionQuery.query)
      .mockImplementationOnce(() => noExistingVoteQuery.query)
      .mockImplementationOnce(() => insertVoteQuery.query)
      .mockImplementationOnce(() => refreshedVoteRowsQuery.query)
      .mockImplementationOnce(() => refreshedExistingVoteQuery.query);

    getSupabaseClientMock.mockReturnValue({
      functions: { invoke },
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 67, selectedOptionIndex: 2 })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 67,
        selectedOption: 2,
        voteCounts: [0, 0, 1],
      }),
    });
    expect(insertVoteQuery.insert).toHaveBeenCalledWith({
      question_id: 67,
      user_id: "user-1",
      chosen_option: 3,
    });
  });

  test("submitAuthorQuestionVote requires a signed-in user for the direct fallback", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: {
        name: "FunctionsFetchError",
        message: "Failed to send a request to the Edge Function",
      },
    });
    const from = jest.fn();

    getSupabaseClientMock.mockReturnValue({
      functions: { invoke },
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 70, selectedOptionIndex: 1 })
    ).resolves.toEqual({
      ok: false,
      data: null,
      message: "Please log in to submit a vote.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("submitAuthorQuestionVote validates ids and option range before inserting", async () => {
    getSupabaseClientMock.mockReturnValue({ from: jest.fn() });

    await expect(
      submitAuthorQuestionVote({ questionId: 0, selectedOptionIndex: 1 })
    ).resolves.toEqual({
      ok: false,
      data: null,
      message: "Invalid question id",
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 30, selectedOptionIndex: 4 })
    ).resolves.toEqual({
      ok: false,
      data: null,
      message: "Invalid vote option",
    });
  });

  test("submitAuthorQuestionVote returns the existing vote instead of inserting a duplicate", async () => {
    const questionRow = {
      id: 44,
      chapter_id: 6,
      question_text: "Choose one",
      option_1_text: "First",
      option_2_text: "Second",
      option_3_text: "Third",
    };
    const fetchQuestionQuery = buildQuestionSingleQuery(questionRow);
    const existingVoteQuery = buildExistingVoteQuery({ chosen_option: 2 });
    const refreshedVoteRowsQuery = buildVoteRowsQuery([
      { chosen_option: 1 },
      { chosen_option: 2 },
      { chosen_option: 2 },
    ]);
    const refreshedExistingVoteQuery = buildExistingVoteQuery({ chosen_option: 2 });
    const insertQuery = buildInsertVoteQuery();

    getSupabaseClientMock.mockReturnValue({
      from: jest
        .fn()
        .mockImplementationOnce(() => fetchQuestionQuery.query)
        .mockImplementationOnce(() => existingVoteQuery.query)
        .mockImplementationOnce(() => refreshedVoteRowsQuery.query)
        .mockImplementationOnce(() => refreshedExistingVoteQuery.query)
        .mockImplementationOnce(() => insertQuery.query),
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 44, selectedOptionIndex: 1 })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        selectedOption: 1,
        voteCounts: [1, 2, 0],
      }),
    });
    expect(insertQuery.insert).not.toHaveBeenCalled();
  });

  test("submitAuthorQuestionVote refreshes the existing vote after a duplicate insert race", async () => {
    const questionRow = {
      id: 77,
      chapter_id: 9,
      question_text: "Choose one",
      option_1_text: "First",
      option_2_text: "Second",
      option_3_text: "Third",
    };
    const fetchQuestionQuery = buildQuestionSingleQuery(questionRow);
    const noExistingVoteQuery = buildExistingVoteQuery(null);
    const insertVoteQuery = buildInsertVoteErrorQuery({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });
    const refreshedVoteRowsQuery = buildVoteRowsQuery([
      { chosen_option: 1 },
      { chosen_option: 1 },
      { chosen_option: 3 },
    ]);
    const refreshedExistingVoteQuery = buildExistingVoteQuery({ chosen_option: 1 });
    const from = jest
      .fn()
      .mockImplementationOnce(() => fetchQuestionQuery.query)
      .mockImplementationOnce(() => noExistingVoteQuery.query)
      .mockImplementationOnce(() => insertVoteQuery.query)
      .mockImplementationOnce(() => refreshedVoteRowsQuery.query)
      .mockImplementationOnce(() => refreshedExistingVoteQuery.query);

    getSupabaseClientMock.mockReturnValue({
      from,
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    await expect(
      submitAuthorQuestionVote({ questionId: 77, selectedOptionIndex: 0 })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        selectedOption: 0,
        voteCounts: [2, 0, 1],
      }),
    });
    expect(insertVoteQuery.insert).toHaveBeenCalledWith({
      question_id: 77,
      user_id: "user-1",
      chosen_option: 1,
    });
  });
});
