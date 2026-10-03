const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const router = express.Router();

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Try again in an hour.' },
});

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

router.post('/register', registerLimiter, (req, res) => {
  const { username, password, setupKey } = req.body;
  // Registration is invite-only: new members need the instance's setup key.
  if (!process.env.SETUP_KEY || setupKey !== process.env.SETUP_KEY) {
    return res.status(403).json({ error: 'Invalid setup key' });
  }
  if (!username || typeof username !== 'string' || !/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, . _ -)' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  // MAX_USERS=0 means unlimited.
  const maxUsers = Number.parseInt(process.env.MAX_USERS ?? '10', 10);
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (maxUsers > 0 && count >= maxUsers) {
    return res.status(403).json({ error: 'This instance has reached its user limit' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username is already taken' });
  }
  const hash = bcrypt.hashSync(password, 12);
  // The first account on a fresh instance becomes its administrator.
  const isFirstUser = count === 0;
  const result = db.prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)')
    .run(username, hash, isFirstUser ? 1 : 0);
  res.json({ message: 'Account created', userId: result.lastInsertRowid, isAdmin: isFirstUser });
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const isAdmin = !!(
    (process.env.ADMIN_USERNAME && user.username === process.env.ADMIN_USERNAME) ||
    user.is_admin
  );
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, username: user.username, isAdmin });
});

router.get('/verify', require('../middleware/auth'), (req, res) => {
  const user = db.prepare('SELECT is_admin, username FROM users WHERE id = ?').get(req.user.userId);
  const isAdmin = !!(
    (process.env.ADMIN_USERNAME && req.user.username === process.env.ADMIN_USERNAME) ||
    user?.is_admin
  );
  res.json({ valid: true, username: req.user.username, isAdmin });
});

// Forgot password — send a reset email
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !user.email) {
    return res.json({ message: 'If this username has an email address on file, a reset link has been sent.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
    .run(token, expires, user.id);

  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
  const resetUrl = `${appUrl}?reset=${token}`;

  try {
    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Private Server — Password reset',
      html: `
        <p>Hi <strong>${escapeHtml(user.username)}</strong>,</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link is valid for 1 hour.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });
    res.json({ message: 'If this username has an email address on file, a reset link has been sent.' });
  } catch (err) {
    console.error('Failed to send email:', err.message);
    res.status(500).json({ error: 'Could not send email. Check the server SMTP settings.' });
  }
});

// Reset password — set a new password with a token
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ error: 'A valid token and a password of at least 8 characters are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expires || Date.now() > user.reset_token_expires) {
    return res.status(400).json({ error: 'The reset link is invalid or has expired' });
  }
  const hash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
    .run(hash, user.id);
  res.json({ message: 'Your password has been updated. You can sign in now.' });
});

module.exports = router;
