/** @jest-environment jsdom */

import { jest } from '@jest/globals';

// Dependencies used by comments-tab controls, profile lookups, and row actions.
const deleteCommentByIdMock = jest.fn();
const updateCommentByIdMock = jest.fn();
const openConfirmModalMock = jest.fn();
const openTextModalMock = jest.fn();
const runQueryOnCandidatesMock = jest.fn();

jest.unstable_mockModule('../js/modules/auth.js', () => ({
  deleteCommentById: deleteCommentByIdMock,
  updateCommentById: updateCommentByIdMock,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/shared.js', () => ({
  TAB_KEYS: { COMMENTS: 'comments' },
  TABLE_CANDIDATES: { comments: ['Comments', 'comments'] },
  escapeHtml: (value) => String(value ?? ''),
  formatDate: () => 'Apr 3, 2026',
  openConfirmModal: openConfirmModalMock,
  openTextModal: openTextModalMock,
  runQueryOnCandidates: runQueryOnCandidatesMock,
}));

const { commentsTab } = await import('../js/modules/admin-dashboard/comments-tab.js');

describe('commentsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    openConfirmModalMock.mockResolvedValue(true);
    openTextModalMock.mockResolvedValue('Updated comment');
    updateCommentByIdMock.mockResolvedValue({ success: true });
    deleteCommentByIdMock.mockResolvedValue({ success: true });
  });

  // Verifies controls request failures return empty controls markup.
  test('getControls returns empty html on query failure', async () => {
    runQueryOnCandidatesMock.mockResolvedValueOnce({ success: false, data: [], message: 'failed' });

    const controls = await commentsTab.getControls({ supabase: {} });

    expect(controls).toEqual({ html: '' });
  });

  // Verifies filter controls render sorted chapter options and trigger refresh.
  test('builds chapter filter controls and refreshes on selection change', async () => {
    runQueryOnCandidatesMock.mockResolvedValueOnce({
      success: true,
      data: [{ chapter_id: 2 }, { chapter_id: 1 }, { chapter_id: 2 }],
    });

    const controls = await commentsTab.getControls({ supabase: {} });
    const refresh = jest.fn();

    const controlsRoot = document.createElement('div');
    controlsRoot.innerHTML = controls.html;
    commentsTab.bindControls({ controlsRoot, refresh });

    const select = controlsRoot.querySelector('#adminCommentsChapterFilter');
    expect(select).not.toBeNull();
    expect(controlsRoot.innerHTML).toContain('Chapter 1');
    expect(controlsRoot.innerHTML).toContain('Chapter 2');

    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies bindControls safely exits when filter select is not present.
  test('bindControls no-ops when chapter filter select is missing', async () => {
    const controlsRoot = document.createElement('div');
    const refresh = jest.fn();

    commentsTab.bindControls({ controlsRoot, refresh });

    controlsRoot.dispatchEvent(new Event('change', { bubbles: true }));
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies fetchRows surfaces base query failures.
  test('fetchRows returns failure when comments query fails', async () => {
    runQueryOnCandidatesMock.mockResolvedValueOnce({ success: false, data: [], message: 'comments failed' });

    const result = await commentsTab.fetchRows({});

    expect(result.success).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.message).toBe('comments failed');
  });

  // Verifies comment rows are enriched with profile usernames when available.
  test('fetchRows merges usernames from profiles lookup', async () => {
    runQueryOnCandidatesMock
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'c1', uid: 'u1', message: 'hello', created_at: '2026-04-03' }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ user_id: 'u1', username: 'reader1' }],
      });

    const result = await commentsTab.fetchRows({});

    expect(result.success).toBe(true);
    expect(result.rows[0]).toMatchObject({ id: 'c1', username: 'reader1', commenterId: 'u1' });
    expect(runQueryOnCandidatesMock).toHaveBeenCalledTimes(2);
  });

  // Verifies profile lookup failures fall back to commenter IDs.
  test('fetchRows falls back to commenter id when profile lookup fails', async () => {
    runQueryOnCandidatesMock
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'c8', uid: 'u8', message: 'hello', created_at: '2026-04-03' }],
      })
      .mockResolvedValueOnce({ success: false, data: [], message: 'profiles failed' });

    const result = await commentsTab.fetchRows({});

    expect(result.success).toBe(true);
    expect(result.rows[0]).toMatchObject({ id: 'c8', username: 'u8', commenterId: 'u8' });
  });

  // Verifies rendered rows include comment edit/delete controls.
  test('renderRows includes edit and delete actions', () => {
    const html = commentsTab.renderRows([
      { id: 'c5', username: 'reader2', commenterId: 'u2', message: 'msg', created_at: '2026-04-03' },
    ]);

    expect(html).toContain('reader2');
    expect(html).toContain('admin-edit-comment-btn');
    expect(html).toContain('admin-delete-comment-btn');
  });

  // Verifies edit and delete actions call service methods and refresh on success.
  test('handleClick updates and deletes comments with refresh', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>user</td>
            <td>Original text</td>
            <td>now</td>
            <td>
              <button class="admin-edit-comment-btn" data-id="c22">Edit</button>
              <button class="admin-delete-comment-btn" data-id="c22">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const editBtn = document.querySelector('.admin-edit-comment-btn');
    let handled = await commentsTab.handleClick({ event: { target: editBtn }, statusEl, refresh });

    expect(handled).toBe(true);
    expect(updateCommentByIdMock).toHaveBeenCalledWith('c22', 'Updated comment');

    const deleteBtn = document.querySelector('.admin-delete-comment-btn');
    handled = await commentsTab.handleClick({ event: { target: deleteBtn }, statusEl, refresh });

    expect(handled).toBe(true);
    expect(deleteCommentByIdMock).toHaveBeenCalledWith('c22');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  // Verifies edit cancel/blank input does not trigger update calls.
  test('handleClick edit exits when modal returns blank text', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    openTextModalMock.mockResolvedValueOnce('   ');

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>user</td>
            <td>Original text</td>
            <td>now</td>
            <td><button class="admin-edit-comment-btn" data-id="c40">Edit</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const editBtn = document.querySelector('.admin-edit-comment-btn');
    const handled = await commentsTab.handleClick({ event: { target: editBtn }, statusEl, refresh });

    expect(handled).toBe(true);
    expect(updateCommentByIdMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies edit failures are surfaced in status text.
  test('handleClick surfaces update failures', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    openTextModalMock.mockResolvedValueOnce('Updated value');
    updateCommentByIdMock.mockResolvedValueOnce({ success: false, message: 'update failed' });

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>user</td>
            <td>Original text</td>
            <td>now</td>
            <td><button class="admin-edit-comment-btn" data-id="c50">Edit</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const editBtn = document.querySelector('.admin-edit-comment-btn');
    const handled = await commentsTab.handleClick({ event: { target: editBtn }, statusEl, refresh });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('update failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete cancel path does not call delete service.
  test('handleClick delete exits when confirmation is canceled', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    openConfirmModalMock.mockResolvedValueOnce(false);

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>user</td>
            <td>Original text</td>
            <td>now</td>
            <td><button class="admin-delete-comment-btn" data-id="c60">Delete</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const deleteBtn = document.querySelector('.admin-delete-comment-btn');
    const handled = await commentsTab.handleClick({ event: { target: deleteBtn }, statusEl, refresh });

    expect(handled).toBe(true);
    expect(deleteCommentByIdMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete failures are surfaced in status text.
  test('handleClick surfaces delete failures', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    openConfirmModalMock.mockResolvedValueOnce(true);
    deleteCommentByIdMock.mockResolvedValueOnce({ success: false, message: 'delete failed' });

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>user</td>
            <td>Original text</td>
            <td>now</td>
            <td><button class="admin-delete-comment-btn" data-id="c70">Delete</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const deleteBtn = document.querySelector('.admin-delete-comment-btn');
    const handled = await commentsTab.handleClick({ event: { target: deleteBtn }, statusEl, refresh });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('delete failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies unrelated click targets are ignored by comment action handler.
  test('handleClick returns false for unrelated click targets', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const outside = document.createElement('button');

    const handled = await commentsTab.handleClick({ event: { target: outside }, statusEl, refresh });

    expect(handled).toBe(false);
  });
});
