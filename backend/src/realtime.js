let ioRef = null;

function setIo(io) {
  ioRef = io;
}

function getIo() {
  return ioRef;
}

function emitFileInteractionUpdate(fileId) {
  if (!ioRef || !fileId) return;
  ioRef.to(`file:${fileId}`).emit('file_interactions_updated', { fileId });
}

function emitGlobalDataUpdate(entity, action, payload = {}) {
  if (!ioRef) return;
  ioRef.to('authed').emit('server_data_updated', {
    entity,
    action,
    ...payload,
    ts: Date.now(),
  });
}

function emitActivity(activity) {
  if (!ioRef || !activity) return;
  ioRef.to('authed').emit('activity:new', activity);
}

function emitNotification(userId, notification) {
  if (!ioRef || !userId || !notification) return;
  ioRef.to(`user:${userId}`).emit('notification:new', notification);
}

function emitPinboardUpdate(boardId, action, payload = {}) {
  if (!ioRef || !boardId) return;
  ioRef.to(`pinboard:${boardId}`).emit('pinboard:update', {
    boardId,
    action,
    ...payload,
    ts: Date.now(),
  });
}

module.exports = {
  setIo,
  getIo,
  emitFileInteractionUpdate,
  emitGlobalDataUpdate,
  emitActivity,
  emitNotification,
  emitPinboardUpdate,
};
