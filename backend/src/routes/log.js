const express = require('express');
const jwt = require('jsonwebtoken');
const { accessLogger } = require('../logger');
const router = express.Router();

const MAX_DETAILS_BYTES = 4096;

router.post('/event', (req, res) => {
  const { event, details } = req.body || {};
  if (!event || typeof event !== 'string' || event.length > 100) {
    return res.status(400).json({ error: 'event is required' });
  }

  let userId = null;
  let username = null;
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded?.userId || null;
      username = decoded?.username || null;
    } catch {}
  }

  let safeDetails = null;
  if (details && typeof details === 'object') {
    try {
      const json = JSON.stringify(details);
      if (json.length <= MAX_DETAILS_BYTES) safeDetails = details;
      else safeDetails = '[truncated]';
    } catch {
      safeDetails = '[unserializable]';
    }
  }

  accessLogger.info({
    message: 'spa_event',
    category: 'spa-event',
    event,
    details: safeDetails,
    userId,
    username,
    ip: req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.ip || req.socket?.remoteAddress || null),
    ua: String(req.headers['user-agent'] || '').slice(0, 200),
  });

  res.status(204).end();
});

module.exports = router;
