import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, createUser } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { planBracket, podiumFrom } from '../src/bracket.ts';

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

// Categoría de combate con N competidores presentes y en curso
async function inProgress(n: number, name = 'Evento') {
  const a = await login('admin@t.gt');
  const ev = (await call('POST', '/api/events', { name, start_date: '2099-05-01', end_date: '2099-05-01', ring_count: 2 }, a)).data;
  await call('POST', `/api/events/${ev.id}/categories/import`, { rows: [{ code: 'C1', name: 'Combate a puntos', modality: 'Cuartetas', gender: 'mixed', ring: '1', start_time: '09:00' }, { code: 'KT1', name: 'Kata', modality: 'Kata Tradicional', gender: 'mixed', ring: '1' }] }, a);
  const cats = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data, cat = cats.find((c: any) => c.code === 'C1'), kata = cats.find((c: any) => c.code === 'KT1');
  const names = ['Ana', 'Beto', 'Carla', 'Dani', 'Eva', 'Fito', 'Gina', 'Hugo'].slice(0, n);
  for (const nm of names) await call('POST', `/api/events/${ev.id}/registrations`, { full_name: nm, gender: 'M', age: 8, belt: 'Blanca', club: 'Dragones', category_ids: [cat.id, kata.id] }, a);
  const comps = (await call('GET', `/api/categories/${cat.id}/competitors`, undefined, a)).data.competitors;
  for (const c of comps) await call('PATCH', `/api/registrations/${c.registration_id}/attendance`, { attendance: 'present' }, a);
  const [r1] = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data;
  await call('POST', `/api/categories/${cat.id}/call`, {}, a); await call('POST', `/api/categories/${cat.id}/announced`, {}, a);
  await call('POST', `/api/categories/${cat.id}/start`, {}, a);
  return { a, ev, cat, kata, r1, comps };
}
// Juega un combate: gana el rojo (o el azul) por 1 punto
async function play(a: string, m: any, winner: 'red' | 'blue' = 'red') {
  assert.equal((await call('POST', `/api/matches/${m.id}/start`, {}, a)).status, 200);
  await call('PATCH', `/api/matches/${m.id}/score`, { red_score: winner === 'red' ? 3 : 1, blue_score: winner === 'blue' ? 3 : 1, seconds_left: 40 }, a);
  return call('POST', `/api/matches/${m.id}/finish`, {}, a);
}

test('planBracket: pasan directo, rondas y combate por el 3.er lugar', () => {
  const shape = (n: number) => planBracket(n).map((m) => `${m.kind[0]}${m.round}.${m.position}${m.bye ? 'b' : ''}`).join(' ');
  assert.equal(shape(1), 'm1.1b');
  assert.equal(shape(2), 'm1.1');                                  // solo final
  assert.equal(shape(3), 'm1.1b m1.2 m2.1');                       // uno pasa directo, sin combate por el 3.º
  assert.equal(shape(4), 'm1.1 m1.2 m2.1 b2.1');                   // semifinales, final y 3.er lugar
  assert.equal(planBracket(3)[2].red, 0);                          // quien pasó directo ya está en la final
  assert.equal(planBracket(5).filter((m) => m.bye).length, 3);
  assert.equal(planBracket(8).filter((m) => m.round === 1).length, 4);
  assert.ok(planBracket(8).some((m) => m.kind === 'bronze'));
  const mk = (kind: string, round: number, position: number, red: string, blue: string | null, winner: string | null, bye = 0) => ({ kind, round, position, red_id: red, blue_id: blue, winner_id: winner, bye });
  assert.deepEqual(podiumFrom([mk('main', 1, 1, 'A', null, 'A', 1)]), [{ place: 1, registration_id: 'A' }]);
  assert.equal(podiumFrom([mk('main', 1, 1, 'A', 'B', null)]), null);
});

test('flujo completo con 4 competidores: sorteo editable, semifinales, 3.er lugar, final y cierre', async () => {
  const { a, cat, comps } = await inProgress(4);
  const d = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data;
  assert.equal(d.confirmed, false);
  assert.equal(d.order.length, 4);
  assert.deepEqual(d.matches.map((m: any) => `${m.kind[0]}${m.round}.${m.position}`), ['m1.1', 'm1.2', 'b2.1', 'm2.1']);
  assert.equal(d.matches[0].red_slot, 0);

  const sorted = comps.map((c: any) => c.registration_id);
  assert.equal((await call('PUT', `/api/categories/${cat.id}/bracket/order`, { order: sorted.slice(1) }, a)).status, 400);      // falta uno
  assert.equal((await call('PUT', `/api/categories/${cat.id}/bracket/order`, { order: sorted }, a)).status, 200);
  assert.equal((await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data.matches[0].red_id, sorted[0]);       // el orden se conserva
  assert.equal((await call('POST', `/api/categories/${cat.id}/bracket/shuffle`, {}, a)).data.order.length, 4);
  await call('PUT', `/api/categories/${cat.id}/bracket/order`, { order: sorted }, a);

  assert.equal((await call('POST', `/api/categories/${cat.id}/bracket/confirm`, {}, a)).status, 200);
  assert.equal((await call('PATCH', `/api/registrations/${sorted[0]}/attendance`, { attendance: 'absent' }, a)).status, 409);   // ya no se puede cambiar
  assert.equal((await call('PUT', `/api/categories/${cat.id}/bracket/order`, { order: sorted }, a)).status, 409);
  let { matches, podium } = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data;
  assert.equal(podium, null);
  assert.deepEqual(matches.map((m: any) => m.number), [1, 2, 3, 4]);
  const [s1, s2, bronze, final] = matches;

  assert.equal((await call('POST', `/api/matches/${final.id}/start`, {}, a)).status, 400);       // la final aún no tiene competidores
  await call('POST', `/api/matches/${s1.id}/start`, {}, a);
  await call('PATCH', `/api/matches/${s1.id}/score`, { red_score: 2, blue_score: 2 }, a);
  assert.match((await call('POST', `/api/matches/${s1.id}/finish`, {}, a)).data.error, /empate/i);                 // empate: no se puede finalizar
  await call('PATCH', `/api/matches/${s1.id}/score`, { red_score: 3, blue_score: 2 }, a);
  const f1 = await call('POST', `/api/matches/${s1.id}/finish`, {}, a);
  assert.equal(f1.data.winner_id, s1.red_id);
  assert.equal((await call('POST', `/api/matches/${s1.id}/finish`, {}, a)).status, 409);                          // ya terminó
  await play(a, s2, 'blue');

  matches = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data.matches;
  assert.deepEqual([matches[3].red_id, matches[3].blue_id], [s1.red_id, s2.blue_id]);                              // ganadores a la final
  assert.deepEqual([matches[2].red_id, matches[2].blue_id], [s1.blue_id, s2.red_id]);                              // perdedores al 3.er lugar
  assert.equal((await call('POST', `/api/categories/${cat.id}/close`, { results: [{ registration_id: s1.red_id, place: 1 }] }, a)).status, 409); // faltan combates
  await play(a, matches[2], 'red'); await play(a, matches[3], 'blue');

  const end = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data;
  assert.deepEqual(end.podium.map((p: any) => p.place), [1, 2, 3, 4]);
  assert.equal(end.podium[0].registration_id, s2.blue_id);                                                         // ganó la final el azul
  assert.equal(end.podium[2].registration_id, s1.blue_id);
  const closed = await call('POST', `/api/categories/${cat.id}/close`, { results: end.podium.map((p: any) => ({ registration_id: p.registration_id, place: p.place })) }, a);
  assert.equal(closed.data.status, 'finished');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM results WHERE category_id = ?').get(cat.id).n, 4);
});

test('3 competidores: uno pasa directo y el perdedor de la semifinal es 3.º; 1 competidor: campeón directo', async () => {
  const { a, cat } = await inProgress(3, 'Tres');
  await call('POST', `/api/categories/${cat.id}/bracket/confirm`, {}, a);
  let d = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data;
  assert.deepEqual(d.matches.map((m: any) => `${m.round}.${m.position}${m.bye ? 'b' : ''}`), ['1.1b', '1.2', '2.1']);
  assert.equal(d.matches[2].red_id, d.matches[0].red_id);
  await play(a, d.matches[1], 'blue');
  d = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data;
  await play(a, d.matches[2], 'red');
  d = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data;
  assert.deepEqual(d.podium.map((p: any) => p.place), [1, 2, 3]);

  const one = await inProgress(1, 'Uno');
  await call('POST', `/api/categories/${one.cat.id}/bracket/confirm`, {}, one.a);
  const o = (await call('GET', `/api/categories/${one.cat.id}/bracket`, undefined, one.a)).data;
  assert.deepEqual(o.podium.map((p: any) => p.place), [1]);
});

test('deshacer emparejamiento solo si no hay combates jugados; kata no usa llaves; permisos por ring', async () => {
  const { a, ev, cat, kata, r1 } = await inProgress(4, 'Reglas');
  assert.equal((await call('GET', `/api/categories/${kata.id}/bracket`, undefined, a)).status, 400);
  const op = (await call('POST', '/api/users', { email: 'o1@t.gt', name: 'O1', password: PW, role_id: 'ring_operator' }, a)).data;
  const other = (await call('POST', '/api/users', { email: 'o2@t.gt', name: 'O2', password: PW, role_id: 'ring_operator' }, a)).data;
  const r2 = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data[1];
  await call('PATCH', `/api/rings/${r1.id}`, { operator_id: op.id }, a); await call('PATCH', `/api/rings/${r2.id}`, { operator_id: other.id }, a);
  const o1 = await login('o1@t.gt'), o2 = await login('o2@t.gt');
  assert.equal((await call('GET', `/api/categories/${cat.id}/bracket`, undefined, o1)).status, 200);
  assert.equal((await call('GET', `/api/categories/${cat.id}/bracket`, undefined, o2)).status, 403);
  assert.equal((await call('POST', `/api/categories/${cat.id}/bracket/confirm`, {}, o2)).status, 403);
  assert.equal((await call('POST', `/api/categories/${cat.id}/bracket/confirm`, {}, o1)).status, 200);
  assert.equal((await call('POST', `/api/categories/${cat.id}/bracket/reset`, {}, o1)).status, 403);                // solo coordinación
  const m = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data.matches[0];
  assert.equal((await call('POST', `/api/matches/${m.id}/start`, {}, o2)).status, 403);
  await call('POST', `/api/matches/${m.id}/start`, {}, o1);
  assert.equal((await call('POST', `/api/categories/${cat.id}/bracket/reset`, {}, a)).status, 409);                 // ya hay un combate en curso
  const m2 = (await call('GET', `/api/categories/${cat.id}/bracket`, undefined, a)).data.matches[1];
  await play(a, m, 'red'); // termina el 1.º
  assert.equal(m2.status, 'pending');
});
