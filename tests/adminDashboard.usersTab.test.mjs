/** @jest-environment jsdom */

import { jest } from '@jest/globals';

// Dependencies invoked by users-tab fetch, role updates, and delete actions.
const getSupabaseClientMock = jest.fn();
const getAllUsersMock = jest.fn();
const deleteUserByIdMock = jest.fn();
const openConfirmModalMock = jest.fn();
const openSelectModalMock = jest.fn();

// Minimal chained Supabase query stub for profiles.update(...).eq(...).
const eqMock = jest.fn().mockResolvedValue({ error: null });
const updateMock = jest.fn(() => ({ eq: eqMock }));
const fromMock = jest.fn(() => ({ update: updateMock }));

jest.unstable_mockModule('../js/modules/supabase.js', () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

jest.unstable_mockModule('../js/modules/auth.js', () => ({
  getAllUsers: getAllUsersMock,
  deleteUserById: deleteUserByIdMock,
}));

jest.unstable_mockModule('../js/modules/admin-dashboard/shared.js', () => ({
  TAB_KEYS: { USERS: 'users' },
  escapeHtml: (value) => String(value ?? ''),
  openConfirmModal: openConfirmModalMock,
  openSelectModal: openSelectModalMock,
}));

const { usersTab } = await import('../js/modules/admin-dashboard/users-tab.js');

describe('usersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    getSupabaseClientMock.mockReturnValue({ from: fromMock });
    deleteUserByIdMock.mockResolvedValue({ success: true });
    openConfirmModalMock.mockResolvedValue(true);
    openSelectModalMock.mockResolvedValue('subscriber');
  });

  // Verifies users tab fetch delegates to auth layer and remaps result shape.
  test('fetchRows delegates to auth.getAllUsers', async () => {
    getAllUsersMock.mockResolvedValue({
      success: true,
      data: [{ user_id: 'u1', email: 'a@example.com', role: 'free' }],
    });

    const result = await usersTab.fetchRows();

    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(getAllUsersMock).toHaveBeenCalledTimes(1);
  });

  // Verifies unsupported role values are rejected before update query runs.
  test('change role validates role input and blocks invalid values', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = document.createElement('button');
    actionBtn.setAttribute('data-action', 'change-user-role');
    actionBtn.setAttribute('data-id', 'u-1');
    actionBtn.setAttribute('data-role', 'free');

    openSelectModalMock.mockResolvedValueOnce('invalid-role');

    const handled = await usersTab.handleClick({
      event: { target: actionBtn },
      actionBtn,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('Invalid role');
    expect(fromMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies role-change modal cancel exits without DB writes.
  test('change role modal cancel does not update role', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = document.createElement('button');
    actionBtn.setAttribute('data-action', 'change-user-role');
    actionBtn.setAttribute('data-id', 'u-cancel');
    actionBtn.setAttribute('data-role', 'free');

    openSelectModalMock.mockResolvedValueOnce(null);

    const handled = await usersTab.handleClick({
      event: { target: actionBtn },
      actionBtn,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies valid role selection updates profile role and refreshes the table.
  test('change role updates profile and refreshes', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = document.createElement('button');
    actionBtn.setAttribute('data-action', 'change-user-role');
    actionBtn.setAttribute('data-id', 'u-22');
    actionBtn.setAttribute('data-role', 'free');

    openSelectModalMock.mockResolvedValueOnce('admin');

    const handled = await usersTab.handleClick({
      event: { target: actionBtn },
      actionBtn,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({ role: 'admin' });
    expect(eqMock).toHaveBeenCalledWith('user_id', 'u-22');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies missing supabase client is surfaced during role updates.
  test('change role shows missing supabase message', async () => {
    getSupabaseClientMock.mockReturnValue(null);
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = document.createElement('button');
    actionBtn.setAttribute('data-action', 'change-user-role');
    actionBtn.setAttribute('data-id', 'u-no-supabase');
    actionBtn.setAttribute('data-role', 'free');
    openSelectModalMock.mockResolvedValueOnce('subscriber');

    const handled = await usersTab.handleClick({
      event: { target: actionBtn },
      actionBtn,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('Supabase client not initialized');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies DB error is surfaced when role update fails.
  test('change role surfaces DB update errors', async () => {
    eqMock.mockResolvedValueOnce({ error: { message: 'role update failed' } });
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    const actionBtn = document.createElement('button');
    actionBtn.setAttribute('data-action', 'change-user-role');
    actionBtn.setAttribute('data-id', 'u-db-fail');
    actionBtn.setAttribute('data-role', 'free');
    openSelectModalMock.mockResolvedValueOnce('subscriber');

    const handled = await usersTab.handleClick({
      event: { target: actionBtn },
      actionBtn,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('role update failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies admin users are protected while non-admin delete path proceeds.
  test('delete flow blocks admin row and deletes non-admin on confirm', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr id="admin-row"><td>a@example.com</td><td>admin</td><td><button class="admin-delete-user-btn" data-id="admin-id">Delete</button></td></tr>
          <tr id="free-row"><td>b@example.com</td><td>free</td><td><button class="admin-delete-user-btn" data-id="free-id">Delete</button></td></tr>
        </tbody>
      </table>
    `;

    const adminDeleteBtn = document.querySelector('#admin-row .admin-delete-user-btn');
    const freeDeleteBtn = document.querySelector('#free-row .admin-delete-user-btn');

    let handled = await usersTab.handleClick({
      event: { target: adminDeleteBtn },
      actionBtn: null,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('cannot delete an admin');
    expect(deleteUserByIdMock).not.toHaveBeenCalled();

    handled = await usersTab.handleClick({
      event: { target: freeDeleteBtn },
      actionBtn: null,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(deleteUserByIdMock).toHaveBeenCalledWith('free-id');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Verifies canceling delete confirmation does not call delete service.
  test('delete flow respects confirmation cancel', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    openConfirmModalMock.mockResolvedValueOnce(false);

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr id="free-row"><td>b@example.com</td><td>free</td><td><button class="admin-delete-user-btn" data-id="free-id">Delete</button></td></tr>
        </tbody>
      </table>
    `;

    const freeDeleteBtn = document.querySelector('#free-row .admin-delete-user-btn');
    const handled = await usersTab.handleClick({
      event: { target: freeDeleteBtn },
      actionBtn: null,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(deleteUserByIdMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Verifies delete service failures are surfaced in status text.
  test('delete flow surfaces delete service errors', async () => {
    const statusEl = document.createElement('div');
    const refresh = jest.fn();
    deleteUserByIdMock.mockResolvedValueOnce({ success: false, message: 'delete failed' });

    document.body.innerHTML = `
      <table>
        <tbody>
          <tr id="free-row"><td>b@example.com</td><td>free</td><td><button class="admin-delete-user-btn" data-id="free-id">Delete</button></td></tr>
        </tbody>
      </table>
    `;

    const freeDeleteBtn = document.querySelector('#free-row .admin-delete-user-btn');
    const handled = await usersTab.handleClick({
      event: { target: freeDeleteBtn },
      actionBtn: null,
      statusEl,
      refresh,
    });

    expect(handled).toBe(true);
    expect(statusEl.textContent).toContain('delete failed');
    expect(refresh).not.toHaveBeenCalled();
  });
});
