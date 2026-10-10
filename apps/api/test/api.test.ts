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

async function call(method: string, path: string, body?: any, cookie = '', type = 'application/json') {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': type, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any, cookie: res.headers.getSetCookie()[0]?.split(';')[0] ?? '' };
}
const login = async (email: string) => (await call('POST', '/api/auth/login', { email, password: PW })).cookie;
const EV = { name: 'Copa Guatemala 2026', start_date: '2099-11-14', end_date: '2099-11-15', ring_count: 4 };

test('sin sesión no se accede a los datos', async () => {
  assert.equal((await call('GET', '/api/events')).status, 401);
});

test('login: clave incorrecta rechazada y clave correcta devuelve permisos', async () => {
  assert.equal((await call('POST', '/api/auth/login', { email: 'admin@t.gt', password: 'mala-clave-123' })).status, 401);
  const ok = await call('POST', '/api/auth/login', { email: 'ADMIN@t.gt', password: PW });
  assert.equal(ok.status, 200);
  const me = await call('GET', '/api/auth/me', undefined, ok.cookie);
  assert.equal(me.data.user.role, 'admin');
  assert.ok(me.data.user.permissions.includes('user:manage'));
});

test('login: bloquea tras 5 intentos fallidos', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/login', { email: 'x@t.gt', password: 'nope' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'x@t.gt', password: 'nope' })).status, 429);
});

test('eventos: crear, editar, duplicar, filtrar y archivar', async () => {
  const c = await login('admin@t.gt');
  const created = await call('POST', '/api/events', EV, c);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(created.data.status, 'draft');

  const upd = await call('PATCH', `/api/events/${id}`, { status: 'active', ring_count: 6 }, c);
  assert.equal(upd.data.status, 'active');
  assert.equal(upd.data.ring_count, 6);
  assert.equal((await call('GET', '/api/events?view=active', undefined, c)).data.length, 1);
  assert.equal((await call('GET', '/api/events?q=guatemala', undefined, c)).data.length, 1);

  const dup = await call('POST', `/api/events/${id}/duplicate`, {}, c);
  assert.equal(dup.data.name, 'Copa Guatemala 2026 (copia)');
  assert.equal(dup.data.cloned_from, id);
  assert.equal(dup.data.status, 'draft');
  assert.equal((await call('GET', '/api/events?view=upcoming', undefined, c)).data.length, 2);

  assert.equal((await call('POST', `/api/events/${id}/archive`, {}, c)).data.status, 'archived');
  assert.equal((await call('GET', '/api/events', undefined, c)).data.length, 1);
  assert.equal((await call('GET', '/api/events?view=archived', undefined, c)).data.length, 1);
  assert.equal((await call('PATCH', `/api/events/${id}`, { name: 'Otro' }, c)).status, 409);
});

test('eventos: valida los datos', async () => {
  const c = await login('admin@t.gt');
  assert.equal((await call('POST', '/api/events', { ...EV, end_date: '2099-11-01' }, c)).status, 400);
  assert.equal((await call('POST', '/api/events', { ...EV, ring_count: 0 }, c)).status, 400);
  assert.equal((await call('POST', '/api/events', { start_date: '2099-01-01', end_date: '2099-01-02' }, c)).status, 400);
  assert.equal((await call('POST', '/api/events', { ...EV, status: 'archived' }, c)).status, 400);
});

test('permisos: coordinador y operador tienen alcance limitado', async () => {
  const a = await login('admin@t.gt');
  for (const [email, role_id] of [['coord@t.gt', 'coordinator'], ['ring@t.gt', 'ring_operator']])
    assert.equal((await call('POST', '/api/users', { email, name: role_id, password: PW, role_id }, a)).status, 201);
  assert.equal((await call('POST', '/api/users', { email: 'coord@t.gt', name: 'x', password: PW, role_id: 'admin' }, a)).status, 409);

  const coord = await login('coord@t.gt'), ring = await login('ring@t.gt');
  assert.equal((await call('GET', '/api/events', undefined, coord)).status, 200);
  assert.equal((await call('POST', '/api/events', EV, coord)).status, 403);
  assert.equal((await call('GET', '/api/users', undefined, coord)).status, 403);
  assert.equal((await call('GET', '/api/events', undefined, ring)).status, 200);
  assert.equal((await call('POST', '/api/events/x/archive', {}, ring)).status, 403);
});

test('seguridad: las modificaciones exigen JSON', async () => {
  const c = await login('admin@t.gt');
  assert.equal((await call('POST', '/api/events', EV, c, 'text/plain')).status, 415);
});
