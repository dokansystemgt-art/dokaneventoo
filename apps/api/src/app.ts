import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { sign, verify, verifyPassword, makeLimiter, hashPassword } from './auth.ts';
import { createUser, assignDefaultOperators } from './db.ts';
import { buildRingSchedule, planSchedule } from './schedule.ts';
import { ineligibleReasons } from './eligibility.ts';
import { planBracket, playOrder, podiumFrom } from './bracket.ts';
import { parseScore, rankKata, podiumTies, kataPodium, JUDGES } from './kata.ts';

class HttpError extends Error {
  status: number;
  extra: any;
  constructor(status: number, message: string, extra?: any) { super(message); this.status = status; this.extra = extra; }
}

const WEB = join(import.meta.dirname, '..', '..', 'web');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const STATUSES = ['draft', 'active', 'inactive', 'finished'];
const SESSION_MS = 12 * 3600_000;
const JSON_T = 'application/json; charset=utf-8';

function cleanEvent(b: any, partial: boolean) {
  const o: any = {};
  for (const [k, max] of [['name', 120], ['venue', 120], ['address', 200], ['description', 2000], ['logo_url', 300]] as const)
    if (b[k] !== undefined) o[k] = String(b[k]).trim().slice(0, max);
  for (const k of ['start_date', 'end_date'])
    if (b[k] !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(b[k])) throw new HttpError(400, `${k} debe tener formato AAAA-MM-DD`); o[k] = b[k]; }
  if (b.start_time !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start_time)) throw new HttpError(400, 'start_time debe tener formato HH:MM'); o.start_time = b.start_time; }
  if (b.ring_count !== undefined) { const n = Number(b.ring_count); if (!Number.isInteger(n) || n < 1 || n > 50) throw new HttpError(400, 'La cantidad de rings debe ser un entero entre 1 y 50'); o.ring_count = n; }
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) throw new HttpError(400, 'Estado inválido (para archivar usa la acción Archivar)'); o.status = b.status; }
  if (b.settings !== undefined) { if (typeof b.settings !== 'object' || b.settings === null || Array.isArray(b.settings)) throw new HttpError(400, 'settings debe ser un objeto'); o.settings = JSON.stringify(b.settings); }
  if (!partial) for (const k of ['name', 'start_date', 'end_date']) if (!o[k]) throw new HttpError(400, `${k} es obligatorio`);
  return o;
}

const GENDERS = ['M', 'F', 'mixed'];
const CAT_STATUS = ['pending', 'next', 'calling', 'preparing', 'in_progress', 'finished'];
const RING_STATUS = ['idle', 'active', 'paused', 'closed'];
const field = (b: any, o: any, k: string, fn: (v: any) => any) => { if (b[k] !== undefined) o[k] = b[k] === null || b[k] === '' ? null : fn(b[k]); };
const intIn = (label: string, min: number, max: number) => (v: any) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label}: debe ser un entero entre ${min} y ${max}`); return n; };
const numIn = (label: string, min: number, max: number) => (v: any) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label}: debe ser un número entre ${min} y ${max}`); return n; };
const text = (max: number) => (v: any) => String(v).trim().slice(0, max);
const oneOf = (label: string, list: string[]) => (v: any) => { if (!list.includes(v)) throw new HttpError(400, `${label} inválido`); return v; };
const hhmm = (v: any) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, 'La hora debe tener formato HH:MM'); return String(v); };

function cleanCategory(b: any, partial: boolean) {
  const o: any = {};
  field(b, o, 'code', text(20)); field(b, o, 'name', text(150)); field(b, o, 'modality', text(40)); field(b, o, 'level', text(40));
  field(b, o, 'gender', oneOf('Género', GENDERS)); field(b, o, 'status', oneOf('Estado', CAT_STATUS));
  field(b, o, 'age_min', intIn('Edad mínima', 0, 120)); field(b, o, 'age_max', intIn('Edad máxima', 0, 120));
  field(b, o, 'weight_min', numIn('Peso mínimo', 0, 300)); field(b, o, 'weight_max', numIn('Peso máximo', 0, 300));
  field(b, o, 'max_participants', intIn('Máximo de participantes', 1, 10000));
  field(b, o, 'est_minutes', intIn('Minutos estimados', 1, 600)); field(b, o, 'sort_order', intIn('Orden', 0, 100000));
  field(b, o, 'start_time', hhmm); field(b, o, 'ring_id', text(60));
  field(b, o, 'belts', (v) => { if (!Array.isArray(v) || v.length > 20) throw new HttpError(400, 'Cintas inválidas'); return JSON.stringify(v.map((x: any) => String(x).trim().slice(0, 20)).filter(Boolean)); });
  const label: any = { code: 'El código', name: 'El nombre', modality: 'La modalidad' };
  for (const k of ['code', 'name', 'modality']) if ((!partial && !o[k]) || (k in o && !o[k])) throw new HttpError(400, `${label[k]} es obligatorio`);
  for (const k of ['gender', 'est_minutes', 'sort_order', 'belts', 'status']) if (o[k] === null) delete o[k];
  return o;
}
function checkRanges(c: any) {
  if (c.age_min != null && c.age_max != null && c.age_min > c.age_max) throw new HttpError(400, 'La edad mínima no puede ser mayor que la máxima');
  if (c.weight_min != null && c.weight_max != null && c.weight_min > c.weight_max) throw new HttpError(400, 'El peso mínimo no puede ser mayor que el máximo');
}
function cleanRing(b: any) {
  const o: any = {};
  field(b, o, 'name', text(60)); field(b, o, 'location', text(120)); field(b, o, 'status', oneOf('Estado', RING_STATUS)); field(b, o, 'operator_id', text(60));
  if ('name' in o && !o.name) throw new HttpError(400, 'El nombre del ring es obligatorio');
  if (o.status === null) delete o.status;
  return o;
}
function cleanBreak(b: any, partial: boolean) {
  const o: any = {};
  field(b, o, 'title', text(80)); field(b, o, 'start_time', hhmm); field(b, o, 'duration_min', intIn('Duración', 1, 600));
  for (const k of ['title', 'start_time', 'duration_min']) if ((!partial && !o[k]) || (k in o && !o[k])) throw new HttpError(400, 'Título, hora de inicio y duración son obligatorios');
  return o;
}

async function readBody(req: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const ch of req) { size += ch.length; if (size > 1_000_000) throw new HttpError(413, 'Solicitud demasiado grande'); chunks.push(ch); }
  if (!chunks.length) return {};
  try { const b = JSON.parse(Buffer.concat(chunks).toString()); if (!b || typeof b !== 'object') throw 0; return b; }
  catch { throw new HttpError(400, 'JSON inválido'); }
}

type Ctx = { user: any; params: string[]; body: any; query: URLSearchParams; ip: string; status: number; headers: Record<string, string> };

export function createApp(opts: { db: DatabaseSync; secret: string; secureCookie?: boolean }) {
  const { db, secret } = opts;
  const limiter = makeLimiter(5, 15 * 60_000);
  const cookieAttrs = `HttpOnly; SameSite=Strict; Path=/${opts.secureCookie ? '; Secure' : ''}`;
  const audit = (u: any, action: string, entity: string, id: string | null, detail: any = {}) =>
    db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)').run(u?.id ?? null, action, entity, id, JSON.stringify(detail));
  const eventOut = (r: any) => ({ ...r, settings: JSON.parse(r.settings) });
  const getEvent = (id: string) => {
    const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!r) throw new HttpError(404, 'Evento no encontrado');
    return r as any;
  };
  const userView = (u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role_id, role_name: u.role_name, permissions: u.permissions });
  const permsOf = (roleId: string) => db.prepare('SELECT permission_id FROM role_permissions WHERE role_id = ?').all(roleId).map((p: any) => p.permission_id);

  const isOperator = (u: any) => u.role_id === 'ring_operator';
  const tx = <T>(fn: () => T): T => { db.exec('BEGIN'); try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  // Un operador de ring solo ve los eventos donde tiene un ring asignado.
  const getEventFor = (u: any, id: string) => {
    const e = getEvent(id);
    if (isOperator(u) && !db.prepare('SELECT 1 FROM rings WHERE event_id = ? AND operator_id = ?').get(id, u.id)) throw new HttpError(404, 'Evento no encontrado');
    return e;
  };
  const ensureRings = (eventId: string, n: number) => { for (let i = 1; i <= n; i++) db.prepare('INSERT OR IGNORE INTO rings (id, event_id, number, name) VALUES (?, ?, ?, ?)').run(randomUUID(), eventId, i, `Ring ${i}`); assignDefaultOperators(db); };
  const one = (sql: string, id: string, msg: string) => { const r = db.prepare(sql).get(id); if (!r) throw new HttpError(404, msg); return r as any; };
  const getRing = (id: string) => one('SELECT * FROM rings WHERE id = ?', id, 'Ring no encontrado');
  const getCategory = (id: string) => one('SELECT * FROM categories WHERE id = ?', id, 'Categoría no encontrada');
  const catOut = (r: any) => ({ ...r, belts: JSON.parse(r.belts) });
  const checkOperator = (id: string | null | undefined) => {
    if (!id) return;
    const u: any = db.prepare('SELECT role_id FROM users WHERE id = ? AND active = 1').get(id);
    if (!u || u.role_id !== 'ring_operator') throw new HttpError(400, 'El operador debe ser un usuario activo con rol Operador de ring');
  };
  const checkRing = (eventId: string, ringId: string | null | undefined) => {
    if (ringId && !db.prepare('SELECT 1 FROM rings WHERE id = ? AND event_id = ?').get(ringId, eventId)) throw new HttpError(400, 'El ring no pertenece a este evento');
  };
  const insertRow = (table: string, row: any) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((k) => row[k]));
  };
  const updateRow = (table: string, id: string, o: any) => {
    const cols = Object.keys(o);
    if (cols.length) db.prepare(`UPDATE ${table} SET ${cols.map((k) => k + ' = ?').join(',')} WHERE id = ?`).run(...cols.map((k) => o[k]), id);
  };

  const routes: { method: string; re: RegExp; perm: string | null; fn: (c: Ctx) => any }[] = [];
  // perm: 'public' = sin sesión · null = cualquier usuario con sesión · 'x:y' = requiere ese permiso
  const r = (method: string, path: string, perm: string | null, fn: (c: Ctx) => any) =>
    routes.push({ method, re: new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$'), perm, fn });

  // ---- Autenticación
  r('POST', '/api/auth/login', 'public', (c) => {
    const email = String(c.body.email ?? '').trim().toLowerCase(), key = c.ip + '|' + email;
    if (limiter.blocked(key)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
    const u: any = db.prepare('SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? AND u.active = 1').get(email);
    if (!u || !verifyPassword(String(c.body.password ?? ''), u.password_hash)) { limiter.fail(key); throw new HttpError(401, 'Correo o contraseña incorrectos'); }
    limiter.reset(key);
    u.permissions = permsOf(u.role_id);
    c.headers['Set-Cookie'] = `dokan_session=${sign({ uid: u.id, exp: Date.now() + SESSION_MS }, secret)}; Max-Age=${SESSION_MS / 1000}; ${cookieAttrs}`;
    audit(u, 'login', 'user', u.id);
    return { user: userView(u) };
  });
  r('POST', '/api/auth/logout', 'public', (c) => { c.headers['Set-Cookie'] = `dokan_session=; Max-Age=0; ${cookieAttrs}`; return {}; });
  r('GET', '/api/auth/me', null, (c) => ({ user: userView(c.user) }));
  r('GET', '/api/health', 'public', () => ({ ok: true }));

  // ---- Usuarios
  r('GET', '/api/roles', 'user:manage', () => db.prepare('SELECT id, name FROM roles ORDER BY name').all());
  r('GET', '/api/users', 'user:manage', () => db.prepare('SELECT id, email, name, role_id, active, created_at FROM users ORDER BY name').all());
  r('POST', '/api/users', 'user:manage', (c) => {
    const { email, name, password, role_id } = c.body;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? ''))) throw new HttpError(400, 'Correo inválido');
    if (!String(name ?? '').trim()) throw new HttpError(400, 'El nombre es obligatorio');
    if (String(password ?? '').length < 10) throw new HttpError(400, 'La contraseña debe tener al menos 10 caracteres');
    if (!db.prepare('SELECT 1 FROM roles WHERE id = ?').get(role_id)) throw new HttpError(400, 'Rol inválido');
    let id: string;
    try { id = createUser(db, { email, name, password, role_id }); }
    catch (e: any) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Ya existe un usuario con ese correo'); throw e; }
    audit(c.user, 'create', 'user', id, { email, role_id });
    c.status = 201;
    return { id, email: String(email).toLowerCase(), name, role_id };
  });

  // ---- Eventos
  const today = () => new Date().toLocaleDateString('sv-SE');
  const VIEWS: Record<string, string> = {
    all: "status != 'archived'",
    upcoming: "status NOT IN ('archived','finished') AND end_date >= ?",
    active: "status = 'active'",
    past: "status != 'archived' AND (status = 'finished' OR end_date < ?)",
    archived: "status = 'archived'",
  };
  r('GET', '/api/events', 'event:read', (c) => {
    const cond = VIEWS[c.query.get('view') ?? 'all'];
    if (!cond) throw new HttpError(400, 'Vista inválida');
    const args: any[] = cond.includes('?') ? [today()] : [];
    const q = (c.query.get('q') ?? '').trim();
    if (q) args.push(`%${q}%`);
    if (isOperator(c.user)) args.push(c.user.id);
    return db.prepare(`SELECT * FROM events WHERE ${cond}${q ? ' AND name LIKE ?' : ''}${isOperator(c.user) ? ' AND id IN (SELECT event_id FROM rings WHERE operator_id = ?)' : ''} ORDER BY start_date DESC, name`).all(...args).map(eventOut);
  });
  r('GET', '/api/events/:id', 'event:read', (c) => eventOut(getEventFor(c.user, c.params[0])));
  r('POST', '/api/events', 'event:write', (c) => {
    const o = cleanEvent(c.body, false);
    if (o.end_date < o.start_date) throw new HttpError(400, 'La fecha de fin no puede ser anterior a la de inicio');
    const id = randomUUID(), cols = Object.keys(o);
    db.prepare(`INSERT INTO events (id, created_by, ${cols.join(',')}) VALUES (?, ?, ${cols.map(() => '?').join(',')})`).run(id, c.user.id, ...cols.map((k) => o[k]));
    ensureRings(id, o.ring_count ?? 2);
    audit(c.user, 'create', 'event', id, { name: o.name });
    c.status = 201;
    return eventOut(getEvent(id));
  });
  r('PATCH', '/api/events/:id', 'event:write', (c) => {
    const cur = getEvent(c.params[0]);
    if (cur.status === 'archived') throw new HttpError(409, 'El evento está archivado');
    const o = cleanEvent(c.body, true), next = { ...cur, ...o };
    if (next.end_date < next.start_date) throw new HttpError(400, 'La fecha de fin no puede ser anterior a la de inicio');
    const cols = Object.keys(o);
    if (cols.length) db.prepare(`UPDATE events SET ${cols.map((k) => k + ' = ?').join(',')}, updated_at = datetime('now') WHERE id = ?`).run(...cols.map((k) => o[k]), cur.id);
    if (o.ring_count) ensureRings(cur.id, o.ring_count);
    audit(c.user, 'update', 'event', cur.id, o);
    return eventOut(getEvent(cur.id));
  });
  r('POST', '/api/events/:id/archive', 'event:archive', (c) => {
    const e = getEvent(c.params[0]);
    db.prepare("UPDATE events SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(e.id);
    audit(c.user, 'archive', 'event', e.id);
    return eventOut(getEvent(e.id));
  });
  r('POST', '/api/events/:id/duplicate', 'event:write', (c) => {
    const e = getEvent(c.params[0]), id = randomUUID();
    tx(() => {
      db.prepare(`INSERT INTO events (id, name, start_date, end_date, start_time, venue, address, description, logo_url, ring_count, settings, cloned_from, created_by, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`)
        .run(id, `${e.name} (copia)`.slice(0, 120), e.start_date, e.end_date, e.start_time, e.venue, e.address, e.description, e.logo_url, e.ring_count, e.settings, e.id, c.user.id);
      const map = new Map<string, string>();
      for (const rg of db.prepare('SELECT * FROM rings WHERE event_id = ?').all(e.id) as any[]) {
        const nid = randomUUID(); map.set(rg.id, nid);
        insertRow('rings', { id: nid, event_id: id, number: rg.number, name: rg.name, location: rg.location }); assignDefaultOperators(db); // clonado: sin estado; los operadores por defecto se reasignan
      }
      for (const k of db.prepare('SELECT * FROM categories WHERE event_id = ?').all(e.id) as any[])
        insertRow('categories', { ...k, id: randomUUID(), event_id: id, ring_id: map.get(k.ring_id) ?? null, status: 'pending', called_at: null, closed_at: null, closed_by: null });
      for (const k of db.prepare('SELECT * FROM schedule_breaks WHERE event_id = ?').all(e.id) as any[])
        insertRow('schedule_breaks', { ...k, id: randomUUID(), event_id: id, ring_id: map.get(k.ring_id) });
    });
    audit(c.user, 'duplicate', 'event', id, { from: e.id });
    c.status = 201;
    return eventOut(getEvent(id));
  });

  // ---- Rings
  const opScope = (u: any, col: string) => (isOperator(u) ? { sql: ` AND ${col} = ?`, args: [u.id] } : { sql: '', args: [] as string[] });
  r('GET', '/api/events/:id/rings', 'event:read', (c) => {
    const e = getEventFor(c.user, c.params[0]), sc = opScope(c.user, 'r.operator_id');
    return db.prepare(`SELECT r.*, u.name AS operator_name, (SELECT COUNT(*) FROM categories k WHERE k.ring_id = r.id) AS category_count
                       FROM rings r LEFT JOIN users u ON u.id = r.operator_id WHERE r.event_id = ?${sc.sql} ORDER BY r.number`).all(e.id, ...sc.args);
  });
  r('GET', '/api/operators', 'ring:write', () => db.prepare("SELECT id, name, email FROM users WHERE role_id = 'ring_operator' AND active = 1 ORDER BY name").all());
  r('POST', '/api/events/:id/rings', 'ring:write', (c) => {
    const e = getEvent(c.params[0]), o = cleanRing(c.body);
    const number = (db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM rings WHERE event_id = ?').get(e.id) as any).n;
    if (number > 50) throw new HttpError(400, 'Máximo 50 rings por evento');
    checkOperator(o.operator_id);
    const id = randomUUID();
    insertRow('rings', { id, event_id: e.id, number, name: o.name ?? `Ring ${number}`, location: o.location ?? null, operator_id: o.operator_id ?? null }); assignDefaultOperators(db);
    audit(c.user, 'create', 'ring', id, { event: e.id });
    c.status = 201;
    return getRing(id);
  });
  r('PATCH', '/api/rings/:id', 'ring:write', (c) => {
    const cur = getRing(c.params[0]), o = cleanRing(c.body);
    checkOperator(o.operator_id);
    updateRow('rings', cur.id, o);
    audit(c.user, 'update', 'ring', cur.id, o);
    return getRing(cur.id);
  });
  r('DELETE', '/api/rings/:id', 'ring:write', (c) => {
    const cur = getRing(c.params[0]);
    db.prepare('DELETE FROM rings WHERE id = ?').run(cur.id); // sus categorías quedan sin ring; sus descansos se borran
    audit(c.user, 'delete', 'ring', cur.id);
    return {};
  });

  // ---- Categorías
  const catRows = (eventId: string, u: any): any[] => db.prepare(`SELECT k.*, (SELECT name FROM rings WHERE id = k.ring_id) AS ring_name,
      (SELECT COUNT(*) FROM registrations g WHERE g.category_id = k.id) AS registered_count,
      (SELECT COUNT(*) FROM registrations g WHERE g.category_id = k.id AND g.attendance = 'present') AS present_count
    FROM categories k WHERE k.event_id = ?${isOperator(u) ? ' AND k.ring_id IN (SELECT id FROM rings WHERE operator_id = ?)' : ''}
    ORDER BY COALESCE(k.start_time, '99:99'), k.sort_order, k.code`).all(eventId, ...(isOperator(u) ? [u.id] : [])) as any[];
  const catWithCounts = (id: string) => { const k = getCategory(id); return catOut(catRows(k.event_id, { role_id: 'admin' }).find((x) => x.id === id)); };
  r('GET', '/api/events/:id/categories', 'event:read', (c) => {
    const e = getEventFor(c.user, c.params[0]), ringId = c.query.get('ring_id');
    return catRows(e.id, c.user).filter((k) => !ringId || k.ring_id === ringId).map(catOut);
  });
  const saveCategory = (fn: () => any) => {
    try { return fn(); } catch (e: any) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Ya existe una categoría con ese código en este evento'); throw e; }
  };
  r('POST', '/api/events/:id/categories', 'category:write', (c) => {
    const e = getEvent(c.params[0]), o = cleanCategory(c.body, false);
    checkRanges(o); checkRing(e.id, o.ring_id);
    const id = randomUUID();
    saveCategory(() => insertRow('categories', { id, event_id: e.id, ...o }));
    audit(c.user, 'create', 'category', id, { code: o.code });
    c.status = 201;
    return catOut(getCategory(id));
  });
  r('PATCH', '/api/categories/:id', 'category:write', (c) => {
    const cur = getCategory(c.params[0]), o = cleanCategory(c.body, true);
    checkRanges({ ...cur, ...o }); checkRing(cur.event_id, o.ring_id);
    saveCategory(() => updateRow('categories', cur.id, o));
    audit(c.user, 'update', 'category', cur.id, o);
    return catOut(getCategory(cur.id));
  });
  r('DELETE', '/api/categories/:id', 'category:write', (c) => {
    const cur = getCategory(c.params[0]);
    db.prepare('DELETE FROM categories WHERE id = ?').run(cur.id);
    audit(c.user, 'delete', 'category', cur.id, { code: cur.code });
    return {};
  });

  // Importación masiva: crea las categorías nuevas y actualiza las que ya existen (por código).
  // Un valor vacío significa "no tocar". Si cualquier fila tiene errores, no se importa nada.
  r('POST', '/api/events/:id/categories/import', 'category:write', (c) => {
    const e = getEvent(c.params[0]), rows = c.body.rows;
    if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'No hay filas para importar');
    if (rows.length > 2000) throw new HttpError(400, 'Máximo 2000 filas por importación');
    const ringByNumber = new Map((db.prepare('SELECT id, number FROM rings WHERE event_id = ?').all(e.id) as any[]).map((x) => [x.number, x.id]));
    const existing = new Map((db.prepare('SELECT * FROM categories WHERE event_id = ?').all(e.id) as any[]).map((k) => [k.code, k]));
    const errors: { row: number; message: string }[] = [], plan: { cur: any; o: any }[] = [], seen = new Set<string>();
    rows.forEach((raw: any, i: number) => {
      const row = i + 2; // fila del archivo (la 1 es el encabezado)
      try {
        const clean = Object.fromEntries(Object.entries(raw ?? {}).filter(([, v]) => v !== '' && v != null));
        const ringNumber = clean.ring; delete clean.ring; delete clean.ring_id;
        const o = cleanCategory(clean, true);
        if (!o.code) throw new HttpError(400, 'Falta el código');
        if (seen.has(o.code)) throw new HttpError(400, 'El código está repetido en el archivo');
        seen.add(o.code);
        if (ringNumber !== undefined) { const id = ringByNumber.get(Number(ringNumber)); if (!id) throw new HttpError(400, `El ring ${ringNumber} no existe en este evento`); o.ring_id = id; }
        const cur = existing.get(o.code);
        if (!cur && (!o.name || !o.modality)) throw new HttpError(400, 'Una categoría nueva necesita nombre y modalidad');
        checkRanges({ ...cur, ...o });
        plan.push({ cur, o });
      } catch (x: any) {
        if (!(x instanceof HttpError)) throw x;
        errors.push({ row, message: `Fila ${row}${raw?.code ? ` (${raw.code})` : ''}: ${x.message}` });
      }
    });
    if (errors.length) throw new HttpError(400, 'El archivo tiene errores. No se importó nada.', { errors });
    let created = 0, updated = 0;
    tx(() => {
      for (const { cur, o } of plan) {
        if (cur) { const { code, ...rest } = o; updateRow('categories', cur.id, rest); updated++; }
        else { insertRow('categories', { id: randomUUID(), event_id: e.id, ...o }); created++; }
      }
    });
    audit(c.user, 'import', 'category', null, { event: e.id, created, updated });
    return { created, updated };
  });

  // ---- Descansos y horario
  r('POST', '/api/rings/:id/breaks', 'schedule:write', (c) => {
    const rg = getRing(c.params[0]), o = cleanBreak(c.body, false), id = randomUUID();
    insertRow('schedule_breaks', { id, event_id: rg.event_id, ring_id: rg.id, ...o });
    audit(c.user, 'create', 'break', id, o);
    c.status = 201;
    return one('SELECT * FROM schedule_breaks WHERE id = ?', id, 'No encontrado');
  });
  r('PATCH', '/api/breaks/:id', 'schedule:write', (c) => {
    const cur = one('SELECT * FROM schedule_breaks WHERE id = ?', c.params[0], 'Descanso no encontrado'), o = cleanBreak(c.body, true);
    updateRow('schedule_breaks', cur.id, o);
    return one('SELECT * FROM schedule_breaks WHERE id = ?', cur.id, 'No encontrado');
  });
  r('DELETE', '/api/breaks/:id', 'schedule:write', (c) => {
    const cur = one('SELECT * FROM schedule_breaks WHERE id = ?', c.params[0], 'Descanso no encontrado');
    db.prepare('DELETE FROM schedule_breaks WHERE id = ?').run(cur.id);
    audit(c.user, 'delete', 'break', cur.id);
    return {};
  });
  r('GET', '/api/events/:id/schedule', 'event:read', (c) => {
    const e = getEventFor(c.user, c.params[0]), sc = opScope(c.user, 'operator_id');
    const rings = db.prepare(`SELECT id, number, name, location, status FROM rings WHERE event_id = ?${sc.sql} ORDER BY number`).all(e.id, ...sc.args) as any[];
    return {
      start_time: e.start_time,
      rings: rings.map((rg) => ({
        ring: rg,
        ...buildRingSchedule(
          db.prepare('SELECT id, code, name, start_time, est_minutes, status, (SELECT COUNT(*) FROM registrations g WHERE g.category_id = categories.id) AS registered FROM categories WHERE ring_id = ?').all(rg.id) as any[],
          db.prepare('SELECT id, title, start_time, duration_min FROM schedule_breaks WHERE ring_id = ?').all(rg.id) as any[]),
      })),
    };
  });

  // ---- Usuarios (edición)
  r('PATCH', '/api/users/:id', 'user:manage', (c) => {
    const u: any = one('SELECT * FROM users WHERE id = ?', c.params[0], 'Usuario no encontrado'), b = c.body, o: any = {};
    if (b.name !== undefined) { o.name = String(b.name).trim().slice(0, 100); if (!o.name) throw new HttpError(400, 'El nombre es obligatorio'); }
    if (b.role_id !== undefined) { if (!db.prepare('SELECT 1 FROM roles WHERE id = ?').get(b.role_id)) throw new HttpError(400, 'Rol inválido'); o.role_id = b.role_id; }
    if (b.active !== undefined) o.active = b.active ? 1 : 0;
    if (b.password !== undefined) { if (String(b.password).length < 10) throw new HttpError(400, 'La contraseña debe tener al menos 10 caracteres'); o.password_hash = hashPassword(String(b.password)); }
    if (u.id === c.user.id && (o.active === 0 || (o.role_id && o.role_id !== u.role_id))) throw new HttpError(400, 'No puedes desactivar ni cambiar el rol de tu propia cuenta');
    updateRow('users', u.id, o);
    if (o.active === 0 || (o.role_id && o.role_id !== 'ring_operator')) db.prepare('UPDATE rings SET operator_id = NULL WHERE operator_id = ?').run(u.id);
    audit(c.user, 'update', 'user', u.id, { ...o, password_hash: undefined });
    return db.prepare('SELECT id, email, name, role_id, active, created_at FROM users WHERE id = ?').get(u.id);
  });

  // ---- Inscripciones
  const catAccess = (u: any, k: any) => {
    if (isOperator(u) && !(k.ring_id && db.prepare('SELECT 1 FROM rings WHERE id = ? AND operator_id = ?').get(k.ring_id, u.id))) throw new HttpError(403, 'Esta categoría no pertenece a tu ring');
  };
  const parsePerson = (b: any) => {
    const full_name = String(b.full_name ?? '').trim().slice(0, 120);
    if (!full_name) throw new HttpError(400, 'El nombre es obligatorio');
    if (b.gender !== 'M' && b.gender !== 'F') throw new HttpError(400, 'El género debe ser M o F');
    if (b.age === undefined || b.age === '' || b.age == null) throw new HttpError(400, 'La edad es obligatoria');
    const belt = String(b.belt ?? '').trim().slice(0, 20);
    if (!belt) throw new HttpError(400, 'La cinta es obligatoria');
    const o: any = {};
    field(b, o, 'weight', numIn('Peso', 1, 300)); field(b, o, 'height', numIn('Altura (m)', 0.3, 2.5));
    return { p: { full_name, gender: b.gender, club: String(b.club ?? '').trim().slice(0, 120) }, snap: { age: intIn('Edad', 1, 99)(b.age), belt, weight: o.weight ?? null, height: o.height ?? null } };
  };
  const checkCats = (cats: any[], p: any, snap: any, force: boolean) => {
    const errs: string[] = [];
    for (const k of cats) {
      if (k.status === 'finished') errs.push(`${k.code}: la categoría ya está cerrada`);
      else if (!force) { const why = ineligibleReasons(k, { gender: p.gender, ...snap }); if (why.length) errs.push(`${k.code}: no coincide en ${why.join(', ')}`); }
    }
    return errs;
  };
  const commitReg = (eventId: string, userId: string, p: any, snap: any, cats: any[], origin: string) => {
    let pid = (db.prepare("SELECT id FROM people WHERE full_name = ? COLLATE NOCASE AND gender = ? AND COALESCE(club, '') = ? COLLATE NOCASE").get(p.full_name, p.gender, p.club) as any)?.id;
    if (!pid) { pid = randomUUID(); db.prepare('INSERT INTO people (id, full_name, gender, club) VALUES (?, ?, ?, ?)').run(pid, p.full_name, p.gender, p.club || null); }
    let created = 0;
    for (const k of cats) created += Number(db.prepare('INSERT OR IGNORE INTO registrations (id, event_id, person_id, category_id, age, weight, height, belt, origin, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), eventId, pid, k.id, snap.age, snap.weight, snap.height, snap.belt, origin, userId).changes);
    return { person_id: pid, created };
  };
  const getReg = (id: string) => one('SELECT * FROM registrations WHERE id = ?', id, 'Inscripción no encontrada');

  r('GET', '/api/events/:id/eligible', 'registration:write', (c) => {
    const e = getEvent(c.params[0]), q = c.query;
    if (!q.get('gender') || !q.get('age') || !q.get('belt')) throw new HttpError(400, 'Indica género, edad y cinta');
    const person = { gender: q.get('gender'), age: Number(q.get('age')), weight: q.get('weight') ? Number(q.get('weight')) : null, belt: q.get('belt') };
    return (db.prepare("SELECT * FROM categories WHERE event_id = ? AND status != 'finished' ORDER BY sort_order, code").all(e.id) as any[])
      .filter((k) => ineligibleReasons(k, person).length === 0).map((k) => ({ id: k.id, code: k.code, name: k.name, modality: k.modality, ring_id: k.ring_id, start_time: k.start_time }));
  });
  r('POST', '/api/events/:id/registrations', 'registration:write', (c) => {
    const e = getEvent(c.params[0]);
    if (e.status === 'archived') throw new HttpError(409, 'El evento está archivado');
    const { p, snap } = parsePerson(c.body);
    const ids: string[] = Array.isArray(c.body.category_ids) ? [...new Set<string>(c.body.category_ids)] : [];
    if (!ids.length || ids.length > 12) throw new HttpError(400, 'Elige entre 1 y 12 categorías');
    const cats = ids.map((id) => { const k: any = db.prepare('SELECT * FROM categories WHERE id = ? AND event_id = ?').get(id, e.id); if (!k) throw new HttpError(400, 'Categoría no válida para este evento'); return k; });
    const errors = checkCats(cats, p, snap, !!c.body.force);
    if (errors.length) throw new HttpError(400, 'Hay categorías que no corresponden a este competidor', { errors });
    const res = tx(() => commitReg(e.id, c.user.id, p, snap, cats, c.body.origin === 'late' ? 'late' : 'manual'));
    audit(c.user, 'create', 'registration', res.person_id, { event: e.id, categories: ids.length });
    c.status = 201;
    return res;
  });
  r('POST', '/api/events/:id/registrations/import', 'registration:write', (c) => {
    const e = getEvent(c.params[0]), rows = c.body.rows;
    if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'No hay filas para importar');
    if (rows.length > 3000) throw new HttpError(400, 'Máximo 3000 filas por importación');
    const byCode = new Map((db.prepare('SELECT * FROM categories WHERE event_id = ?').all(e.id) as any[]).map((k) => [k.code, k]));
    const errors: { row: number; message: string }[] = [], plan: any[] = [];
    rows.forEach((raw: any, i: number) => {
      const row = i + 2;
      try {
        const { p, snap } = parsePerson(raw ?? {});
        const codes: string[] = Array.isArray(raw.category_codes) ? raw.category_codes : [];
        if (!codes.length) throw new HttpError(400, 'Falta al menos una categoría');
        const cats = codes.map((code) => { const k = byCode.get(code); if (!k) throw new HttpError(400, `La categoría ${code} no existe en este evento`); return k; });
        const errs = checkCats(cats, p, snap, false);
        if (errs.length) throw new HttpError(400, errs.join('; '));
        plan.push({ p, snap, cats });
      } catch (x: any) {
        if (!(x instanceof HttpError)) throw x;
        errors.push({ row, message: `Fila ${row}${raw?.full_name ? ` (${raw.full_name})` : ''}: ${x.message}` });
      }
    });
    if (errors.length) throw new HttpError(400, 'El archivo tiene errores. No se importó nada.', { errors });
    let created = 0, total = 0;
    tx(() => { for (const x of plan) { total += x.cats.length; created += commitReg(e.id, c.user.id, x.p, x.snap, x.cats, 'import').created; } });
    audit(c.user, 'import', 'registration', null, { event: e.id, created });
    return { rows: plan.length, created, already: total - created };
  });
  r('GET', '/api/events/:id/registrations', 'registration:write', (c) => {
    const e = getEvent(c.params[0]);
    return db.prepare(`SELECT g.id, g.category_id, k.code AS category_code, k.status AS category_status, g.age, g.weight, g.height, g.belt, g.origin, g.attendance, p.id AS person_id, p.full_name, p.gender, p.club
      FROM registrations g JOIN people p ON p.id = g.person_id JOIN categories k ON k.id = g.category_id
      WHERE g.event_id = ? ORDER BY p.full_name COLLATE NOCASE, k.code`).all(e.id);
  });
  r('DELETE', '/api/registrations/:id', 'registration:write', (c) => {
    const g = getReg(c.params[0]);
    // Se puede quitar a un competidor aunque su categoría ya haya empezado o terminado: sus combates quedan sin ese competidor y sus resultados se borran.
    tx(() => {
      for (const col of ['red_id', 'blue_id', 'winner_id']) db.prepare(`UPDATE matches SET ${col} = NULL WHERE ${col} = ?`).run(g.id);
      db.prepare('DELETE FROM registrations WHERE id = ?').run(g.id);
    });
    audit(c.user, 'delete', 'registration', g.id);
    return {};
  });
  r('PATCH', '/api/registrations/:id/attendance', 'category:run', (c) => {
    const g = getReg(c.params[0]), k = getCategory(g.category_id), a = c.body.attendance;
    catAccess(c.user, k);
    if (!['pending', 'present', 'absent'].includes(a)) throw new HttpError(400, 'Asistencia inválida');
    if (k.bracket_confirmed_at) throw new HttpError(409, 'El emparejamiento ya fue confirmado');
    if (k.status === 'finished') throw new HttpError(409, 'La categoría ya está cerrada');
    db.prepare("UPDATE registrations SET attendance = ?, attendance_at = CASE WHEN ? = 'pending' THEN NULL ELSE datetime('now') END WHERE id = ?").run(a, a, g.id);
    return { id: g.id, attendance: a };
  });
  r('GET', '/api/categories/:id/competitors', 'event:read', (c) => {
    const k = getCategory(c.params[0]); catAccess(c.user, k);
    return { category: catWithCounts(k.id), competitors: db.prepare(`SELECT g.id AS registration_id, p.full_name, p.club, p.gender, g.age, g.weight, g.belt, g.attendance,
      (SELECT place FROM results s WHERE s.registration_id = g.id) AS place
      FROM registrations g JOIN people p ON p.id = g.person_id WHERE g.category_id = ? ORDER BY p.full_name COLLATE NOCASE`).all(k.id) };
  });

  // ---- Llamado, inicio y cierre de categorías
  const setCat = (k: any, o: any) => updateRow('categories', k.id, o);
  r('POST', '/api/categories/:id/call', 'category:run', (c) => {
    const k = getCategory(c.params[0]); catAccess(c.user, k);
    if (!k.ring_id) throw new HttpError(400, 'La categoría no tiene ring asignado');
    if (!['pending', 'next', 'calling', 'preparing'].includes(k.status)) throw new HttpError(409, 'La categoría ya está en curso o cerrada');
    if (!(db.prepare('SELECT 1 FROM registrations WHERE category_id = ?').get(k.id))) throw new HttpError(400, 'La categoría no tiene inscritos');
    setCat(k, { status: 'calling', called_at: new Date().toISOString() });
    audit(c.user, 'call', 'category', k.id);
    return catWithCounts(k.id);
  });
  r('POST', '/api/categories/:id/cancel-call', 'category:run', (c) => {
    const k = getCategory(c.params[0]); catAccess(c.user, k);
    if (!['calling', 'preparing'].includes(k.status)) throw new HttpError(409, 'La categoría no está en llamado');
    setCat(k, { status: 'pending', called_at: null });
    return catWithCounts(k.id);
  });
  r('POST', '/api/categories/:id/announced', 'announce', (c) => {
    const k = getCategory(c.params[0]);
    if (k.status !== 'calling') throw new HttpError(409, 'La categoría no está siendo llamada');
    setCat(k, { status: 'preparing' });
    audit(c.user, 'announced', 'category', k.id);
    return catWithCounts(k.id);
  });
  r('POST', '/api/categories/:id/start', 'category:run', (c) => {
    const k = getCategory(c.params[0]); catAccess(c.user, k);
    if (k.status !== 'preparing') throw new HttpError(409, 'Primero debe hacerse el llamado por micrófono');
    if (!(db.prepare("SELECT 1 FROM registrations WHERE category_id = ? AND attendance = 'present'").get(k.id))) throw new HttpError(400, 'Marca al menos un competidor presente');
    setCat(k, { status: 'in_progress' });
    audit(c.user, 'start', 'category', k.id);
    return catWithCounts(k.id);
  });
  r('POST', '/api/categories/:id/close', 'category:run', (c) => {
    const k = getCategory(c.params[0]); catAccess(c.user, k);
    if (k.status !== 'in_progress') throw new HttpError(409, 'Inicia la categoría antes de cerrarla');
    let results: any[] = Array.isArray(c.body.results) ? c.body.results : [];
    if (!usesBracket(k) && db.prepare('SELECT 1 FROM kata_scores WHERE category_id = ?').get(k.id)) { // kata: los lugares salen de las notas de los jueces
      const st = kataState(k);
      if (!st.complete) throw new HttpError(409, `Faltan ${st.pending} competidores por calificar`);
      if (st.ties.length) throw new HttpError(409, 'Hay empate de nota en los primeros lugares: los jueces deben definir la nota oficial', { ties: st.ties });
      results = st.podium!;
    }
    const present = new Set((db.prepare("SELECT id FROM registrations WHERE category_id = ? AND attendance = 'present'").all(k.id) as any[]).map((x) => x.id));
    const count: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }, used = new Set<string>();
    for (const x of results) {
      if (![1, 2, 3, 4].includes(Number(x.place))) throw new HttpError(400, 'Los lugares válidos son 1, 2, 3 y 4');
      if (!present.has(x.registration_id)) throw new HttpError(400, 'Solo los competidores presentes pueden tener un lugar');
      if (used.has(x.registration_id)) throw new HttpError(400, 'Un competidor no puede tener dos lugares');
      used.add(x.registration_id); count[Number(x.place)]++;
    }
    if (count[1] !== 1) throw new HttpError(400, 'Debe haber exactamente un primer lugar');
    if (count[2] > 1 || count[3] > 2 || count[4] > 1) throw new HttpError(400, 'Máximo un segundo lugar, dos terceros y un cuarto');
    if (k.bracket_confirmed_at && db.prepare("SELECT 1 FROM matches WHERE category_id = ? AND bye = 0 AND status != 'finished'").get(k.id)) throw new HttpError(409, 'Faltan combates por terminar');
    tx(() => {
      db.prepare('DELETE FROM results WHERE category_id = ?').run(k.id);
      for (const x of results) db.prepare('INSERT INTO results (category_id, registration_id, place) VALUES (?, ?, ?)').run(k.id, x.registration_id, Number(x.place));
      setCat(k, { status: 'finished', closed_at: new Date().toISOString(), closed_by: c.user.id });
    });
    audit(c.user, 'close', 'category', k.id, { results: results.length });
    return catWithCounts(k.id);
  });
  r('POST', '/api/categories/:id/reopen', 'category:write', (c) => {
    const k = getCategory(c.params[0]);
    if (k.status !== 'finished') throw new HttpError(409, 'La categoría no está cerrada');
    setCat(k, { status: 'in_progress', closed_at: null, closed_by: null });
    audit(c.user, 'reopen', 'category', k.id);
    return catWithCounts(k.id);
  });

  // ---- Control del evento (dashboard), categorías cerradas y asignación automática
  r('GET', '/api/events/:id/control', 'event:read', (c) => {
    const e = getEventFor(c.user, c.params[0]), sc = opScope(c.user, 'operator_id');
    const rings = db.prepare(`SELECT id, number, name, status FROM rings WHERE event_id = ?${sc.sql} ORDER BY number`).all(e.id, ...sc.args) as any[];
    const used = catRows(e.id, c.user).filter((k) => k.registered_count > 0), open = used.filter((k) => k.status !== 'finished');
    const ids = used.map((k) => k.id);
    const people = ids.length ? (db.prepare(`SELECT COUNT(DISTINCT person_id) AS n FROM registrations WHERE category_id IN (${ids.map(() => '?').join(',')})`).get(...ids) as any).n : 0;
    const calls = open.filter((k) => k.status === 'calling' || k.status === 'preparing').map((k) => ({
      category: catOut(k),
      competitors: db.prepare('SELECT p.full_name, p.club FROM registrations g JOIN people p ON p.id = g.person_id WHERE g.category_id = ? ORDER BY p.full_name COLLATE NOCASE').all(k.id),
    }));
    return {
      summary: { participants: people, registrations: used.reduce((n, k) => n + k.registered_count, 0), categories_used: used.length,
        waiting: open.filter((k) => ['pending', 'next'].includes(k.status)).length, calling: calls.length, in_progress: open.filter((k) => k.status === 'in_progress').length, finished: used.length - open.length },
      rings: rings.map((ring) => ({ ring, queue: open.filter((k) => k.ring_id === ring.id).map(catOut) })),
      unassigned: open.filter((k) => !k.ring_id).map(catOut),
      calls,
    };
  });
  r('GET', '/api/events/:id/closed', 'event:read', (c) => {
    const e = getEventFor(c.user, c.params[0]);
    return catRows(e.id, c.user).filter((k) => k.status === 'finished').map((k) => ({
      category: catOut(k),
      podium: db.prepare(`SELECT s.place, p.full_name, p.club FROM results s JOIN registrations g ON g.id = s.registration_id JOIN people p ON p.id = g.person_id
                          WHERE s.category_id = ? ORDER BY s.place, p.full_name COLLATE NOCASE`).all(k.id),
    })).sort((a, b) => String(b.category.closed_at).localeCompare(String(a.category.closed_at)));
  });
  r('POST', '/api/events/:id/autoschedule', 'schedule:write', (c) => {
    const e = getEvent(c.params[0]);
    const start = c.body.start_time ? hhmm(c.body.start_time) : e.start_time;
    const rings = db.prepare('SELECT id FROM rings WHERE event_id = ? ORDER BY number').all(e.id) as any[];
    if (!rings.length) throw new HttpError(400, 'El evento no tiene rings');
    const cats = catRows(e.id, { role_id: 'admin' }).filter((k) => k.registered_count > 0 && ['pending', 'next'].includes(k.status));
    const breaks = db.prepare('SELECT * FROM schedule_breaks WHERE event_id = ?').all(e.id) as any[];
    const plan = planSchedule({ rings, cats, breaks, start });
    tx(() => { for (const x of plan) updateRow('categories', x.id, { ring_id: x.ring_id, start_time: x.start_time }); });
    audit(c.user, 'autoschedule', 'event', e.id, { categories: plan.length });
    return { scheduled: plan.length };
  });

  // ---- Llave (tabla de clasificación) y combates
  // Kata y exhibición se califican por jueces. Las «Especiales» (Gran Campeón, Seniors) son combates; solo KEX-007 (Kata Exhibición) es kata.
  const usesBracket = (k: any) => !/kata|exhib/i.test(`${k.modality} ${k.name}`);
  const matchSql = `SELECT m.*, rp.full_name AS red_name, rp.club AS red_club, rp.photo_url AS red_photo, bp.full_name AS blue_name, bp.club AS blue_club, bp.photo_url AS blue_photo
    FROM matches m LEFT JOIN registrations rr ON rr.id = m.red_id LEFT JOIN people rp ON rp.id = rr.person_id
    LEFT JOIN registrations br ON br.id = m.blue_id LEFT JOIN people bp ON bp.id = br.person_id`;
  const matchesOf = (catId: string) => (db.prepare(`${matchSql} WHERE m.category_id = ?`).all(catId) as any[]).sort(playOrder);
  const getMatch = (id: string) => one(`${matchSql} WHERE m.id = ?`, id, 'Combate no encontrado');
  const bracketCat = (c: Ctx, id: string) => {
    const k = getCategory(id); catAccess(c.user, k);
    if (!usesBracket(k)) throw new HttpError(400, 'Esta modalidad se evalúa por puntaje de jueces, no por combates');
    return k;
  };
  const presentRegs = (catId: string) => db.prepare(`SELECT g.id AS registration_id, p.full_name, p.club, p.photo_url, g.belt FROM registrations g JOIN people p ON p.id = g.person_id
    WHERE g.category_id = ? AND g.attendance = 'present' ORDER BY p.full_name COLLATE NOCASE`).all(catId) as any[];
  const ensureOrder = (k: any, present: any[]) => {
    const ids = present.map((p) => p.registration_id);
    const order: string[] = (k.bracket_order ? JSON.parse(k.bracket_order) : []).filter((id: string) => ids.includes(id));
    const rest = ids.filter((id) => !order.includes(id));
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const next = JSON.stringify([...order, ...rest]);
    if (next !== k.bracket_order) updateRow('categories', k.id, { bracket_order: next });
    return JSON.parse(next) as string[];
  };
  r('GET', '/api/categories/:id/bracket', 'event:read', (c) => {
    const k = bracketCat(c, c.params[0]);
    if (!['in_progress', 'finished'].includes(k.status)) throw new HttpError(409, 'Inicia la categoría para ver la clasificación');
    const present = presentRegs(k.id), byId = new Map(present.map((p) => [p.registration_id, p]));
    const confirmed = !!k.bracket_confirmed_at;
    let order: string[] = [], matches: any[];
    if (confirmed) matches = matchesOf(k.id);
    else {
      order = ensureOrder(k, present);
      const who = (i: number | null) => (i == null ? null : byId.get(order[i]));
      matches = planBracket(order.length).sort(playOrder).map((m) => ({ ...m, bye: m.bye ? 1 : 0, status: 'pending', red_score: 0, blue_score: 0, winner_id: null,
        red_id: who(m.red)?.registration_id ?? null, red_name: who(m.red)?.full_name ?? null, red_club: who(m.red)?.club ?? null,
        blue_id: who(m.blue)?.registration_id ?? null, blue_name: who(m.blue)?.full_name ?? null, blue_club: who(m.blue)?.club ?? null,
        red_slot: m.round === 1 ? m.red : null, blue_slot: m.round === 1 ? m.blue : null }));
    }
    const podium = confirmed ? podiumFrom(matches)?.map((p) => ({ ...p, full_name: byId.get(p.registration_id)?.full_name, club: byId.get(p.registration_id)?.club })) ?? null : null;
    return { category: catWithCounts(k.id), confirmed, competitors: present, order, matches, podium };
  });
  r('PUT', '/api/categories/:id/bracket/order', 'category:run', (c) => {
    const k = bracketCat(c, c.params[0]);
    if (k.status !== 'in_progress') throw new HttpError(409, 'La categoría no está en curso');
    if (k.bracket_confirmed_at) throw new HttpError(409, 'El emparejamiento ya fue confirmado');
    const ids = presentRegs(k.id).map((p) => p.registration_id), order = c.body.order;
    if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || !order.every((id: string) => ids.includes(id))) throw new HttpError(400, 'El orden debe incluir a cada competidor presente una sola vez');
    updateRow('categories', k.id, { bracket_order: JSON.stringify(order) });
    return { order };
  });
  r('POST', '/api/categories/:id/bracket/shuffle', 'category:run', (c) => {
    const k = bracketCat(c, c.params[0]);
    if (k.status !== 'in_progress' || k.bracket_confirmed_at) throw new HttpError(409, 'Ya no se puede volver a sortear');
    updateRow('categories', k.id, { bracket_order: null });
    return { order: ensureOrder({ ...k, bracket_order: null }, presentRegs(k.id)) };
  });
  r('POST', '/api/categories/:id/bracket/confirm', 'category:run', (c) => {
    const k = bracketCat(c, c.params[0]);
    if (k.status !== 'in_progress') throw new HttpError(409, 'La categoría no está en curso');
    if (k.bracket_confirmed_at) throw new HttpError(409, 'El emparejamiento ya fue confirmado');
    const present = presentRegs(k.id);
    if (!present.length) throw new HttpError(400, 'No hay competidores presentes');
    const order = ensureOrder(k, present), now = new Date().toISOString(), plan = planBracket(order.length).sort(playOrder);
    tx(() => {
      let n = 0;
      for (const m of plan) insertRow('matches', { id: randomUUID(), category_id: k.id, kind: m.kind, round: m.round, position: m.position, number: m.bye ? null : ++n, bye: m.bye ? 1 : 0,
        red_id: m.red == null ? null : order[m.red], blue_id: m.blue == null ? null : order[m.blue],
        status: m.bye ? 'finished' : 'pending', winner_id: m.bye ? order[m.red!] : null, finished_at: m.bye ? now : null });
      updateRow('categories', k.id, { bracket_confirmed_at: now });
    });
    audit(c.user, 'bracket-confirm', 'category', k.id, { competitors: order.length });
    return { confirmed: true };
  });
  r('POST', '/api/categories/:id/bracket/reset', 'category:write', (c) => {
    const k = bracketCat(c, c.params[0]);
    if (!k.bracket_confirmed_at) throw new HttpError(409, 'El emparejamiento no está confirmado');
    if (db.prepare("SELECT 1 FROM matches WHERE category_id = ? AND bye = 0 AND status != 'pending'").get(k.id)) throw new HttpError(409, 'Ya hay combates iniciados o terminados');
    tx(() => { db.prepare('DELETE FROM matches WHERE category_id = ?').run(k.id); updateRow('categories', k.id, { bracket_confirmed_at: null }); });
    audit(c.user, 'bracket-reset', 'category', k.id);
    return { confirmed: false };
  });

  // ---- Kata (y kata con arma / especiales): 3 jueces, nota de 9.90 a 9.99 cada uno. Total = suma; promedio = total / 3.
  const kataCat = (c: Ctx, id: string) => {
    const k = getCategory(id); catAccess(c.user, k);
    if (usesBracket(k)) throw new HttpError(400, 'Esta modalidad se juega por combates, no por notas de jueces');
    return k;
  };
  const kataState = (k: any) => {
    const present = presentRegs(k.id), byId = new Map(present.map((p) => [p.registration_id, p]));
    const order = ensureOrder(k, present);
    const sc = new Map((db.prepare('SELECT * FROM kata_scores WHERE category_id = ?').all(k.id) as any[]).map((x) => [x.registration_id, x]));
    const rows = order.map((id, i) => {
      const p = byId.get(id), s = sc.get(id);
      return { registration_id: id, turn: i + 1, full_name: p.full_name, club: p.club, belt: p.belt, photo_url: p.photo_url, seconds: s?.seconds ?? null, j1: s?.j1 ?? null, j2: s?.j2 ?? null, j3: s?.j3 ?? null, total: s?.total ?? null };
    });
    const ranked = rankKata(rows), pending = ranked.filter((r) => r.total == null).length;
    const tied = podiumTies(rows).map((g) => g.map((r) => ({ registration_id: r.registration_id, full_name: r.full_name, total: r.total })));
    const tiedIds = new Set(tied.flat().map((r) => r.registration_id));
    return { competitors: ranked.map((r) => ({ ...r, tied: tiedIds.has(r.registration_id) })), pending, complete: ranked.length > 0 && pending === 0, ties: tied, podium: kataPodium(rows) };
  };
  r('GET', '/api/categories/:id/kata', 'event:read', (c) => {
    const k = kataCat(c, c.params[0]);
    if (!['in_progress', 'finished'].includes(k.status)) throw new HttpError(409, 'Inicia la categoría para ver la tabla de clasificación');
    const st = kataState(k);
    return { category: catWithCounts(k.id), ...st, podium: st.podium?.map((p) => ({ ...p, full_name: st.competitors.find((x) => x.registration_id === p.registration_id)!.full_name })) ?? null };
  });
  r('POST', '/api/categories/:id/kata/shuffle', 'category:run', (c) => {
    const k = kataCat(c, c.params[0]);
    if (k.status !== 'in_progress') throw new HttpError(409, 'La categoría no está en curso');
    if (db.prepare('SELECT 1 FROM kata_scores WHERE category_id = ?').get(k.id)) throw new HttpError(409, 'Ya hay notas registradas: no se puede cambiar el orden');
    updateRow('categories', k.id, { bracket_order: null });
    return kataState({ ...k, bracket_order: null });
  });
  // Registra o corrige la nota de un competidor (corregir = volver a enviar). Los jueces pueden cambiarla mientras la categoría siga en curso.
  r('PUT', '/api/categories/:id/kata/:rid/scores', 'category:run', (c) => {
    const k = kataCat(c, c.params[0]), rid = c.params[1];
    if (k.status !== 'in_progress') throw new HttpError(409, 'La categoría no está en curso');
    if (!presentRegs(k.id).some((p) => p.registration_id === rid)) throw new HttpError(404, 'Competidor no encontrado entre los presentes de esta categoría');
    const j = [1, 2, 3].map((n) => parseScore(c.body[`j${n}`]));
    if (j.some((x) => x == null)) throw new HttpError(400, 'Las notas de los 3 jueces son obligatorias y van de 9.90 a 9.99');
    const [j1, j2, j3] = j as number[], total = j1 + j2 + j3;
    const seconds = c.body.seconds == null || c.body.seconds === '' ? null : intIn('Tiempo de presentación', 0, 3600)(c.body.seconds);
    db.prepare(`INSERT INTO kata_scores (category_id, registration_id, j1, j2, j3, total, seconds, scored_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (category_id, registration_id) DO UPDATE SET j1 = excluded.j1, j2 = excluded.j2, j3 = excluded.j3, total = excluded.total, seconds = COALESCE(excluded.seconds, kata_scores.seconds), scored_by = excluded.scored_by, scored_at = datetime('now')`)
      .run(k.id, rid, j1, j2, j3, total, seconds, c.user.id);
    audit(c.user, 'kata-score', 'category', k.id, { registration_id: rid, j1, j2, j3, total, judges: JUDGES });
    return { registration_id: rid, j1, j2, j3, total, seconds };
  });

  const liveMatch = (c: Ctx) => {
    const m = getMatch(c.params[0]), k = getCategory(m.category_id);
    catAccess(c.user, k);
    if (k.status !== 'in_progress') throw new HttpError(409, 'La categoría no está en curso');
    if (m.status === 'finished') throw new HttpError(409, 'El combate ya terminó');
    if (!m.red_id || !m.blue_id) throw new HttpError(400, 'El combate todavía no tiene los dos competidores');
    return m;
  };
  r('GET', '/api/matches/:id', 'event:read', (c) => {
    const m = getMatch(c.params[0]), k = getCategory(m.category_id);
    catAccess(c.user, k);
    return { match: m, category: catWithCounts(k.id) };
  });
  r('POST', '/api/matches/:id/start', 'category:run', (c) => {
    const m = liveMatch(c);
    if (m.status === 'pending') updateRow('matches', m.id, { status: 'in_progress', started_at: new Date().toISOString() });
    return getMatch(m.id);
  });
  r('PATCH', '/api/matches/:id/score', 'category:run', (c) => {
    const m = liveMatch(c), o: any = {};
    field(c.body, o, 'red_score', intIn('Puntos del rojo', 0, 999)); field(c.body, o, 'blue_score', intIn('Puntos del azul', 0, 999)); field(c.body, o, 'seconds_left', intIn('Tiempo', 0, 3600));
    for (const k of Object.keys(o)) if (o[k] === null) delete o[k];
    updateRow('matches', m.id, o);
    return getMatch(m.id);
  });
  r('POST', '/api/matches/:id/finish', 'category:run', (c) => {
    const m = liveMatch(c);
    if (m.red_score === m.blue_score) throw new HttpError(400, 'Hay empate: desempata antes de finalizar');
    const winner = m.red_score > m.blue_score ? m.red_id : m.blue_id, loser = winner === m.red_id ? m.blue_id : m.red_id;
    tx(() => {
      updateRow('matches', m.id, { status: 'finished', winner_id: winner, started_at: m.started_at ?? new Date().toISOString(), finished_at: new Date().toISOString() });
      if (m.kind !== 'main') return;
      const total = (db.prepare("SELECT MAX(round) AS n FROM matches WHERE category_id = ? AND kind = 'main'").get(m.category_id) as any).n;
      const slot = m.position % 2 === 1 ? 'red_id' : 'blue_id';
      if (m.round < total) db.prepare(`UPDATE matches SET ${slot} = ? WHERE category_id = ? AND kind = 'main' AND round = ? AND position = ?`).run(winner, m.category_id, m.round + 1, Math.ceil(m.position / 2));
      if (m.round === total - 1) db.prepare(`UPDATE matches SET ${slot} = ? WHERE category_id = ? AND kind = 'bronze'`).run(loser, m.category_id); // el perdedor de semifinal va por el 3.er lugar
    });
    audit(c.user, 'match-finish', 'match', m.id, { winner });
    return getMatch(m.id);
  });

  function currentUser(req: IncomingMessage) {
    const tok = /(?:^|;\s*)dokan_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    const t = tok && verify(tok, secret);
    if (!t) return null;
    const u: any = db.prepare('SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.active = 1').get(t.uid);
    if (u) u.permissions = permsOf(u.role_id);
    return u ?? null;
  }

  async function serveStatic(pathname: string, out: any) {
    let rel: string;
    try { rel = normalize(decodeURIComponent(pathname)); } catch { return out(400, 'Solicitud inválida', 'text/plain'); }
    if (rel.includes('..')) return out(404, 'No encontrado', 'text/plain');
    if (rel === '/' || rel === '\\') rel = 'index.html';
    try { return out(200, await readFile(join(WEB, rel)), MIME[extname(rel)] ?? 'application/octet-stream'); }
    catch { return out(404, 'No encontrado', 'text/plain'); }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const out = (status: number, body: string | Buffer, type: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'", ...headers });
      res.end(body);
    };
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return out(405, 'Método no permitido', 'text/plain');
        return await serveStatic(url.pathname, out);
      }
      const route = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!route) throw new HttpError(404, 'Ruta no encontrada');
      let body: any = {};
      if (req.method !== 'GET') {
        if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Se esperaba contenido JSON');
        body = await readBody(req);
      }
      const user = currentUser(req);
      if (route.perm !== 'public') {
        if (!user) throw new HttpError(401, 'Inicia sesión para continuar');
        if (route.perm && !user.permissions.includes(route.perm)) throw new HttpError(403, 'No tienes permiso para esta acción');
      }
      const c: Ctx = { user, params: route.re.exec(url.pathname)!.slice(1).map(decodeURIComponent), body, query: url.searchParams, ip: req.socket.remoteAddress ?? '', status: 200, headers: {} };
      const data = await route.fn(c);
      out(c.status, JSON.stringify(data ?? {}), JSON_T, c.headers);
    } catch (e: any) {
      if (e instanceof HttpError) return out(e.status, JSON.stringify({ error: e.message, ...e.extra }), JSON_T);
      console.error(e);
      out(500, JSON.stringify({ error: 'Error interno del servidor' }), JSON_T);
    }
  });
}
