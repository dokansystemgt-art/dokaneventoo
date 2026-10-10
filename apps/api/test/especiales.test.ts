import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, createUser, syncUsers, assignDefaultOperators } from '../src/db.ts';
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
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}
const cookie = async () => (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@t.gt', password: PW }) })).headers.get('set-cookie')!.split(';')[0];

test('Gran Campeón y Seniors son combates; Kata Exhibición General es kata', async () => {
  const a = await cookie();
  const ev = (await call('POST', '/api/events', { name: 'E', start_date: '2099-05-01', end_date: '2099-05-01', ring_count: 1 }, a)).data;
  const rows = [
    { code: 'OPW-1', name: 'Gran Campeón · 18+ años · Cinta Negra · Masculino', modality: 'Especiales', gender: 'M' },
    { code: 'SN-01', name: 'Seniors · 25+ años · Cinta Negra · Masculino', modality: 'Especiales', gender: 'M' },
    { code: 'KEX-007', name: 'Kata Exhibición General · Toda edad · Toda cinta · Mixto', modality: 'Especiales', gender: 'mixed' },
  ];
  await call('POST', `/api/events/${ev.id}/categories/import`, { rows }, a);
  const cats = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data;
  const id = (c: string) => cats.find((x: any) => x.code === c).id;
  for (const c of ['OPW-1', 'SN-01']) {
    assert.notEqual((await call('GET', `/api/categories/${id(c)}/bracket`, undefined, a)).status, 400, c);
    assert.equal((await call('GET', `/api/categories/${id(c)}/kata`, undefined, a)).status, 400, c);
  }
  assert.notEqual((await call('GET', `/api/categories/${id('KEX-007')}/kata`, undefined, a)).status, 400); // 409 = aún no iniciada, pero sí es kata
  assert.equal((await call('GET', `/api/categories/${id('KEX-007')}/bracket`, undefined, a)).status, 400);
});

test('Ring 1 y Ring 2 quedan asignados a los rings 1 y 2 de cada evento', async () => {
  const a = await cookie();
  const ev = (await call('POST', '/api/events', { name: 'E2', start_date: '2099-06-01', end_date: '2099-06-01', ring_count: 2 }, a)).data;
  for (const [e, n] of [['dkring1@gmail.com', 'Ring 1'], ['dkring2@gmail.com', 'Ring 2']]) createUser(db, { email: e, name: n, password: 'clave-segura-1', role_id: 'ring_operator' });
  assignDefaultOperators(db);
  const rings = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data;
  assert.deepEqual(rings.map((r: any) => r.operator_name), ['Ring 1', 'Ring 2']);
});

test('se puede quitar a un competidor cuando su categoría ya empezó o terminó', async () => {
  const a = await cookie();
  const ev = (await call('POST', '/api/events', { name: 'E3', start_date: '2099-07-01', end_date: '2099-07-01', ring_count: 1 }, a)).data;
  await call('POST', `/api/events/${ev.id}/categories/import`, { rows: [{ code: 'Z1', name: 'Combate', modality: 'Cuartetas', gender: 'mixed' }] }, a);
  const cat = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data[0];
  for (const n of ['Ana', 'Beto']) await call('POST', `/api/events/${ev.id}/registrations`, { full_name: n, gender: 'M', age: 8, belt: 'Blanca', club: 'D', category_ids: [cat.id] }, a);
  const regs = (await call('GET', `/api/events/${ev.id}/registrations`, undefined, a)).data;
  assert.equal(regs[0].category_status, 'pending');
  const [r1, r2] = regs.map((r: any) => r.id);
  db.prepare("INSERT INTO matches (id, category_id, kind, round, position, number, red_id, blue_id, winner_id, status) VALUES ('m1', ?, 'main', 1, 1, 1, ?, ?, ?, 'finished')").run(cat.id, r1, r2, r1);
  db.prepare("INSERT INTO results (category_id, registration_id, place) VALUES (?, ?, 1)").run(cat.id, r1);
  db.prepare("UPDATE categories SET status = 'finished' WHERE id = ?").run(cat.id);
  assert.equal((await call('DELETE', `/api/registrations/${r1}`, {}, a)).status, 200);
  const m: any = db.prepare("SELECT red_id, winner_id FROM matches WHERE id = 'm1'").get();
  assert.equal(m.red_id, null); assert.equal(m.winner_id, null);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM results WHERE category_id = ?').get(cat.id) as any).n, 0);
});

test('syncUsers deja solo los 4 usuarios del sistema', () => {
  const r = syncUsers(db);
  assert.equal(r.kept, 4);
  const emails = (db.prepare('SELECT email FROM users ORDER BY email').all() as any[]).map((u) => u.email);
  assert.deepEqual(emails, ['dklocu@gmail.com', 'dkring1@gmail.com', 'dkring2@gmail.com', 'dokan.systemgt@gmail.com']);
});

