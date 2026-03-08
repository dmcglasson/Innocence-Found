/**
 * Simple validation and sanitization helpers to mitigate injection/XSS.
 */

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_NAME_LENGTH = 500;
const MAX_DISPLAY_NAME_LENGTH = 500;
const MAX_TYPE_LENGTH = 50;
const PAGE_MAX = 100;
const PAGE_DEFAULT = 20;

/** Strip control chars and trim; limit length. */
function sanitizeText(str, maxLen = 10000) {
  if (str == null || typeof str !== 'string') return '';
  const trimmed = str.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/** Chapters table: book_id, chapter_num, free, chapter_id (uuid, optional) */
function validateChapterCreate(body) {
  const bookId = body.book_id != null ? parseInt(body.book_id, 10) : NaN;
  const chapterNum = typeof body.chapter_num === 'number' ? body.chapter_num : parseInt(body.chapter_num, 10);
  const free = body.free === true || body.free === 'true';
  const chapterId = body.chapter_id && String(body.chapter_id).trim() ? String(body.chapter_id).trim() : null;
  const errors = [];
  if (Number.isNaN(bookId)) errors.push('book_id is required and must be a number');
  if (Number.isNaN(chapterNum)) errors.push('chapter_num must be a number');
  return {
    errors,
    data: {
      ...(Number.isNaN(bookId) ? {} : { book_id: bookId }),
      chapter_num: Number.isNaN(chapterNum) ? 0 : chapterNum,
      free,
      ...(chapterId && { chapter_id: chapterId }),
    },
  };
}

function validateChapterUpdate(body) {
  const data = {};
  if (body.book_id !== undefined) {
    const n = parseInt(body.book_id, 10);
    if (!Number.isNaN(n)) data.book_id = n;
  }
  if (body.chapter_num !== undefined) {
    const n = parseInt(body.chapter_num, 10);
    if (!Number.isNaN(n)) data.chapter_num = n;
  }
  if (body.free !== undefined) data.free = body.free === true || body.free === 'true';
  if (body.chapter_id !== undefined) data.chapter_id = body.chapter_id === null || body.chapter_id === '' ? null : String(body.chapter_id).trim();
  const errors = [];
  return { errors, data };
}

/** Worksheets table: title, description, file_path */
function validateWorksheetMetadata(body) {
  const title = body.title !== undefined ? sanitizeText(body.title, MAX_TITLE_LENGTH) : undefined;
  const description = body.description !== undefined ? sanitizeText(body.description, MAX_DESCRIPTION_LENGTH) : undefined;
  const errors = [];
  if (body.title !== undefined && title !== undefined && !title.length) errors.push('title cannot be empty');
  return { errors, data: { title, description } };
}

/** Legacy document metadata (kept for any code that still sends name/type) */
function validateDocumentMetadata(body) {
  const name = sanitizeText(body.name, MAX_NAME_LENGTH);
  const display_name = body.display_name !== undefined ? sanitizeText(body.display_name, MAX_DISPLAY_NAME_LENGTH) : undefined;
  const type = body.type !== undefined ? sanitizeText(body.type, MAX_TYPE_LENGTH) : undefined;
  const chapter_id = body.chapter_id !== undefined ? (body.chapter_id === null || body.chapter_id === '' ? null : body.chapter_id) : undefined;
  const errors = [];
  if (body.name !== undefined && !name) errors.push('name cannot be empty');
  return { errors, data: { name: name || undefined, display_name, type, chapter_id } };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || PAGE_DEFAULT;
  if (Number.isNaN(limit) || limit < 1) limit = PAGE_DEFAULT;
  if (limit > PAGE_MAX) limit = PAGE_MAX;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

module.exports = {
  sanitizeText,
  validateChapterCreate,
  validateChapterUpdate,
  validateWorksheetMetadata,
  validateDocumentMetadata,
  parsePagination,
  PAGE_DEFAULT,
  PAGE_MAX,
};
