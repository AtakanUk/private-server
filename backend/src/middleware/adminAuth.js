const jwt = require('jsonwebtoken');
const db = require('../db');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    const adminUsername = process.env.ADMIN_USERNAME;

    const user = db.prepare('SELECT is_admin, username FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return res.status(403).json({ error: 'Forbidden' });

    const envAdmin = !!(adminUsername && decoded.username === adminUsername);
    const dbAdmin = !!user.is_admin;
    if (!envAdmin && !dbAdmin) return res.status(403).json({ error: 'Forbidden' });

    req.user.isAdmin = true;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
