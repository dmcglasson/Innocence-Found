/** @jest-environment jsdom */

import { jest } from '@jest/globals';

// External collaborators for worksheet edit/delete actions.
const getSupabaseClientMock = jest.fn();
const openConfirmModalMock = jest.fn();
const runQueryOnCandidatesMock = jest.fn();

jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/shared.js', () => ({
  TAB_KEYS: { WORKSHEETS: 'worksheets' },
  TABLE_CANDIDATES: { worksheets: ['worksheets', 'Worksheets'] },
  escapeHtml: (value) => String(value ?? ''),
  formatDate: () => 'Apr 2, 2026',
  openConfirmModal: openConfirmModalMock,
  runQueryOnCandidates: runQueryOnCandidatesMock,
}));

const { worksheetsTab } = await import('../js/modules/admin-dashboard/worksheets-tab.js');

// Mirrors attributes provided by rendered worksheet rows.
function makeEditButton() {
  const btn = document.createElement('button');
  btn.setAttribute('data-action', 'edit-worksheet');
  btn.setAttribute('data-id', 'ws-1');
  btn.setAttribute('data-title', 'Old worksheet');
  btn.setAttribute('data-description', 'Old description');
  btn.setAttribute('data-release-date', '2026-04-02');
  return btn;
}

describe('worksheetsTab', () => {
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

    expect(await worksheetsTab.handleClick({ actionBtn: null, statusEl, refresh })).toBe(false);
    expect(await worksheetsTab.handleClick({ actionBtn: unknownBtn, statusEl, refresh })).toBe(false);
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
  });

  // Verifies worksheet table rows expose expected edit/delete action buttons.
  test('renders worksheet rows with edit/delete actions', () => {
    const html = worksheetsTab.renderRows([
      { id: 'ws-1', title: 'Worksheet A', description: 'desc', release_date: '2026-04-02' },
    ]);

    expect(html).toContain('Worksheet A');
    expect(html).toContain('data-action="edit-worksheet"');
    expect(html).toContain('data-action="delete-worksheet"');
  });

  // Verifies edit flow blocks submissions where title is blank after trimming.
  test('blocks update when edited title is empty', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();

    const pending = worksheetsTab.handleClick({ actionBtn: makeEditButton(), statusEl, refresh });
    document.querySelector('#adminWorksheetTitleInput').value = '   ';
    document
      .querySelector('#adminWorksheetModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('Title cannot be empty');
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
  });

  // Verifies canceling edit modal exits without update calls.
  test('edit modal cancel returns handled without updates', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();

    const pending = worksheetsTab.handleClick({ actionBtn: makeEditButton(), statusEl, refresh });
    document.querySelector('.admin-modal-cancel-btn').click();

    const handled = await pending;

    expect(handled).toBe(true);
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies invalid release date is rejected before update.
  test('validates worksheet release date format', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();

    const pending = worksheetsTab.handleClick({ actionBtn: makeEditButton(), statusEl, refresh });
    const dateInput = document.querySelector('#adminWorksheetReleaseDateInput');
    dateInput.type = 'text';
    dateInput.value = 'invalid-date';
    document
      .querySelector('#adminWorksheetModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('Release Date must be a valid date');
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();
  });

  // Verifies successful worksheet edits persist changes and refresh the table.
  test('updates worksheet and refreshes on valid edit', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();

    const pending = worksheetsTab.handleClick({ actionBtn: makeEditButton(), statusEl, refresh });
    document.querySelector('#adminWorksheetTitleInput').value = 'Updated worksheet';
    document.querySelector('#adminWorksheetReleaseDateInput').value = '2026-05-02';
    document
      .querySelector('#adminWorksheetModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(runQueryOnCandidatesMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies update failures are surfaced in status text.
  test('shows update error message when worksheet update fails', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    runQueryOnCandidatesMock.mockResolvedValueOnce({ success: false, message: 'update failed' });

    const pending = worksheetsTab.handleClick({ actionBtn: makeEditButton(), statusEl, refresh });
    document.querySelector('#adminWorksheetTitleInput').value = 'Updated worksheet';
    document
      .querySelector('#adminWorksheetModalForm')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const handled = await pending;

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('update failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete path respects confirmation before issuing delete query.
  test('deletes worksheet only after confirmation', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-action', 'delete-worksheet');
    deleteBtn.setAttribute('data-id', 'ws-9');

    openConfirmModalMock.mockResolvedValueOnce(false);
    await worksheetsTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });
    expect(runQueryOnCandidatesMock).not.toHaveBeenCalled();

    openConfirmModalMock.mockResolvedValueOnce(true);
    await worksheetsTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });
    expect(runQueryOnCandidatesMock).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies delete branch handles missing supabase client safely.
  test('shows missing supabase message when deleting without client', async () => {
    getSupabaseClientMock.mockReturnValue(null);
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-action', 'delete-worksheet');
    deleteBtn.setAttribute('data-id', 'ws-10');

    await worksheetsTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });

    expect(statusEl.textContent).toContain('Supabase client not initialized');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete query failures are surfaced in status text.
  test('shows delete error message when worksheet deletion fails', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-action', 'delete-worksheet');
    deleteBtn.setAttribute('data-id', 'ws-11');
    runQueryOnCandidatesMock.mockResolvedValueOnce({ success: false, message: 'delete failed' });

    await worksheetsTab.handleClick({ actionBtn: deleteBtn, statusEl, refresh });

    expect(statusEl.textContent).toContain('delete failed');
    expect(refresh).not.toHaveBeenCalled();
  });
});
