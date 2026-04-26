import { deleteCommentById, updateCommentById } from '../auth.js';
import {
  TAB_KEYS,
  TABLE_CANDIDATES,
  escapeHtml,
  formatDate,
  openConfirmModal,
  openTextModal,
  runQueryOnCandidates,
} from './shared.js';

let selectedChapterId = '';

function normalizeChapterId(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const asNumber = Number.parseInt(trimmed, 10);
  if (Number.isInteger(asNumber) && String(asNumber) === trimmed) {
    return asNumber;
  }

  return trimmed;
}

export const commentsTab = {
  key: TAB_KEYS.COMMENTS,

  async getControls({ supabase }) {
    const result = await runQueryOnCandidates(
      supabase,
      TABLE_CANDIDATES.comments,
      (table) =>
        supabase
          .from(table)
          .select('chapter_id')
          .order('chapter_id', { ascending: true })
          .limit(500)
    );

    if (!result.success) {
      return { html: '' };
    }

    const chapterIds = [...new Set((result.data || [])
      .map((row) => row?.chapter_id)
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== ''))]
      .sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
          return aNum - bNum;
        }
        return String(a).localeCompare(String(b));
      });

    const optionsHtml = chapterIds
      .map((chapterId) => {
        const value = String(chapterId);
        const selected = String(selectedChapterId) === value ? 'selected' : '';
        return `<option value="${escapeHtml(value)}" ${selected}>Chapter ${escapeHtml(value)}</option>`;
      })
      .join('');

    return {
      html: `
        <label class="admin-controls__label" for="adminCommentsChapterFilter">Filter by Chapter ID</label>
        <div class="admin-select-wrap">
          <select id="adminCommentsChapterFilter" class="admin-select">
            <option value="" ${selectedChapterId === '' ? 'selected' : ''}>All Chapters</option>
            ${optionsHtml}
          </select>
        </div>
      `,
    };
  },

  bindControls({ controlsRoot, refresh }) {
    const select = controlsRoot.querySelector('#adminCommentsChapterFilter');
    if (!select) return;

    select.addEventListener('change', async (event) => {
      selectedChapterId = String(event.target.value ?? '').trim();
      await refresh();
    });
  },

  getMeta() {
    return {
      title: 'Comments',
      subtitle: 'Moderate chapter comments from readers.',
      headers: ['Username', 'Response', 'Timestamp', 'Actions'],
      empty: 'No comments found.',
    };
  },

  async fetchRows(supabase) {
    const result = await runQueryOnCandidates(
      supabase,
      TABLE_CANDIDATES.comments,
      (table) => {
        let query = supabase
          .from(table)
          .select('id, chapter_id, uid, message, created_at')
          .order('created_at', { ascending: false })
          .limit(250);

        if (selectedChapterId !== '') {
          query = query.eq('chapter_id', normalizeChapterId(selectedChapterId));
        }

        return query;
      }
    );

    if (!result.success) {
      return {
        success: false,
        rows: [],
        message: result.message,
      };
    }

    const rows = result.data || [];
    const userIds = [...new Set(
      rows
        .map((row) => row.uid)
        .filter(Boolean)
    )];

    let usernameByUserId = {};
    if (userIds.length > 0) {
      const profilesResult = await runQueryOnCandidates(
        supabase,
        ['profiles', 'Profiles'],
        (table) =>
          supabase
            .from(table)
            .select('user_id, username')
            .in('user_id', userIds)
      );

      if (profilesResult.success) {
        usernameByUserId = (profilesResult.data || []).reduce((acc, profile) => {
          const id = profile?.user_id;
          if (id) {
            acc[id] = profile?.username || '';
          }
          return acc;
        }, {});
      }
    }

    const rowsWithUsernames = rows.map((row) => {
      const commenterId = row.uid;
      return {
        ...row,
        commenterId,
        username: usernameByUserId[commenterId] || commenterId || '',
      };
    });

    return {
      success: true,
      rows: rowsWithUsernames,
      message: '',
    };
  },

  renderRows(rows) {
    return rows
      .map((row) => {
        return `
          <tr data-comment-id="${escapeHtml(row.id)}">
            <td>${escapeHtml(row.username || row.commenterId || '')}</td>
            <td>${escapeHtml(row.message || '')}</td>
            <td>${escapeHtml(formatDate(row.created_at))}</td>
            <td>
              <div class="action-btn-group">
                <button class="action-btn admin-edit-comment-btn" data-id="${escapeHtml(row.id)}">Edit</button>
                <button class="action-btn admin-delete-comment-btn" data-id="${escapeHtml(row.id)}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  async handleClick({ event, statusEl, refresh }) {
    const editCommentBtn = event.target.closest('.admin-edit-comment-btn');
    if (editCommentBtn) {
      const commentId = editCommentBtn.getAttribute('data-id');
      const row = editCommentBtn.closest('tr');
      const currentText = row?.children?.[1]?.textContent || '';
      const newText = await openTextModal({
        title: 'Edit Comment',
        label: 'Comment',
        value: currentText,
        submitText: 'Save Comment',
        multiline: true,
        required: true,
      });
      if (!newText || !newText.trim()) return true;

      const result = await updateCommentById(commentId, newText);
      if (!result.success) {
        if (statusEl) statusEl.textContent = result.message || 'Failed to update comment.';
        return true;
      }

      await refresh();
      return true;
    }

    const deleteCommentBtn = event.target.closest('.admin-delete-comment-btn');
    if (deleteCommentBtn) {
      const confirmed = await openConfirmModal({
        title: 'Delete Comment',
        message: 'Delete this comment?',
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (!confirmed) return true;

      const commentId = deleteCommentBtn.getAttribute('data-id');
      const result = await deleteCommentById(commentId);
      if (!result.success) {
        if (statusEl) statusEl.textContent = result.message || 'Failed to delete comment.';
        return true;
      }

      await refresh();
      return true;
    }

    return false;
  },
};
