const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const { listLogDates, readLogFile } = require('../logger');
const { enrichLogRecords } = require('../utils/logEnricher');
const router = express.Router();

function normalizeNullableText(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s || null;
}

function isEnvAdminUser(username) {
  return !!(process.env.ADMIN_USERNAME && username === process.env.ADMIN_USERNAME);
}

function getUserOr404(userId, res) {
  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return user;
}

// List all users
router.get('/users', adminAuth, (req, res) => {
  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.phone,
      u.color,
      u.avatar,
      u.is_admin,
      u.upload_email_notifications,
      u.created_at,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id), 0) AS file_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'image'), 0) AS image_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'video'), 0) AS video_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'audio'), 0) AS audio_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'document'), 0) AS document_count,
      COALESCE((SELECT SUM(f.size) FROM files f WHERE f.user_id = u.id), 0) AS total_size,
      COALESCE((SELECT COUNT(*) FROM albums a WHERE a.user_id = u.id), 0) AS album_count,
      COALESCE((SELECT COUNT(*) FROM file_comments c WHERE c.user_id = u.id), 0) AS comment_count,
      COALESCE((SELECT COUNT(*) FROM file_reactions r WHERE r.user_id = u.id), 0) AS reaction_count,
      (SELECT MAX(f.created_at) FROM files f WHERE f.user_id = u.id) AS last_upload_at
    FROM users u
    ORDER BY u.created_at ASC
  `).all().map((u) => ({
    ...u,
    is_admin: !!u.is_admin,
    upload_email_notifications: !!u.upload_email_notifications,
    env_admin: isEnvAdminUser(u.username),
  }));

  res.json(users);
});

// Get user details
router.get('/users/:id', adminAuth, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user id' });

  const row = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.phone,
      u.color,
      u.avatar,
      u.is_admin,
      u.upload_email_notifications,
      u.created_at,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id), 0) AS file_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'image'), 0) AS image_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'video'), 0) AS video_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'audio'), 0) AS audio_count,
      COALESCE((SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.category = 'document'), 0) AS document_count,
      COALESCE((SELECT SUM(f.size) FROM files f WHERE f.user_id = u.id), 0) AS total_size,
      COALESCE((SELECT COUNT(*) FROM albums a WHERE a.user_id = u.id), 0) AS album_count,
      COALESCE((SELECT COUNT(*) FROM file_comments c WHERE c.user_id = u.id), 0) AS comment_count,
      COALESCE((SELECT COUNT(*) FROM file_reactions r WHERE r.user_id = u.id), 0) AS reaction_count,
      (SELECT MAX(f.created_at) FROM files f WHERE f.user_id = u.id) AS last_upload_at
    FROM users u
    WHERE u.id = ?
  `).get(userId);

  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...row,
    is_admin: !!row.is_admin,
    upload_email_notifications: !!row.upload_email_notifications,
    env_admin: isEnvAdminUser(row.username),
  });
});

// Update user profile / role
router.patch('/users/:id', adminAuth, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user id' });

  const user = getUserOr404(userId, res);
  if (!user) return;

  const username = normalizeNullableText(req.body?.username);
  const email = normalizeNullableText(req.body?.email);
  const phone = normalizeNullableText(req.body?.phone);
  const color = normalizeNullableText(req.body?.color);
  const uploadEmailNotifications = req.body?.uploadEmailNotifications;
  const isAdmin = req.body?.isAdmin;

  const targetEnvAdmin = isEnvAdminUser(user.username);
  if (targetEnvAdmin && username !== undefined && username !== user.username) {
    return res.status(400).json({ error: 'The ADMIN_USERNAME account cannot be renamed' });
  }
  if (targetEnvAdmin && isAdmin === false) {
    return res.status(400).json({ error: 'The ADMIN_USERNAME account cannot lose admin rights' });
  }

  if (username !== undefined) {
    if (!username || username.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    if (username !== user.username) {
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username, userId);
      if (exists) return res.status(409).json({ error: 'Username is already taken' });
    }
  }

  db.prepare(`
    UPDATE users
    SET
      username = COALESCE(?, username),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      color = COALESCE(?, color),
      upload_email_notifications = COALESCE(?, upload_email_notifications),
      is_admin = COALESCE(?, is_admin)
    WHERE id = ?
  `).run(
    username,
    email,
    phone,
    color,
    uploadEmailNotifications === undefined ? null : (uploadEmailNotifications ? 1 : 0),
    isAdmin === undefined ? null : (isAdmin ? 1 : 0),
    userId
  );

  if (targetEnvAdmin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
  }

  res.json({ message: 'User updated' });
});

// Reset a user's password (admin)
router.patch('/users/:id/password', adminAuth, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ message: 'Password updated' });
});

// List available log dates
router.get('/logs/dates', adminAuth, (req, res) => {
  res.json({ dates: listLogDates() });
});

// Return a day's logs, filtered
router.get('/logs', adminAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const date = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : today;

  const userFilter = req.query.user ? String(req.query.user).toLowerCase() : '';
  const q = req.query.q ? String(req.query.q).toLowerCase() : '';
  const category = req.query.category || 'default';
  const status = req.query.status || 'all';
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let records = readLogFile(date);

  records = records.filter((r) => {
    if (userFilter) {
      const uname = (r.username || '').toLowerCase();
      const uid = String(r.userId || '');
      if (uname !== userFilter && uid !== userFilter) return false;
    }
    if (category === 'http' && r.category !== 'http') return false;
    if (category === 'media' && r.category !== 'media') return false;
    if (category === 'spa-event' && r.category !== 'spa-event') return false;
    if (category === 'default' && r.category === 'media') return false;
    if (status === '2xx' && !(r.status >= 200 && r.status < 300)) return false;
    if (status === '4xx' && !(r.status >= 400 && r.status < 500)) return false;
    if (status === '5xx' && !(r.status >= 500)) return false;
    if (status === 'errors' && !(r.status >= 400)) return false;
    if (q) {
      const haystack = [r.url, r.event, r.method, r.ip].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  records.reverse();
  const total = records.length;
  const items = records.slice(offset, offset + limit);
  enrichLogRecords(items);

  res.json({ date, total, offset, limit, items });
});

// Delete user (admins cannot delete themselves)
router.delete('/users/:id', adminAuth, (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (Number(user.id) === Number(req.user.userId)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  if (isEnvAdminUser(user.username)) {
    return res.status(400).json({ error: 'The ADMIN_USERNAME account cannot be deleted' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

module.exports = router;
