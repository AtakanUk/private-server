const jwt = require('jsonwebtoken');
const { accessLogger, errorLogger } = require('../logger');

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'oldpassword',
  'token',
  'reset_token',
  'resettoken',
  'authorization',
]);

const MAX_BODY_BYTES = 2048;

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(sanitizeBody);
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      out[key] = sanitizeBody(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function bodyForLog(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return undefined;
  if (!req.body || typeof req.body !== 'object') return undefined;
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return '[multipart]';
  const sanitized = sanitizeBody(req.body);
  const json = JSON.stringify(sanitized);
  if (!json || json === '{}') return undefined;
  if (json.length > MAX_BODY_BYTES) return '[truncated]';
  return sanitized;
}

// Media URLs carry the JWT as ?token=, so it must not reach the log files.
function redactUrl(url) {
  return url.replace(/([?&](?:token|reset)=)[^&#]*/gi, '$1[REDACTED]');
}

function getIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

function getJwtUser(req) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
  if (!token) return { userId: null, username: null };
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: decoded?.userId || null, username: decoded?.username || null };
  } catch {
    return { userId: null, username: null };
  }
}

function categorize(url) {
  if (url.startsWith('/api/files/thumb/') || url.startsWith('/api/profile/avatar/') || url.startsWith('/api/pinboards/media/')) {
    return 'media';
  }
  if (url.startsWith('/api/log/event')) return 'spa-event';
  return 'http';
}

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  const { userId, username } = getJwtUser(req);
  const ip = getIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const url = redactUrl(req.originalUrl || req.url);
    const category = categorize(url);

    const entry = {
      message: 'http_request',
      category,
      method: req.method,
      url,
      status: res.statusCode,
      duration,
      ip,
      userId,
      username,
      ua,
      contentLength: Number(res.getHeader('content-length')) || undefined,
    };

    const body = bodyForLog(req);
    if (body !== undefined) entry.body = body;

    if (req.query && Object.keys(req.query).length > 0) {
      const queryClean = sanitizeBody(req.query);
      if (Object.keys(queryClean).length > 0) entry.query = queryClean;
    }

    accessLogger.info(entry);
    if (res.statusCode >= 400) {
      errorLogger.warn(entry);
    }
  });

  next();
};
