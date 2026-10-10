// Calificación de kata por jueces. Lógica pura, sin base de datos.
// Las notas viajan en centésimas (9.95 = 995). Total = suma de los 3 jueces; promedio = total / 3.
export const JUDGES = 3, MIN_SCORE = 990, MAX_SCORE = 999, MAX_PLACE = 4;

// Acepta 9.95, "9.95" o "9,95". Devuelve centésimas o null si no es una nota válida (9.90 a 9.99 con dos decimales).
export function parseScore(v: unknown): number | null {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6 || cents < MIN_SCORE || cents > MAX_SCORE) return null;
  return cents;
}

export type KataEntry = { registration_id: string; total: number | null };

// Lugar por puntaje total (empatados comparten lugar: 1, 1, 3...). Sin nota = null.
export function rankKata<T extends KataEntry>(rows: T[]): (T & { rank: number | null })[] {
  const scored = rows.filter((r) => r.total != null) as (T & { total: number })[];
  return rows.map((r) => ({ ...r, rank: r.total == null ? null : 1 + scored.filter((s) => s.total > r.total!).length }));
}

// Grupos de competidores con la misma nota total que afectan los puestos 1 a 4 (en kata cada puesto es de una sola persona).
export function podiumTies<T extends KataEntry>(rows: T[]): T[][] {
  const ranked = rankKata(rows).filter((r) => r.rank != null && r.rank <= MAX_PLACE);
  const groups = new Map<number, typeof ranked>();
  for (const r of ranked) groups.set(r.total!, [...(groups.get(r.total!) ?? []), r]);
  return [...groups.values()].filter((g) => g.length > 1);
}

// Puestos finales. null si falta alguien por calificar o si hay empates sin resolver.
export function kataPodium<T extends KataEntry>(rows: T[]): { place: number; registration_id: string }[] | null {
  if (!rows.length || rows.some((r) => r.total == null) || podiumTies(rows).length) return null;
  return rankKata(rows).filter((r) => r.rank! <= MAX_PLACE).sort((a, b) => a.rank! - b.rank!).map((r) => ({ place: r.rank!, registration_id: r.registration_id }));
}
