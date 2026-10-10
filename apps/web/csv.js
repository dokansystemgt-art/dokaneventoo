// Lectura de CSV (Excel en español usa ";") y conversión a filas de categorías. Sin dependencias.
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const head = text.split(/\r?\n/, 1)[0];
  const delim = (head.match(/;/g) || []).length >= (head.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (h) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const COLS = {
  code: ['codigo', 'code'], name: ['nombre', 'name'], modality: ['modalidad', 'modality'], gender: ['genero', 'gender', 'sexo'],
  age_min: ['edad_min', 'edad_minima', 'age_min'], age_max: ['edad_max', 'edad_maxima', 'age_max'],
  weight_min: ['peso_min', 'peso_minimo', 'weight_min'], weight_max: ['peso_max', 'peso_maximo', 'weight_max'],
  level: ['nivel', 'grado', 'level'], belts: ['cintas', 'belts'], ring: ['ring', 'ring_numero', 'numero_de_ring'],
  start_time: ['hora', 'hora_inicio', 'start_time'], est_minutes: ['minutos', 'duracion', 'est_minutes'],
  sort_order: ['orden', 'sort_order'], max_participants: ['max_participantes', 'maximo_participantes', 'maximo'],
};
const GENDERS = { masculino: 'M', m: 'M', varon: 'M', femenino: 'F', f: 'F', mujer: 'F', mixto: 'mixed', mixed: 'mixed', ambos: 'mixed' };

export function categoriesFromCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: ['El archivo no tiene filas de datos.'] };
  const idx = {};
  table[0].forEach((h, i) => { const n = norm(h); for (const [field, names] of Object.entries(COLS)) if (names.includes(n)) idx[field] = i; });
  if (idx.code === undefined) return { rows: [], errors: ['Falta la columna "codigo" en el encabezado.'] };
  const rows = table.slice(1).map((cells) => {
    const o = {};
    for (const [field, i] of Object.entries(idx)) {
      let v = (cells[i] ?? '').trim();
      if (v === '') continue;
      if (field === 'gender') v = GENDERS[norm(v)] ?? v;
      else if (field === 'belts') v = v.split(/[|,/]/).map((x) => x.trim()).filter(Boolean);
      else if (field === 'start_time' && /^\d:\d{2}$/.test(v)) v = '0' + v;
      o[field] = v;
    }
    return o;
  });
  return { rows, errors: [] };
}

const PCOLS = {
  full_name: ['nombre', 'nombre_completo', 'competidor', 'full_name'], gender: ['genero', 'sexo', 'gender'], age: ['edad', 'age'],
  weight: ['peso', 'weight'], height: ['altura', 'height'], belt: ['cinta', 'belt'], club: ['academia', 'club', 'gym', 'gimnasio'],
  category_codes: ['categorias', 'codigos', 'category_codes', 'categoria'],
};
export function participantsFromCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: ['El archivo no tiene filas de datos.'] };
  const idx = {};
  table[0].forEach((h, i) => { const n = norm(h); for (const [field, names] of Object.entries(PCOLS)) if (names.includes(n)) idx[field] = i; });
  const missing = ['full_name', 'gender', 'age', 'belt', 'category_codes'].filter((f) => idx[f] === undefined);
  if (missing.length) return { rows: [], errors: [`Faltan columnas en el encabezado: ${missing.join(', ')} (nombre, genero, edad, cinta, categorias).`] };
  const rows = table.slice(1).map((cells) => {
    const o = {};
    for (const [field, i] of Object.entries(idx)) {
      let v = (cells[i] ?? '').trim();
      if (v === '') continue;
      if (field === 'gender') v = GENDERS[norm(v)] === 'mixed' ? v : (GENDERS[norm(v)] ?? v);
      else if (field === 'category_codes') v = v.split(/[|,/;]/).map((x) => x.trim()).filter(Boolean);
      else if (field === 'weight' || field === 'height') v = v.replace(',', '.');
      o[field] = v;
    }
    return o;
  });
  return { rows, errors: [] };
}
