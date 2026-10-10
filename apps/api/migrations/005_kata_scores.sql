-- Notas de kata: 3 jueces, cada nota entre 9.90 y 9.99. Se guardan en centésimas (9.95 = 995) para no arrastrar errores de decimales.
CREATE TABLE kata_scores (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  j1 INTEGER NOT NULL CHECK (j1 BETWEEN 990 AND 999),
  j2 INTEGER NOT NULL CHECK (j2 BETWEEN 990 AND 999),
  j3 INTEGER NOT NULL CHECK (j3 BETWEEN 990 AND 999),
  total INTEGER NOT NULL,
  scored_by TEXT REFERENCES users(id),
  scored_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (category_id, registration_id)
);
