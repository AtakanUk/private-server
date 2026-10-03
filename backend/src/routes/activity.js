const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { serializeActivity } = require('../utils/activity');

const router = express.Router();

// Global feed (everyone sees everything)
router.get('/', auth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const before = req.query.before ? Number(req.query.before) : null;

  let sql = `
    SELECT a.*, u.username AS actor_username, u.color AS actor_color, u.avatar AS actor_avatar
    FROM activity a
    LEFT JOIN users u ON u.id = a.actor_user_id
  `;
  const params = [];
  if (before) {
    sql += ' WHERE a.id < ?';
    params.push(before);
  }
  sql += ' ORDER BY a.id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  const items = rows.map(serializeActivity);
  res.json({ items });
});

// Delete a single activity item (admin only)
router.delete('/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const result = db.prepare('DELETE FROM activity WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Delete all activity items (admin only)
router.delete('/', adminAuth, (req, res) => {
  db.prepare('DELETE FROM activity').run();
  res.json({ ok: true });
});

module.exports = router;
