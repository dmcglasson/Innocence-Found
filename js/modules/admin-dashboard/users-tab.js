import { getSupabaseClient } from '../supabase.js';
import { deleteUserById, getAllUsers } from '../auth.js';
import { TAB_KEYS, escapeHtml, openConfirmModal, openSelectModal } from './shared.js';

async function updateUserRole(userId, role) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('user_id', userId);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

export const usersTab = {
  key: TAB_KEYS.USERS,

  getMeta() {
    return {
      title: 'Users',
      subtitle: 'Review user roles and manage account access.',
      headers: ['Email', 'Role', 'Actions'],
      empty: 'No users found.',
    };
  },

  async fetchRows() {
    const result = await getAllUsers();
    return {
      success: result.success,
      rows: result.data || [],
      message: result.message,
    };
  },

  renderRows(rows) {
    return rows
      .map((row) => {
        const role = String(row.role || 'free');
        const email = String(row.email || '').trim() || 'N/A';
        return `
          <tr>
            <td>${escapeHtml(email)}</td>
            <td>${escapeHtml(role)}</td>
            <td>
              <button class="action-btn admin-action-btn" data-action="change-user-role" data-id="${escapeHtml(row.user_id)}" data-role="${escapeHtml(role)}">Change Role</button>
              <button class="action-btn admin-delete-user-btn" data-id="${escapeHtml(row.user_id)}">Delete</button>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  async handleClick({ event, actionBtn, statusEl, refresh }) {
    const deleteUserBtn = event.target.closest('.admin-delete-user-btn');
    if (deleteUserBtn) {
      const row = deleteUserBtn.closest('tr');
      const role = String(row?.children?.[1]?.textContent || '').trim().toLowerCase();
      if (role === 'admin') {
        if (statusEl) statusEl.textContent = 'You cannot delete an admin account.';
        return true;
      }

      const confirmed = await openConfirmModal({
        title: 'Delete User',
        message: 'Delete this user account?',
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (!confirmed) return true;

      const userId = deleteUserBtn.getAttribute('data-id');
      const deleteResult = await deleteUserById(userId);
      if (!deleteResult.success) {
        if (statusEl) statusEl.textContent = deleteResult.message || 'Failed to delete user.';
        return true;
      }

      await refresh();
      return true;
    }

    if (!actionBtn) return false;

    const action = actionBtn.getAttribute('data-action');
    if (action !== 'change-user-role') {
      return false;
    }

    const userId = actionBtn.getAttribute('data-id');
    const currentRole = actionBtn.getAttribute('data-role') || 'free';
    const nextRole = await openSelectModal({
      title: 'Change User Role',
      label: 'Role',
      value: currentRole,
      options: [
        { value: 'admin', label: 'admin' },
        { value: 'subscriber', label: 'subscriber' },
        { value: 'free', label: 'free' },
      ],
      submitText: 'Save Role',
    });
    if (!nextRole) return true;

    const cleanRole = String(nextRole).trim().toLowerCase();
    const allowed = ['admin', 'subscriber', 'free'];
    if (!allowed.includes(cleanRole)) {
      if (statusEl) statusEl.textContent = 'Invalid role. Use admin, subscriber, or free.';
      return true;
    }

    const result = await updateUserRole(userId, cleanRole);
    if (!result.success) {
      if (statusEl) statusEl.textContent = result.message || 'Failed to update user role.';
      return true;
    }

    await refresh();
    return true;
  },
};
