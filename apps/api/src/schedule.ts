// Lógica pura del horario de un ring: ordena categorías y descansos, calcula la hora de fin y detecta cruces.
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function buildRingSchedule(cats: any[], breaks: any[]) {
  const timed = [
    ...cats.filter((c) => c.start_time).map((c) => ({ kind: 'category', id: c.id, title: c.name, code: c.code, status: c.status, registered: c.registered, s: toMin(c.start_time), minutes: c.est_minutes })),
    ...breaks.map((b) => ({ kind: 'break', id: b.id, title: b.title, code: undefined, status: undefined, registered: undefined, s: toMin(b.start_time), minutes: b.duration_min })),
  ].sort((a, b) => a.s - b.s);
  let prevEnd = -1;
  const items = timed.map((i) => {
    const conflict = i.s < prevEnd;
    prevEnd = Math.max(prevEnd, i.s + i.minutes);
    return { kind: i.kind, id: i.id, title: i.title, code: i.code, status: i.status, registered: i.registered, start: toHM(i.s), end: toHM(i.s + i.minutes), minutes: i.minutes, conflict };
  });
  return { items, unscheduled: cats.filter((c) => !c.start_time).map((c) => ({ id: c.id, code: c.code, title: c.name })) };
}

// Asignación automática: reparte las categorías sin ring entre los rings (el menos cargado primero)
// y les pone hora en secuencia dentro de cada ring, saltando los descansos.
export function planSchedule(o: { rings: { id: string }[]; cats: any[]; breaks: any[]; start: string }) {
  const load = new Map(o.rings.map((r) => [r.id, 0]));
  const cats = o.cats.map((c) => ({ ...c }));
  for (const c of cats) if (c.ring_id && load.has(c.ring_id)) load.set(c.ring_id, load.get(c.ring_id)! + c.est_minutes);
  const order = (a: any, b: any) => (a.sort_order - b.sort_order) || String(a.code).localeCompare(String(b.code));
  for (const c of cats.filter((x) => !x.ring_id || !load.has(x.ring_id)).sort(order)) {
    const [rid] = [...load.entries()].sort((a, b) => a[1] - b[1])[0];
    c.ring_id = rid; load.set(rid, load.get(rid)! + c.est_minutes);
  }
  const plan: { id: string; ring_id: string; start_time: string }[] = [];
  for (const ring of o.rings) {
    const brs = o.breaks.filter((b) => b.ring_id === ring.id).map((b) => ({ s: toMin(b.start_time), e: toMin(b.start_time) + b.duration_min }));
    let t = toMin(o.start);
    const mine = cats.filter((c) => c.ring_id === ring.id).sort((a, b) => String(a.start_time ?? '99:99').localeCompare(String(b.start_time ?? '99:99')) || order(a, b));
    for (const c of mine) {
      for (;;) { const clash = brs.find((b) => t < b.e && t + c.est_minutes > b.s); if (!clash) break; t = clash.e; }
      plan.push({ id: c.id, ring_id: ring.id, start_time: toHM(t) });
      t += c.est_minutes;
    }
  }
  return plan;
}
