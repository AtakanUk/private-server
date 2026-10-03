const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { emitGlobalDataUpdate } = require('../realtime');
const router = express.Router();

// List folders (shared)
router.get('/', auth, (req, res) => {
  const folders = db.prepare(`
    SELECT f.*, COUNT(ff.file_id) as file_count
    FROM folders f
    LEFT JOIN file_folders ff ON f.id = ff.folder_id
    WHERE f.parent_id IS NULL
    GROUP BY f.id
    ORDER BY f.name
  `).all();
  res.json(folders);
});

// Create folder
router.post('/', auth, (req, res) => {
  const { name, parentId } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const result = db.prepare(
    'INSERT INTO folders (name, parent_id, user_id) VALUES (?, ?, ?)'
  ).run(name.trim(), parentId || null, req.user.userId);

  emitGlobalDataUpdate('folders', 'created', { folderId: Number(result.lastInsertRowid) });

  res.json({ id: result.lastInsertRowid, name: name.trim() });
});

// Delete folder
router.delete('/:id', auth, (req, res) => {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?')
    .get(req.params.id);

  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  db.prepare('DELETE FROM file_folders WHERE folder_id = ?').run(folder.id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id);

  emitGlobalDataUpdate('folders', 'deleted', { folderId: Number(folder.id) });

  res.json({ message: 'Folder deleted' });
});

// Add files to folder
router.post('/:id/files', auth, (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'fileIds is required' });
  }

  const stmt = db.prepare('INSERT OR IGNORE INTO file_folders (file_id, folder_id) VALUES (?, ?)');
  for (const fileId of fileIds) {
    stmt.run(fileId, parseInt(req.params.id));
  }

  emitGlobalDataUpdate('folders', 'files-added', { folderId: Number(req.params.id), count: fileIds.length });

  res.json({ message: 'Files added to folder' });
});

module.exports = router;
