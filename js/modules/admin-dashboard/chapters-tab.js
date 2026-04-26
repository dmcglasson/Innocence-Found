import { getSupabaseClient } from '../supabase.js';
import {
  TAB_KEYS,
  TABLE_CANDIDATES,
  escapeHtml,
  formatDate,
  openConfirmModal,
  runQueryOnCandidates,
} from './shared.js';

const CHAPTER_ACCESS_FREE = 'free';
const CHAPTER_ACCESS_PROTECTED = 'protected';

function parseChapterAccess(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === CHAPTER_ACCESS_FREE) {
    return { ok: true, free: true };
  }

  if (normalized === CHAPTER_ACCESS_PROTECTED) {
    return { ok: true, free: false };
  }

  return { ok: false, message: 'Access must be either free or protected.' };
}

function parseReleaseDateInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { ok: true, value: null };

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: 'Release Date must be a valid date (YYYY-MM-DD).' };
  }

  return { ok: true, value: date.toISOString().slice(0, 10) };
}

function toChapterDraft(row) {
  return {
    chapterNum: String(row.chapter_num ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    access: row.free ? CHAPTER_ACCESS_FREE : CHAPTER_ACCESS_PROTECTED,
    releaseDate: String(row.release_date ? row.release_date.slice(0, 10) : ''),
  };
}

function openChapterEditModal(initialDraft) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminChapterModalTitle">
        <div class="admin-modal__header">
          <h3 id="adminChapterModalTitle">Edit Chapter</h3>
        </div>
        <form class="admin-modal__form" id="adminChapterModalForm">
          <label class="admin-controls__label" for="adminChapterNumInput">Chapter Number</label>
          <input id="adminChapterNumInput" class="admin-select" type="number" min="1" required value="${escapeHtml(initialDraft.chapterNum)}" />

          <label class="admin-controls__label" for="adminChapterTitleInput">Title</label>
          <input id="adminChapterTitleInput" class="admin-select" type="text" required value="${escapeHtml(initialDraft.title)}" />

          <label class="admin-controls__label" for="adminChapterDescriptionInput">Description</label>
          <textarea id="adminChapterDescriptionInput" class="admin-select admin-modal__textarea">${escapeHtml(initialDraft.description)}</textarea>

          <label class="admin-controls__label" for="adminChapterAccessInput">Access</label>
          <select id="adminChapterAccessInput" class="admin-select">
            <option value="free" ${initialDraft.access === CHAPTER_ACCESS_FREE ? 'selected' : ''}>Free</option>
            <option value="protected" ${initialDraft.access === CHAPTER_ACCESS_PROTECTED ? 'selected' : ''}>Protected</option>
          </select>

          <label class="admin-controls__label" for="adminChapterReleaseDateInput">Release Date</label>
          <input id="adminChapterReleaseDateInput" class="admin-select" type="date" value="${escapeHtml(initialDraft.releaseDate)}" />

          <div class="admin-modal__actions">
            <button type="button" class="action-btn admin-modal-cancel-btn admin-modal__button admin-modal__button--secondary">Cancel</button>
            <button type="submit" class="action-btn admin-modal__button admin-modal__button--primary">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    const closeModal = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal(null);
      }
    });

    const cancelBtn = overlay.querySelector('.admin-modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => closeModal(null));
    }

    const form = overlay.querySelector('#adminChapterModalForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();

        const chapterNum = overlay.querySelector('#adminChapterNumInput')?.value ?? '';
        const title = overlay.querySelector('#adminChapterTitleInput')?.value ?? '';
        const description = overlay.querySelector('#adminChapterDescriptionInput')?.value ?? '';
        const access = overlay.querySelector('#adminChapterAccessInput')?.value ?? '';
        const releaseDate = overlay.querySelector('#adminChapterReleaseDateInput')?.value ?? '';

        closeModal({ chapterNum, title, description, access, releaseDate });
      });
    }

    document.body.appendChild(overlay);
    const titleInput = overlay.querySelector('#adminChapterTitleInput');
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  });
}

async function updateChapter(payload) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized.' };
  }

  const updates = {
    chapter_num: payload.chapterNum,
    title: payload.title,
    description: payload.description,
    free: payload.free,
    release_date: payload.releaseDate,
  };

  const result = await runQueryOnCandidates(
    supabase,
    TABLE_CANDIDATES.chapters,
    (table) => supabase.from(table).update(updates).eq('id', payload.id)
  );

  return result.success ? { success: true } : { success: false, message: result.message };
}

async function deleteChapter(id) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized.' };
  }

  const result = await runQueryOnCandidates(
    supabase,
    TABLE_CANDIDATES.chapters,
    (table) => supabase.from(table).delete().eq('id', id)
  );

  return result.success ? { success: true } : { success: false, message: result.message };
}

export const chaptersTab = {
  key: TAB_KEYS.CHAPTERS,

  getMeta() {
    return {
      title: 'Chapters',
      subtitle: 'Manage chapter visibility and publication details.',
      headers: ['Chapter Number', 'Title', 'Description', 'Access', 'Release Date', 'Actions'],
      empty: 'No chapters found.',
    };
  },

  async fetchRows(supabase) {
    const result = await runQueryOnCandidates(
      supabase,
      TABLE_CANDIDATES.chapters,
      (table) =>
        supabase
          .from(table)
          .select('id, chapter_num, title, description, free, release_date, created_at')
          .order('chapter_num', { ascending: true })
    );

    return {
      success: result.success,
      rows: result.data || [],
      message: result.message,
    };
  },

  renderRows(rows) {
    return rows
      .map((row) => {
        const accessText = row.free ? 'Free' : 'Protected';
        const releaseDate = formatDate(row.release_date || row.created_at);
        return `
          <tr>
            <td>${escapeHtml(row.chapter_num ?? row.id)}</td>
            <td>${escapeHtml(row.title || '')}</td>
            <td>${escapeHtml(row.description || '')}</td>
            <td>${escapeHtml(accessText)}</td>
            <td>${escapeHtml(releaseDate)}</td>
            <td>
              <div class="action-btn-group">
                <button class="action-btn admin-action-btn" data-action="edit-chapter" data-id="${escapeHtml(row.id)}" data-chapter-num="${escapeHtml(row.chapter_num ?? '')}" data-title="${escapeHtml(row.title || '')}" data-description="${escapeHtml(row.description || '')}" data-free="${row.free ? '1' : '0'}" data-release-date="${escapeHtml(String(row.release_date || '').slice(0, 10))}">Edit</button>
                <button class="action-btn admin-action-btn" data-action="delete-chapter" data-id="${escapeHtml(row.id)}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  async handleClick({ actionBtn, statusEl, refresh }) {
    if (!actionBtn) return false;

    const action = actionBtn.getAttribute('data-action');
    if (action !== 'edit-chapter' && action !== 'delete-chapter') {
      return false;
    }

    if (action === 'edit-chapter') {
      const id = actionBtn.getAttribute('data-id');
      const draft = toChapterDraft({
        chapter_num: actionBtn.getAttribute('data-chapter-num'),
        title: actionBtn.getAttribute('data-title'),
        description: actionBtn.getAttribute('data-description'),
        free: actionBtn.getAttribute('data-free') === '1',
        release_date: actionBtn.getAttribute('data-release-date'),
      });

      const modalResult = await openChapterEditModal(draft);
      if (!modalResult) return true;

      const parsedChapterNum = Number.parseInt(String(modalResult.chapterNum).trim(), 10);
      if (!Number.isInteger(parsedChapterNum) || parsedChapterNum <= 0) {
        if (statusEl) statusEl.textContent = 'Chapter Number must be a positive integer.';
        return true;
      }

      const cleanTitle = String(modalResult.title).trim();
      if (!cleanTitle) {
        if (statusEl) statusEl.textContent = 'Title cannot be empty.';
        return true;
      }

      const accessResult = parseChapterAccess(modalResult.access);
      if (!accessResult.ok) {
        if (statusEl) statusEl.textContent = accessResult.message;
        return true;
      }

      const parsedReleaseDate = parseReleaseDateInput(modalResult.releaseDate);
      if (!parsedReleaseDate.ok) {
        if (statusEl) statusEl.textContent = parsedReleaseDate.message;
        return true;
      }

      const updateResult = await updateChapter({
        id,
        chapterNum: parsedChapterNum,
        title: cleanTitle,
        description: String(modalResult.description ?? ''),
        free: accessResult.free,
        releaseDate: parsedReleaseDate.value,
      });

      if (!updateResult.success) {
        if (statusEl) statusEl.textContent = updateResult.message || 'Failed to update chapter.';
        return true;
      }

      await refresh();
      return true;
    }

    const id = actionBtn.getAttribute('data-id');
    const confirmed = await openConfirmModal({
      title: 'Delete Chapter',
      message: 'Delete this chapter? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return true;

    const deleteResult = await deleteChapter(id);
    if (!deleteResult.success) {
      if (statusEl) statusEl.textContent = deleteResult.message || 'Failed to delete chapter.';
      return true;
    }

    await refresh();
    return true;
  },
};
