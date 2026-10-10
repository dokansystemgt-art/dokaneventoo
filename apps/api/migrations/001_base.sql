CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE permissions (id TEXT PRIMARY KEY, description TEXT NOT NULL);
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '08:00',
  venue TEXT, address TEXT, description TEXT, logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive','finished','archived')),
  ring_count INTEGER NOT NULL DEFAULT 2 CHECK (ring_count BETWEEN 1 AND 50),
  settings TEXT NOT NULL DEFAULT '{}',
  cloned_from TEXT REFERENCES events(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_status ON events (status, start_date);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, detail TEXT
);
