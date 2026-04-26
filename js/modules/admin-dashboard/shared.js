export const TAB_KEYS = {
  CHAPTERS: 'chapters',
  WORKSHEETS: 'worksheets',
  USERS: 'users',
  COMMENTS: 'comments',
};

export const TABLE_CANDIDATES = {
  chapters: ['Chapters', 'chapters'],
  worksheets: ['worksheets', 'Worksheets'],
  comments: ['Comments', 'comments'],
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(value) {
  if (!value) return '';

  // Treat DATE values (YYYY-MM-DD) as local calendar dates to avoid timezone day-shift.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split('-').map((part) => Number.parseInt(part, 10));
    const localDate = new Date(year, month - 1, day);

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(localDate);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export async function runQueryOnCandidates(supabase, candidates, queryFactory) {
  let lastError = null;

  for (const tableName of candidates) {
    const { data, error } = await queryFactory(tableName);
    if (!error) {
      return { success: true, data, tableName };
    }

    lastError = error;
    const message = String(error?.message || '').toLowerCase();
    const missingTable =
      message.includes('relation') ||
      message.includes('could not find the table') ||
      message.includes('schema cache') ||
      error?.code === '42p01' ||
      error?.code === 'PGRST205';

    if (!missingTable) {
      break;
    }
  }

  return {
    success: false,
    data: [],
    message: lastError?.message || 'Query failed.',
  };
}

export function openConfirmModal({
  title = 'Confirm Action',
  message = 'Are you sure you want to continue?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminConfirmModalTitle">
        <div class="admin-modal__header">
          <h3 id="adminConfirmModalTitle">${escapeHtml(title)}</h3>
        </div>
        <div class="admin-modal__body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="action-btn admin-modal-cancel-btn admin-modal__button admin-modal__button--secondary">${escapeHtml(cancelText)}</button>
          <button type="button" class="action-btn admin-modal-confirm-btn admin-modal__button admin-modal__button--primary">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const closeModal = (confirmed) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(confirmed);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeModal(false);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal(false);
      }
    });

    document.addEventListener('keydown', onKeyDown);

    const cancelBtn = overlay.querySelector('.admin-modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => closeModal(false));
    }

    const confirmBtn = overlay.querySelector('.admin-modal-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => closeModal(true));
      confirmBtn.focus();
    }

    document.body.appendChild(overlay);
  });
}

export function openTextModal({
  title = 'Edit Value',
  label = 'Value',
  value = '',
  submitText = 'Save',
  cancelText = 'Cancel',
  multiline = false,
  required = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    const inputId = 'adminTextModalInput';
    const safeValue = escapeHtml(String(value ?? ''));
    const inputHtml = multiline
      ? `<textarea id="${inputId}" class="admin-select admin-modal__textarea" ${required ? 'required' : ''}>${safeValue}</textarea>`
      : `<input id="${inputId}" class="admin-select" type="text" value="${safeValue}" ${required ? 'required' : ''} />`;

    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminTextModalTitle">
        <div class="admin-modal__header">
          <h3 id="adminTextModalTitle">${escapeHtml(title)}</h3>
        </div>
        <form class="admin-modal__form" id="adminTextModalForm">
          <label class="admin-controls__label" for="${inputId}">${escapeHtml(label)}</label>
          ${inputHtml}
          <div class="admin-modal__actions">
            <button type="button" class="action-btn admin-modal-cancel-btn admin-modal__button admin-modal__button--secondary">${escapeHtml(cancelText)}</button>
            <button type="submit" class="action-btn admin-modal__button admin-modal__button--primary">${escapeHtml(submitText)}</button>
          </div>
        </form>
      </div>
    `;

    const closeModal = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeModal(null);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal(null);
      }
    });

    document.addEventListener('keydown', onKeyDown);

    const cancelBtn = overlay.querySelector('.admin-modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => closeModal(null));
    }

    const form = overlay.querySelector('#adminTextModalForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const nextValue = overlay.querySelector(`#${inputId}`)?.value ?? '';
        closeModal(nextValue);
      });
    }

    document.body.appendChild(overlay);
    const inputEl = overlay.querySelector(`#${inputId}`);
    if (inputEl) {
      inputEl.focus();
      if (!multiline && typeof inputEl.select === 'function') {
        inputEl.select();
      }
    }
  });
}

export function openSelectModal({
  title = 'Choose Value',
  label = 'Value',
  value = '',
  options = [],
  submitText = 'Save',
  cancelText = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    const selectId = 'adminSelectModalInput';
    const optionsHtml = options
      .map((opt) => {
        const optValue = escapeHtml(String(opt.value ?? ''));
        const selected = String(opt.value ?? '') === String(value ?? '') ? 'selected' : '';
        return `<option value="${optValue}" ${selected}>${escapeHtml(String(opt.label ?? opt.value ?? ''))}</option>`;
      })
      .join('');

    overlay.className = 'admin-modal-overlay';
    overlay.innerHTML = `
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminSelectModalTitle">
        <div class="admin-modal__header">
          <h3 id="adminSelectModalTitle">${escapeHtml(title)}</h3>
        </div>
        <form class="admin-modal__form" id="adminSelectModalForm">
          <label class="admin-controls__label" for="${selectId}">${escapeHtml(label)}</label>
          <select id="${selectId}" class="admin-select">${optionsHtml}</select>
          <div class="admin-modal__actions">
            <button type="button" class="action-btn admin-modal-cancel-btn admin-modal__button admin-modal__button--secondary">${escapeHtml(cancelText)}</button>
            <button type="submit" class="action-btn admin-modal__button admin-modal__button--primary">${escapeHtml(submitText)}</button>
          </div>
        </form>
      </div>
    `;

    const closeModal = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeModal(null);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal(null);
      }
    });

    document.addEventListener('keydown', onKeyDown);

    const cancelBtn = overlay.querySelector('.admin-modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => closeModal(null));
    }

    const form = overlay.querySelector('#adminSelectModalForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const nextValue = overlay.querySelector(`#${selectId}`)?.value ?? '';
        closeModal(nextValue);
      });
    }

    document.body.appendChild(overlay);
    const selectEl = overlay.querySelector(`#${selectId}`);
    if (selectEl) {
      selectEl.focus();
    }
  });
}
