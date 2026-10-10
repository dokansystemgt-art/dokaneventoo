CREATE TABLE people (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M','F')),
  club TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_people_name ON people (full_name COLLATE NOCASE);
CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  age INTEGER NOT NULL, weight REAL, height REAL, belt TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','late','import')),
  attendance TEXT NOT NULL DEFAULT 'pending' CHECK (attendance IN ('pending','present','absent')),
  attendance_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, person_id, category_id)
);
CREATE INDEX idx_reg_category ON registrations (category_id);
CREATE TABLE results (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 3),
  PRIMARY KEY (category_id, registration_id)
);
ALTER TABLE categories ADD COLUMN called_at TEXT;
ALTER TABLE categories ADD COLUMN closed_at TEXT;
ALTER TABLE categories ADD COLUMN closed_by TEXT;
