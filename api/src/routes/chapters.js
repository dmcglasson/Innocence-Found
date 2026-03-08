const router = require('express').Router();
const { adminClient } = require('../db/supabase');
const { requireAdminAuth } = require('../middleware/auth');
const {
  validateChapterCreate,
  validateChapterUpdate,
  parsePagination,
} = require('../middleware/validate');

const CHAPTERS_TABLE = 'Chapters';

router.use(requireAdminAuth);

/** List chapters with pagination (uses existing Chapters table: id, chapter_num, free, book_id, created_at, chapter_id) */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const bookId = req.query.book_id ? String(req.query.book_id).trim() : null;
    let q = adminClient
      .from(CHAPTERS_TABLE)
      .select('id, chapter_num, free, book_id, created_at, chapter_id');
    if (bookId) q = q.eq('book_id', bookId);
    const { data: rows, error } = await q
      .order('chapter_num', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const countQuery = bookId
      ? adminClient.from(CHAPTERS_TABLE).select('*', { count: 'exact', head: true }).eq('book_id', bookId)
      : adminClient.from(CHAPTERS_TABLE).select('*', { count: 'exact', head: true });
    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;
    res.json({
      data: rows,
      pagination: { page, limit, total: count ?? rows.length },
    });
  } catch (e) {
    next(e);
  }
});

/** Get one chapter by id */
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await adminClient
      .from(CHAPTERS_TABLE)
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Chapter not found' });
      throw error;
    }
    res.json(data);
  } catch (e) {
    next(e);
  }
});

/** Create chapter */
router.post('/', async (req, res, next) => {
  try {
    const { errors, data } = validateChapterCreate(req.body);
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    const { data: created, error } = await adminClient
      .from(CHAPTERS_TABLE)
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

/** Update chapter */
router.patch('/:id', async (req, res, next) => {
  try {
    const { errors, data } = validateChapterUpdate(req.body);
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update', details: [] });
    }
    const { data: updated, error } = await adminClient
      .from(CHAPTERS_TABLE)
      .update(data)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Chapter not found' });
      throw error;
    }
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** Delete chapter */
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await adminClient
      .from(CHAPTERS_TABLE)
      .select('id')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const { error } = await adminClient.from(CHAPTERS_TABLE).delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
