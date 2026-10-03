require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { setIo } = require('./src/realtime');

// Fail fast on missing secrets instead of running with an insecure default.
for (const key of ['JWT_SECRET', 'SETUP_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable ${key}. See .env.example.`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

app.set('trust proxy', 'loopback');

// Create upload directories
const uploadDir = process.env.UPLOAD_DIR || './uploads';
['originals', 'thumbnails', 'avatars', 'pinboards'].forEach(dir => {
  fs.mkdirSync(path.join(uploadDir, dir), { recursive: true });
});

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false, // disabled for the React SPA; can be managed at the reverse-proxy level
}));

// CORS — set CORS_ORIGIN in production when the frontend is served from another origin
const allowedOrigin = process.env.CORS_ORIGIN;
const corsOrigin = allowedOrigin || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000');
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

setIo(io);

const jwt = require('jsonwebtoken');

io.on('connection', (socket) => {
  // Clients authenticate with their JWT; only authenticated sockets receive
  // broadcasts or may join per-file / per-board rooms.
  socket.on('auth', (token) => {
    if (!token || typeof token !== 'string') return;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.userId) return;
      socket.data.userId = decoded.userId;
      socket.join('authed');
      socket.join(`user:${decoded.userId}`);
      // Rooms requested before the auth event arrived (emits are buffered
      // while connecting) are joined now.
      for (const room of pendingRooms) socket.join(room);
      pendingRooms.clear();
    } catch {}
  });

  const pendingRooms = new Set();
  const joinWhenAuthed = (room) => {
    if (socket.data.userId) socket.join(room);
    else if (pendingRooms.size < 50) pendingRooms.add(room);
  };

  socket.on('join_file', (fileId) => {
    if (!fileId || typeof fileId !== 'string') return;
    joinWhenAuthed(`file:${fileId}`);
  });

  socket.on('leave_file', (fileId) => {
    if (!fileId || typeof fileId !== 'string') return;
    pendingRooms.delete(`file:${fileId}`);
    socket.leave(`file:${fileId}`);
  });

  socket.on('join_pinboard', (boardId) => {
    if (boardId === undefined || boardId === null) return;
    joinWhenAuthed(`pinboard:${boardId}`);
  });

  socket.on('leave_pinboard', (boardId) => {
    if (boardId === undefined || boardId === null) return;
    pendingRooms.delete(`pinboard:${boardId}`);
    socket.leave(`pinboard:${boardId}`);
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger — every HTTP request (auth optional; userId is taken from the JWT when present)
app.use(require('./src/middleware/requestLogger'));

// Lightweight health endpoint for container healthcheck
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// Routes
app.use('/api/log', require('./src/routes/log'));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/files', require('./src/routes/files'));
app.use('/api/folders', require('./src/routes/folders'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/albums', require('./src/routes/albums'));
app.use('/api/profile', require('./src/routes/profile'));
app.use('/api/activity', require('./src/routes/activity'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/pinboards', require('./src/routes/pinboards'));
app.use('/api/countdown', require('./src/routes/countdown'));

// Serve the frontend build (production)
const frontendBuild = path.join(__dirname, './frontend/build');
if (fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large' });
  }
  console.error(err.message);
  res.status(500).json({ error: err.message || 'Server error' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Private Server is running on http://0.0.0.0:${PORT}`);
});
