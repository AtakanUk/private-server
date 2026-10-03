const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { emitGlobalDataUpdate } = require('../realtime');
const router = express.Router();

function deleteAlbumForUser(albumId, userId) {
  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(albumId, userId);
  if (!album) return false;

  db.prepare('DELETE FROM album_files WHERE album_id = ?').run(albumId);
  db.prepare('DELETE FROM albums WHERE id = ?').run(albumId);
  return true;
}

// List albums (file count + cover)
router.get('/', auth, (req, res) => {
  const albums = db.prepare(`
    SELECT a.id, a.name, a.created_at, a.cover_file_id,
           COUNT(f.id) as file_count
    FROM albums a
    LEFT JOIN album_files af ON af.album_id = a.id
    LEFT JOIN files f ON f.id = af.file_id
    WHERE a.user_id = ?
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `).all(req.user.userId);

  // Thumbnail info for the cover
  const result = albums.map(album => {
    let coverFile = null;

    if (album.cover_file_id) {
      coverFile = db.prepare(
        'SELECT id, thumbnail, blurred, thumbnail_updated_at, created_at FROM files WHERE id = ?'
      ).get(album.cover_file_id);
    }

    if (!coverFile) {
        coverFile = db.prepare(`
          SELECT f.id, f.thumbnail, f.blurred, f.thumbnail_updated_at, f.created_at FROM files f
          JOIN album_files af ON af.file_id = f.id
          WHERE af.album_id = ? AND f.thumbnail IS NOT NULL
          LIMIT 1
        `).get(album.id);
    }

    return { ...album, cover: coverFile || null };
  });

  res.json(result);
});

// Create album
router.post('/', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Album name is required' });
  const result = db.prepare('INSERT INTO albums (name, user_id) VALUES (?, ?)').run(name.trim(), req.user.userId);
  emitGlobalDataUpdate('albums', 'created', { albumId: Number(result.lastInsertRowid) });
  res.json({ id: result.lastInsertRowid, name: name.trim() });
});

// Get album files
router.get('/:id/files', auth, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });

  const files = db.prepare(`
    SELECT
      f.*,
      (SELECT COUNT(*) FROM file_comments fc WHERE fc.file_id = f.id) AS comment_count,
      (SELECT COUNT(*) FROM file_reactions fr WHERE fr.file_id = f.id) AS reaction_count,
      (
        SELECT GROUP_CONCAT(t.emoji, ' ')
        FROM (
          SELECT fr2.emoji AS emoji
          FROM file_reactions fr2
          WHERE fr2.file_id = f.id
          GROUP BY fr2.emoji
          ORDER BY COUNT(*) DESC, MAX(fr2.created_at) DESC
          LIMIT 3
        ) t
      ) AS reaction_preview
    FROM files f
    JOIN album_files af ON af.file_id = f.id
    WHERE af.album_id = ?
    ORDER BY af.added_at DESC
  `).all(req.params.id);

  res.json({ album, files });
});

// Set album cover
router.patch('/:id/cover', auth, (req, res) => {
  const { fileId } = req.body || {};
  const albumId = Number(req.params.id);
  const album = db.prepare('SELECT * FROM albums WHERE id = ? AND user_id = ?').get(albumId, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });

  if (!fileId) {
    db.prepare('UPDATE albums SET cover_file_id = NULL WHERE id = ?').run(albumId);
    emitGlobalDataUpdate('albums', 'cover-updated', { albumId, fileId: null });
    return res.json({ message: 'Album cover cleared', cover_file_id: null });
  }

  const inAlbum = db.prepare('SELECT 1 as ok FROM album_files WHERE album_id = ? AND file_id = ?').get(albumId, fileId);
  if (!inAlbum) {
    return res.status(400).json({ error: 'The selected file is not in this album' });
  }

  db.prepare('UPDATE albums SET cover_file_id = ? WHERE id = ?').run(fileId, albumId);
  emitGlobalDataUpdate('albums', 'cover-updated', { albumId, fileId });
  return res.json({ message: 'Album cover updated', cover_file_id: fileId });
});

// Rename album
router.patch('/:id', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Album name is required' });
  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  emitGlobalDataUpdate('albums', 'renamed', { albumId: Number(req.params.id) });
  res.json({ message: 'Album renamed' });
});

// Delete album
router.delete('/:id', auth, (req, res) => {
  const deleted = deleteAlbumForUser(req.params.id, req.user.userId);
  if (!deleted) return res.status(404).json({ error: 'Album not found' });
  emitGlobalDataUpdate('albums', 'deleted', { albumId: Number(req.params.id) });
  res.json({ message: 'Album deleted' });
});

// POST fallback for proxies that block DELETE
router.post('/:id/delete', auth, (req, res) => {
  const deleted = deleteAlbumForUser(req.params.id, req.user.userId);
  if (!deleted) return res.status(404).json({ error: 'Album not found' });
  emitGlobalDataUpdate('albums', 'deleted', { albumId: Number(req.params.id) });
  res.json({ message: 'Album deleted' });
});

// Add file to album
router.post('/:id/files', auth, (req, res) => {
  const { fileId } = req.body;
  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  // Files are a shared pool, so any member can add any file to their album.
  const file = db.prepare('SELECT id FROM files WHERE id = ?').get(fileId);
  if (!file) return res.status(404).json({ error: 'File not found' });
  try {
    db.prepare('INSERT INTO album_files (album_id, file_id) VALUES (?, ?)').run(req.params.id, fileId);
  } catch {
    // Already added, that's fine
  }

  // Use the first added file as the default cover
  db.prepare('UPDATE albums SET cover_file_id = COALESCE(cover_file_id, ?) WHERE id = ?').run(fileId, req.params.id);

  emitGlobalDataUpdate('albums', 'file-added', { albumId: Number(req.params.id), fileId });

  res.json({ message: 'File added to album' });
});

// Bulk add files
router.post('/:id/files/bulk', auth, (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'No file selected' });
  }
  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });

  let added = 0;
  for (const fileId of fileIds) {
    const file = db.prepare('SELECT id FROM files WHERE id = ?').get(fileId);
    if (!file) continue;
    try {
      db.prepare('INSERT INTO album_files (album_id, file_id) VALUES (?, ?)').run(req.params.id, fileId);
      added++;
    } catch {}
  }
  db.prepare('UPDATE albums SET cover_file_id = COALESCE(cover_file_id, ?) WHERE id = ?').run(fileIds[0], req.params.id);
  emitGlobalDataUpdate('albums', 'files-added-bulk', { albumId: Number(req.params.id), count: added });
  res.json({ message: `${added} files added`, added });
});

// Bulk remove files
router.post('/:id/files/bulk-remove', auth, (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'No file selected' });
  }
  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });

  for (const fileId of fileIds) {
    db.prepare('DELETE FROM album_files WHERE album_id = ? AND file_id = ?').run(req.params.id, fileId);
    db.prepare('UPDATE albums SET cover_file_id = NULL WHERE id = ? AND cover_file_id = ?').run(req.params.id, fileId);
  }
  emitGlobalDataUpdate('albums', 'files-removed-bulk', { albumId: Number(req.params.id), count: fileIds.length });
  res.json({ message: `${fileIds.length} files removed from album` });
});

// Remove file from album
router.delete('/:id/files/:fileId', auth, (req, res) => {
  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  db.prepare('DELETE FROM album_files WHERE album_id = ? AND file_id = ?').run(req.params.id, req.params.fileId);

  // Clear the cover if the removed file was the cover
  db.prepare('UPDATE albums SET cover_file_id = NULL WHERE id = ? AND cover_file_id = ?').run(req.params.id, req.params.fileId);

  emitGlobalDataUpdate('albums', 'file-removed', { albumId: Number(req.params.id), fileId: req.params.fileId });

  res.json({ message: 'File removed from album' });
});

module.exports = router;
