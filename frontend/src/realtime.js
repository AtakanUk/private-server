import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || '';
// In CRA dev (port 3000) the API runs separately on 3001; otherwise it is same-origin.
const SOCKET_URL = API_BASE || (window.location.port === '3000' ? 'http://localhost:3001' : window.location.origin);

let socket;
let lastAuthedToken = null;
// Rooms are per-connection on the server, so re-join them after a reconnect.
const activeBoards = new Map();

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      if (lastAuthedToken) socket.emit('auth', lastAuthedToken);
      for (const boardId of activeBoards.keys()) socket.emit('join_pinboard', boardId);
    });
  }
  return socket;
}

export function authSocket(token) {
  lastAuthedToken = token || null;
  if (!token) return;
  const s = getSocket();
  if (s.connected) s.emit('auth', token);
}

export function subscribeGlobalUpdates(handler) {
  const s = getSocket();
  s.on('server_data_updated', handler);
  return () => s.off('server_data_updated', handler);
}

export function subscribeActivity(handler) {
  const s = getSocket();
  s.on('activity:new', handler);
  return () => s.off('activity:new', handler);
}

export function subscribeNotifications(handler) {
  const s = getSocket();
  s.on('notification:new', handler);
  return () => s.off('notification:new', handler);
}

export function subscribePinboard(boardId, handler) {
  const s = getSocket();
  activeBoards.set(boardId, (activeBoards.get(boardId) || 0) + 1);
  if (s.connected) s.emit('join_pinboard', boardId);
  s.on('pinboard:update', handler);
  return () => {
    const n = (activeBoards.get(boardId) || 1) - 1;
    if (n <= 0) {
      activeBoards.delete(boardId);
      s.emit('leave_pinboard', boardId);
    } else {
      activeBoards.set(boardId, n);
    }
    s.off('pinboard:update', handler);
  };
}

export { getSocket };
