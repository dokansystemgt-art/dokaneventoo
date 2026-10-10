import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { openDb, createUser } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { parseCsv, categoriesFromCsv } from '../../web/csv.js';

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
const admin = async () => (await call('POST', '/api/auth/login', { email: 'admin@t.gt', password: PW })).cookie;
const mkEvent = async (a: string) => (await call('POST', '/api/events', { name: 'Importación', start_date: '2099-05-01', end_date: '2099-05-01', ring_count: 2 }, a)).data;

test('csv: comillas, CRLF, BOM y separador ; o ,', () => {
  assert.deepEqual(parseCsv('\uFEFFa;b\r\n"x;1";"di ""hola"""\r\n'), [['a', 'b'], ['x;1', 'di "hola"']]);
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  const { rows, errors } = categoriesFromCsv('Código;Nombre;Género;Cintas;Hora;Ring;Edad mín\nX-1;Algo;masculino;Blanca|Azul;8:30;2;5\nX-2;Otro;Femenino;;;;');
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], { code: 'X-1', name: 'Algo', gender: 'M', belts: ['Blanca', 'Azul'], start_time: '08:30', ring: '2', age_min: '5' });
  assert.deepEqual(rows[1], { code: 'X-2', name: 'Otro', gender: 'F' });
  assert.match(categoriesFromCsv('nombre;edad\nA;5').errors[0], /codigo/);
});

test('importar categorías: crea, actualiza, asigna ring por número y respeta los vacíos', async () => {
  const a = await admin(), ev = await mkEvent(a), url = `/api/events/${ev.id}/categories/import`;
  const r1 = await call('POST', url, { rows: [
    { code: 'A-1', name: 'Alfa', modality: 'Kata', gender: 'F', age_min: '8', age_max: '9', belts: ['Blanca'], ring: '2', start_time: '09:00' },
    { code: 'A-2', name: 'Beta', modality: 'Kumite', gender: 'M' }] }, a);
  assert.deepEqual(r1.data, { created: 2, updated: 0 });
  const r2 = await call('POST', url, { rows: [{ code: 'A-1', name: 'Alfa renombrada', level: 'Intermedio' }] }, a);
  assert.deepEqual(r2.data, { created: 0, updated: 1 });
  const cats = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data;
  const a1 = cats.find((c: any) => c.code === 'A-1');
  assert.equal(a1.name, 'Alfa renombrada');
  assert.equal(a1.level, 'Intermedio');
  assert.equal(a1.start_time, '09:00');   // lo que venía vacío no se toca
  assert.ok(a1.ring_id);
  assert.deepEqual(a1.belts, ['Blanca']);
});

test('importar categorías: si hay errores no se importa nada y se informan por fila', async () => {
  const a = await admin(), ev = await mkEvent(a), url = `/api/events/${ev.id}/categories/import`;
  const r = await call('POST', url, { rows: [
    { code: 'OK-1', name: 'Bien', modality: 'Kata' },
    { code: 'MAL-1', name: 'Sin modalidad' },
    { code: 'MAL-2', name: 'Ring falso', modality: 'Kata', ring: '9' },
    { code: 'MAL-3', name: 'Edades', modality: 'Kata', age_min: '20', age_max: '10' },
    { code: 'OK-1', name: 'Repetida', modality: 'Kata' }] }, a);
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.errors.map((e: any) => e.row), [3, 4, 5, 6]);
  assert.match(r.data.errors[1].message, /ring 9/);
  assert.equal((await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data.length, 0);
  assert.equal((await call('POST', url, { rows: [] }, a)).status, 400);
});

test('importar categorías: exige permiso', async () => {
  const a = await admin(), ev = await mkEvent(a);
  await call('POST', '/api/users', { email: 'op@t.gt', name: 'Op', password: PW, role_id: 'ring_operator' }, a);
  const op = (await call('POST', '/api/auth/login', { email: 'op@t.gt', password: PW })).cookie;
  assert.equal((await call('POST', `/api/events/${ev.id}/categories/import`, { rows: [{ code: 'X', name: 'x', modality: 'x' }] }, op)).status, 403);
});

test('el CSV del catálogo completo (133 categorías) se importa sin errores', async () => {
  const a = await admin(), ev = await mkEvent(a);
  const { rows, errors } = categoriesFromCsv(readFileSync(new URL('../../../ejemplos/categorias-dokan-2026.csv', import.meta.url), 'utf8'));
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 133);
  const r = await call('POST', `/api/events/${ev.id}/categories/import`, { rows }, a);
  assert.deepEqual(r.data, { created: 133, updated: 0 });
  const cats = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data;
  const c = cats.find((x: any) => x.code === 'CPL-002');
  assert.equal(c.level, 'Intermedio');
  assert.deepEqual(c.belts, ['Morada', 'Azul']);
  assert.deepEqual([c.age_min, c.age_max, c.gender], [3, 5, 'M']);
  assert.deepEqual(cats.find((x: any) => x.code === 'KEX-007').belts, []);
  assert.equal((await call('POST', `/api/events/${ev.id}/categories/import`, { rows }, a)).data.updated, 133); // reimportar es seguro
});
