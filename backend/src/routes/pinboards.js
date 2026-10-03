const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const { emitGlobalDataUpdate, emitPinboardUpdate } = require('../realtime');
const { createActivity } = require('../utils/activity');
const { sandboxUserContent } = require('../utils/userContent');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const PIN_DIR = path.join(UPLOAD_DIR, 'pinboards');
fs.mkdirSync(PIN_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PIN_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const fileFilter = (req, file, cb) => {
  const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
  if (ok) cb(null, true);
  else cb(new Error(`Unsupported file type: ${file.mimetype}`));
};
const upload = multer({ storage, fileFilter });

function serializeBoard(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    userId: row.user_id,
    createdAt: row.created_at,
    creatorUsername: row.creator_username,
    creatorColor: row.creator_color,
    creatorAvatar: row.creator_avatar,
    itemCount: row.item_count || 0,
  };
}

function serializeItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    boardId: row.board_id,
    authorId: row.author_user_id,
    authorUsername: row.author_username,
    authorColor: row.author_color,
    authorAvatar: row.author_avatar,
    kind: row.kind,
    content: row.content,
    noteImageFileId: row.note_image_file_id,
    filename: row.filename,
    mimeType: row.mime_type,
    fileRefId: row.file_ref_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    color: row.color,
    rotation: row.rotation,
    zIndex: row.z_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likes: row.like_count || 0,
    dislikes: row.dislike_count || 0,
    myVote: row.my_vote || 0,
  };
}

function serializeLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    boardId: row.board_id,
    fromItemId: row.from_item_id,
    toItemId: row.to_item_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

function itemWithCounts(itemId, userId) {
  return db.prepare(`
    SELECT
      i.*,
      u.username AS author_username,
      u.color AS author_color,
      u.avatar AS author_avatar,
      (SELECT COUNT(*) FROM pinboard_item_reactions r WHERE r.item_id = i.id AND r.vote = 1) AS like_count,
      (SELECT COUNT(*) FROM pinboard_item_reactions r WHERE r.item_id = i.id AND r.vote = -1) AS dislike_count,
      (SELECT r.vote FROM pinboard_item_reactions r WHERE r.item_id = i.id AND r.user_id = ?) AS my_vote
    FROM pinboard_items i
    LEFT JOIN users u ON u.id = i.author_user_id
    WHERE i.id = ?
  `).get(userId, itemId);
}

// List boards
router.get('/', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*,
      u.username AS creator_username,
      u.color AS creator_color,
      u.avatar AS creator_avatar,
      (SELECT COUNT(*) FROM pinboard_items i WHERE i.board_id = b.id) AS item_count
    FROM pinboards b
    LEFT JOIN users u ON u.id = b.user_id
    ORDER BY b.created_at DESC
  `).all();
  res.json({ boards: rows.map(serializeBoard) });
});

// Create board
router.post('/', auth, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (name.length > 120) return res.status(400).json({ error: 'Name is too long' });

  const result = db.prepare('INSERT INTO pinboards (name, description, user_id) VALUES (?, ?, ?)')
    .run(name, description || null, req.user.userId);

  const board = db.prepare(`
    SELECT b.*,
      u.username AS creator_username,
      u.color AS creator_color,
      u.avatar AS creator_avatar,
      0 AS item_count
    FROM pinboards b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
  `).get(result.lastInsertRowid);

  emitGlobalDataUpdate('pinboards', 'created', { boardId: board.id });
  createActivity({
    actorUserId: req.user.userId,
    type: 'pinboard_created',
    entityType: 'pinboard',
    entityId: String(board.id),
    metadata: { name: board.name },
  });

  res.json({ board: serializeBoard(board) });
});

// Get single board + items
router.get('/:id', auth, (req, res) => {
  const board = db.prepare(`
    SELECT b.*,
      u.username AS creator_username,
      u.color AS creator_color,
      u.avatar AS creator_avatar,
      (SELECT COUNT(*) FROM pinboard_items i WHERE i.board_id = b.id) AS item_count
    FROM pinboards b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const items = db.prepare(`
    SELECT
      i.*,
      u.username AS author_username,
      u.color AS author_color,
      u.avatar AS author_avatar,
      (SELECT COUNT(*) FROM pinboard_item_reactions r WHERE r.item_id = i.id AND r.vote = 1) AS like_count,
      (SELECT COUNT(*) FROM pinboard_item_reactions r WHERE r.item_id = i.id AND r.vote = -1) AS dislike_count,
      (SELECT r.vote FROM pinboard_item_reactions r WHERE r.item_id = i.id AND r.user_id = ?) AS my_vote
    FROM pinboard_items i
    LEFT JOIN users u ON u.id = i.author_user_id
    WHERE i.board_id = ?
    ORDER BY i.z_index ASC, i.id ASC
  `).all(req.user.userId, req.params.id);

  const links = db.prepare(`
    SELECT id, board_id, from_item_id, to_item_id, created_by_user_id, created_at
    FROM pinboard_links
    WHERE board_id = ?
    ORDER BY id ASC
  `).all(req.params.id);

  res.json({ board: serializeBoard(board), items: items.map(serializeItem), links: links.map(serializeLink) });
});

// Rename / update board
router.patch('/:id', auth, (req, res) => {
  const board = db.prepare('SELECT * FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  if (board.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : null;
  if (name !== null && !name) return res.status(400).json({ error: 'Name cannot be empty' });

  if (name !== null) db.prepare('UPDATE pinboards SET name = ? WHERE id = ?').run(name, board.id);
  if (description !== null) db.prepare('UPDATE pinboards SET description = ? WHERE id = ?').run(description || null, board.id);

  emitGlobalDataUpdate('pinboards', 'updated', { boardId: board.id });
  res.json({ ok: true });
});

// Delete board (cascades items; also removes any uploaded media files)
router.delete('/:id', auth, (req, res) => {
  const board = db.prepare('SELECT * FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  if (board.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const items = db.prepare('SELECT filename FROM pinboard_items WHERE board_id = ? AND filename IS NOT NULL').all(board.id);
  for (const it of items) {
    const p = path.join(PIN_DIR, it.filename);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
  db.prepare('DELETE FROM pinboards WHERE id = ?').run(board.id);
  emitGlobalDataUpdate('pinboards', 'deleted', { boardId: board.id });
  res.json({ ok: true });
});

// Create item (note / file_ref)
router.post('/:id/items', auth, (req, res) => {
  const board = db.prepare('SELECT id FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const { kind = 'note', content = '', fileRefId = null, x = 40, y = 40, width = 220, height = 160, color = null, rotation = 0 } = req.body || {};
  if (!['note', 'file_ref'].includes(kind)) return res.status(400).json({ error: 'Invalid card type' });
  if (kind === 'file_ref' && !fileRefId) return res.status(400).json({ error: 'A file reference is required' });

  const maxZ = db.prepare('SELECT COALESCE(MAX(z_index), 0) AS z FROM pinboard_items WHERE board_id = ?').get(board.id).z;

  const result = db.prepare(`
    INSERT INTO pinboard_items
    (board_id, author_user_id, kind, content, note_image_file_id, file_ref_id, x, y, width, height, color, rotation, z_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    board.id, req.user.userId, kind,
    typeof content === 'string' ? content : '',
    null,
    kind === 'file_ref' ? String(fileRefId) : null,
    Number(x) || 0, Number(y) || 0,
    Number(width) || 220, Number(height) || 160,
    color || null, Number(rotation) || 0,
    maxZ + 1,
  );

  const item = serializeItem(itemWithCounts(result.lastInsertRowid, req.user.userId));
  emitPinboardUpdate(board.id, 'item-created', { item });
  res.json({ item });
});

// Upload image/video item
router.post('/:id/items/upload', auth, upload.single('file'), async (req, res) => {
  const board = db.prepare('SELECT id FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(404).json({ error: 'Board not found' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file selected' });

  const kind = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
  const x = Number(req.body?.x) || 40;
  const y = Number(req.body?.y) || 40;
  const width = Number(req.body?.width) || 260;
  const height = Number(req.body?.height) || 200;

  const maxZ = db.prepare('SELECT COALESCE(MAX(z_index), 0) AS z FROM pinboard_items WHERE board_id = ?').get(board.id).z;

  const result = db.prepare(`
    INSERT INTO pinboard_items
    (board_id, author_user_id, kind, filename, mime_type, x, y, width, height, z_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    board.id, req.user.userId, kind,
    req.file.filename, req.file.mimetype,
    x, y, width, height, maxZ + 1
  );

  const item = serializeItem(itemWithCounts(result.lastInsertRowid, req.user.userId));
  emitPinboardUpdate(board.id, 'item-created', { item });
  res.json({ item });
});

// Serve pinboard media
router.get('/media/:filename', auth, (req, res) => {
  const safe = path.basename(req.params.filename);
  const full = path.join(PIN_DIR, safe);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
  sandboxUserContent(res);
  res.sendFile(path.resolve(full));
});

// Update item (content / position / size)
router.patch('/:id/items/:itemId', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM pinboard_items WHERE id = ? AND board_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Card not found' });

  const updates = [];
  const values = [];
  const b = req.body || {};

  if (typeof b.content === 'string' && item.author_user_id === req.user.userId) { updates.push('content = ?'); values.push(b.content); }
  if (b.x !== undefined) { updates.push('x = ?'); values.push(Number(b.x) || 0); }
  if (b.y !== undefined) { updates.push('y = ?'); values.push(Number(b.y) || 0); }
  if (b.width !== undefined) { updates.push('width = ?'); values.push(Math.max(60, Number(b.width) || 220)); }
  if (b.height !== undefined) { updates.push('height = ?'); values.push(Math.max(40, Number(b.height) || 160)); }
  if (b.rotation !== undefined) { updates.push('rotation = ?'); values.push(Number(b.rotation) || 0); }
  if (b.zIndex !== undefined) { updates.push('z_index = ?'); values.push(Number(b.zIndex) || 0); }
  if (b.color !== undefined && item.author_user_id === req.user.userId) { updates.push('color = ?'); values.push(b.color || null); }
  if (b.noteImageFileId !== undefined && item.author_user_id === req.user.userId) {
    if (b.noteImageFileId === null || b.noteImageFileId === '') {
      updates.push('note_image_file_id = ?');
      values.push(null);
    } else {
      const fileRow = db.prepare('SELECT id, mime_type FROM files WHERE id = ?').get(String(b.noteImageFileId));
      if (!fileRow || !String(fileRow.mime_type || '').startsWith('image/')) {
        return res.status(400).json({ error: 'Select a valid image file' });
      }
      updates.push('note_image_file_id = ?');
      values.push(String(b.noteImageFileId));
    }
  }

  if (!updates.length) return res.json({ ok: true });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(item.id);
  db.prepare(`UPDATE pinboard_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = serializeItem(itemWithCounts(item.id, req.user.userId));
  emitPinboardUpdate(Number(req.params.id), 'item-updated', { item: updated });
  res.json({ item: updated });
});

// Create link between two cards
router.post('/:id/links', auth, (req, res) => {
  const board = db.prepare('SELECT id FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const fromItemId = Number(req.body?.fromItemId);
  const toItemId = Number(req.body?.toItemId);
  if (!Number.isFinite(fromItemId) || !Number.isFinite(toItemId) || fromItemId === toItemId) {
    return res.status(400).json({ error: 'Invalid link' });
  }

  const from = db.prepare('SELECT id FROM pinboard_items WHERE id = ? AND board_id = ?').get(fromItemId, board.id);
  const to = db.prepare('SELECT id FROM pinboard_items WHERE id = ? AND board_id = ?').get(toItemId, board.id);
  if (!from || !to) return res.status(400).json({ error: 'Cards not found on this board' });

  const a = Math.min(fromItemId, toItemId);
  const b = Math.max(fromItemId, toItemId);

  db.prepare(`
    INSERT OR IGNORE INTO pinboard_links (board_id, from_item_id, to_item_id, created_by_user_id)
    VALUES (?, ?, ?, ?)
  `).run(board.id, a, b, req.user.userId);

  const link = db.prepare('SELECT * FROM pinboard_links WHERE board_id = ? AND from_item_id = ? AND to_item_id = ?')
    .get(board.id, a, b);

  const serialized = serializeLink(link);
  emitPinboardUpdate(board.id, 'link-created', { link: serialized });
  res.json({ link: serialized });
});

// Delete a link
router.delete('/:id/links/:linkId', auth, (req, res) => {
  const board = db.prepare('SELECT id FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const linkId = Number(req.params.linkId);
  const link = db.prepare('SELECT * FROM pinboard_links WHERE id = ? AND board_id = ?').get(linkId, board.id);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  db.prepare('DELETE FROM pinboard_links WHERE id = ?').run(link.id);
  emitPinboardUpdate(board.id, 'link-deleted', { linkId: link.id });
  res.json({ ok: true });
});

// Delete item
router.delete('/:id/items/:itemId', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM pinboard_items WHERE id = ? AND board_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Card not found' });

  const board = db.prepare('SELECT user_id FROM pinboards WHERE id = ?').get(req.params.id);
  if (item.author_user_id !== req.user.userId && board?.user_id !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (item.filename) {
    const p = path.join(PIN_DIR, item.filename);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
  db.prepare('DELETE FROM pinboard_items WHERE id = ?').run(item.id);
  emitPinboardUpdate(Number(req.params.id), 'item-deleted', { itemId: item.id });
  res.json({ ok: true });
});

// Get viewport (per user + board)
router.get('/:id/viewport', auth, (req, res) => {
  const row = db.prepare('SELECT scroll_left, scroll_top, zoom FROM pinboard_viewports WHERE board_id = ? AND user_id = ?')
    .get(req.params.id, req.user.userId);
  if (!row) return res.json({ viewport: null });
  res.json({ viewport: { scrollLeft: row.scroll_left, scrollTop: row.scroll_top, zoom: row.zoom } });
});

// Save viewport (per user + board)
router.put('/:id/viewport', auth, (req, res) => {
  const board = db.prepare('SELECT id FROM pinboards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const sl = Number(req.body?.scrollLeft);
  const st = Number(req.body?.scrollTop);
  const z = Number(req.body?.zoom);
  if (!Number.isFinite(sl) || !Number.isFinite(st) || !Number.isFinite(z)) {
    return res.status(400).json({ error: 'Invalid values' });
  }

  db.prepare(`
    INSERT INTO pinboard_viewports (board_id, user_id, scroll_left, scroll_top, zoom)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(board_id, user_id) DO UPDATE SET
      scroll_left = excluded.scroll_left,
      scroll_top = excluded.scroll_top,
      zoom = excluded.zoom,
      updated_at = CURRENT_TIMESTAMP
  `).run(board.id, req.user.userId, sl, st, z);

  res.json({ ok: true });
});

// Like / dislike item (vote = 1 | -1 | 0)
router.post('/:id/items/:itemId/vote', auth, (req, res) => {
  const item = db.prepare('SELECT id FROM pinboard_items WHERE id = ? AND board_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Card not found' });

  const vote = Number(req.body?.vote);
  if (![1, -1, 0].includes(vote)) return res.status(400).json({ error: 'Invalid vote' });

  if (vote === 0) {
    db.prepare('DELETE FROM pinboard_item_reactions WHERE item_id = ? AND user_id = ?')
      .run(item.id, req.user.userId);
  } else {
    db.prepare(`
      INSERT INTO pinboard_item_reactions (item_id, user_id, vote)
      VALUES (?, ?, ?)
      ON CONFLICT(item_id, user_id) DO UPDATE SET vote = excluded.vote, created_at = CURRENT_TIMESTAMP
    `).run(item.id, req.user.userId, vote);
  }

  const updated = serializeItem(itemWithCounts(item.id, req.user.userId));
  emitPinboardUpdate(Number(req.params.id), 'item-voted', { item: updated });
  res.json({ item: updated });
});

module.exports = router;
