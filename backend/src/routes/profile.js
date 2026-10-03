const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const { sandboxUserContent } = require('../utils/userContent');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are accepted'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Get own profile
router.get('/', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, phone, color, avatar, upload_email_notifications, is_admin FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...user,
    upload_email_notifications: !!user.upload_email_notifications,
    is_admin: !!user.is_admin,
  });
});

// Search users for mentions
router.get('/users', auth, (req, res) => {
  const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limitRaw = Number(req.query.limit || 8);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 8;

  let users;
  if (q) {
    users = db.prepare(
      'SELECT id, username, color, avatar FROM users WHERE username LIKE ? ORDER BY username ASC LIMIT ?'
    ).all(`%${q}%`, limit);
  } else {
    users = db.prepare(
      'SELECT id, username, color, avatar FROM users ORDER BY username ASC LIMIT ?'
    ).all(limit);
  }

  res.json({ users });
});

router.get('/by-username/:username', auth, (req, res) => {
  const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const user = db.prepare('SELECT id, username, email, phone, color, avatar, created_at FROM users WHERE username = ?')
    .get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ user });
});

// Update profile (email, phone, color)
router.patch('/', auth, (req, res) => {
  const { email, phone, color, uploadEmailNotifications } = req.body;
  const current = db.prepare('SELECT email, phone, color, upload_email_notifications FROM users WHERE id = ?').get(req.user.userId);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const nextEmail = typeof email === 'string' ? (email.trim() || null) : current.email;
  const nextPhone = typeof phone === 'string' ? (phone.trim() || null) : current.phone;
  const nextColor = typeof color === 'string' ? (color.trim() || null) : current.color;
  const nextUploadNotify = uploadEmailNotifications === undefined
    ? current.upload_email_notifications
    : (uploadEmailNotifications ? 1 : 0);

  db.prepare('UPDATE users SET email = ?, phone = ?, color = ?, upload_email_notifications = ? WHERE id = ?')
    .run(nextEmail, nextPhone, nextColor, nextUploadNotify, req.user.userId);
  res.json({ message: 'Profile updated' });
});

// Upload avatar
router.post('/avatar', auth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file selected' });

  // Delete old avatar file
  const oldUser = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.userId);
  if (oldUser?.avatar) {
    const oldPath = path.join(UPLOAD_DIR, 'avatars', oldUser.avatar);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, req.user.userId);
  res.json({ avatar: req.file.filename });
});

// Serve avatar by user id
router.get('/avatar/:userId', auth, (req, res) => {
  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.params.userId);
  if (!user?.avatar) return res.status(404).json({ error: 'No avatar' });

  const avatarPath = path.join(UPLOAD_DIR, 'avatars', user.avatar);
  if (!fs.existsSync(avatarPath)) return res.status(404).json({ error: 'Avatar not found' });

  sandboxUserContent(res);
  res.sendFile(path.resolve(avatarPath));
});

module.exports = router;
