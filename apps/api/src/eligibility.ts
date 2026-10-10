// ¿Puede este competidor entrar en esta categoría? Devuelve los motivos por los que NO (vacío = sí).
export function ineligibleReasons(cat: any, p: { gender?: string | null; age?: number | null; weight?: number | null; belt?: string | null }): string[] {
  const why: string[] = [];
  const belts: string[] = typeof cat.belts === 'string' ? JSON.parse(cat.belts) : (cat.belts ?? []);
  if (cat.gender !== 'mixed' && cat.gender !== p.gender) why.push('género');
  if (p.age != null && ((cat.age_min != null && p.age < cat.age_min) || (cat.age_max != null && p.age > cat.age_max))) why.push('edad');
  const hasWeight = cat.weight_min != null || cat.weight_max != null;
  if (hasWeight && (p.weight == null || (cat.weight_min != null && p.weight < cat.weight_min) || (cat.weight_max != null && p.weight > cat.weight_max))) why.push('peso');
  if (belts.length && p.belt && !belts.some((b) => b.toLowerCase() === p.belt!.toLowerCase())) why.push('cinta');
  return why;
}
