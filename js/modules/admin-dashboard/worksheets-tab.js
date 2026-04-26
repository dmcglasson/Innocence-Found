import { getSupabaseClient } from '../supabase.js';
import {
  TAB_KEYS,
  TABLE_CANDIDATES,
  escapeHtml,
  formatDate,
  openConfirmModal,
  runQueryOnCandidates,
} from './shared.js';

function parseReleaseDateInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { ok: true, value: null };

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: 'Release Date must be a valid date (YYYY-MM-DD).' };
  }

  return { ok: true, value: date.toISOString().slice(0, 10) };
}

function toWorksheetDraft(row) {
  return {
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    releaseDate: String(row.release_date ? row.release_date.slice(0, 10) : ''),
  };
}

function openWorksheetEditModal(initialDraft) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminWorksheetModalTitle">
        <div class="admin-modal__header">
          <h3 id="adminWorksheetModalTitle">Edit Worksheet</h3>
        </div>
        <form class="admin-modal__form" id="adminWorksheetModalForm">
          <label class="admin-controls__label" for="adminWorksheetTitleInput">Title</label>
          <input id="adminWorksheetTitleInput" class="admin-select" type="text" required value="${escapeHtml(initialDraft.title)}" />

          <label class="admin-controls__label" for="adminWorksheetDescriptionInput">Description</label>
          <textarea id="adminWorksheetDescriptionInput" class="admin-select admin-modal__textarea">${escapeHtml(initialDraft.description)}</textarea>

          <label class="admin-controls__label" for="adminWorksheetReleaseDateInput">Release Date</label>
          <input id="adminWorksheetReleaseDateInput" class="admin-select" type="date" value="${escapeHtml(initialDraft.releaseDate)}" />

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

    const form = overlay.querySelector('#adminWorksheetModalForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();

        const title = overlay.querySelector('#adminWorksheetTitleInput')?.value ?? '';
        const description = overlay.querySelector('#adminWorksheetDescriptionInput')?.value ?? '';
        const releaseDate = overlay.querySelector('#adminWorksheetReleaseDateInput')?.value ?? '';

        closeModal({ title, description, releaseDate });
      });
    }

    document.body.appendChild(overlay);
    const titleInput = overlay.querySelector('#adminWorksheetTitleInput');
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  });
}

async function updateWorksheet(payload) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase client not initialized.' };
  }

  const result = await runQueryOnCandidates(
    supabase,
    TABLE_CANDIDATES.worksheets,
    (table) =>
      supabase
        .from(table)
        .update({
          title: payload.title,
          description: payload.description,
          release_date: payload.releaseDate,
        })
        .eq('id', payload.id)
  );

  return result.success ? { success: true } : { success: false, message: result.message };
}

export const worksheetsTab = {
  key: TAB_KEYS.WORKSHEETS,

  getMeta() {
    return {
      title: 'Worksheets',
      subtitle: 'Manage worksheet content and publication details.',
      headers: ['Title', 'Description', 'Release Date', 'Actions'],
      empty: 'No worksheets found.',
    };
  },

  async fetchRows(supabase) {
    const result = await runQueryOnCandidates(
      supabase,
      TABLE_CANDIDATES.worksheets,
      (table) =>
        supabase
          .from(table)
          .select('id, title, description, release_date, created_at')
          .order('id', { ascending: true })
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
        const releaseDate = formatDate(row.release_date);
        return `
          <tr>
            <td>${escapeHtml(row.title || '')}</td>
            <td>${escapeHtml(row.description || '')}</td>
            <td>${escapeHtml(releaseDate)}</td>
            <td>
              <div class="action-btn-group">
                <button class="action-btn admin-action-btn" data-action="edit-worksheet" data-id="${escapeHtml(row.id)}" data-title="${escapeHtml(row.title || '')}" data-description="${escapeHtml(row.description || '')}" data-release-date="${escapeHtml(String(row.release_date || '').slice(0, 10))}">Edit</button>
                <button class="action-btn admin-action-btn" data-action="delete-worksheet" data-id="${escapeHtml(row.id)}">Delete</button>
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
    if (action !== 'edit-worksheet' && action !== 'delete-worksheet') {
      return false;
    }

    if (action === 'edit-worksheet') {
      const id = actionBtn.getAttribute('data-id');
      const draft = toWorksheetDraft({
        title: actionBtn.getAttribute('data-title'),
        description: actionBtn.getAttribute('data-description'),
        release_date: actionBtn.getAttribute('data-release-date'),
      });

      const modalResult = await openWorksheetEditModal(draft);
      if (!modalResult) return true;

      const cleanTitle = String(modalResult.title).trim();
      if (!cleanTitle) {
        if (statusEl) statusEl.textContent = 'Title cannot be empty.';
        return true;
      }

      const parsedReleaseDate = parseReleaseDateInput(modalResult.releaseDate);
      if (!parsedReleaseDate.ok) {
        if (statusEl) statusEl.textContent = parsedReleaseDate.message;
        return true;
      }

      const result = await updateWorksheet({
        id,
        title: cleanTitle,
        description: String(modalResult.description ?? ''),
        releaseDate: parsedReleaseDate.value,
      });

      if (!result.success) {
        if (statusEl) statusEl.textContent = result.message || 'Failed to update worksheet.';
        return true;
      }

      await refresh();
      return true;
    }

    const id = actionBtn.getAttribute('data-id');
    const confirmed = await openConfirmModal({
      title: 'Delete Worksheet',
      message: 'Delete this worksheet?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return true;

    const supabase = getSupabaseClient();
    if (!supabase) {
      if (statusEl) statusEl.textContent = 'Supabase client not initialized.';
      return true;
    }

    const result = await runQueryOnCandidates(
      supabase,
      TABLE_CANDIDATES.worksheets,
      (table) => supabase.from(table).delete().eq('id', id)
    );

    if (!result.success) {
      if (statusEl) statusEl.textContent = result.message || 'Failed to delete worksheet.';
      return true;
    }

    await refresh();
    return true;
  },
};
