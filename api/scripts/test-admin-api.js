#!/usr/bin/env node
/**
 * Test script for the Admin API.
 *
 * Prerequisites:
 * 1. API running: cd api && npm start
 * 2. You are an admin: add your user UUID to .env as ADMIN_USER_IDS=your-uuid,
 *    OR set role='admin' for your user in the profiles table in Supabase.
 * 3. Get your access token: log in at http://localhost:8080, then in browser console run:
 *    (await supabase.auth.getSession()).data.session?.access_token
 *
 * Run:
 *   ACCESS_TOKEN=your_jwt_here node scripts/test-admin-api.js
 */

const BASE = process.env.API_BASE_URL || 'http://localhost:3001';
const TOKEN = process.env.ACCESS_TOKEN;

function log(name, ok, detail = '') {
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${name}` + (detail ? ` — ${detail}` : ''));
}

async function request(method, path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers = { ...opts.headers };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(url, { method, ...opts, headers });
  let body;
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    try { body = await res.json(); } catch (_) { body = null; }
  } else {
    body = await res.text();
  }
  return { status: res.status, body };
}

async function run() {
  console.log('\n--- Admin API tests ---\n');

  const health = await request('GET', '/health');
  log('GET /health', health.status === 200, health.status);
  if (health.status !== 200) {
    console.log('API not running. Start with: cd api && npm start\n');
    process.exit(1);
  }

  const noAuth = await request('GET', '/admin/chapters');
  log('GET /admin/chapters without token → 401', noAuth.status === 401, noAuth.status);

  if (!TOKEN) {
    console.log('\nNo ACCESS_TOKEN. To test with auth:');
    console.log('  1. Log in at http://localhost:8080');
    console.log('  2. Browser console: (await supabase.auth.getSession()).data.session?.access_token');
    console.log('  3. ACCESS_TOKEN=<paste> node scripts/test-admin-api.js\n');
    process.exit(0);
  }

  const listCh = await request('GET', '/admin/chapters');
  const listChOk = listCh.status === 200 && listCh.body && Array.isArray(listCh.body.data);
  log('GET /admin/chapters with token', listChOk, listCh.status === 403 ? '403 (not admin)' : listCh.status);
  if (listCh.status === 403) {
    console.log('\nUser is not admin. Add to .env: ADMIN_USER_IDS=your-user-uuid');
    console.log('Or in Supabase: profiles table, set role=admin for your user.\n');
    process.exit(0);
  }
  if (listCh.status !== 200) {
    console.log(listCh.body);
    process.exit(1);
  }

  const createCh = await request('POST', '/admin/chapters', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book_id: 1, chapter_num: 1, free: true }),
  });
  const createChOk = createCh.status === 201 && createCh.body && createCh.body.id != null;
  log('POST /admin/chapters', createChOk, createCh.status);
  if (!createChOk && createCh.status === 400) {
    console.log('  (Books table needs a row with id=1)');
  }
  const chapterId = createChOk ? (createCh.body.id ?? createCh.body.chapter_id) : null;

  if (chapterId != null) {
    const getCh = await request('GET', `/admin/chapters/${chapterId}`);
    log('GET /admin/chapters/:id', getCh.status === 200, getCh.status);
    const patchCh = await request('PATCH', `/admin/chapters/${chapterId}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ free: false }),
    });
    log('PATCH /admin/chapters/:id', patchCh.status === 200, patchCh.status);
    const delCh = await request('DELETE', `/admin/chapters/${chapterId}`);
    log('DELETE /admin/chapters/:id', delCh.status === 204, delCh.status);
  }

  const listDoc = await request('GET', '/admin/documents');
  log('GET /admin/documents', listDoc.status === 200 && Array.isArray(listDoc.body?.data), listDoc.status);

  console.log('\n--- Manual tests (run in terminal) ---');
  console.log('Upload a worksheet (replace YOUR_TOKEN and path to file):');
  console.log('  curl -X POST http://localhost:3001/admin/documents \\');
  console.log('    -H "Authorization: Bearer YOUR_TOKEN" \\');
  console.log('    -F "file=@./test.txt" -F "title=My Worksheet"');
  console.log('Download file: GET /admin/documents/:id/file with same header.');
  console.log('\n--- Done ---\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
