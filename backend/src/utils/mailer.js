const nodemailer = require('nodemailer');
const db = require('../db');

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

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

async function sendUploadNotification(username, files) {
  if (!process.env.SMTP_HOST) return; // email is optional

  const recipients = db.prepare(`
    SELECT email
    FROM users
    WHERE upload_email_notifications = 1
      AND email IS NOT NULL
      AND TRIM(email) <> ''
  `).all();

  const emails = recipients
    .map((r) => (r.email || '').trim())
    .filter(Boolean);

  if (!emails.length) return;

  const fileList = files
    .map(f => `<li>${escapeHtml(f.name)} (${f.category}, ${(f.size / 1024).toFixed(1)} KB)</li>`)
    .join('');

  const now = new Date().toLocaleString('en-GB', { timeZone: process.env.TZ || 'UTC' });

  try {
    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      bcc: emails,
      subject: `Private Server — ${username} uploaded new files`,
      html: `
        <p><strong>${escapeHtml(username)}</strong> uploaded new file(s):</p>
        <ul>${fileList}</ul>
        <p>Date: ${now}</p>
        <p><a href="${process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`}">Open Private Server</a></p>
      `,
    });
  } catch (err) {
    console.error('Failed to send upload notification:', err.message);
  }
}

module.exports = { sendUploadNotification };
