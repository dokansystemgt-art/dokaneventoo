import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, createUser } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { parseScore, rankKata, podiumTies, kataPodium } from '../src/kata.ts';

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
const login = async (email: string) => { const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) }); return r.headers.getSetCookie()[0].split(';')[0]; };

async function kataInProgress(n: number, modality = 'Kata Tradicional') {
  const a = await login('admin@t.gt');
  const ev = (await call('POST', '/api/events', { name: 'Kata ' + modality, start_date: '2099-05-01', end_date: '2099-05-01', ring_count: 1 }, a)).data;
  await call('POST', `/api/events/${ev.id}/categories/import`, { rows: [{ code: 'KT1', name: 'Kata', modality, gender: 'mixed', ring: '1', start_time: '09:00' }] }, a);
  const kata = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data.find((c: any) => c.code === 'KT1');
  for (const nm of ['Ana', 'Beto', 'Carla', 'Dani', 'Eva', 'Fito'].slice(0, n)) await call('POST', `/api/events/${ev.id}/registrations`, { full_name: nm, gender: 'M', age: 8, belt: 'Blanca', club: 'Dragones', category_ids: [kata.id] }, a);
  const comps = (await call('GET', `/api/categories/${kata.id}/competitors`, undefined, a)).data.competitors;
  for (const c of comps) await call('PATCH', `/api/registrations/${c.registration_id}/attendance`, { attendance: 'present' }, a);
  await call('POST', `/api/categories/${kata.id}/call`, {}, a); await call('POST', `/api/categories/${kata.id}/announced`, {}, a);
  assert.equal((await call('POST', `/api/categories/${kata.id}/start`, {}, a)).status, 200);
  return { a, kata, comps };
}
const score = (a: string, kid: string, rid: string, j1: any, j2: any, j3: any) => call('PUT', `/api/categories/${kid}/kata/${rid}/scores`, { j1, j2, j3 }, a);
const table = async (a: string, kid: string) => (await call('GET', `/api/categories/${kid}/kata`, undefined, a)).data;

test('lógica: notas válidas 9.90–9.99, lugares y empates', () => {
  assert.equal(parseScore('9.95'), 995); assert.equal(parseScore('9,9'), 990); assert.equal(parseScore(9.99), 999);
  for (const bad of ['9.89', '10', '9.955', '', 'abc', null, 0]) assert.equal(parseScore(bad), null);
  const rows = [{ registration_id: 'a', total: 2985 }, { registration_id: 'b', total: 2990 }, { registration_id: 'c', total: 2985 }, { registration_id: 'd', total: null }];
  assert.deepEqual(rankKata(rows).map((r) => r.rank), [2, 1, 2, null]);
  assert.equal(podiumTies(rows).length, 1);
  assert.equal(kataPodium(rows), null); // falta d y hay empate
  const ok = [{ registration_id: 'a', total: 2980 }, { registration_id: 'b', total: 2990 }, { registration_id: 'c', total: 2970 }];
  assert.deepEqual(kataPodium(ok), [{ place: 1, registration_id: 'b' }, { place: 2, registration_id: 'a' }, { place: 3, registration_id: 'c' }]);
  // un empate fuera de los 4 primeros no bloquea
  const five = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ registration_id: id, total: [2990, 2985, 2980, 2975, 2970, 2970][i] }));
  assert.equal(podiumTies(five).length, 0); assert.equal(kataPodium(five)!.length, 4);
});

test('kata completo: notas, total, tabla ordenada y cierre con los lugares', async () => {
  const { a, kata, comps } = await kataInProgress(4);
  const [c1, c2, c3, c4] = comps.map((c: any) => c.registration_id);
  const first = await call('PUT', `/api/categories/${kata.id}/kata/${c1}/scores`, { j1: '9.90', j2: '9.95', j3: '9.99', seconds: 95 }, a);
  assert.equal(first.data.total, 2984); assert.equal(first.data.seconds, 95);
  assert.equal((await call('PUT', `/api/categories/${kata.id}/kata/${c1}/scores`, { j1: '9.90', j2: '9.95', j3: '9.99', seconds: -3 }, a)).status, 400);
  assert.equal((await score(a, kata.id, c1, '9.90', '9.95', '9.99')).data.seconds, null);      // corregir sin tiempo no borra el guardado
  { const r = (await table(a, kata.id)).competitors.find((x: any) => x.registration_id === c1); assert.equal(r.seconds, 95); assert.equal(r.belt, 'Blanca'); }
  await score(a, kata.id, c2, '9.99', '9.99', '9.98'); await score(a, kata.id, c3, '9.91', '9.92', '9.93');
  let t = await table(a, kata.id);
  assert.equal(t.complete, false); assert.equal(t.pending, 1); assert.equal(t.podium, null);
  assert.equal((await call('POST', `/api/categories/${kata.id}/close`, { results: [] }, a)).status, 409);
  await score(a, kata.id, c4, '9.90', '9.90', '9.90');
  t = await table(a, kata.id);
  assert.equal(t.complete, true); assert.equal(t.ties.length, 0);
  assert.deepEqual(t.podium.map((p: any) => p.registration_id), [c2, c1, c3, c4]);
  // aunque el cliente mande otros lugares, mandan las notas
  const close = await call('POST', `/api/categories/${kata.id}/close`, { results: [{ registration_id: c4, place: 1 }] }, a);
  assert.equal(close.status, 200);
  const closed = (await call('GET', `/api/events/${kata.event_id}/closed`, undefined, a)).data[0];
  assert.deepEqual(closed.podium.map((p: any) => [p.place, p.full_name]), [[1, comps.find((c: any) => c.registration_id === c2).full_name], [2, comps.find((c: any) => c.registration_id === c1).full_name], [3, comps.find((c: any) => c.registration_id === c3).full_name], [4, comps.find((c: any) => c.registration_id === c4).full_name]]);
});

test('empate: bloquea el cierre hasta que los jueces corrigen la nota oficial', async () => {
  const { a, kata, comps } = await kataInProgress(3, 'Kata con Arma');
  const [c1, c2, c3] = comps.map((c: any) => c.registration_id);
  await score(a, kata.id, c1, '9.95', '9.95', '9.95'); await score(a, kata.id, c2, '9.96', '9.95', '9.94'); await score(a, kata.id, c3, '9.90', '9.91', '9.92');
  const t = await table(a, kata.id);
  assert.equal(t.ties.length, 1); assert.equal(t.ties[0].length, 2); assert.ok(t.competitors.filter((c: any) => c.tied).length === 2);
  const blocked = await call('POST', `/api/categories/${kata.id}/close`, {}, a);
  assert.equal(blocked.status, 409); assert.equal(blocked.data.ties?.length, 1);
  assert.equal((await score(a, kata.id, c2, '9.97', '9.95', '9.94')).status, 200); // los jueces corrigen
  assert.equal((await table(a, kata.id)).ties.length, 0);
  assert.equal((await call('POST', `/api/categories/${kata.id}/close`, {}, a)).status, 200);
});

test('validaciones de notas, orden y permisos', async () => {
  const { a, kata, comps } = await kataInProgress(2, 'Especiales');
  const rid = comps[0].registration_id;
  for (const bad of [['9.89', '9.95', '9.95'], ['10', '9.95', '9.95'], ['9.95', '', '9.95'], ['9.955', '9.95', '9.95']]) assert.equal((await score(a, kata.id, rid, ...bad)).status, 400);
  assert.equal((await score(a, kata.id, 'no-existe', '9.95', '9.95', '9.95')).status, 404);
  assert.equal((await call('POST', `/api/categories/${kata.id}/kata/shuffle`, {}, a)).status, 200);
  await score(a, kata.id, rid, '9.95', '9.95', '9.95');
  assert.equal((await call('POST', `/api/categories/${kata.id}/kata/shuffle`, {}, a)).status, 409); // ya hay notas
  assert.equal((await call('GET', `/api/categories/${kata.id}/bracket`, undefined, a)).status, 400); // kata no usa llaves
  assert.equal((await call('GET', '/api/categories/x/kata')).status, 401);
});

test('una categoría de combate no usa las notas de kata', async () => {
  const a = await login('admin@t.gt');
  const ev = (await call('POST', '/api/events', { name: 'Combate', start_date: '2099-05-01', end_date: '2099-05-01' }, a)).data;
  await call('POST', `/api/events/${ev.id}/categories/import`, { rows: [{ code: 'C1', name: 'Combate', modality: 'Cuartetas' }] }, a);
  const cat = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data[0];
  assert.equal((await call('GET', `/api/categories/${cat.id}/kata`, undefined, a)).status, 400);
});
