// Llave de eliminación directa con combate por el tercer lugar. Lógica pura, sin base de datos.
export type PlanMatch = { kind: 'main' | 'bronze'; round: number; position: number; red: number | null; blue: number | null; bye: boolean };

// n = cantidad de competidores. red/blue son posiciones (índices) dentro del orden del sorteo.
export function planBracket(n: number): PlanMatch[] {
  if (n < 1) return [];
  if (n === 1) return [{ kind: 'main', round: 1, position: 1, red: 0, blue: null, bye: true }];
  let size = 2; while (size < n) size *= 2;
  const total = Math.log2(size), first = size / 2, byes = size - n;
  const ms: PlanMatch[] = []; let idx = 0;
  for (let p = 1; p <= first; p++) { const bye = p <= byes, red = idx++, blue = bye ? null : idx++; ms.push({ kind: 'main', round: 1, position: p, red, blue, bye }); }
  for (let r = 2; r <= total; r++) for (let p = 1; p <= size / 2 ** r; p++) ms.push({ kind: 'main', round: r, position: p, red: null, blue: null, bye: false });
  for (const m of ms.filter((x) => x.round === 1 && x.bye)) { // quien pasa directo ocupa su lugar en la siguiente ronda
    const next = ms.find((x) => x.round === 2 && x.position === Math.ceil(m.position / 2));
    if (next) next[m.position % 2 === 1 ? 'red' : 'blue'] = m.red;
  }
  if (total >= 2) {
    const semis = ms.filter((m) => m.round === total - 1);
    if (semis.length === 2 && semis.every((m) => !m.bye)) ms.push({ kind: 'bronze', round: total, position: 1, red: null, blue: null, bye: false });
  }
  return ms;
}

// Orden de juego: por ronda; en la última, primero el de tercer lugar y al final la final.
export const playOrder = (a: { round: number; kind: string; position: number }, b: { round: number; kind: string; position: number }) =>
  a.round - b.round || (a.kind === 'bronze' ? -1 : 0) - (b.kind === 'bronze' ? -1 : 0) || a.position - b.position;

// Puestos finales a partir de los combates ya jugados. null = todavía faltan combates.
export function podiumFrom(ms: any[]): { place: number; registration_id: string }[] | null {
  const mains = ms.filter((m) => m.kind === 'main');
  if (!mains.length) return null;
  const total = Math.max(...mains.map((m) => m.round)), final = mains.find((m) => m.round === total && m.position === 1);
  if (!final?.winner_id) return null;
  const loser = (m: any) => (m.winner_id === m.red_id ? m.blue_id : m.red_id);
  const out = [{ place: 1, registration_id: final.winner_id }];
  if (loser(final)) out.push({ place: 2, registration_id: loser(final) });
  const bronze = ms.find((m) => m.kind === 'bronze');
  if (bronze) { if (!bronze.winner_id) return null; out.push({ place: 3, registration_id: bronze.winner_id }, { place: 4, registration_id: loser(bronze) }); }
  else if (total >= 2) for (const m of mains.filter((x) => x.round === total - 1 && !x.bye)) { if (!m.winner_id) return null; out.push({ place: 3, registration_id: loser(m) }); }
  return out;
}
