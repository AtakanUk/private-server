const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { serializeNotification } = require('../utils/activity');

const router = express.Router();

// List notifications (mine)
router.get('/', auth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = db.prepare(`
    SELECT n.*, u.username AS actor_username, u.color AS actor_color, u.avatar AS actor_avatar
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_user_id
    WHERE n.user_id = ?
    ORDER BY n.id DESC
    LIMIT ?
  `).all(req.user.userId, limit);

  const unreadCount = db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL'
  ).get(req.user.userId).c;

  res.json({ items: rows.map(serializeNotification), unreadCount });
});

// Unread count only (light)
router.get('/unread-count', auth, (req, res) => {
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL'
  ).get(req.user.userId);
  res.json({ unreadCount: row.c });
});

// Mark one as read
router.patch('/:id/read', auth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT user_id FROM notifications WHERE id = ?').get(id);
  if (!row || row.user_id !== req.user.userId) return res.status(404).json({ error: 'Notification not found' });
  db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND read_at IS NULL").run(id);
  res.json({ ok: true });
});

// Mark all as read
router.post('/read-all', auth, (req, res) => {
  db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL")
    .run(req.user.userId);
  res.json({ ok: true });
});

// Dismiss (delete)
router.delete('/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT user_id FROM notifications WHERE id = ?').get(id);
  if (!row || row.user_id !== req.user.userId) return res.status(404).json({ error: 'Notification not found' });
  db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Dismiss all
router.delete('/', auth, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.userId);
  res.json({ ok: true });
});

module.exports = router;
