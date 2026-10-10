import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.ts';
import { USUARIOS } from './usuarios.ts';

// Permisos por acción. Un rol nuevo = un nuevo conjunto de permisos, sin tocar código.
export const PERMISSIONS: Record<string, string> = {
  'event:read': 'Ver eventos', 'event:write': 'Crear y editar eventos', 'event:archive': 'Archivar eventos',
  'user:manage': 'Administrar usuarios', 'ring:write': 'Administrar rings', 'category:write': 'Administrar categorías',
  'schedule:write': 'Administrar horarios', 'registration:write': 'Administrar inscripciones',
  'pairing:write': 'Administrar emparejamientos', 'ring:operate': 'Operar un ring asignado',
  'category:run': 'Llamar, iniciar y cerrar categorías, y tomar asistencia', 'announce': 'Hacer el llamado por micrófono',
};
const ROLES: Record<string, string> = { admin: 'Administrador', coordinator: 'Coordinador', ring_operator: 'Operador de ring', announcer: 'Locutor' };
const GRANTS: Record<string, string[]> = {
  admin: Object.keys(PERMISSIONS),
  coordinator: ['event:read', 'ring:write', 'category:write', 'schedule:write', 'registration:write', 'pairing:write', 'category:run', 'announce'],
  ring_operator: ['event:read', 'ring:operate', 'category:run'],
  announcer: ['event:read', 'announce'],
};

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  migrate(db);
  bootstrap(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const dir = join(import.meta.dirname, '..', 'migrations');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r: any) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(dir, f), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

// Idempotente: se ejecuta en cada arranque y agrega los permisos/roles nuevos.
function bootstrap(db: DatabaseSync) {
  for (const [id, name] of Object.entries(ROLES)) db.prepare('INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)').run(id, name);
  for (const [id, d] of Object.entries(PERMISSIONS)) db.prepare('INSERT OR IGNORE INTO permissions (id, description) VALUES (?, ?)').run(id, d);
  for (const [role, perms] of Object.entries(GRANTS))
    for (const p of perms) db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(role, p);
}

export function createUser(db: DatabaseSync, u: { email: string; name: string; password: string; role_id: string }) {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, name, password_hash, role_id) VALUES (?, ?, ?, ?, ?)')
    .run(id, u.email.trim().toLowerCase(), u.name.trim(), hashPassword(u.password), u.role_id);
  return id;
}

// Deja SOLO los usuarios de USUARIOS: crea o actualiza (clave, nombre, rol, activo) y elimina cualquier otro.
export function syncUsers(db: DatabaseSync) {
  const keep = USUARIOS.map((u) => u.email.toLowerCase());
  for (const u of USUARIOS) {
    const email = u.email.toLowerCase(), cur = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
    if (cur) db.prepare('UPDATE users SET name = ?, password_hash = ?, role_id = ?, active = 1 WHERE id = ?').run(u.name, hashPassword(u.password), u.role_id, cur.id);
    else createUser(db, u);
  }
  const marks = keep.map(() => '?').join(',');
  const extra = (db.prepare(`SELECT id FROM users WHERE email NOT IN (${marks})`).all(...keep) as any[]).map((r) => r.id);
  for (const id of extra) {
    db.prepare('UPDATE rings SET operator_id = NULL WHERE operator_id = ?').run(id);
    for (const [t, col] of [['events', 'created_by'], ['kata_scores', 'scored_by'], ['registrations', 'created_by']]) db.prepare(`UPDATE ${t} SET ${col} = NULL WHERE ${col} = ?`).run(id);
    try { db.prepare('DELETE FROM users WHERE id = ?').run(id); } catch { db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id); }
  }
  assignDefaultOperators(db);
  return { kept: keep.length, removed: extra.length };
}

// Ring 1 opera el ring 1 y Ring 2 el ring 2 en todos los eventos (solo si ese ring aún no tiene operador).
export function assignDefaultOperators(db: DatabaseSync) {
  USUARIOS.filter((u) => u.role_id === 'ring_operator').forEach((u, i) => {
    const row = db.prepare('SELECT id FROM users WHERE email = ? AND active = 1').get(u.email.toLowerCase()) as any;
    if (row) db.prepare('UPDATE rings SET operator_id = ? WHERE number = ? AND operator_id IS NULL').run(row.id, i + 1);
  });
}
