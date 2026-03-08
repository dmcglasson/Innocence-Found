const path = require('path');
const router = require('express').Router();
const multer = require('multer');
const { adminClient } = require('../db/supabase');
const { requireAdminAuth } = require('../middleware/auth');
const {
  validateWorksheetMetadata,
  parsePagination,
  sanitizeText,
} = require('../middleware/validate');

const WORKSHEETS_TABLE = 'worksheets';
const DOCUMENTS_BUCKET = 'documents';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

router.use(requireAdminAuth);

async function ensureBucket() {
  const { data: buckets } = await adminClient.storage.listBuckets();
  if (buckets && buckets.some((b) => b.name === DOCUMENTS_BUCKET)) return;
  await adminClient.storage.createBucket(DOCUMENTS_BUCKET, { public: false });
}

/** List worksheets with pagination (uses existing worksheets table: id, title, description, file_path, created_at) */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { data: rows, error } = await adminClient
      .from(WORKSHEETS_TABLE)
      .select('id, title, description, file_path, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const { count, error: countErr } = await adminClient
      .from(WORKSHEETS_TABLE)
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;
    res.json({
      data: rows,
      pagination: { page, limit, total: count ?? rows.length },
    });
  } catch (e) {
    next(e);
  }
});

/** Get one worksheet by id */
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await adminClient
      .from(WORKSHEETS_TABLE)
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Document not found' });
      throw error;
    }
    res.json(data);
  } catch (e) {
    next(e);
  }
});

/** Serve file (authorized route only; reads file_path from worksheets) */
router.get('/:id/file', async (req, res, next) => {
  try {
    const { data: row, error } = await adminClient
      .from(WORKSHEETS_TABLE)
      .select('file_path, title')
      .eq('id', req.params.id)
      .single();
    if (error || !row || !row.file_path) return res.status(404).json({ error: 'Document or file not found' });
    const { data: fileData, error: downloadErr } = await adminClient.storage
      .from(DOCUMENTS_BUCKET)
      .download(row.file_path);
    if (downloadErr || !fileData) return res.status(404).json({ error: 'File not found in storage' });
    const filename = (row.title || path.basename(row.file_path) || 'download').replace(/"/g, '\\"');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(fileData);
  } catch (e) {
    next(e);
  }
});

/** Create worksheet (metadata + file upload; file_path = storage path) */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = sanitizeText(body.title, 500) || (req.file && req.file.originalname ? path.basename(req.file.originalname) : null);
    if (!title) {
      return res.status(400).json({ error: 'Validation failed', details: ['title is required or provide a file'] });
    }
    const description = body.description !== undefined ? sanitizeText(body.description, 5000) : null;

    if (!req.file) {
      return res.status(400).json({ error: 'Validation failed', details: ['file is required for create'] });
    }

    await ensureBucket();
    const ext = path.extname(req.file.originalname) || '';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${unique}-${title}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { data: uploadData, error: uploadErr } = await adminClient.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const { data: created, error } = await adminClient
      .from(WORKSHEETS_TABLE)
      .insert({
        title,
        description: description || null,
        file_path: uploadData.path,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(created);
  } catch (e) {
    if (e.message && e.message.startsWith('Unsupported file type')) {
      return res.status(400).json({ error: e.message, details: ['file'] });
    }
    next(e);
  }
});

/** Update worksheet metadata and/or replace file */
router.patch('/:id', upload.single('file'), async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await adminClient
      .from(WORKSHEETS_TABLE)
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Document not found' });

    const { errors, data: meta } = validateWorksheetMetadata(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const update = {
      ...(meta.title !== undefined && { title: meta.title }),
      ...(meta.description !== undefined && { description: meta.description }),
    };

    if (req.file) {
      await ensureBucket();
      const titlePart = meta.title !== undefined ? meta.title : existing.title;
      const ext = path.extname(req.file.originalname) || path.extname(existing.file_path) || '';
      const newPath = `${existing.id}-${Date.now()}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
      const { error: uploadErr } = await adminClient.storage
        .from(DOCUMENTS_BUCKET)
        .upload(newPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (uploadErr) throw uploadErr;
      if (existing.file_path) {
        await adminClient.storage.from(DOCUMENTS_BUCKET).remove([existing.file_path]);
      }
      update.file_path = newPath;
    }

    if (Object.keys(update).length === 0 && !req.file) {
      return res.status(400).json({ error: 'No valid fields to update', details: [] });
    }

    const { data: updated, error } = await adminClient
      .from(WORKSHEETS_TABLE)
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(updated);
  } catch (e) {
    if (e.message && e.message.startsWith('Unsupported file type')) {
      return res.status(400).json({ error: e.message, details: ['file'] });
    }
    next(e);
  }
});

/** Delete worksheet and remove file from storage */
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: existing, error: fetchErr } = await adminClient
      .from(WORKSHEETS_TABLE)
      .select('id, file_path')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Document not found' });
    const { error } = await adminClient.from(WORKSHEETS_TABLE).delete().eq('id', req.params.id);
    if (error) throw error;
    if (existing.file_path) {
      await adminClient.storage.from(DOCUMENTS_BUCKET).remove([existing.file_path]);
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
