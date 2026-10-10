CREATE TABLE rings (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','active','paused','closed')),
  operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (event_id, number)
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ring_id TEXT REFERENCES rings(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  modality TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'mixed' CHECK (gender IN ('M','F','mixed')),
  age_min INTEGER, age_max INTEGER,
  weight_min REAL, weight_max REAL,
  level TEXT,
  belts TEXT NOT NULL DEFAULT '[]',
  max_participants INTEGER,
  start_time TEXT,
  est_minutes INTEGER NOT NULL DEFAULT 30 CHECK (est_minutes BETWEEN 1 AND 600),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','next','calling','preparing','in_progress','finished')),
  UNIQUE (event_id, code)
);
CREATE INDEX idx_categories_ring ON categories (ring_id);
CREATE TABLE schedule_breaks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ring_id TEXT NOT NULL REFERENCES rings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 1 AND 600)
);
CREATE INDEX idx_breaks_ring ON schedule_breaks (ring_id);
