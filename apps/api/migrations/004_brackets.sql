CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'main' CHECK (kind IN ('main','bronze')),
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  number INTEGER,
  bye INTEGER NOT NULL DEFAULT 0,
  red_id TEXT REFERENCES registrations(id),
  blue_id TEXT REFERENCES registrations(id),
  red_score INTEGER NOT NULL DEFAULT 0,
  blue_score INTEGER NOT NULL DEFAULT 0,
  seconds_left INTEGER NOT NULL DEFAULT 120,
  winner_id TEXT REFERENCES registrations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','finished')),
  started_at TEXT, finished_at TEXT,
  UNIQUE (category_id, kind, round, position)
);
CREATE INDEX idx_matches_category ON matches (category_id);
ALTER TABLE categories ADD COLUMN bracket_order TEXT;
ALTER TABLE categories ADD COLUMN bracket_confirmed_at TEXT;
ALTER TABLE people ADD COLUMN photo_url TEXT;
-- Con combate por el tercer lugar hay hasta 4 puestos
CREATE TABLE results_new (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 4),
  PRIMARY KEY (category_id, registration_id)
);
INSERT INTO results_new SELECT category_id, registration_id, place FROM results;
DROP TABLE results;
ALTER TABLE results_new RENAME TO results;
