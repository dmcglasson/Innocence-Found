/** @jest-environment jsdom */

import { jest } from '@jest/globals';

// External collaborators used by chapters-tab action handlers.
const getSupabaseClientMock = jest.fn();
const openConfirmModalMock = jest.fn();
const runQueryOnCandidatesMock = jest.fn();

jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/shared.js', () => ({
  TAB_KEYS: { CHAPTERS: 'chapters' },
  TABLE_CANDIDATES: { chapters: ['Chapters', 'chapters'] },
  escapeHtml: (value) => String(value ?? ''),
  formatDate: () => 'Apr 1, 2026',
  openConfirmModal: openConfirmModalMock,
  runQueryOnCandidates: runQueryOnCandidatesMock,
}));

const { chaptersTab } = await import('../js/modules/admin-dashboard/chapters-tab.js');

// Creates an action button with the same data attributes as real table rows.
function makeEditButton(overrides = {}) {
  const btn = document.createElement('button');
  btn.className = 'admin-action-btn';
  btn.setAttribute('data-action', 'edit-chapter');
  btn.setAttribute('data-id', '10');
  btn.setAttribute('data-chapter-num', '3');
  btn.setAttribute('data-title', 'Old title');
  btn.setAttribute('data-description', 'Old desc');
  btn.setAttribute('data-free', '1');
  btn.setAttribute('data-release-date', '2026-04-01');

  Object.entries(overrides).forEach(([key, value]) => {
    btn.setAttribute(key, value);
  });

  return btn;
}

describe('chaptersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    getSupabaseClientMock.mockReturnValue({});
    runQueryOnCandidatesMock.mockResolvedValue({ success: true, data: [] });
    openConfirmModalMock.mockResolvedValue(true);
  });

  // Verifies non-action clicks return false and do not perform work.
  test('returns false when action button is missing or unknown', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const unknownBtn = document.createElement('button');
    unknownBtn.setAttribute('data-action', 'unknown-action');

    expect(await chaptersTab.handleClick({ actionBtn: null, statusEl, refresh })).toBe(false);
    expect(await chaptersTab.handleClick({ actionBtn: unknownBtn, statusEl, refresh })).toBe(false);
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
  });

  // Verifies rendered rows include action controls expected by click handlers.
  test('renders rows with chapter actions', () => {
    const html = chaptersTab.renderRows([
      { id: 7, chapter_num: 4, title: 'Chapter 4', description: 'Desc', free: false, release_date: '2026-04-01' },
    ]);

    expect(html).toContain('Chapter 4');
    expect(html).toContain('data-action="edit-chapter"');
    expect(html).toContain('data-action="delete-chapter"');
  });

  // Verifies invalid chapter numbers are rejected before any persistence call.
  test('validates chapter number before update', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = makeEditButton();

    const pending = chaptersTab.handleClick({ actionBtn, statusEl, refresh });

    const form = document.querySelector('#adminChapterModalForm');
    document.querySelector('#adminChapterNumInput').value = '0';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('positive integer');
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies canceling edit modal exits without persistence calls.
  test('edit modal cancel returns handled without updates', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = makeEditButton();

    const pending = chaptersTab.handleClick({ actionBtn, statusEl, refresh });
    document.querySelector('.admin-modal-cancel-btn').click();

    const handled = await pending;

    expect(handled).toBe(true);
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies invalid access value is rejected before update.
  test('validates chapter access options', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = makeEditButton();

    const pending = chaptersTab.handleClick({ actionBtn, statusEl, refresh });
    const accessSelect = document.querySelector('#adminChapterAccessInput');
    accessSelect.innerHTML += '<option value="invalid">invalid</option>';
    accessSelect.value = 'invalid';
    document
      .querySelector('#adminChapterModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('Access must be either free or protected');
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
  });

  // Verifies invalid release date is rejected before update.
  test('validates release date format', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = makeEditButton();

    const pending = chaptersTab.handleClick({ actionBtn, statusEl, refresh });
    const dateInput = document.querySelector('#adminChapterReleaseDateInput');
    dateInput.type = 'text';
    dateInput.value = 'not-a-date';
    document
      .querySelector('#adminChapterModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('Release Date must be a valid date');
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
  });

  // Verifies a valid edit submission triggers update query and refresh callback.
  test('submits valid edit and refreshes table', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = makeEditButton();

    const pending = chaptersTab.handleClick({ actionBtn, statusEl, refresh });

    const form = document.querySelector('#adminChapterModalForm');
    document.querySelector('#adminChapterNumInput').value = '8';
    document.querySelector('#adminChapterTitleInput').value = 'Updated title';
    document.querySelector('#adminChapterDescriptionInput').value = 'Updated desc';
    document.querySelector('#adminChapterReleaseDateInput').value = '2026-05-01';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(runQueryOnCandidatesMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies update query failures are surfaced in status text.
  test('shows update error message when chapter update fails', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = makeEditButton();
    runQueryOnCandidatesMock.mockResolvedValueOnce({ success: false, message: 'update failed' });

    const pending = chaptersTab.handleClick({ actionBtn, statusEl, refresh });
    document.querySelector('#adminChapterNumInput').value = '5';
    document.querySelector('#adminChapterTitleInput').value = 'Updated title';
    document
      .querySelector('#adminChapterModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('update failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete workflow only calls backend after user confirmation.
  test('delete flow respects confirmation and refreshes on success', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-action', 'delete-chapter');
    deleteBtn.setAttribute('data-id', '77');

    openConfirmModalMock.mockResolvedValueOnce(false);
    await chaptersTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();

    openConfirmModalMock.mockResolvedValueOnce(true);
    await chaptersTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });
    expect(runQueryOnCandidatesMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies delete failures are surfaced in status text.
  test('shows delete error when chapter deletion fails', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-action', 'delete-chapter');
    deleteBtn.setAttribute('data-id', '88');
    runQueryOnCandidatesMock.mockResolvedValueOnce({ success: false, message: 'delete failed' });

    await chaptersTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });

    expect(statusEl.textContent).toContain('delete failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete branch handles missing supabase client safely.
  test('shows supabase error when delete runs without client', async () => {
    getSupabaseClientMock.mockReturnValue(null);
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-action', 'delete-chapter');
    deleteBtn.setAttribute('data-id', '99');

    await chaptersTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });

    expect(statusEl.textContent).toContain('Supabase client not initialized');
    expect(refresh).not.toHaveBeenCalled();
  });
});
