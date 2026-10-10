import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, createUser } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { ineligibleReasons } from '../src/eligibility.ts';
import { planSchedule } from '../src/schedule.ts';
import { participantsFromCsv } from '../../web/csv.js';

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
const user = (a: string, email: string, role_id: string) => call('POST', '/api/users', { email, name: email, password: PW, role_id }, a).then((r) => r.data);

async function setup(name = 'Evento') {
  const a = await login('admin@t.gt');
  const ev = (await call('POST', '/api/events', { name, start_date: '2099-05-01', end_date: '2099-05-01', ring_count: 2, start_time: '08:00' }, a)).data;
  const [r1, r2] = (await call('GET', `/api/events/${ev.id}/rings`, undefined, a)).data;
  await call('POST', `/api/events/${ev.id}/categories/import`, { rows: [
    { code: 'K1', name: 'Kumite M 8-9', modality: 'Cuartetas', gender: 'M', age_min: 8, age_max: 9, belts: ['Blanca', 'Amarilla'], ring: '1', start_time: '09:00' },
    { code: 'K2', name: 'Kumite F 8-9', modality: 'Cuartetas', gender: 'F', age_min: 8, age_max: 9, ring: '1', start_time: '08:00' },
    { code: 'K3', name: 'Kata mixto', modality: 'Kata', gender: 'mixed' }] }, a);
  const cats = Object.fromEntries((await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data.map((c: any) => [c.code, c]));
  const reg = (full_name: string, gender: string, age: number, category_ids: string[], extra: any = {}) =>
    call('POST', `/api/events/${ev.id}/registrations`, { full_name, gender, age, belt: 'Blanca', club: 'Dragones', category_ids, ...extra }, a);
  return { a, ev, r1, r2, cats, reg };
}

test('elegibilidad: género, edad, peso y cinta', () => {
  const cat = { gender: 'M', age_min: 8, age_max: 9, weight_max: 30, belts: ['Blanca'] };
  assert.deepEqual(ineligibleReasons(cat, { gender: 'M', age: 8, weight: 28, belt: 'blanca' }), []);
  assert.deepEqual(ineligibleReasons(cat, { gender: 'F', age: 12, weight: 40, belt: 'Azul' }), ['género', 'edad', 'peso', 'cinta']);
  assert.deepEqual(ineligibleReasons(cat, { gender: 'M', age: 8, belt: 'Blanca' }), ['peso']); // falta el peso y la categoría lo pide
  assert.deepEqual(ineligibleReasons({ gender: 'mixed', belts: [] }, { gender: 'F', age: 5, belt: 'Negra' }), []);
});

test('inscribir: valida compatibilidad, permite forzar y no duplica personas ni inscripciones', async () => {
  const { a, ev, cats, reg } = await setup();
  assert.equal((await call('GET', `/api/events/${ev.id}/eligible?gender=M&age=8&belt=Blanca`, undefined, a)).data.map((c: any) => c.code).join(), 'K1,K3');
  const bad = await reg('Pedro Pérez', 'M', 12, [cats.K1.id]);
  assert.equal(bad.status, 400);
  assert.match(bad.data.errors[0], /K1.*edad/);
  assert.equal((await reg('Pedro Pérez', 'M', 12, [cats.K1.id], { force: true, origin: 'late' })).status, 201);
  assert.equal((await reg('Ana Gómez', 'F', 8, [cats.K1.id])).status, 400); // género
  assert.equal((await reg('Luis Díaz', 'M', 8, [cats.K1.id, cats.K3.id])).data.created, 2);
  assert.equal((await reg('luis díaz', 'M', 8, [cats.K1.id, cats.K3.id])).data.created, 0); // mismo competidor: no se duplica
  assert.equal((await call('GET', `/api/events/${ev.id}/registrations`, undefined, a)).data.length, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM people').get().n, 2);
});

test('flujo: llamar → locutor → asistencia → iniciar → cerrar con resultados → cerradas', async () => {
  const { a, ev, r1, r2, cats, reg } = await setup();
  const op1 = await user(a, 'ring1@t.gt', 'ring_operator'), op2 = await user(a, 'ring2@t.gt', 'ring_operator'); await user(a, 'loc@t.gt', 'announcer');
  await call('PATCH', `/api/rings/${r1.id}`, { operator_id: op1.id }, a); await call('PATCH', `/api/rings/${r2.id}`, { operator_id: op2.id }, a);
  const ids: string[] = [];
  for (const [n, age] of [['Ana', 8], ['Beto', 9], ['Carlos', 8]] as const) await reg(n, 'M', age, [cats.K1.id]);
  const comps = () => call('GET', `/api/categories/${cats.K1.id}/competitors`, undefined, a).then((r) => r.data.competitors);
  for (const c of await comps()) ids.push(c.registration_id);
  const o1 = await login('ring1@t.gt'), o2 = await login('ring2@t.gt'), loc = await login('loc@t.gt');

  assert.equal((await call('POST', `/api/categories/${cats.K2.id}/call`, {}, o1)).status, 400); // sin inscritos
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/call`, {}, o2)).status, 403); // ring ajeno
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/call`, {}, o1)).data.status, 'calling');
  const control = (await call('GET', `/api/events/${ev.id}/control`, undefined, a)).data;
  assert.equal(control.calls.length, 1);
  assert.deepEqual(control.calls[0].competitors.map((c: any) => c.full_name), ['Ana', 'Beto', 'Carlos']);
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/start`, {}, o1)).status, 409);       // falta el llamado
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/announced`, {}, o1)).status, 403);    // el operador no es locutor
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/announced`, {}, loc)).data.status, 'preparing');
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/start`, {}, o1)).status, 400);        // nadie presente
  assert.equal((await call('PATCH', `/api/registrations/${ids[0]}/attendance`, { attendance: 'present' }, o2)).status, 403);
  for (const [i, s] of [[0, 'present'], [1, 'present'], [2, 'absent']] as const) await call('PATCH', `/api/registrations/${ids[i]}/attendance`, { attendance: s }, o1);
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/start`, {}, o1)).data.status, 'in_progress');
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/close`, { results: [{ registration_id: ids[2], place: 1 }] }, o1)).status, 400); // ausente
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/close`, { results: [{ registration_id: ids[0], place: 2 }] }, o1)).status, 400); // sin primer lugar
  const closed = await call('POST', `/api/categories/${cats.K1.id}/close`, { results: [{ registration_id: ids[1], place: 1 }, { registration_id: ids[0], place: 2 }] }, o1);
  assert.equal(closed.data.status, 'finished');

  const after = (await call('GET', `/api/events/${ev.id}/control`, undefined, a)).data;
  assert.equal(after.rings[0].queue.length, 0);
  assert.equal(after.summary.finished, 1);
  const list = (await call('GET', `/api/events/${ev.id}/closed`, undefined, o1)).data;
  assert.deepEqual(list[0].podium.map((p: any) => [p.place, p.full_name]), [[1, 'Beto'], [2, 'Ana']]);
  assert.deepEqual((await call('GET', `/api/events/${ev.id}/closed`, undefined, o2)).data, []);        // el operador del ring 2 no ve lo cerrado en el ring 1
});

test('categoría cerrada: no admite inscripciones nuevas, sí permite quitar competidores; solo se reabre con permiso', async () => {
  const { a, ev, r1, cats, reg } = await setup();
  const op = await user(a, 'solo@t.gt', 'ring_operator'); await call('PATCH', `/api/rings/${r1.id}`, { operator_id: op.id }, a);
  await user(a, 'locutor@t.gt', 'announcer');
  await reg('Ana', 'M', 8, [cats.K1.id]);
  const rid = (await call('GET', `/api/categories/${cats.K1.id}/competitors`, undefined, a)).data.competitors[0].registration_id;
  const o = await login('solo@t.gt'), l = await login('locutor@t.gt');
  await call('POST', `/api/categories/${cats.K1.id}/call`, {}, o); await call('POST', `/api/categories/${cats.K1.id}/announced`, {}, l);
  await call('PATCH', `/api/registrations/${rid}/attendance`, { attendance: 'present' }, o); await call('POST', `/api/categories/${cats.K1.id}/start`, {}, o);
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/close`, { results: [{ registration_id: rid, place: 1 }] }, o)).status, 200);
  assert.equal((await reg('Luis', 'M', 9, [cats.K1.id])).status, 400);
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/reopen`, {}, o)).status, 403);
  assert.equal((await call('POST', `/api/categories/${cats.K1.id}/reopen`, {}, a)).data.status, 'in_progress');
  await call('POST', `/api/categories/${cats.K1.id}/close`, { results: [{ registration_id: rid, place: 1 }] }, o);
  assert.equal((await call('DELETE', `/api/registrations/${rid}`, {}, a)).status, 200); // ahora se puede quitar aunque la categoría esté cerrada
  await call('POST', `/api/categories/${cats.K1.id}/reopen`, {}, a);
  assert.equal((await call('GET', `/api/events/${ev.id}/closed`, undefined, a)).data.length, 0);
});

test('horario automático: reparte entre rings, ordena por hora y salta descansos', async () => {
  const plan = planSchedule({ rings: [{ id: 'r1' }, { id: 'r2' }], start: '08:00',
    cats: ['A', 'B', 'C', 'D'].map((code, i) => ({ id: code, code, sort_order: i, est_minutes: 30, ring_id: null, start_time: null })),
    breaks: [{ ring_id: 'r1', start_time: '08:30', duration_min: 30 }] });
  assert.deepEqual(plan.map((p) => `${p.id}:${p.ring_id}:${p.start_time}`), ['A:r1:08:00', 'C:r1:09:00', 'B:r2:08:00', 'D:r2:08:30']);
  const { a, ev, cats, reg } = await setup();
  await reg('Ana', 'M', 8, [cats.K1.id]); await reg('Eva', 'F', 8, [cats.K2.id]); await reg('Mix', 'F', 20, [cats.K3.id]);
  assert.equal((await call('POST', `/api/events/${ev.id}/autoschedule`, {}, a)).data.scheduled, 3);
  const got = (await call('GET', `/api/events/${ev.id}/categories`, undefined, a)).data.map((c: any) => `${c.code}@${c.start_time}`);
  assert.deepEqual(got, ['K2@08:00', 'K3@08:00', 'K1@08:30']); // K2 ya iba antes que K1 en el ring 1 y se respeta; K3 (sin ring) va al ring 2, que está vacío
});

test('importar competidores desde CSV: todo o nada, con errores por fila', async () => {
  const { a, ev } = await setup();
  const url = `/api/events/${ev.id}/registrations/import`;
  const bad = participantsFromCsv('Nombre;Género;Edad;Peso;Cinta;Academia;Categorías\nOk Uno;Masculino;8;;Blanca;Dragones;K1\nMal Dos;Masculino;12;;Blanca;Dragones;K1\nMal Tres;Masculino;8;;Blanca;;ZZ-9\nMal Cuatro;Femenino;8;;Blanca;;K1');
  assert.deepEqual(bad.errors, []);
  const r = await call('POST', url, { rows: bad.rows }, a);
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.errors.map((e: any) => e.row), [3, 4, 5]);
  assert.equal((await call('GET', `/api/events/${ev.id}/registrations`, undefined, a)).data.length, 0);
  const ok = participantsFromCsv('Nombre;Género;Edad;Peso;Cinta;Academia;Categorías\nAna Ruiz;Femenino;8;27,5;Blanca;Dragones;K2|K3\nLuis Mora;Masculino;9;;Amarilla;Dragones;K1');
  assert.equal(ok.rows[0].weight, '27.5');
  assert.deepEqual(ok.rows[0].category_codes, ['K2', 'K3']);
  assert.deepEqual((await call('POST', url, { rows: ok.rows }, a)).data, { rows: 2, created: 3, already: 0 });
  assert.equal((await call('POST', url, { rows: ok.rows }, a)).data.already, 3); // reimportar no duplica
  assert.match(participantsFromCsv('Nombre;Edad\nA;5').errors[0], /genero|cinta/);
});
