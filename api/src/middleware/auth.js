const { anonClient, adminClient } = require('../db/supabase');

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Require a valid Supabase JWT in Authorization: Bearer <token>.
 * Sets req.user = { id, email } and req.accessToken.
 * Sends 401 if missing or invalid.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = { id: user.id, email: user.email };
    req.accessToken = token;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require the authenticated user to be an admin.
 * Uses (in order): ADMIN_USER_IDS env, then profiles.role === 'admin'.
 * Sends 403 if not admin.
 */
async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (ADMIN_USER_IDS.includes(req.user.id)) {
    return next();
  }
  try {
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) {
      return res.status(500).json({ error: 'Failed to check admin status' });
    }
    if (profile && profile.role === 'admin') {
      return next();
    }
  } catch (_) {
    return res.status(500).json({ error: 'Failed to check admin status' });
  }
  return res.status(403).json({ error: 'Admin access required' });
}

/** Combined: require auth then admin. Use for all /admin/* routes. */
const requireAdminAuth = [requireAuth, requireAdmin];

module.exports = { requireAuth, requireAdmin, requireAdminAuth };
