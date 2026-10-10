import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, createUser } from '../src/db.ts';
import { createApp } from '../src/app.ts';

const PW = 'clave-segura-1';
const db = openDb(':memory:');
createUser(db, { email: 'admin@t.gt', name: 'Admin', password: PW, role_id: 'admin' });
const server = createApp({ db, secret: 'secreto-de-prueba' });
await new Promise<void>((ok) => server.listen(0, ok));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => { server.closeAllConnections(); server.close(); });
async function call(method: string, path: string, body?: any, cookie = '') {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any, cookie: res.headers.getSetCookie()[0]?.split(';')[0] ?? '' };
}
const login = async (email: string) => (await call('POST', '/api/auth/login', { email, password: PW })).cookie;
const mkEvent = async (a: string, name = 'Copa 2099', ring_count = 2) =>
  (await call('POST', '/api/events', { name, start_date: '2099-05-01', end_date: '2099-05-01', ring_count }, a)).data;
const KUMITE = { code: 'KM-1', name: 'Kumite Masculino 14-15 años -55 kg', modality: 'Kumite', gender: 'M', age_min: 14, age_max: 15, weight_max: 55, belts: ['Verde', 'Azul'], max_participants: 16 };

test('rings: se crean con el evento, se agregan, editan y borran', async () => {
  const a = await login('admin@t.gt'), ev = await mkEvent(a, 'Copa 2099', 4);
  let rings = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data;
  assert.deepEqual(rings.map((r: any) => r.name), ['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4']);
  const nr = await call('POST', `/api/events/${ev.id}/rings`, { name: 'Ring Central', location: 'Cancha A' }, a);
  assert.equal(nr.data.number, 5);
  assert.equal((await call('PATCH', `/api/rings/${nr.data.id}`, { status: 'active' }, a)).data.status, 'active');
  assert.equal((await call('PATCH', `/api/events/${ev.id}`, { ring_count: 6 }, a)).status, 200);
  assert.equal((await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data.length, 6);
  assert.equal((await call('DELETE', `/api/rings/${nr.data.id}`, {}, a)).status, 200);
  rings = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data;
  assert.equal(rings.length, 5);
});

test('categorías: crear, validar, editar y evitar códigos repetidos', async () => {
  const a = await login('admin@t.gt'), ev = await mkEvent(a), other = await mkEvent(a, 'Otro');
  const ring = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data[0];
  const otherRing = (await call('GET', `/api/events/${other.id}/rings`, undefined, a)).data[0];
  const ok = await call('POST', `/api/events/${ev.id}/categories`, { ...KUMITE, ring_id: ring.id, start_time: '09:30' }, a);
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.data.belts, ['Verde', 'Azul']);
  assert.equal((await call('POST', `/api/events/${ev.id}/categories`, KUMITE, a)).status, 409);
  assert.equal((await call('POST', `/api/events/${ev.id}/categories`, { ...KUMITE, code: 'X', age_min: 20 }, a)).status, 400);
  assert.equal((await call('POST', `/api/events/${ev.id}/categories`, { ...KUMITE, code: 'Y', ring_id: otherRing.id }, a)).status, 400);
  assert.equal((await call('POST', `/api/events/${ev.id}/categories`, { code: 'Z', name: 'Sin modalidad' }, a)).status, 400);
  const upd = await call('PATCH', `/api/categories/${ok.data.id}`, { weight_max: 60, start_time: '10:00' }, a);
  assert.equal(upd.data.weight_max, 60);
  assert.equal((await call('GET', `/api/events/${ev.id}/categories?ring_id=${ring.id}`, undefined, a)).data.length, 1);
});

test('horario: ordena, calcula fin, marca cruces e incluye descansos', async () => {
  const a = await login('admin@t.gt'), ev = await mkEvent(a);
  const ring = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data[0];
  const mk = (code: string, start_time?: string, est_minutes = 30) =>
    call('POST', `/api/events/${ev.id}/categories`, { code, name: code, modality: 'Kata', ring_id: ring.id, start_time, est_minutes }, a);
  await mk('K2', '09:00', 60); await mk('K1', '08:00', 60); await mk('K3', '09:30'); await mk('K4');
  assert.equal((await call('POST', `/api/rings/${ring.id}/breaks`, { title: 'Descanso', start_time: '12:00', duration_min: 60 }, a)).status, 201);
  const { items, unscheduled } = (await call('GET', `/api/events/${ev.id}/schedule`, undefined, a)).data.rings[0];
  assert.deepEqual(items.map((i: any) => i.title), ['K1', 'K2', 'K3', 'Descanso']);
  assert.deepEqual(items.map((i: any) => i.end), ['09:00', '10:00', '10:00', '13:00']);
  assert.deepEqual(items.map((i: any) => i.conflict), [false, false, true, false]);
  assert.deepEqual(unscheduled.map((u: any) => u.code), ['K4']);
  assert.equal((await call('POST', `/api/rings/${ring.id}/breaks`, { title: 'x', start_time: '25:00', duration_min: 5 }, a)).status, 400);
});

test('operador de ring: solo ve su evento, su ring y sus categorías', async () => {
  const a = await login('admin@t.gt');
  const op = (await call('POST', '/api/users', { email: 'ring1@t.gt', name: 'Ring 1', password: PW, role_id: 'ring_operator' }, a)).data;
  const coord = (await call('POST', '/api/users', { email: 'c@t.gt', name: 'C', password: PW, role_id: 'coordinator' }, a)).data;
  const ev = await mkEvent(a, 'Evento con operador'), hidden = await mkEvent(a, 'Evento ajeno');
  const [r1, r2] = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data;
  assert.equal((await call('PATCH', `/api/rings/${r1.id}`, { operator_id: coord.id }, a)).status, 400);
  assert.equal((await call('PATCH', `/api/rings/${r1.id}`, { operator_id: op.id }, a)).data.operator_id, op.id);
  for (const [code, rid] of [['A', r1.id], ['B', r2.id]]) await call('POST', `/api/events/${ev.id}/categories`, { code, name: code, modality: 'Kata', ring_id: rid }, a);

  const o = await login('ring1@t.gt');
  assert.deepEqual((await call('GET', '/api/events', undefined, o)).data.map((e: any) => e.name), ['Evento con operador']);
  assert.equal((await call('GET', `/api/events/${hidden.id}`, undefined, o)).status, 404);
  assert.deepEqual((await call('GET', `/api/events/${ev.id}/rings`, undefined, o)).data.map((r: any) => r.id), [r1.id]);
  assert.deepEqual((await call('GET', `/api/events/${ev.id}/categories`, undefined, o)).data.map((c: any) => c.code), ['A']);
  assert.equal((await call('GET', `/api/events/${ev.id}/schedule`, undefined, o)).data.rings.length, 1);
  assert.equal((await call('POST', `/api/events/${ev.id}/categories`, KUMITE, o)).status, 403);
  assert.equal((await call('GET', '/api/operators', undefined, o)).status, 403);
  assert.equal((await call('GET', '/api/operators', undefined, await login('c@t.gt'))).data.length, 1);
});

test('duplicar evento copia rings, categorías y descansos (sin operador)', async () => {
  const a = await login('admin@t.gt'), ev = await mkEvent(a, 'Original');
  const ring = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data[0];
  await call('POST', `/api/events/${ev.id}/categories`, { ...KUMITE, ring_id: ring.id, start_time: '08:00', status: 'finished' }, a);
  await call('POST', `/api/rings/${ring.id}/breaks`, { title: 'Pausa', start_time: '10:00', duration_min: 15 }, a);
  const dup = (await call('POST', `/api/events/${ev.id}/duplicate`, {}, a)).data;
  const rings = (await call('GET', `/api/events/${dup.id}/rings`, undefined, a)).data;
  const cats = (await call('GET', `/api/events/${dup.id}/categories`, undefined, a)).data;
  assert.equal(rings.length, 2);
  assert.equal(cats.length, 1);
  assert.equal(cats[0].ring_id, rings[0].id);
  assert.notEqual(cats[0].ring_id, ring.id);
  assert.equal(cats[0].status, 'pending');
  assert.equal((await call('GET', `/api/events/${dup.id}/schedule`, undefined, a)).data.rings[0].items.length, 2);
});

test('usuarios: desactivar impide entrar y libera sus rings; no se puede desactivar a sí mismo', async () => {
  const a = await login('admin@t.gt');
  const me = (await call('GET', '/api/auth/me', undefined, a)).data.user;
  assert.equal((await call('PATCH', `/api/users/${me.id}`, { active: false }, a)).status, 400);
  const op = (await call('POST', '/api/users', { email: 'baja@t.gt', name: 'Baja', password: PW, role_id: 'ring_operator' }, a)).data;
  const ev = await mkEvent(a, 'Evento baja'), ring = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data[0];
  await call('PATCH', `/api/rings/${ring.id}`, { operator_id: op.id }, a);
  assert.equal((await call('PATCH', `/api/users/${op.id}`, { active: false }, a)).data.active, 0);
  assert.equal((await call('POST', '/api/auth/login', { email: 'baja@t.gt', password: PW })).status, 401);
  assert.equal((await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data[0].operator_id, null);
  assert.equal((await call('PATCH', `/api/users/${op.id}`, { password: 'corta' }, a)).status, 400);
});
