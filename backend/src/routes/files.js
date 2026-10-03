const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const exifr = require('exifr');
const db = require('../db');
const auth = require('../middleware/auth');
const { sendUploadNotification } = require('../utils/mailer');
const { emitFileInteractionUpdate, emitGlobalDataUpdate } = require('../realtime');
const { createActivity, createNotification } = require('../utils/activity');
const { sandboxUserContent, contentDisposition } = require('../utils/userContent');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 0; // 0 = unlimited

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'originals');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
    'application/pdf',
    'application/zip', 'application/x-zip-compressed',
    'application/x-rar-compressed',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  ...(MAX_FILE_SIZE > 0 && { limits: { fileSize: MAX_FILE_SIZE } })
});

function unlinkIfExists(p) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Original, thumbnail and any transcoded video proxies
function removeFileFromDisk(file) {
  unlinkIfExists(path.join(UPLOAD_DIR, 'originals', file.filename));
  if (file.thumbnail) unlinkIfExists(path.join(UPLOAD_DIR, 'thumbnails', file.thumbnail));
  if (file.proxy_variants) {
    try {
      for (const name of Object.values(JSON.parse(file.proxy_variants) || {})) {
        unlinkIfExists(path.join(UPLOAD_DIR, 'proxies', path.basename(String(name))));
      }
    } catch {}
  }
}

function ensureFileExists(fileId) {
  return db.prepare('SELECT id FROM files WHERE id = ?').get(fileId);
}

function getReactionGroups(fileId) {
  const rows = db.prepare(`
    SELECT
      fr.emoji,
      fr.user_id,
      fr.created_at,
      u.username,
      u.color,
      u.avatar
    FROM file_reactions fr
    JOIN users u ON u.id = fr.user_id
    WHERE fr.file_id = ?
    ORDER BY fr.created_at ASC
  `).all(fileId);

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.emoji)) grouped.set(row.emoji, []);
    grouped.get(row.emoji).push({
      id: row.user_id,
      username: row.username,
      color: row.color,
      avatar: row.avatar,
      reactedAt: row.created_at,
    });
  }

  return [...grouped.entries()]
    .map(([emoji, users]) => ({ emoji, count: users.length, users }))
    .sort((a, b) => b.count - a.count);
}

async function extractFileDate(filePath, mimetype) {
  try {
    if (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml') {
      const tags = await exifr.parse(filePath, ['DateTimeOriginal', 'DateTime', 'CreateDate']);
      const d = tags?.DateTimeOriginal || tags?.CreateDate || tags?.DateTime;
      if (d instanceof Date && !isNaN(d)) return d.toISOString();
    }
    if (mimetype.startsWith('video/')) {
      return await new Promise((resolve) => {
        execFile('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          filePath
        ], (err, stdout) => {
          if (err) return resolve(null);
          try {
            const meta = JSON.parse(stdout);
            const raw = meta?.format?.tags?.creation_time;
            if (raw) return resolve(new Date(raw).toISOString());
          } catch {}
          resolve(null);
        });
      });
    }
  } catch {}
  return null;
}

function getCategory(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

function extractVideoFrame(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-i', videoPath,
      '-ss', '1',
      '-vframes', '1',
      '-vf', 'scale=400:400:force_original_aspect_ratio=decrease',
      '-y',
      outputPath
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function extractVideoFrameAtTime(videoPath, outputPath, seconds) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-ss', String(seconds),
      '-i', videoPath,
      '-frames:v', '1',
      '-y',
      outputPath
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function extractImageFrameWithFfmpeg(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-i', imagePath,
      '-vf', 'scale=400:400:force_original_aspect_ratio=decrease',
      '-frames:v', '1',
      '-y',
      outputPath
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function generateImageThumbnail(filePath, thumbPath) {
  try {
    await sharp(filePath, {
      failOn: 'none',
      limitInputPixels: false,
      sequentialRead: true,
    })
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbPath);
    return true;
  } catch (primaryError) {
    try {
      const buffer = await sharp(filePath, {
        failOn: 'none',
        limitInputPixels: false,
        sequentialRead: true,
      })
        .rotate()
        .jpeg({ quality: 88 })
        .toBuffer();

      await sharp(buffer, { failOn: 'none', limitInputPixels: false })
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      return true;
    } catch (secondaryError) {
      try {
        await extractImageFrameWithFfmpeg(filePath, thumbPath);
        return true;
      } catch {
        console.error('[thumb:image] failed:', {
          filePath,
          primaryError: primaryError?.message,
          secondaryError: secondaryError?.message,
        });
        return false;
      }
    }
  }
}

/**
 * Extract video metadata: duration, bitrate, codec, dimensions
 */
async function extractVideoMetadata(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,bit_rate',
      '-show_entries', 'format=duration,bit_rate',
      '-of', 'default=noprint_wrappers=1:nokey=0',
      filePath
    ], (err, stdout) => {
      try {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        
        const lines = stdout.trim().split('\n');
        const metadata = {};
        
        lines.forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) metadata[key] = value;
        });

        resolve({
          duration: parseFloat(metadata.duration) || null,
          bitrate: parseInt(metadata.bit_rate) || null,
          codec: metadata.codec_name || null,
          width: parseInt(metadata.width) || null,
          height: parseInt(metadata.height) || null,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

function updateVideoProcessingState(fileId, status, variants = null) {
  if (variants !== null) {
    db.prepare('UPDATE files SET proxy_status = ?, proxy_variants = ? WHERE id = ?')
      .run(status, JSON.stringify(variants), fileId);
  } else {
    db.prepare('UPDATE files SET proxy_status = ? WHERE id = ?')
      .run(status, fileId);
  }

  emitGlobalDataUpdate('files', 'processing-status', {
    fileId,
    proxyStatus: status,
    proxyVariants: variants,
  });
}

/**
 * Queue video processing job (transcode to lower bitrates)
 * This runs async - file is playable immediately, proxies generated in background
 */
async function queueVideoProcessing(fileId, filePath, metadata) {
  setImmediate(async () => {
    try {
      updateVideoProcessingState(fileId, 'processing');
      await processVideoProxies(fileId, filePath, metadata);
    } catch (error) {
      console.error(`Video processing failed for ${fileId}:`, error);
      updateVideoProcessingState(fileId, 'failed');
    }
  });
}

/**
 * Process video into multiple quality variants (1080p, 720p, 360p)
 */
async function processVideoProxies(fileId, filePath, metadata) {
  if (!metadata?.bitrate || !metadata?.duration) {
    updateVideoProcessingState(fileId, 'failed');
    return;
  }

  const proxiesDir = path.join(UPLOAD_DIR, 'proxies');
  fs.mkdirSync(proxiesDir, { recursive: true });

  // Quality ladder: bitrate, max_dimension
  const qualities = [
    { name: '1080p', bitrate: '8000k', maxDim: 1920 },
    { name: '720p', bitrate: '4000k', maxDim: 1280 },
    { name: '360p', bitrate: '1000k', maxDim: 640 },
  ];

  const variants = {};
  let hasAnyProxy = false;

  for (const quality of qualities) {
    const proxyPath = path.join(proxiesDir, `${fileId}_${quality.name}.mp4`);
    const bitrateKbps = parseInt(quality.bitrate, 10);
    
    try {
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', [
          '-i', filePath,
          '-c:v', 'libx264',  // H.264 for better compatibility
          '-b:v', quality.bitrate,
          '-maxrate', `${Math.round(bitrateKbps * 1.5)}k`,
          '-bufsize', `${bitrateKbps * 2}k`,
          '-vf', `scale=${quality.maxDim}:${quality.maxDim}:force_original_aspect_ratio=decrease`,
          '-movflags', '+faststart',  // Enable seeking without downloading full file
          '-preset', 'medium',  // Balance speed vs compression
          '-c:a', 'aac',
          '-b:a', '128k',
          '-y',
          proxyPath
        ], { maxBuffer: 1024 * 1024 * 10 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      variants[quality.name] = `${fileId}_${quality.name}.mp4`;
      hasAnyProxy = true;
      updateVideoProcessingState(fileId, 'processing', variants);
      console.log(`✓ Generated ${quality.name} proxy for ${fileId}`);
    } catch (error) {
      console.error(`Failed to generate ${quality.name} proxy:`, error.message);
    }
  }

  if (hasAnyProxy) {
    updateVideoProcessingState(fileId, 'completed', variants);
  } else {
    updateVideoProcessingState(fileId, 'failed');
  }
}

async function generateThumbnail(filePath, fileId, mimetype) {
  const thumbDir = path.join(UPLOAD_DIR, 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });
  const thumbPath = path.join(thumbDir, `${fileId}.webp`);

  try {
    if (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml') {
      const ok = await generateImageThumbnail(filePath, thumbPath);
      if (!ok) return null;
      return `${fileId}.webp`;
    }

    if (mimetype.startsWith('video/')) {
      const tmpFrame = path.join(thumbDir, `${fileId}_frame.jpg`);
      await extractVideoFrame(filePath, tmpFrame);
      await sharp(tmpFrame)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      fs.unlinkSync(tmpFrame);
      return `${fileId}.webp`;
    }

    return null;
  } catch (error) {
    console.error('[thumb] failed:', { fileId, mimetype, error: error?.message });
    return null;
  }
}

// List all files (shared pool)
router.get('/', auth, (req, res) => {
  const { category, search, folder, page = 1, limit = 50, sort = 'upload_date', order = 'desc' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const SORT_MAP = {
    upload_date: 'created_at',
    file_date:   'file_date',
    size:        'size',
    name:        'original_name',
    type:        'category',
  };
  const sortCol = SORT_MAP[sort] || 'created_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';
  // Fall back to upload_date when file_date is null
  const orderClause = sortCol === 'file_date'
    ? `COALESCE(file_date, created_at) ${sortDir}`
    : `${sortCol} ${sortDir}`;

  let query, params, countQuery, countParams;

  const interactionSelect = `
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
  `;

  if (folder) {
    query = `SELECT f.*, ${interactionSelect}, u.color as uploader_color, u.avatar as uploader_avatar, u.username as uploader_username FROM files f JOIN file_folders ff ON f.id = ff.file_id LEFT JOIN users u ON f.user_id = u.id WHERE ff.folder_id = ?`;
    params = [parseInt(folder)];
    countQuery = 'SELECT COUNT(*) as total FROM files f JOIN file_folders ff ON f.id = ff.file_id WHERE ff.folder_id = ?';
    countParams = [parseInt(folder)];
    if (category && category !== 'all') {
      query += ' AND f.category = ?';
      countQuery += ' AND f.category = ?';
      params.push(category);
      countParams.push(category);
    }
    if (search) {
      query += ' AND f.original_name LIKE ?';
      countQuery += ' AND f.original_name LIKE ?';
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }
  } else {
    query = `SELECT f.*, ${interactionSelect}, u.color as uploader_color, u.avatar as uploader_avatar, u.username as uploader_username FROM files f LEFT JOIN users u ON f.user_id = u.id WHERE 1=1`;
    params = [];
    countQuery = 'SELECT COUNT(*) as total FROM files WHERE 1=1';
    countParams = [];
    if (category && category !== 'all') {
      query += ' AND f.category = ?';
      countQuery += ' AND category = ?';
      params.push(category);
      countParams.push(category);
    }
    if (search) {
      query += ' AND f.original_name LIKE ?';
      countQuery += ' AND original_name LIKE ?';
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }
  }

  query += ` ORDER BY ${orderClause} LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const files = db.prepare(query).all(...params);
  const { total } = db.prepare(countQuery).get(...countParams);

  res.json({ files, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// Upload files
router.post('/upload', auth, upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No file selected' });
  }

  const inserted = [];
  const insertStmt = db.prepare(
    'INSERT INTO files (id, filename, original_name, mime_type, size, category, thumbnail, thumbnail_updated_at, user_id, file_date, duration, bitrate, width, height, codec, proxy_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (const file of req.files) {
    const fileId = path.parse(file.filename).name;
    const category = getCategory(file.mimetype);
    const thumbnail = await generateThumbnail(file.path, fileId, file.mimetype);
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const fileDate = await extractFileDate(file.path, file.mimetype);

    // Extract video metadata (if video)
    let metadata = { duration: null, bitrate: null, width: null, height: null, codec: null };
    if (category === 'video') {
      metadata = await extractVideoMetadata(file.path) || metadata;
    }

    insertStmt.run(
      fileId,
      file.filename,
      originalName,
      file.mimetype,
      file.size,
      category,
      thumbnail,
      thumbnail ? new Date().toISOString() : null,
      req.user.userId,
      fileDate,
      metadata.duration,
      metadata.bitrate,
      metadata.width,
      metadata.height,
      metadata.codec,
      category === 'video'
        ? (metadata.bitrate ? 'pending' : 'failed')
        : 'completed'
    );

    if (req.body.folderId) {
      db.prepare('INSERT OR IGNORE INTO file_folders (file_id, folder_id) VALUES (?, ?)')
        .run(fileId, parseInt(req.body.folderId));
    }

    // Queue video processing if video (runs async in background)
    if (category === 'video' && metadata.bitrate) {
      queueVideoProcessing(fileId, file.path, metadata);
    }

    inserted.push({
      id: fileId,
      name: originalName,
      size: file.size,
      category,
      proxy_status: category === 'video' ? (metadata.bitrate ? 'pending' : 'failed') : 'completed'
    });
  }

  // Upload email notification (for users who enabled it in their profile)
  sendUploadNotification(req.user.username, inserted);

  emitGlobalDataUpdate('files', 'uploaded', { count: inserted.length });

  for (const f of inserted) {
    createActivity({
      actorUserId: req.user.userId,
      type: 'file_uploaded',
      entityType: 'file',
      entityId: f.id,
      metadata: { name: f.name, category: f.category, size: f.size },
    });
  }

  res.json({ uploaded: inserted });
});

// Full details of a single file (for opening directly from the feed)
router.get('/:id', auth, (req, res) => {
  const row = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM file_comments fc WHERE fc.file_id = f.id) AS comment_count,
      (SELECT COUNT(*) FROM file_reactions fr WHERE fr.file_id = f.id) AS reaction_count,
      u.color as uploader_color,
      u.avatar as uploader_avatar,
      u.username as uploader_username
    FROM files f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE f.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'File not found' });
  res.json({ file: row });
});

// Albums that contain this file
router.get('/:id/albums', auth, (req, res) => {
  const albumIds = db.prepare(
    'SELECT album_id FROM album_files WHERE file_id = ?'
  ).all(req.params.id).map(r => r.album_id);
  res.json({ albumIds });
});

// Reactions + comments summary (single endpoint)
router.get('/:id/interactions', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const reactions = getReactionGroups(req.params.id);
  const comments = db.prepare(`
    SELECT
      c.id,
      c.file_id,
      c.user_id,
      c.parent_comment_id,
      c.content,
      c.created_at,
      (SELECT COUNT(*) FROM file_comment_likes l WHERE l.comment_id = c.id) AS like_count,
      EXISTS(SELECT 1 FROM file_comment_likes ml WHERE ml.comment_id = c.id AND ml.user_id = ?) AS liked_by_me,
      u.username,
      u.color,
      u.avatar
    FROM file_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.file_id = ?
    ORDER BY c.created_at ASC, c.id ASC
  `).all(req.user.userId, req.params.id);

  res.json({ reactions, comments });
});

// Add reaction (idempotent)
router.post('/:id/reactions', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
  if (!emoji || emoji.length > 16) {
    return res.status(400).json({ error: 'Invalid reaction' });
  }

  const insertResult = db.prepare('INSERT OR IGNORE INTO file_reactions (file_id, user_id, emoji) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.userId, emoji);

  emitFileInteractionUpdate(req.params.id);
  emitGlobalDataUpdate('files', 'interactions-updated', { fileId: req.params.id });

  if (insertResult.changes > 0) {
    const fileRow = db.prepare('SELECT id, original_name, user_id FROM files WHERE id = ?').get(req.params.id);
    if (fileRow) {
      createActivity({
        actorUserId: req.user.userId,
        type: 'file_reaction',
        entityType: 'file',
        entityId: fileRow.id,
        metadata: { fileName: fileRow.original_name, emoji },
      });
      createNotification({
        userId: fileRow.user_id,
        actorUserId: req.user.userId,
        type: 'file_reaction',
        entityType: 'file',
        entityId: fileRow.id,
        metadata: { fileName: fileRow.original_name, emoji },
      });
    }
  }

  res.json({ reactions: getReactionGroups(req.params.id) });
});

// Remove reaction
router.delete('/:id/reactions/:emoji', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const emoji = decodeURIComponent(req.params.emoji || '').trim();
  if (!emoji || emoji.length > 16) {
    return res.status(400).json({ error: 'Invalid reaction' });
  }

  db.prepare('DELETE FROM file_reactions WHERE file_id = ? AND user_id = ? AND emoji = ?')
    .run(req.params.id, req.user.userId, emoji);

  emitFileInteractionUpdate(req.params.id);
  emitGlobalDataUpdate('files', 'interactions-updated', { fileId: req.params.id });

  res.json({ reactions: getReactionGroups(req.params.id) });
});

// Add comment (replies via parent_comment_id)
router.post('/:id/comments', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const parentCommentId = req.body?.parentCommentId ? Number(req.body.parentCommentId) : null;

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (content.length > 1000) return res.status(400).json({ error: 'Comment is too long' });

  if (parentCommentId) {
    const parent = db.prepare('SELECT id, file_id FROM file_comments WHERE id = ?').get(parentCommentId);
    if (!parent || parent.file_id !== req.params.id) {
      return res.status(400).json({ error: 'Invalid reply target' });
    }
  }

  const result = db.prepare(
    'INSERT INTO file_comments (file_id, user_id, parent_comment_id, content) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, req.user.userId, parentCommentId, content);

  const comment = db.prepare(`
    SELECT
      c.id,
      c.file_id,
      c.user_id,
      c.parent_comment_id,
      c.content,
      c.created_at,
      0 AS like_count,
      0 AS liked_by_me,
      u.username,
      u.color,
      u.avatar
    FROM file_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  emitFileInteractionUpdate(req.params.id);
  emitGlobalDataUpdate('files', 'interactions-updated', { fileId: req.params.id });

  const fileRow = db.prepare('SELECT id, original_name, user_id FROM files WHERE id = ?').get(req.params.id);
  const snippet = content.length > 140 ? content.slice(0, 140) + '…' : content;

  createActivity({
    actorUserId: req.user.userId,
    type: parentCommentId ? 'comment_reply' : 'file_comment',
    entityType: 'file',
    entityId: req.params.id,
    metadata: { fileName: fileRow?.original_name, snippet, commentId: comment.id, parentCommentId },
  });

  const notifyTargets = new Set();
  if (fileRow && fileRow.user_id) notifyTargets.add(Number(fileRow.user_id));
  if (parentCommentId) {
    const parentRow = db.prepare('SELECT user_id FROM file_comments WHERE id = ?').get(parentCommentId);
    if (parentRow?.user_id) notifyTargets.add(Number(parentRow.user_id));
  }
  notifyTargets.delete(Number(req.user.userId));

  for (const uid of notifyTargets) {
    const isReplyTarget = parentCommentId && (() => {
      const parentRow = db.prepare('SELECT user_id FROM file_comments WHERE id = ?').get(parentCommentId);
      return parentRow?.user_id === uid;
    })();
    createNotification({
      userId: uid,
      actorUserId: req.user.userId,
      type: isReplyTarget ? 'comment_reply' : 'file_comment',
      entityType: 'file',
      entityId: req.params.id,
      metadata: { fileName: fileRow?.original_name, snippet, commentId: comment.id },
    });
  }

  res.json({ comment });
});

// Like comment
router.post('/:id/comments/:commentId/like', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const commentId = Number(req.params.commentId);
  const comment = db.prepare('SELECT id, file_id FROM file_comments WHERE id = ?').get(commentId);
  if (!comment || comment.file_id !== req.params.id) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const likeResult = db.prepare('INSERT OR IGNORE INTO file_comment_likes (comment_id, user_id) VALUES (?, ?)')
    .run(commentId, req.user.userId);

  emitFileInteractionUpdate(req.params.id);
  emitGlobalDataUpdate('files', 'interactions-updated', { fileId: req.params.id });

  if (likeResult.changes > 0) {
    const commentRow = db.prepare('SELECT user_id, content FROM file_comments WHERE id = ?').get(commentId);
    const fileRow = db.prepare('SELECT id, original_name FROM files WHERE id = ?').get(req.params.id);
    if (commentRow && commentRow.user_id !== req.user.userId) {
      const snippet = (commentRow.content || '').slice(0, 140);
      createNotification({
        userId: commentRow.user_id,
        actorUserId: req.user.userId,
        type: 'comment_like',
        entityType: 'file',
        entityId: req.params.id,
        metadata: { fileName: fileRow?.original_name, snippet, commentId },
      });
    }
  }

  const likeCount = db.prepare('SELECT COUNT(*) as count FROM file_comment_likes WHERE comment_id = ?')
    .get(commentId).count;
  res.json({ likeCount, likedByMe: true });
});

// Unlike comment
router.delete('/:id/comments/:commentId/like', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const commentId = Number(req.params.commentId);
  const comment = db.prepare('SELECT id, file_id FROM file_comments WHERE id = ?').get(commentId);
  if (!comment || comment.file_id !== req.params.id) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  db.prepare('DELETE FROM file_comment_likes WHERE comment_id = ? AND user_id = ?')
    .run(commentId, req.user.userId);

  emitFileInteractionUpdate(req.params.id);
  emitGlobalDataUpdate('files', 'interactions-updated', { fileId: req.params.id });

  const likeCount = db.prepare('SELECT COUNT(*) as count FROM file_comment_likes WHERE comment_id = ?')
    .get(commentId).count;
  res.json({ likeCount, likedByMe: false });
});

// Delete own comment (replies are deleted by cascade)
router.delete('/:id/comments/:commentId', auth, (req, res) => {
  const file = ensureFileExists(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const commentId = Number(req.params.commentId);
  const comment = db.prepare('SELECT id, user_id, file_id FROM file_comments WHERE id = ?').get(commentId);
  if (!comment || comment.file_id !== req.params.id) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  if (comment.user_id !== req.user.userId) {
    return res.status(403).json({ error: 'You cannot delete this comment' });
  }

  db.prepare('DELETE FROM file_comments WHERE id = ?').run(commentId);
  emitFileInteractionUpdate(req.params.id);
  emitGlobalDataUpdate('files', 'interactions-updated', { fileId: req.params.id });
  res.json({ message: 'Comment deleted' });
});

// Bulk delete files
router.post('/bulk-delete', auth, (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'No file selected' });
  }

  const bulkDelete = db.transaction((ids) => {
    let deleted = 0;
    for (const id of ids) {
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
      if (!file) continue;

      removeFileFromDisk(file);

      db.prepare('DELETE FROM file_folders WHERE file_id = ?').run(id);
      db.prepare('DELETE FROM album_files WHERE file_id = ?').run(id);
      db.prepare('UPDATE albums SET cover_file_id = NULL WHERE cover_file_id = ?').run(id);
      db.prepare('DELETE FROM files WHERE id = ?').run(id);
      deleted++;
    }
    return deleted;
  });

  const deleted = bulkDelete(fileIds);
  emitGlobalDataUpdate('files', 'bulk-deleted', { count: deleted });
  res.json({ message: `${deleted} files deleted`, deleted });
});

// View / stream file
router.get('/view/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?')
    .get(req.params.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  let filePath = path.join(UPLOAD_DIR, 'originals', file.filename);
  let mimeType = file.mime_type;

  // Quality selection for videos
  if (file.category === 'video' && req.query.quality) {
    const quality = req.query.quality; // '1080p', '720p', '360p'
    const validQualities = ['1080p', '720p', '360p'];

    if (validQualities.includes(quality) && file.proxy_variants) {
      try {
        const variants = JSON.parse(file.proxy_variants);
        if (variants[quality]) {
          // Proxy path
          const proxyPath = path.join(UPLOAD_DIR, 'proxies', variants[quality]);
          if (fs.existsSync(proxyPath)) {
            filePath = proxyPath;
            mimeType = 'video/mp4';  // All proxies are MP4
          }
        }
      } catch (e) {
        // Fallback to original if parse fails
      }
    }
  }

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing on disk' });

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', contentDisposition('inline', file.original_name));
  res.setHeader('Accept-Ranges', 'bytes');  // Enable range requests for seeking
  sandboxUserContent(res, mimeType);
  res.sendFile(path.resolve(filePath));
});

// Thumbnail
router.get('/thumb/:id', auth, async (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?')
    .get(req.params.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  if (!file.thumbnail) {
    const originalPath = path.join(UPLOAD_DIR, 'originals', file.filename);
    if (fs.existsSync(originalPath)) {
      const generated = await generateThumbnail(originalPath, file.id, file.mime_type);
      if (generated) {
        db.prepare('UPDATE files SET thumbnail = ?, thumbnail_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(generated, file.id);
        file.thumbnail = generated;
      }
    }
  }

  if (!file.thumbnail) return res.status(404).json({ error: 'No thumbnail' });

  const thumbPath = path.join(UPLOAD_DIR, 'thumbnails', file.thumbnail);
  if (!fs.existsSync(thumbPath)) {
    const originalPath = path.join(UPLOAD_DIR, 'originals', file.filename);
    if (fs.existsSync(originalPath)) {
      const generated = await generateThumbnail(originalPath, file.id, file.mime_type);
      if (generated) {
        db.prepare('UPDATE files SET thumbnail = ?, thumbnail_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(generated, file.id);
        file.thumbnail = generated;
      }
    }
  }

  const refreshedThumbPath = path.join(UPLOAD_DIR, 'thumbnails', file.thumbnail);
  if (!fs.existsSync(refreshedThumbPath)) return res.status(404).json({ error: 'Thumbnail not found' });

  res.setHeader('Content-Type', 'image/webp');
  res.sendFile(path.resolve(refreshedThumbPath));
});

// Download file
router.get('/download/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?')
    .get(req.params.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  const filePath = path.join(UPLOAD_DIR, 'originals', file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing on disk' });

  res.setHeader('Content-Disposition', contentDisposition('attachment', file.original_name));
  res.sendFile(path.resolve(filePath));
});

// Rename file
router.patch('/:id/rename', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'File name cannot be empty' });

  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  db.prepare('UPDATE files SET original_name = ? WHERE id = ?').run(name.trim(), req.params.id);
  emitGlobalDataUpdate('files', 'renamed', { fileId: req.params.id });
  res.json({ message: 'File renamed', name: name.trim() });
});

// Add file to album (file-centric fallback endpoint)
router.post('/:id/albums/:albumId', auth, (req, res) => {
  // Shared pool: any file can be added regardless of owner.
  const file = db.prepare('SELECT id FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const album = db.prepare('SELECT id FROM albums WHERE id = ? AND user_id = ?').get(req.params.albumId, req.user.userId);
  if (!album) return res.status(404).json({ error: 'Album not found' });

  try {
    db.prepare('INSERT INTO album_files (album_id, file_id) VALUES (?, ?)').run(req.params.albumId, req.params.id);
  } catch {
    // Already added is fine
  }

  db.prepare('UPDATE albums SET cover_file_id = COALESCE(cover_file_id, ?) WHERE id = ?').run(req.params.id, req.params.albumId);

  emitGlobalDataUpdate('albums', 'file-added', { albumId: Number(req.params.albumId), fileId: req.params.id });

  res.json({ message: 'File added to album' });
});

// Generate a thumbnail from the video at the requested second
router.post('/:id/thumbnail-at-time', auth, async (req, res) => {
  const file = db.prepare('SELECT id, filename, mime_type, category, duration FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (file.category !== 'video') return res.status(400).json({ error: 'Only available for videos' });

  const rawTime = Number(req.body?.time);
  if (!Number.isFinite(rawTime) || rawTime < 0) {
    return res.status(400).json({ error: 'Send a valid timestamp' });
  }

  const maxTime = Number.isFinite(file.duration) && file.duration > 0
    ? Math.max(0, file.duration - 0.2)
    : rawTime;
  const captureTime = Math.min(rawTime, maxTime);

  const originalPath = path.join(UPLOAD_DIR, 'originals', file.filename);
  if (!fs.existsSync(originalPath)) {
    return res.status(404).json({ error: 'Original video is missing on disk' });
  }

  const thumbDir = path.join(UPLOAD_DIR, 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });

  const tempFramePath = path.join(thumbDir, `${file.id}_manual_${Date.now()}.jpg`);
  const thumbFileName = `${file.id}.webp`;
  const thumbPath = path.join(thumbDir, thumbFileName);

  try {
    await extractVideoFrameAtTime(originalPath, tempFramePath, captureTime);
    await sharp(tempFramePath)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(thumbPath);

    db.prepare('UPDATE files SET thumbnail = ?, thumbnail_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(thumbFileName, file.id);
    emitGlobalDataUpdate('files', 'thumbnail-updated', { fileId: file.id, thumbnail: thumbFileName });

    res.json({
      message: 'Thumbnail updated',
      thumbnail: thumbFileName,
      at: captureTime,
    });
  } catch {
    res.status(500).json({ error: 'Could not create thumbnail' });
  } finally {
    if (fs.existsSync(tempFramePath)) {
      fs.unlinkSync(tempFramePath);
    }
  }
});

// Blur toggle
router.patch('/:id/blur', auth, (req, res) => {
  const file = db.prepare('SELECT id, blurred FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  const newVal = file.blurred ? 0 : 1;
  db.prepare('UPDATE files SET blurred = ? WHERE id = ?').run(newVal, req.params.id);
  emitGlobalDataUpdate('files', 'blur-toggled', { fileId: req.params.id, blurred: !!newVal });
  res.json({ blurred: !!newVal });
});

// Delete file
router.delete('/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?')
    .get(req.params.id);

  if (!file) return res.status(404).json({ error: 'File not found' });

  removeFileFromDisk(file);

  db.prepare('DELETE FROM file_folders WHERE file_id = ?').run(file.id);
  db.prepare('DELETE FROM album_files WHERE file_id = ?').run(file.id);
  db.prepare('UPDATE albums SET cover_file_id = NULL WHERE cover_file_id = ?').run(file.id);
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);

  emitGlobalDataUpdate('files', 'deleted', { fileId: file.id });

  res.json({ message: 'File deleted' });
});

// Storage statistics
router.get('/stats/storage', auth, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_files,
      SUM(size) as total_size,
      SUM(CASE WHEN category = 'image' THEN 1 ELSE 0 END) as images,
      SUM(CASE WHEN category = 'video' THEN 1 ELSE 0 END) as videos,
      SUM(CASE WHEN category = 'audio' THEN 1 ELSE 0 END) as audios,
      SUM(CASE WHEN category = 'document' THEN 1 ELSE 0 END) as documents
    FROM files
  `).get();

  const albumCount = db.prepare('SELECT COUNT(*) as count FROM albums WHERE user_id = ?').get(req.user.userId);
  stats.album_count = albumCount.count;

  res.json(stats);
});

module.exports = router;
