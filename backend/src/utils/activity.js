const db = require('../db');
const { emitActivity, emitNotification } = require('../realtime');

function hydrateActor(actorUserId) {
  if (!actorUserId) return null;
  return db.prepare('SELECT id, username, color, avatar FROM users WHERE id = ?').get(actorUserId);
}

function createActivity({ actorUserId, type, entityType = null, entityId = null, metadata = null }) {
  const meta = metadata ? JSON.stringify(metadata) : null;
  const result = db.prepare(
    'INSERT INTO activity (actor_user_id, type, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(actorUserId || null, type, entityType, entityId, meta);

  const row = db.prepare(`
    SELECT a.*, u.username AS actor_username, u.color AS actor_color, u.avatar AS actor_avatar
    FROM activity a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  const activity = serializeActivity(row);
  emitActivity(activity);
  return activity;
}

function serializeActivity(row) {
  if (!row) return null;
  let metadata = null;
  try { metadata = row.metadata ? JSON.parse(row.metadata) : null; } catch {}
  return {
    id: row.id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata,
    createdAt: row.created_at,
    actor: row.actor_user_id ? {
      id: row.actor_user_id,
      username: row.actor_username,
      color: row.actor_color,
      avatar: row.actor_avatar,
    } : null,
  };
}

function createNotification({ userId, actorUserId, type, entityType = null, entityId = null, metadata = null }) {
  if (!userId) return null;
  if (actorUserId && Number(actorUserId) === Number(userId)) return null;

  const meta = metadata ? JSON.stringify(metadata) : null;
  const result = db.prepare(
    'INSERT INTO notifications (user_id, actor_user_id, type, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, actorUserId || null, type, entityType, entityId, meta);

  const row = db.prepare(`
    SELECT n.*, u.username AS actor_username, u.color AS actor_color, u.avatar AS actor_avatar
    FROM notifications n LEFT JOIN users u ON u.id = n.actor_user_id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);

  const notification = serializeNotification(row);
  emitNotification(userId, notification);
  return notification;
}

function serializeNotification(row) {
  if (!row) return null;
  let metadata = null;
  try { metadata = row.metadata ? JSON.parse(row.metadata) : null; } catch {}
  return {
    id: row.id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata,
    readAt: row.read_at,
    createdAt: row.created_at,
    actor: row.actor_user_id ? {
      id: row.actor_user_id,
      username: row.actor_username,
      color: row.actor_color,
      avatar: row.actor_avatar,
    } : null,
  };
}

module.exports = {
  createActivity,
  createNotification,
  serializeActivity,
  serializeNotification,
  hydrateActor,
};
