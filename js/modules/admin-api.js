/**
 * Admin API client. Calls the backend admin endpoints with the current user's JWT.
 * The backend returns 401/403 for unauthenticated or non-admin users.
 */

import { getCurrentSession } from './auth.js';

// Admin API base URL (from window.ENV or default)
const API_BASE_URL = (typeof window !== 'undefined' && (window.ENV?.API_BASE_URL || window.ENV?.API_URL)) || 'http://localhost:3001';

async function getAuthHeaders() {
  const session = await getCurrentSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

async function request(method, path, body = null, formData = null) {
  const headers = await getAuthHeaders();
  if (!headers) return { ok: false, status: 401, data: { error: 'Not logged in' } };
  const url = `${API_BASE_URL.replace(/\/$/, '')}${path}`;
  const opts = { method, headers };
  if (formData) {
    opts.body = formData;
    delete opts.headers['Content-Type'];
  } else if (body && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    try { data = await res.json(); } catch (_) {}
  } else if (res.status !== 204) {
    data = await res.text();
  }
  return { ok: res.ok, status: res.status, data };
}

export async function getChapters(page = 1, limit = 20, bookId = null) {
  let path = `/admin/chapters?page=${page}&limit=${limit}`;
  if (bookId) path += `&book_id=${encodeURIComponent(bookId)}`;
  return request('GET', path);
}

export async function getChapter(id) {
  return request('GET', `/admin/chapters/${id}`);
}

export async function createChapter(payload) {
  return request('POST', '/admin/chapters', payload);
}

export async function updateChapter(id, payload) {
  return request('PATCH', `/admin/chapters/${id}`, payload);
}

export async function deleteChapter(id) {
  return request('DELETE', `/admin/chapters/${id}`);
}

export async function getDocuments(page = 1, limit = 20) {
  return request('GET', `/admin/documents?page=${page}&limit=${limit}`);
}

export async function getDocument(id) {
  return request('GET', `/admin/documents/${id}`);
}

export async function uploadDocument(file, title, description = '') {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  if (description) form.append('description', description);
  return request('POST', '/admin/documents', null, form);
}

export async function updateDocument(id, fields, file = null) {
  if (file) {
    const form = new FormData();
    if (fields.title !== undefined) form.append('title', fields.title);
    if (fields.description !== undefined) form.append('description', fields.description);
    form.append('file', file);
    return request('PATCH', `/admin/documents/${id}`, null, form);
  }
  return request('PATCH', `/admin/documents/${id}`, fields);
}

export async function deleteDocument(id) {
  return request('DELETE', `/admin/documents/${id}`);
}

/** Get download URL for a document file (opens in same tab with auth). */
export function getDocumentFileUrl(id) {
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}/admin/documents/${id}/file`;
}

/** Fetch document file with auth and return a blob URL for download/preview. Call revokeObjectURL when done. */
export async function getDocumentFileBlobUrl(id) {
  const session = await getCurrentSession();
  if (!session?.access_token) return null;
  const url = getDocumentFileUrl(id);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Check if current user can access admin (200 = admin, 403 = not admin, 401 = not logged in). */
export async function checkAdminAccess() {
  const r = await getChapters(1, 1);
  return r.status;
}
