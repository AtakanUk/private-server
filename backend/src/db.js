const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'media.db'));

// Ensure FK constraints and ON DELETE CASCADE rules are enforced.
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    upload_email_notifications INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    category TEXT NOT NULL,
    thumbnail TEXT,
    thumbnail_updated_at DATETIME,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Video/Image metadata
    duration REAL,
    bitrate INTEGER,
    width INTEGER,
    height INTEGER,
    codec TEXT,
    -- Proxy variants (video only)
    proxy_variants TEXT,
    proxy_status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES folders(id)
  );

  CREATE TABLE IF NOT EXISTS file_folders (
    file_id TEXT NOT NULL,
    folder_id INTEGER NOT NULL,
    PRIMARY KEY (file_id, folder_id),
    FOREIGN KEY (file_id) REFERENCES files(id),
    FOREIGN KEY (folder_id) REFERENCES folders(id)
  );

  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    cover_file_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS album_files (
    album_id INTEGER NOT NULL,
    file_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (album_id, file_id),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS file_reactions (
    file_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (file_id, user_id, emoji),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS file_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    parent_comment_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES file_comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS file_comment_likes (
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES file_comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    actor_user_id INTEGER,
    type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata TEXT,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS pinboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pinboard_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    author_user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    content TEXT,
    note_image_file_id TEXT,
    filename TEXT,
    mime_type TEXT,
    file_ref_id TEXT,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    width REAL DEFAULT 220,
    height REAL DEFAULT 160,
    color TEXT,
    rotation REAL DEFAULT 0,
    z_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES pinboards(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pinboard_items_board ON pinboard_items(board_id);

  CREATE TABLE IF NOT EXISTS pinboard_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    from_item_id INTEGER NOT NULL,
    to_item_id INTEGER NOT NULL,
    created_by_user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES pinboards(id) ON DELETE CASCADE,
    FOREIGN KEY (from_item_id) REFERENCES pinboard_items(id) ON DELETE CASCADE,
    FOREIGN KEY (to_item_id) REFERENCES pinboard_items(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pinboard_links_unique_pair ON pinboard_links(board_id, from_item_id, to_item_id);
  CREATE INDEX IF NOT EXISTS idx_pinboard_links_board ON pinboard_links(board_id);

  CREATE TABLE IF NOT EXISTS pinboard_item_reactions (
    item_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    vote INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id, user_id),
    FOREIGN KEY (item_id) REFERENCES pinboard_items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pinboard_viewports (
    board_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    scroll_left REAL DEFAULT 0,
    scroll_top REAL DEFAULT 0,
    zoom REAL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id, user_id),
    FOREIGN KEY (board_id) REFERENCES pinboards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Add new columns to existing tables (no-op if they already exist)
['email', 'reset_token', 'reset_token_expires'].forEach(col => {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`); } catch {}
});

try { db.exec('ALTER TABLE files ADD COLUMN blurred INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN file_date DATETIME'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN duration REAL'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN bitrate INTEGER'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN width INTEGER'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN height INTEGER'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN codec TEXT'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN proxy_variants TEXT'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN proxy_status TEXT DEFAULT "pending"'); } catch {}
try { db.exec('ALTER TABLE files ADD COLUMN thumbnail_updated_at DATETIME'); } catch {}
try { db.exec('ALTER TABLE pinboard_items ADD COLUMN note_image_file_id TEXT'); } catch {}

// User profile fields
['avatar', 'phone'].forEach(col => {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`); } catch {}
});
try { db.exec('ALTER TABLE users ADD COLUMN upload_email_notifications INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN color TEXT DEFAULT '#6366f1'`); } catch {}

// Keep configured ADMIN_USERNAME as admin even if DB flag was not set.
if (process.env.ADMIN_USERNAME) {
  try {
    db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?').run(process.env.ADMIN_USERNAME);
  } catch {}
}

// Global shared countdown targets (single row, id=1)
db.exec(`
  CREATE TABLE IF NOT EXISTS countdown_targets (
    id INTEGER PRIMARY KEY,
    targets_json TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed the single row if not present
const _cdRow = db.prepare('SELECT id FROM countdown_targets WHERE id = 1').get();
if (!_cdRow) {
  db.prepare("INSERT INTO countdown_targets (id, targets_json) VALUES (1, ?)").run(
    JSON.stringify([])
  );
}

module.exports = db;
