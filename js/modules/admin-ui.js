/**
 * Admin page UI: chapters and documents management.
 */

import {
  checkAdminAccess,
  getChapters,
  createChapter,
  updateChapter,
  deleteChapter,
  getDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getDocumentFileBlobUrl,
} from './admin-api.js';

let chaptersPage = 1;
let documentsPage = 1;

function msg(elId, text, type = 'success') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'message' + (type ? ` ${type}` : '');
  el.style.display = text ? 'block' : 'none';
}

function showContent(show) {
  const content = document.getElementById('adminContent');
  if (content) content.style.display = show ? 'block' : 'none';
}

export async function initAdminPage() {
  const status = await checkAdminAccess();
  const messageEl = document.getElementById('adminMessage');
  if (!messageEl) return;

  if (status === 401) {
    msg('adminMessage', 'Please log in to access the admin page.', 'error');
    showContent(false);
    return;
  }
  if (status === 403) {
    msg('adminMessage', 'You do not have admin access.', 'error');
    showContent(false);
    return;
  }
  msg('adminMessage', '');
  showContent(true);

  setupTabs();
  await loadChapters();
  await loadDocuments();
  setupChapterForm();
  setupDocumentForm();
}

function setupTabs() {
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.getAttribute('data-tab');
      document.getElementById('adminChapters').style.display = id === 'chapters' ? 'block' : 'none';
      document.getElementById('adminDocuments').style.display = id === 'documents' ? 'block' : 'none';
    });
  });
}

async function loadChapters() {
  const res = await getChapters(chaptersPage, 20);
  const tbody = document.getElementById('chaptersList');
  const pagEl = document.getElementById('chaptersPagination');
  if (!tbody) return;

  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="6">Failed to load chapters.</td></tr>';
    if (pagEl) pagEl.textContent = '';
    return;
  }

  const { data = [], pagination = {} } = res.data;
  tbody.innerHTML = data.length === 0
    ? '<tr><td colspan="6">No chapters yet. Add one above.</td></tr>'
    : data.map((ch) => `
        <tr>
          <td>${escapeHtml(String(ch.id))}</td>
          <td>${escapeHtml(String(ch.book_id))}</td>
          <td>${escapeHtml(String(ch.chapter_num))}</td>
          <td>${ch.free ? 'Yes' : 'No'}</td>
          <td>${escapeHtml(formatDate(ch.created_at))}</td>
          <td>
            <button type="button" class="btn btn-small btn-secondary admin-delete-chapter" data-id="${escapeHtml(String(ch.id))}">Delete</button>
          </td>
        </tr>
      `).join('');

  if (pagEl) {
    const { page = 1, limit = 20, total = 0 } = pagination;
    pagEl.textContent = `Page ${page} · ${total} total`;
  }

  tbody.querySelectorAll('.admin-delete-chapter').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this chapter?')) return;
      const id = btn.getAttribute('data-id');
      const r = await deleteChapter(id);
      if (r.ok) await loadChapters();
      else msg('adminMessage', r.data?.error || 'Delete failed', 'error');
    });
  });
}

async function loadDocuments() {
  const res = await getDocuments(documentsPage, 20);
  const tbody = document.getElementById('documentsList');
  const pagEl = document.getElementById('documentsPagination');
  if (!tbody) return;

  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="4">Failed to load documents.</td></tr>';
    if (pagEl) pagEl.textContent = '';
    return;
  }

  const { data = [], pagination = {} } = res.data;
  tbody.innerHTML = data.length === 0
    ? '<tr><td colspan="4">No documents yet. Upload one above.</td></tr>'
    : data.map((doc) => `
        <tr>
          <td>${escapeHtml(doc.title || '')}</td>
          <td>${escapeHtml((doc.description || '').slice(0, 50))}${(doc.description || '').length > 50 ? '…' : ''}</td>
          <td>${escapeHtml(formatDate(doc.created_at))}</td>
          <td>
            <button type="button" class="btn btn-small btn-secondary admin-download-doc" data-id="${escapeHtml(doc.id)}">Download</button>
            <button type="button" class="btn btn-small btn-secondary admin-delete-doc" data-id="${escapeHtml(doc.id)}">Delete</button>
          </td>
        </tr>
      `).join('');

  if (pagEl) {
    const { page = 1, limit = 20, total = 0 } = pagination;
    pagEl.textContent = `Page ${page} · ${total} total`;
  }

  tbody.querySelectorAll('.admin-download-doc').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const url = await getDocumentFileBlobUrl(id);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document';
        a.click();
        URL.revokeObjectURL(url);
      } else msg('adminMessage', 'Download failed.', 'error');
    });
  });

  tbody.querySelectorAll('.admin-delete-doc').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this document?')) return;
      const id = btn.getAttribute('data-id');
      const r = await deleteDocument(id);
      if (r.ok) await loadDocuments();
      else msg('adminMessage', r.data?.error || 'Delete failed', 'error');
    });
  });
}

function setupChapterForm() {
  const form = document.getElementById('chapterForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookId = parseInt(document.getElementById('chBookId').value, 10);
    const chapterNum = parseInt(document.getElementById('chNum').value, 10);
    const free = document.getElementById('chFree').checked;
    const r = await createChapter({ book_id: bookId, chapter_num: chapterNum, free });
    if (r.ok) {
      msg('adminMessage', 'Chapter added.', 'success');
      form.reset();
      await loadChapters();
    } else {
      msg('adminMessage', (r.data?.details && r.data.details[0]) || r.data?.error || 'Failed to add chapter', 'error');
    }
  });
}

function setupDocumentForm() {
  const form = document.getElementById('documentForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('docTitle').value.trim();
    const description = document.getElementById('docDesc').value.trim();
    const fileInput = document.getElementById('docFile');
    const file = fileInput?.files?.[0];
    if (!file) {
      msg('adminMessage', 'Please select a file.', 'error');
      return;
    }
    msg('adminMessage', 'Uploading…', 'success');
    const r = await uploadDocument(file, title, description);
    if (r.ok) {
      msg('adminMessage', 'Document uploaded.', 'success');
      form.reset();
      await loadDocuments();
    } else {
      msg('adminMessage', (r.data?.details && r.data.details[0]) || r.data?.error || 'Upload failed', 'error');
    }
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatDate(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString();
  } catch (_) {
    return v;
  }
}
