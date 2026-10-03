const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { emitGlobalDataUpdate } = require('../realtime');

const router = express.Router();

function sliceGraphemes(str, max = 1) {
  const input = String(str || '');
  if (!input) return '';
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return [...seg.segment(input)].slice(0, max).map((x) => x.segment).join('');
    }
  } catch {}
  return Array.from(input).slice(0, max).join('');
}

// GET /api/countdown  → shared targets list
router.get('/', auth, (req, res) => {
  const row = db.prepare('SELECT targets_json FROM countdown_targets WHERE id = 1').get();
  let targets = [];
  try { targets = JSON.parse(row?.targets_json || '[]'); } catch {}
  res.json({ targets });
});

// PUT /api/countdown  → replace targets list (any logged-in user can update)
router.put('/', auth, (req, res) => {
  const incoming = req.body?.targets;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'targets array is required' });

  const sanitized = incoming
    .filter((t) => t && typeof t.id === 'string' && typeof t.date === 'string')
    .map((t) => ({
      id: String(t.id).slice(0, 64),
      icon: typeof t.icon === 'string' ? (sliceGraphemes(t.icon, 1) || '⏳') : '⏳',
      date: String(t.date).slice(0, 32),
    }));

  db.prepare('UPDATE countdown_targets SET targets_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
    .run(JSON.stringify(sanitized));

  emitGlobalDataUpdate('countdown', 'updated', { targets: sanitized });
  res.json({ targets: sanitized });
});

module.exports = router;
