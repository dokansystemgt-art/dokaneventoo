import { categoriesFromCsv, participantsFromCsv } from './csv.js';
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (d) => d.split('-').reverse().join('/');
const STATUS = { draft: ['Borrador', ''], active: ['Activo', 'ok'], inactive: ['Inactivo', 'warn'], finished: ['Finalizado', 'info'], archived: ['Archivado', ''] };
const RING_ST = { idle: ['En espera', ''], active: ['En curso', 'ok'], paused: ['Pausado', 'warn'], closed: ['Cerrado', 'info'] };
const GENDER = { M: 'Masculino', F: 'Femenino', mixed: 'Mixto' };
const VIEWS = [['all', 'Todos'], ['upcoming', 'Próximos'], ['active', 'Activos'], ['past', 'Anteriores'], ['archived', 'Archivados']];
const range = (a, b, u) => (a == null && b == null ? 'Todos' : a == null ? `Hasta ${b} ${u}` : b == null ? `Desde ${a} ${u}` : `${a}–${b} ${u}`);
const opts = (obj) => Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
const CAT_ST = { pending: ['En espera', ''], next: ['Próxima', 'info'], calling: ['Llamando', 'hot'], preparing: ['En preparación', 'warn'], in_progress: ['En curso', 'ok'], finished: ['Finalizada', 'info'] };
const BELTS = ['Blanca', 'Amarilla', 'Naranja', 'Morada', 'Azul', 'Verde', 'Café', 'Roja', 'Negra'];
const PLACE = { 1: '1.er lugar', 2: '2.º lugar', 3: '3.er lugar', 4: '4.º lugar' };
// Kata y exhibición se califican por jueces. Las «Especiales» (Gran Campeón, Seniors) son combates; solo KEX-007 (Kata Exhibición) es kata.
const usesBracket = (k) => !/kata|exhib/i.test(`${k.modality} ${k.name}`);
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : '');
const beep = () => { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(c.currentTime + 0.3); } catch { /* sin audio */ } };
let me = null, view = 'all', q = '', catRing = '', timer, pollTimer, onLeave = null;
const can = (p) => me.permissions.includes(p);
const app = $('#app');

async function api(method, path, body) {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { me = null; renderLogin(); }
  if (!res.ok) { const err = new Error(data.error || 'Ocurrió un error inesperado'); err.errors = data.errors; throw err; }
  return data;
}
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}
const badge = (pair) => `<span class="badge ${pair[1]}">${pair[0]}</span>`;
// Delegación de clics: <button data-act="x" data-id="y"> llama handlers.x(id)
function wire(el, handlers) {
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !handlers[b.dataset.act]) return;
    try { await handlers[b.dataset.act](b.dataset.id, b); } catch (x) { toast(x.message, 'error'); }
  };
}

// Formulario modal genérico. fields: [{name,label,type,options,req,wide,attrs,list}]
function openForm({ title, fields, values = {}, submit = 'Guardar', onSave }) {
  const input = (f) => {
    const v = values[f.name] ?? f.value ?? '';
    if (f.type === 'select') return `<select name="${f.name}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea name="${f.name}" rows="3" maxlength="2000">${esc(v)}</textarea>`;
    return `<input name="${f.name}" type="${f.type || 'text'}" ${f.req ? 'required' : ''} ${f.attrs || ''} value="${esc(v)}"${f.list ? ` list="dl-${f.name}"` : ''}>${f.list ? `<datalist id="dl-${f.name}">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
  };
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="form"><h2>${esc(title)}</h2>
    <div class="row">${fields.map((f) => `<label class="${f.wide ? 'wide' : ''}">${esc(f.label)}${input(f)}</label>`).join('')}</div>
    <p class="err" id="ferr" role="alert"></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">${esc(submit)}</button></div></form>`;
  d.onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    try { await onSave(Object.fromEntries(new FormData(e.target))); d.close(); } catch (x) { $('#ferr', d).textContent = x.message; }
  };
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal();
}

function renderLogin() {
  app.innerHTML = `<main class="login"><form id="lf" class="login-card">
    <h1>DOKAN</h1><p>Gestión de torneos de karate</p>
    <label>Correo<input name="email" type="email" autocomplete="username" required autofocus></label>
    <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
    <p id="err" class="err" role="alert"></p>
    <button class="btn primary" type="submit">Entrar</button></form></main>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { me = (await api('POST', '/auth/login', { email: f.get('email'), password: f.get('password') })).user; location.hash = '#/eventos'; route(); }
    catch (x) { $('#err').textContent = x.message; }
  };
}

function shell(active, html) {
  app.innerHTML = `<div class="shell">
    <aside class="side"><div class="brand">DOKAN</div>
      <nav><a ${active === 'eventos' ? 'class="on"' : ''} href="#/eventos">Eventos</a>${can('user:manage') ? `<a ${active === 'usuarios' ? 'class="on"' : ''} href="#/usuarios">Usuarios</a>` : ''}</nav>
      <div class="me"><strong>${esc(me.name)}</strong><span>${esc(me.role_name)}</span><button class="btn ghost sm" id="out">Cerrar sesión</button></div></aside>
    <main class="main" id="main">${html}</main></div>`;
  $('#out').onclick = async () => { await api('POST', '/auth/logout'); me = null; renderLogin(); };
  return $('#main');
}

function route() {
  clearInterval(pollTimer);
  if (onLeave) { onLeave(); onLeave = null; }
  if (!me) return renderLogin();
  const [, page, id, tab] = location.hash.split('/');
  const run = page === 'categoria' && id ? bracketPage(id) : page === 'marcador' && id ? boardPage(id) : page === 'kata' && id ? (tab ? kataBoard(id, tab) : kataPage(id)) : page === 'usuarios' && can('user:manage') ? usersPage() : id ? eventPage(id, tab) : eventsPage();
  run.catch((x) => { toast(x.message, 'error'); if (id) location.hash = '#/eventos'; });
}

/* ---------- Eventos ---------- */
const eventFields = (ev) => [
  { name: 'name', label: 'Nombre', req: true, wide: true, attrs: 'maxlength="120"' },
  { name: 'start_date', label: 'Fecha de inicio', type: 'date', req: true }, { name: 'end_date', label: 'Fecha de fin', type: 'date', req: true },
  { name: 'start_time', label: 'Hora de inicio', type: 'time', req: true },
  { name: 'venue', label: 'Lugar' }, { name: 'ring_count', label: 'Cantidad de rings', type: 'number', req: true, attrs: 'min="1" max="50"' },
  { name: 'address', label: 'Dirección', wide: true }, { name: 'description', label: 'Descripción', type: 'textarea', wide: true },
  ...(ev && ev.status !== 'archived' ? [{ name: 'status', label: 'Estado', type: 'select', options: ['draft', 'active', 'inactive', 'finished'].map((s) => [s, STATUS[s][0]]) }] : []),
];
function eventForm(ev, done) {
  openForm({ title: ev ? 'Editar evento' : 'Nuevo evento', fields: eventFields(ev), submit: 'Guardar evento',
    values: ev ?? { start_time: '08:00', ring_count: 2 },
    onSave: async (b) => { b.ring_count = Number(b.ring_count); ev ? await api('PATCH', `/events/${ev.id}`, b) : await api('POST', '/events', b); toast('Evento guardado'); done(); } });
}

async function eventsPage() {
  const main = shell('eventos', `<header class="bar"><h1>Eventos</h1>${can('event:write') ? '<button class="btn primary" data-act="new">Nuevo evento</button>' : ''}</header>
    <div class="tools"><div class="tabs" role="tablist">${VIEWS.map(([k, l]) => `<button role="tab" data-view="${k}" aria-selected="${k === view}">${l}</button>`).join('')}</div>
    <input id="q" type="search" placeholder="Buscar evento" aria-label="Buscar evento" value="${esc(q)}"></div><div class="card" id="list"></div>`);
  let events = [];
  const load = async () => {
    events = await api('GET', `/events?view=${view}&q=${encodeURIComponent(q)}`);
    $('#list').innerHTML = !events.length
      ? `<div class="empty"><strong>No hay eventos en esta vista</strong>${can('event:write') ? 'Crea un evento para configurar sus rings, categorías y horarios.' : 'Cuando tengas rings asignados, el evento aparecerá aquí.'}</div>`
      : `<div class="scroll"><table><thead><tr><th>Evento</th><th>Fechas</th><th>Rings</th><th>Estado</th><th></th></tr></thead><tbody>${events.map((ev) => {
        const acts = [];
        if (can('event:write') && ev.status !== 'archived') acts.push(`<button class="btn sm" data-act="edit" data-id="${ev.id}">Editar</button>`, `<button class="btn sm" data-act="toggle" data-id="${ev.id}">${ev.status === 'active' ? 'Desactivar' : 'Activar'}</button>`);
        if (can('event:write')) acts.push(`<button class="btn sm" data-act="dup" data-id="${ev.id}">Duplicar</button>`);
        if (can('event:archive') && ev.status !== 'archived') acts.push(`<button class="btn sm danger" data-act="archive" data-id="${ev.id}">Archivar</button>`);
        return `<tr><td><a class="name-link" href="#/eventos/${ev.id}/control">${esc(ev.name)}</a><small>${esc(ev.venue || 'Sin lugar definido')}</small></td>
          <td>${fmt(ev.start_date)}${ev.end_date !== ev.start_date ? ' al ' + fmt(ev.end_date) : ''}<small>Inicia a las ${esc(ev.start_time)}</small></td>
          <td>${ev.ring_count}</td><td>${badge(STATUS[ev.status])}</td><td><div class="acts">${acts.join('')}</div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  };
  const find = (id) => events.find((x) => x.id === id);
  wire(main, {
    new: () => eventForm(null, load), edit: (id) => eventForm(find(id), load),
    toggle: async (id) => { const ev = find(id); await api('PATCH', `/events/${id}`, { status: ev.status === 'active' ? 'inactive' : 'active' }); toast(ev.status === 'active' ? 'Evento desactivado' : 'Evento activado'); load(); },
    dup: async (id) => { await api('POST', `/events/${id}/duplicate`); toast('Evento duplicado como borrador, con sus rings, categorías y horarios'); load(); },
    archive: async (id) => {
      if (!confirm(`¿Archivar «${find(id).name}»?\nDejará de aparecer en la lista principal y ya no se podrá editar.`)) return;
      await api('POST', `/events/${id}/archive`); toast('Evento archivado'); load();
    },
  });
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    view = b.dataset.view; document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-selected', x.dataset.view === view)); load().catch((x) => toast(x.message, 'error'));
  });
  $('#q').oninput = (e) => { q = e.target.value; clearTimeout(timer); timer = setTimeout(() => load().catch((x) => toast(x.message, 'error')), 250); };
  await load();
}

/* ---------- Detalle del evento ---------- */
async function eventPage(id, tab) {
  tab = tab || (can('announce') && !can('category:run') ? 'microfono' : 'control');
  const ev = await api('GET', `/events/${id}`);
  const tabs = [['control', 'Control'], ...(can('registration:write') ? [['inscritos', 'Inscritos']] : []), ['cerradas', 'Cerradas'], ...(can('announce') ? [['microfono', 'Micrófono']] : []),
    ['rings', 'Rings'], ['categorias', 'Categorías'], ['horarios', 'Horarios']];
  const main = shell('eventos', `<a class="crumb" href="#/eventos">← Eventos</a>
    <header class="bar"><div><div class="title-row"><h1>${esc(ev.name)}</h1>${badge(STATUS[ev.status])}</div>
      <p class="meta">${fmt(ev.start_date)}${ev.end_date !== ev.start_date ? ' al ' + fmt(ev.end_date) : ''} · inicia a las ${esc(ev.start_time)}${ev.venue ? ' · ' + esc(ev.venue) : ''}</p></div></header>
    <div class="tools"><nav class="tabs">${tabs.map(([k, l]) => `<a href="#/eventos/${id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav></div><div id="tab"></div>`);
  const body = $('#tab', main), editable = ev.status !== 'archived';
  const tabFn = { control: controlTab, inscritos: registrationsTab, cerradas: closedTab, microfono: micTab, rings: ringsTab, categorias: categoriesTab, horarios: scheduleTab }[tab] || controlTab;
  await tabFn(ev, body, editable);
}

async function ringsTab(ev, body, editable) {
  const canEdit = editable && can('ring:write');
  const load = async () => {
    const [rings, ops] = await Promise.all([api('GET', `/events/${ev.id}/rings`), canEdit ? api('GET', '/operators') : []]);
    body.innerHTML = `<div class="toolbar"><span class="meta">${rings.length} ring${rings.length === 1 ? '' : 's'}</span>${canEdit ? '<button class="btn primary" data-act="add">Agregar ring</button>' : ''}</div>
      <div class="card">${!rings.length ? '<div class="empty"><strong>Este evento no tiene rings</strong>Agrega el primero para empezar a asignar categorías.</div>'
      : `<div class="scroll"><table><thead><tr><th>Ring</th><th>Ubicación</th><th>Operador</th><th>Estado</th><th>Categorías</th><th></th></tr></thead><tbody>${rings.map((r) => `<tr>
        <td><strong>${esc(r.name)}</strong><small>Número ${r.number}</small></td><td>${esc(r.location || '—')}</td>
        <td>${canEdit ? `<select data-op="${r.id}" aria-label="Operador de ${esc(r.name)}"><option value="">Sin asignar</option>${ops.map((o) => `<option value="${o.id}" ${o.id === r.operator_id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>` : esc(r.operator_name || 'Sin asignar')}</td>
        <td>${badge(RING_ST[r.status])}</td><td>${r.category_count}</td>
        <td><div class="acts">${canEdit ? `<button class="btn sm" data-act="edit" data-id="${r.id}">Editar</button><button class="btn sm danger" data-act="del" data-id="${r.id}">Eliminar</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`}</div>`;
    body.rings = rings;
  };
  const f = (r) => [{ name: 'name', label: 'Nombre', req: true, attrs: 'maxlength="60"', value: r?.name }, { name: 'location', label: 'Ubicación', attrs: 'maxlength="120"' },
    ...(r ? [{ name: 'status', label: 'Estado', type: 'select', options: opts(RING_ST) }] : [])];
  wire(body, {
    add: () => openForm({ title: 'Agregar ring', fields: f(), onSave: async (b) => { await api('POST', `/events/${ev.id}/rings`, b); toast('Ring agregado'); load(); } }),
    edit: (id) => { const r = body.rings.find((x) => x.id === id); openForm({ title: `Editar ${r.name}`, fields: f(r), values: r, onSave: async (b) => { await api('PATCH', `/rings/${id}`, b); toast('Ring guardado'); load(); } }); },
    del: async (id) => {
      const r = body.rings.find((x) => x.id === id);
      if (!confirm(`¿Eliminar «${r.name}»?\n${r.category_count ? `Sus ${r.category_count} categorías quedarán sin ring asignado. ` : ''}Se borrarán sus descansos.`)) return;
      await api('DELETE', `/rings/${id}`); toast('Ring eliminado'); load();
    },
  });
  body.onchange = async (e) => {
    const s = e.target.closest('[data-op]'); if (!s) return;
    try { await api('PATCH', `/rings/${s.dataset.op}`, { operator_id: s.value || null }); toast('Operador actualizado'); load(); } catch (x) { toast(x.message, 'error'); load(); }
  };
  await load();
}

async function categoriesTab(ev, body, editable) {
  const canEdit = editable && can('category:write');
  const load = async () => {
    const [rings, cats] = await Promise.all([api('GET', `/events/${ev.id}/rings`), api('GET', `/events/${ev.id}/categories${catRing ? `?ring_id=${catRing}` : ''}`)]);
    const ringName = (id) => rings.find((r) => r.id === id)?.name ?? 'Sin asignar';
    body.rings = rings; body.cats = cats;
    body.innerHTML = `<div class="toolbar"><select id="fring" aria-label="Filtrar por ring"><option value="">Todos los rings</option>${rings.map((r) => `<option value="${r.id}" ${r.id === catRing ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      ${canEdit ? '<div class="acts"><button class="btn" data-act="import">Importar CSV</button><button class="btn primary" data-act="add">Nueva categoría</button><input type="file" id="csvfile" accept=".csv,text/csv" hidden></div>' : ''}</div>
      <div class="card">${!cats.length ? '<div class="empty"><strong>No hay categorías</strong>Crea categorías con su modalidad, edades, pesos, ring y hora.</div>'
      : `<div class="scroll"><table><thead><tr><th>Categoría</th><th>Modalidad</th><th>Género</th><th>Edad</th><th>Peso</th><th>Ring y hora</th><th>Inscritos</th><th></th></tr></thead><tbody>${cats.map((c) => `<tr>
        <td><strong>${esc(c.code)}</strong><small>${esc(c.name)}</small></td><td>${esc(c.modality)}${c.level ? `<small>${esc(c.level)}</small>` : ''}</td><td>${GENDER[c.gender]}</td>
        <td>${range(c.age_min, c.age_max, 'años')}</td><td>${range(c.weight_min, c.weight_max, 'kg')}</td>
        <td>${esc(ringName(c.ring_id))}<small>${c.start_time ? esc(c.start_time) + ' · ' + c.est_minutes + ' min' : 'Sin hora'}</small></td><td>${c.registered_count || '—'}</td>
        <td><div class="acts">${canEdit ? `<button class="btn sm" data-act="edit" data-id="${c.id}">Editar</button><button class="btn sm danger" data-act="del" data-id="${c.id}">Eliminar</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`}</div>`;
    $('#fring', body).onchange = (e) => { catRing = e.target.value; load().catch((x) => toast(x.message, 'error')); };
  };
  const fields = () => [
    { name: 'code', label: 'Código', req: true, attrs: 'maxlength="20"' }, { name: 'modality', label: 'Modalidad', req: true, list: ['Kata', 'Kumite', 'Dupleta puntos', 'Tag team', 'Exhibición'] },
    { name: 'name', label: 'Nombre', req: true, wide: true, attrs: 'maxlength="150"' },
    { name: 'gender', label: 'Género', type: 'select', options: opts(GENDER) }, { name: 'level', label: 'Nivel o grado', list: ['Principiante', 'Intermedio', 'Avanzado', 'Cinta Negra'] },
    { name: 'age_min', label: 'Edad mínima', type: 'number', attrs: 'min="0" max="120"' }, { name: 'age_max', label: 'Edad máxima', type: 'number', attrs: 'min="0" max="120"' },
    { name: 'weight_min', label: 'Peso mínimo (kg)', type: 'number', attrs: 'min="0" step="0.1"' }, { name: 'weight_max', label: 'Peso máximo (kg)', type: 'number', attrs: 'min="0" step="0.1"' },
    { name: 'belts', label: 'Cintas permitidas (separadas por coma)', wide: true }, { name: 'max_participants', label: 'Máximo de participantes', type: 'number', attrs: 'min="1"' },
    { name: 'ring_id', label: 'Ring', type: 'select', options: [['', 'Sin asignar'], ...body.rings.map((r) => [r.id, r.name])] },
    { name: 'start_time', label: 'Hora de inicio', type: 'time' }, { name: 'est_minutes', label: 'Duración estimada (min)', type: 'number', attrs: 'min="1" max="600"', value: 30 },
    { name: 'sort_order', label: 'Orden', type: 'number', attrs: 'min="0"', value: 0 },
  ];
  const save = (id) => async (b) => {
    b.belts = (b.belts || '').split(',').map((s) => s.trim()).filter(Boolean);
    id ? await api('PATCH', `/categories/${id}`, b) : await api('POST', `/events/${ev.id}/categories`, b);
    toast('Categoría guardada'); load();
  };
  wire(body, {
    add: () => openForm({ title: 'Nueva categoría', fields: fields(), values: catRing ? { ring_id: catRing } : {}, submit: 'Guardar categoría', onSave: save() }),
    edit: (id) => { const c = body.cats.find((x) => x.id === id); openForm({ title: `Editar ${c.code}`, fields: fields(), values: { ...c, belts: c.belts.join(', ') }, submit: 'Guardar categoría', onSave: save(id) }); },
    del: async (id) => { const c = body.cats.find((x) => x.id === id); if (!confirm(`¿Eliminar la categoría ${c.code}?`)) return; await api('DELETE', `/categories/${id}`); toast('Categoría eliminada'); load(); },
    import: () => $('#csvfile', body).click(),
  });
  body.onchange = async (e) => {
    if (e.target.id !== 'csvfile' || !e.target.files[0]) return;
    const file = e.target.files[0]; e.target.value = '';
    try {
      const { rows, errors } = categoriesFromCsv(await file.text());
      if (errors.length) return alert(errors.join('\n'));
      if (!confirm(`Se leyeron ${rows.length} categorías de «${file.name}».\nLas nuevas se crean y las que ya existen (mismo código) se actualizan con los datos que traiga el archivo.\n\n¿Importar?`)) return;
      const r = await api('POST', `/events/${ev.id}/categories/import`, { rows });
      toast(`Importación lista: ${r.created} nuevas, ${r.updated} actualizadas`); load();
    } catch (x) {
      const list = (x.errors || []).slice(0, 8).map((m) => m.message).join('\n');
      alert(x.message + (list ? '\n\n' + list : ''));
    }
  };
  await load();
}

async function scheduleTab(ev, body, editable) {
  const canEdit = editable && can('schedule:write');
  const load = async () => {
    const { rings } = await api('GET', `/events/${ev.id}/schedule`);
    body.innerHTML = !rings.length ? '<div class="card"><div class="empty"><strong>No hay rings para mostrar</strong>Agrega rings en la pestaña Rings.</div></div>'
      : `${canEdit ? '<div class="toolbar"><span class="meta">Solo se ordenan las categorías con inscritos que aún no han iniciado.</span><button class="btn primary" data-act="auto">Asignar y ordenar por horario</button></div>' : ''}<div class="stack">${rings.map(({ ring, items, unscheduled }) => `<section class="card rcard"><header><h2>${esc(ring.name)}</h2>${canEdit ? `<button class="btn sm" data-act="brk" data-id="${ring.id}">Agregar descanso</button>` : ''}</header>
        ${items.length ? items.map((i) => `<div class="sitem ${i.kind === 'break' ? 'brk' : ''} ${i.conflict ? 'bad' : ''} ${i.kind !== 'break' && !i.registered ? 'dim' : ''}"><time>${i.start} – ${i.end}</time>
          <div>${i.kind === 'break' ? '' : `<strong>${esc(i.code)}</strong> `}${esc(i.title)}${i.conflict ? '<small>Se cruza con el elemento anterior</small>' : ''}</div>
          <div>${i.kind === 'break' ? `<span class="badge">Descanso</span> ${canEdit ? `<button class="btn sm danger" data-act="delbrk" data-id="${i.id}">Quitar</button>` : ''}` : (i.registered ? `<span class="badge ok">${i.registered} inscritos</span>` : '<span class="badge">Sin inscritos</span>')}</div></div>`).join('')
          : '<div class="note">Este ring todavía no tiene categorías con hora. Asígnalas en la pestaña Categorías.</div>'}
        ${unscheduled.length ? `<div class="note">Sin hora: ${unscheduled.map((u) => esc(u.code)).join(', ')}</div>` : ''}</section>`).join('')}</div>`;
  };
  wire(body, {
    auto: async () => {
      if (!confirm('Se repartirán entre los rings las categorías con inscritos que no tengan ring y se les pondrá hora en orden, respetando los descansos.\nLas horas de esas categorías se reemplazarán. ¿Continuar?')) return;
      const r = await api('POST', `/events/${ev.id}/autoschedule`, {}); toast(`${r.scheduled} categorías ordenadas por horario`); load();
    },
    brk: (ringId) => openForm({ title: 'Agregar descanso o pausa', submit: 'Guardar descanso',
      fields: [{ name: 'title', label: 'Título', req: true, wide: true, value: 'Descanso', attrs: 'maxlength="80"' }, { name: 'start_time', label: 'Hora de inicio', type: 'time', req: true }, { name: 'duration_min', label: 'Duración (min)', type: 'number', req: true, value: 30, attrs: 'min="1" max="600"' }],
      onSave: async (b) => { await api('POST', `/rings/${ringId}/breaks`, b); toast('Descanso agregado'); load(); } }),
    delbrk: async (id) => { if (!confirm('¿Quitar este descanso del horario?')) return; await api('DELETE', `/breaks/${id}`); toast('Descanso quitado'); load(); },
  });
  await load();
}

/* ---------- Control del torneo ---------- */
async function controlTab(ev, body, editable) {
  let last = '', seen = new Set(), first = true;
  const render = (d) => {
    const s = d.summary;
    const stat = (n, l, cls = '') => `<div class="stat ${cls}"><b>${n}</b><span>${l}</span></div>`;
    const row = (k) => `<div class="qrow ${k.status === 'calling' ? 'hot' : ''}" data-act="open" data-id="${k.id}" role="button" tabindex="0">
      <time>${k.start_time || '—'}</time><div><strong>${esc(k.code)}</strong> ${esc(k.name)}</div>
      <div class="qmeta">${k.present_count}/${k.registered_count} presentes</div><div>${badge(CAT_ST[k.status])}</div>
      <div>${editable && can('category:run') && ['pending', 'next'].includes(k.status) && k.ring_id ? `<button class="btn sm primary" data-act="call" data-id="${k.id}">Llamar</button>` : ''}</div></div>`;
    body.innerHTML = `<div class="stats">${stat(s.participants, 'Competidores')}${stat(s.categories_used, 'Categorías en uso')}${stat(s.waiting, 'En espera')}${stat(s.calling, 'En llamado', s.calling ? 'hot' : '')}${stat(s.in_progress, 'En curso')}${stat(s.finished, 'Finalizadas')}</div>
      ${d.calls.map((c) => `<div class="callbar"><strong>${esc(c.category.ring_name)}</strong> ${c.category.status === 'calling' ? 'está llamando a' : 'ya llamó a'} <strong>${esc(c.category.code)}</strong> · ${esc(c.category.name)} <span class="meta">(${c.competitors.length} competidores)</span> ${badge(CAT_ST[c.category.status])}</div>`).join('')}
      <div class="toolbar"><span class="meta">Solo aparecen las categorías que tienen inscritos.</span><div class="acts">
        ${editable && can('registration:write') ? '<button class="btn" data-act="late">Inscripción de último momento</button>' : ''}
        ${editable && can('schedule:write') ? '<button class="btn" data-act="auto">Asignar y ordenar por horario</button>' : ''}</div></div>
      <div class="stack">${d.rings.map(({ ring, queue }) => `<section class="card rcard"><header><h2>${esc(ring.name)}</h2><span class="meta">${queue.length} por competir</span></header>
        ${queue.length ? queue.map(row).join('') : '<div class="note">No hay categorías con inscritos pendientes en este ring.</div>'}</section>`).join('')}
        ${d.unassigned.length ? `<section class="card rcard"><header><h2>Sin ring asignado</h2><span class="meta">${d.unassigned.length}</span></header>${d.unassigned.map(row).join('')}<div class="note">Usa «Asignar y ordenar por horario» o asígnales ring en la pestaña Categorías.</div></section>` : ''}</div>`;
  };
  const load = async () => {
    const d = await api('GET', `/events/${ev.id}/control`), sig = JSON.stringify(d);
    if (sig === last) return; last = sig;
    const hot = d.calls.filter((c) => c.category.status === 'calling');
    if (!first && hot.some((c) => !seen.has(c.category.id))) { beep(); toast('Están llamando a una categoría'); }
    hot.forEach((c) => seen.add(c.category.id)); first = false;
    render(d);
  };
  const reload = () => { last = ''; return load(); };
  wire(body, {
    open: (id) => openCategory(id, editable, reload),
    call: async (id) => { await api('POST', `/categories/${id}/call`); toast('Categoría enviada a llamado'); reload(); },
    late: () => openRegister(ev, 'late', reload),
    auto: async () => {
      if (!confirm('Se repartirán entre los rings las categorías con inscritos que no tengan ring y se les pondrá hora en orden, respetando los descansos.\nLas horas de esas categorías se reemplazarán. ¿Continuar?')) return;
      const r = await api('POST', `/events/${ev.id}/autoschedule`, {}); toast(`${r.scheduled} categorías ordenadas por horario`); reload();
    },
  });
  body.onkeydown = (e) => { if (e.key === 'Enter' && e.target.dataset?.act === 'open') e.target.click(); };
  await load();
  pollTimer = setInterval(() => load().catch(() => {}), 4000);
}

async function openCategory(id, editable, changed) {
  const d = document.createElement('dialog'); d.className = 'big';
  document.body.append(d); d.addEventListener('close', () => { d.remove(); changed(); });
  const draw = async () => {
    const { category: k, competitors } = await api('GET', `/categories/${id}/competitors`);
    d.cat = k;
    const run = editable && can('category:run');
    const att = (c) => (run && k.status !== 'finished'
      ? `<div class="seg noprint"><button class="btn sm ${c.attendance === 'present' ? 'primary' : ''}" data-att="present" data-id="${c.registration_id}">Presente</button><button class="btn sm ${c.attendance === 'absent' ? 'danger' : ''}" data-att="absent" data-id="${c.registration_id}">Ausente</button></div><span class="printonly">☐ Presente &nbsp; ☐ Ausente</span>`
      : (c.place ? badge([PLACE[c.place], 'ok']) : badge(c.attendance === 'present' ? ['Presente', 'ok'] : c.attendance === 'absent' ? ['Ausente', 'warn'] : ['Sin marcar', ''])));
    const acts = [];
    if (run) {
      if (['pending', 'next'].includes(k.status)) acts.push('<button class="btn primary" data-do="call">Llamar categoría</button>');
      if (k.status === 'calling') acts.push('<span class="meta">Esperando el llamado por micrófono…</span><button class="btn" data-do="cancel">Cancelar llamado</button>');
      if (k.status === 'preparing') acts.push('<button class="btn" data-do="call">Volver a llamar</button><button class="btn primary" data-do="start">Guardar e iniciar categoría</button>');
      if (k.status === 'in_progress') acts.push('<button class="btn primary" data-do="bracket">Abrir tabla de clasificación</button>');
    }
    if (editable && can('announce') && k.status === 'calling') acts.push('<button class="btn primary" data-do="announced">Ya hice el llamado por micrófono</button>');
    if (k.status === 'finished' && editable && can('category:write')) acts.push('<button class="btn" data-do="reopen">Reabrir categoría</button>');
    d.innerHTML = `<div class="cat-head"><div class="title-row"><h2>${esc(k.code)} · ${esc(k.name)}</h2>${badge(CAT_ST[k.status])}</div>
      <p class="meta">${esc(k.ring_name || 'Sin ring')} · ${k.start_time || 'sin hora'} · ${k.registered_count} inscritos · ${k.present_count} presentes</p></div>
      <div class="cat-body"><div class="scroll"><table><thead><tr><th>N.º</th><th>Competidor</th><th>Academia</th><th>Edad</th><th>Cinta</th><th>Asistencia</th><th class="pcol">Firma</th></tr></thead><tbody>
      ${competitors.map((c, i) => `<tr><td>${i + 1}</td><td><strong>${esc(c.full_name)}</strong></td><td>${esc(c.club || '—')}</td><td>${c.age}</td><td>${esc(c.belt)}</td><td>${att(c)}</td><td class="pcol"></td></tr>`).join('')}</tbody></table></div></div>
      <div class="cat-foot"><button class="btn noprint" data-do="print">Imprimir asistencia</button>${acts.join('')}<button class="btn noprint" data-do="close-dialog">Cerrar ventana</button></div>`;
    d.competitors = competitors;
  };
  const doAction = {
    call: async () => { await api('POST', `/categories/${id}/call`); toast('Categoría enviada a llamado'); },
    cancel: async () => { await api('POST', `/categories/${id}/cancel-call`); toast('Llamado cancelado'); },
    announced: async () => { await api('POST', `/categories/${id}/announced`); toast('Llamado registrado'); },
    start: async () => { const k = await api('POST', `/categories/${id}/start`); toast('Categoría en curso'); d.close(); location.hash = usesBracket(k) ? `#/categoria/${id}` : `#/kata/${id}`; },
    bracket: async () => { d.close(); location.hash = usesBracket(d.cat) ? `#/categoria/${id}` : `#/kata/${id}`; },
    reopen: async () => { if (!confirm('¿Reabrir esta categoría? Dejará de aparecer como cerrada.')) return; await api('POST', `/categories/${id}/reopen`); toast('Categoría reabierta'); },
    print: async () => window.print(),
    'close-dialog': async () => d.close(),
  };
  d.onclick = async (e) => {
    const a = e.target.closest('[data-att]'), x = e.target.closest('[data-do]');
    try {
      if (a) { await api('PATCH', `/registrations/${a.dataset.id}/attendance`, { attendance: a.dataset.att }); await draw(); }
      else if (x && doAction[x.dataset.do]) { await doAction[x.dataset.do](); if (d.isConnected) await draw(); }
    } catch (err) { toast(err.message, 'error'); }
  };
  await draw(); d.showModal();
}

/* ---------- Inscritos ---------- */
function showErrors(x) {
  const list = (x.errors || []).slice(0, 8).map((m) => m.message ?? m).join('\n');
  alert(x.message + (list ? '\n\n' + list : ''));
}
async function registrationsTab(ev, body, editable) {
  let rows = [], filter = '';
  const canEdit = editable && can('registration:write');
  body.innerHTML = `<div class="toolbar"><input id="rq" type="search" placeholder="Buscar por nombre, academia o categoría" aria-label="Buscar inscrito"><div class="acts">
    ${canEdit ? '<button class="btn" data-act="import">Importar CSV</button><button class="btn primary" data-act="add">Inscribir competidor</button><input type="file" id="pfile" accept=".csv,text/csv" hidden>' : ''}</div></div>
    <p class="meta" id="rsum"></p><div class="card" id="rlist"></div>`;
  const draw = () => {
    const f = filter.toLowerCase(), list = rows.filter((r) => !f || [r.full_name, r.club, r.category_code].some((v) => (v || '').toLowerCase().includes(f)));
    $('#rsum', body).textContent = `${new Set(rows.map((r) => r.person_id)).size} competidores · ${rows.length} inscripciones${f ? ` · ${list.length} coinciden con la búsqueda` : ''}`;
    $('#rlist', body).innerHTML = !list.length ? '<div class="empty"><strong>No hay inscritos</strong>Inscribe competidores uno por uno o importa un archivo CSV.</div>'
      : `<div class="scroll"><table><thead><tr><th>Competidor</th><th>Género y edad</th><th>Cinta</th><th>Peso</th><th>Categoría</th><th>Origen</th><th></th></tr></thead><tbody>${list.map((r) => `<tr>
        <td><strong>${esc(r.full_name)}</strong><small>${esc(r.club || 'Sin academia')}</small></td><td>${r.gender === 'M' ? 'Masculino' : 'Femenino'} · ${r.age} años</td><td>${esc(r.belt)}</td><td>${r.weight ? r.weight + ' kg' : '—'}</td>
        <td><strong>${esc(r.category_code)}</strong></td><td>${r.origin === 'late' ? badge(['Último momento', 'warn']) : r.origin === 'import' ? badge(['Importado', '']) : badge(['Manual', ''])}</td>
        <td><div class="acts">${canEdit ? `<button class="btn sm danger" data-act="del" data-id="${r.id}">Quitar</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
  };
  const load = async () => { rows = await api('GET', `/events/${ev.id}/registrations`); draw(); };
  $('#rq', body).oninput = (e) => { filter = e.target.value; draw(); };
  wire(body, {
    add: () => openRegister(ev, 'manual', load), import: () => $('#pfile', body).click(),
    del: async (id) => { const r = rows.find((x) => x.id === id); const warn = r.category_status === 'finished' ? '\n\nLa categoría ya finalizó: si estaba en el podio, su lugar y sus resultados se borrarán.' : r.category_status === 'in_progress' ? '\n\nLa categoría está en curso: sus combates quedarán sin este competidor.' : '';
    if (!confirm(`¿Quitar a ${r.full_name} de la categoría ${r.category_code}?${warn}`)) return; await api('DELETE', `/registrations/${id}`); toast('Inscripción eliminada'); load(); },
  });
  body.onchange = async (e) => {
    if (e.target.id !== 'pfile' || !e.target.files[0]) return;
    const file = e.target.files[0]; e.target.value = '';
    try {
      const { rows: data, errors } = participantsFromCsv(await file.text());
      if (errors.length) return alert(errors.join('\n'));
      if (!confirm(`Se leyeron ${data.length} competidores de «${file.name}».\nSi alguno ya estaba inscrito en esa categoría, se omite.\n\n¿Importar?`)) return;
      const r = await api('POST', `/events/${ev.id}/registrations/import`, { rows: data });
      toast(`Importación lista: ${r.created} inscripciones nuevas (${r.already} ya existían)`); load();
    } catch (x) { showErrors(x); }
  };
  await load();
}

function openRegister(ev, origin, done) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="form"><h2>${origin === 'late' ? 'Inscripción de último momento' : 'Inscribir competidor'}</h2>
    <div class="row"><label class="wide">Nombre completo<input name="full_name" required maxlength="120"></label>
      <label>Género<select name="gender" required><option value="">Elegir…</option><option value="M">Masculino</option><option value="F">Femenino</option></select></label>
      <label>Edad<input name="age" type="number" min="1" max="99" required></label>
      <label>Cinta<select name="belt" required><option value="">Elegir…</option>${BELTS.map((b) => `<option>${b}</option>`).join('')}</select></label>
      <label>Peso (kg)<input name="weight" type="number" step="0.1" min="1"></label><label>Altura (m)<input name="height" type="number" step="0.01" min="0.3"></label>
      <label class="wide">Academia<input name="club" maxlength="120"></label></div>
    <fieldset class="elig"><legend>Categorías compatibles</legend><div id="elig" class="elig-list"><p class="note">Completa género, edad y cinta para ver las categorías.</p></div></fieldset>
    <p class="err" id="ferr" role="alert"></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Inscribir</button></div></form>`;
  const form = $('form', d), val = (n) => form.elements[n].value;
  const refresh = async () => {
    if (!val('gender') || !val('age') || !val('belt')) return;
    try {
      const qs = new URLSearchParams({ gender: val('gender'), age: val('age'), belt: val('belt'), weight: val('weight') });
      const list = await api('GET', `/events/${ev.id}/eligible?${qs}`);
      $('#elig', d).innerHTML = list.length ? list.map((k) => `<label><input type="checkbox" name="cat" value="${k.id}"><span><strong>${esc(k.code)}</strong> ${esc(k.name)}${k.start_time ? ` · ${k.start_time}` : ''}</span></label>`).join('')
        : '<p class="note">No hay categorías compatibles con estos datos.</p>';
    } catch (x) { $('#elig', d).innerHTML = `<p class="err">${esc(x.message)}</p>`; }
  };
  form.addEventListener('change', (e) => { if (['gender', 'age', 'belt', 'weight'].includes(e.target.name)) refresh(); });
  const send = (force) => {
    const f = new FormData(form), b = Object.fromEntries(f);
    b.category_ids = f.getAll('cat'); delete b.cat; b.origin = origin; b.force = force;
    return api('POST', `/events/${ev.id}/registrations`, b);
  };
  d.onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    try { await send(false); d.close(); toast('Competidor inscrito'); done(); }
    catch (x) {
      if (x.errors?.length && confirm(`${x.errors.join('\n')}\n\n¿Inscribir de todos modos?`)) {
        try { await send(true); d.close(); toast('Competidor inscrito'); done(); } catch (y) { $('#ferr', d).textContent = y.message; }
      } else $('#ferr', d).textContent = x.message;
    }
  };
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal();
}

/* ---------- Categorías cerradas ---------- */
async function closedTab(ev, body, editable) {
  const load = async () => {
    const list = await api('GET', `/events/${ev.id}/closed`);
    body.innerHTML = !list.length ? '<div class="card"><div class="empty"><strong>Todavía no hay categorías cerradas</strong>Cuando cierres una categoría, aparecerá aquí con sus resultados.</div></div>'
      : `<div class="stack">${list.map(({ category: k, podium }) => `<section class="card rcard"><header><div><h2>${esc(k.code)}</h2><span class="meta">${esc(k.name)} · ${esc(k.ring_name || '')} · cerrada a las ${fmtTime(k.closed_at)}</span></div>
        ${editable && can('category:write') ? `<button class="btn sm" data-act="reopen" data-id="${k.id}">Reabrir</button>` : ''}</header>
        ${podium.map((p) => `<div class="sitem"><time>${PLACE[p.place]}</time><div><strong>${esc(p.full_name)}</strong></div><div class="meta">${esc(p.club || '')}</div></div>`).join('')}</section>`).join('')}</div>`;
  };
  wire(body, { reopen: async (id) => { if (!confirm('¿Reabrir esta categoría? Volverá a la lista de control como «En curso».')) return; await api('POST', `/categories/${id}/reopen`); toast('Categoría reabierta'); load(); } });
  await load();
}

/* ---------- Micrófono (locutor) ---------- */
async function micTab(ev, body) {
  let last = '', seen = new Set(), first = true;
  const load = async () => {
    const { calls } = await api('GET', `/events/${ev.id}/control`), sig = JSON.stringify(calls);
    if (sig === last) return; last = sig;
    const hot = calls.filter((c) => c.category.status === 'calling');
    if (!first && hot.some((c) => !seen.has(c.category.id))) { beep(); toast('Nueva categoría para llamar', 'error'); }
    hot.forEach((c) => seen.add(c.category.id)); first = false;
    body.innerHTML = !calls.length ? '<div class="card"><div class="empty"><strong>No hay categorías por llamar</strong>Cuando un ring pida un llamado, aparecerá aquí con sonido.</div></div>'
      : `<div class="stack">${calls.map(({ category: k, competitors }) => `<section class="card rcard"><header><div><h2>${esc(k.ring_name)} · ${esc(k.code)}</h2><span class="meta">${esc(k.name)}</span></div>${badge(CAT_ST[k.status])}</header>
        <ol class="mic-list">${competitors.map((p) => `<li><strong>${esc(p.full_name)}</strong><span>${esc(p.club || '')}</span></li>`).join('')}</ol>
        <div class="note">${k.status === 'calling' ? `<button class="btn primary" data-act="done" data-id="${k.id}">Ya hice el llamado</button>` : 'Llamado realizado. El ring ya puede iniciar la categoría.'}</div></section>`).join('')}</div>`;
  };
  wire(body, { done: async (id) => { await api('POST', `/categories/${id}/announced`); toast('Llamado registrado'); last = ''; load(); } });
  await load();
  pollTimer = setInterval(() => load().catch(() => {}), 3000);
}

/* ---------- Tabla de clasificación ---------- */
async function bracketPage(catId) {
  let d = await api('GET', `/categories/${catId}/bracket`);
  const k = d.category;
  const main = shell('eventos', `<a class="crumb" href="#/eventos/${k.event_id}/control">← Volver al control</a><div class="bk" id="bk"></div>`);
  const roundName = (r, total) => (r === total ? 'FINAL' : r === total - 1 ? 'SEMIFINAL' : r === total - 2 ? 'CUARTOS DE FINAL' : `RONDA ${r}`);
  const draw = () => {
    const ms = d.matches, mains = ms.filter((m) => m.kind === 'main'), total = Math.max(...mains.map((m) => m.round)), bronze = ms.find((m) => m.kind === 'bronze');
    const final = mains.find((m) => m.round === total && m.position === 1);
    const champ = d.confirmed && final.winner_id ? (final.winner_id === final.red_id ? final.red_name : final.blue_name) : null;
    const opt = (id) => d.competitors.map((p) => `<option value="${p.registration_id}" ${p.registration_id === id ? 'selected' : ''}>${esc(p.full_name)}${p.club ? ' · ' + esc(p.club) : ''}</option>`).join('');
    const row = (m, side) => {
      const id = m[side + '_id'], slot = m[side + '_slot'];
      if (!d.confirmed && slot != null) return `<select class="bk-row" data-slot="${slot}" aria-label="Competidor">${opt(id)}</select>`;
      if (!id) return `<div class="bk-row empty">${m.bye && side === 'blue' ? 'Pasa directo' : 'Pendiente'}</div>`;
      const shown = d.confirmed && m.status !== 'pending' ? `<b>${m[side + '_score']}</b>` : '';
      return `<div class="bk-row ${m.winner_id === id && !m.bye ? 'win' : ''} ${m.status === 'finished' && !m.bye && m.winner_id !== id ? 'lose' : ''}"><span>${esc(m[side + '_name'])}</span>${shown}</div>`;
    };
    const box = (m) => `<div class="bk-match ${m.status === 'in_progress' ? 'live' : ''}">
      ${m.kind === 'bronze' ? '<div class="bk-tag">Tercer y cuarto lugar</div>' : d.confirmed && !m.bye ? `<div class="bk-tag">Combate ${m.number}</div>` : ''}
      ${row(m, 'red')}${row(m, 'blue')}
      ${d.confirmed && !m.bye ? (m.status === 'finished' ? '<div class="bk-foot muted">Finalizado</div>'
        : m.red_id && m.blue_id ? `<div class="bk-foot"><button class="btn sm primary" data-act="board" data-id="${m.id}">${m.status === 'in_progress' ? 'Continuar combate' : 'Entrar al tablero'}</button></div>` : '<div class="bk-foot muted">Esperando ganadores</div>') : ''}</div>`;
    const ages = k.age_min == null && k.age_max == null ? '' : `${k.age_min ?? ''}${k.age_max != null && k.age_max !== k.age_min ? ' a ' + k.age_max : ''} años · `;
    const canRun = can('category:run') && k.status === 'in_progress';
    $('#bk', main).innerHTML = `<div class="bk-head"><span class="bk-code">${esc(k.code)}</span><div><h1>${esc(k.name)}</h1><p>${ages}${esc((k.belts || []).join(' y '))}${(k.belts || []).length ? ' · ' : ''}${GENDER[k.gender]}</p></div>
        <div class="bk-stats"><div><small>HORARIO</small><b>${k.start_time || '—'}</b></div><div><small>RING</small><b>${esc((k.ring_name || '').replace('Ring ', '') || '—')}</b></div><div><small>COMPETIDORES</small><b>${d.competitors.length}</b></div></div></div>
      <div class="bk-panel"><div class="bk-top"><div><h2>Tabla de clasificación</h2><p>${d.confirmed ? 'Entra al tablero del combate que toque. Los ganadores avanzan solos a la final y al combate por el tercer lugar.' : 'Puedes modificar las parejas antes de confirmar.'}</p></div>
        <div class="acts">${!d.confirmed && canRun ? '<button class="btn" data-act="shuffle">Sortear de nuevo</button><button class="btn primary" data-act="confirm">Confirmar emparejamiento</button>' : ''}
          ${d.confirmed && can('category:write') && k.status === 'in_progress' && !ms.some((m) => !m.bye && m.status !== 'pending') ? '<button class="btn" data-act="reset">Deshacer emparejamiento</button>' : ''}
          ${d.podium && canRun ? '<button class="btn primary" data-act="close">Cerrar categoría y guardar resultados</button>' : ''}</div></div>
        <div class="bk-grid">${Array.from({ length: total }, (_, i) => i + 1).map((r) => `<div class="bk-col"><h3>${roundName(r, total)}</h3>${mains.filter((m) => m.round === r).map(box).join('')}</div>`).join('')}
          <div class="bk-col"><h3>CHAMPION</h3><div class="bk-champ">${champ ? esc(champ) : 'Pendiente'}</div></div>
          ${bronze ? `<div class="bk-col"><h3>3.º Y 4.º LUGAR</h3>${box(bronze)}</div>` : ''}</div>
        ${d.podium ? `<div class="bk-podium">${d.podium.map((p) => `<div><b>${PLACE[p.place]}</b><span>${esc(p.full_name)}</span><span class="meta">${esc(p.club || '')}</span></div>`).join('')}</div>` : ''}</div>`;
  };
  const reload = async () => { d = await api('GET', `/categories/${catId}/bracket`); draw(); };
  wire(main, {
    board: (id) => { location.hash = `#/marcador/${id}`; },
    shuffle: async () => { await api('POST', `/categories/${catId}/bracket/shuffle`); await reload(); },
    confirm: async () => { if (!confirm('¿Confirmar el emparejamiento? Después ya no se podrán cambiar las parejas.')) return; await api('POST', `/categories/${catId}/bracket/confirm`); toast('Emparejamiento confirmado'); await reload(); },
    reset: async () => { if (!confirm('¿Deshacer el emparejamiento y volver a editar las parejas?')) return; await api('POST', `/categories/${catId}/bracket/reset`); await reload(); },
    close: async () => {
      if (!confirm('Se cerrará la categoría con estos resultados:\n\n' + d.podium.map((p) => `${PLACE[p.place]}: ${p.full_name}`).join('\n'))) return;
      await api('POST', `/categories/${catId}/close`, { results: d.podium.map((p) => ({ registration_id: p.registration_id, place: p.place })) });
      toast('Categoría cerrada y resultados guardados'); location.hash = `#/eventos/${k.event_id}/control`;
    },
  });
  main.onchange = async (e) => {
    const sel = e.target.closest('[data-slot]'); if (!sel) return;
    const order = [...d.order], i = Number(sel.dataset.slot), j = order.indexOf(sel.value);
    [order[i], order[j]] = [order[j], order[i]];
    try { await api('PUT', `/categories/${catId}/bracket/order`, { order }); } catch (x) { toast(x.message, 'error'); }
    await reload();
  };
  draw();
}

/* ---------- Tablero del combate ---------- */
async function boardPage(matchId) {
  const { match: m0, category: k } = await api('GET', `/matches/${matchId}`);
  if (m0.status === 'finished') { toast('Este combate ya terminó'); location.hash = `#/categoria/${k.id}`; return; }
  if (!m0.red_id || !m0.blue_id) throw new Error('El combate todavía no tiene a los dos competidores');
  const S = { red: m0.red_score, blue: m0.blue_score, left: m0.seconds_left, running: false, endAt: 0, tiebreak: false, started: m0.status === 'in_progress', over: false };
  const pad = (n) => String(n).padStart(2, '0'), clock = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  const user = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
  const sideHtml = (side, label) => `<section class="b-side ${side}"><div class="b-who"><span class="b-lbl ${side}">COMPETIDOR ${label}</span><h2>${esc(m0[side + '_name'])}</h2><div class="b-club">${esc(m0[side + '_club'] || '')}</div></div>
    <div class="b-panel"><div class="b-box"><div class="b-photo">${m0[side + '_photo'] ? `<img src="${esc(m0[side + '_photo'])}" alt="">` : user}</div>
    <div class="b-pts"><b id="s-${side}">00</b><small>PUNTOS</small></div></div><div class="b-pm"><button data-pt="${side}:-1" aria-label="Quitar punto">−</button><button class="plus" data-pt="${side}:1" aria-label="Sumar punto">+</button></div></div></section>`;
  const ages = k.age_min == null && k.age_max == null ? '' : `${k.age_min ?? ''}${k.age_max != null && k.age_max !== k.age_min ? ' y ' + k.age_max : ''} años`;
  app.innerHTML = `<div class="board"><header class="b-top"><div><span class="b-logo"><b>DOKAN</b><small>SYSTEM</small></span><span class="b-ring">${esc(k.ring_name || '')}</span></div>
    <div class="b-title"><h1>${esc(k.name)}</h1><p>${[ages, (k.belts || []).join(' y '), GENDER[k.gender]].filter(Boolean).join(' | ')}</p></div>
    <div class="b-num"><div><small>COMBATE</small><b>${m0.kind === 'bronze' ? 'Tercer lugar' : `Combate ${m0.number}`}</b></div><span class="b-code">${esc(k.code)}</span></div></header>
    <main class="b-main">${sideHtml('red', 'ROJO')}<section class="b-center"><span class="b-lbl">TIEMPO OFICIAL</span><div class="b-trow"><i class="chev l"></i><div class="b-time" id="tm">02:00</div><i class="chev r"></i></div><div class="b-state" id="st"></div>
      <div class="b-adj"><button class="b-mini" data-t="-1">−1 s</button><button class="b-mini" data-t="1">+1 s</button></div></section>${sideHtml('blue', 'AZUL')}</main>
    <footer class="b-foot"><div class="l"><button class="b-btn" id="rst">REINICIAR</button><button class="b-btn go" id="go">INICIAR</button></div><button class="b-btn fin" id="fin">FINALIZAR</button>
      <div class="r"><button class="b-btn" id="coach">COACH</button><button class="b-btn" id="back">REGRESAR</button></div></footer></div>`;
  const board = $('.board');
  const paint = () => {
    $('#tm').textContent = clock(S.left); $('#s-red').textContent = pad(S.red); $('#s-blue').textContent = pad(S.blue);
    const st = $('#st'); st.className = 'b-state' + (S.tiebreak ? ' tb' : '');
    st.textContent = S.tiebreak ? 'DESEMPATE · SIGUE EL COMBATE' : S.running ? 'EN CURSO' : S.left === 0 ? 'TIEMPO TERMINADO' : S.started ? 'PAUSADO' : 'LISTO PARA INICIAR';
    const go = $('#go'); go.textContent = S.running ? 'PAUSAR' : 'INICIAR'; go.disabled = S.left === 0 || S.over;
  };
  let saveT; const body = () => ({ red_score: S.red, blue_score: S.blue, seconds_left: S.left });
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api('PATCH', `/matches/${matchId}/score`, body()).catch(() => {}), 350); };
  const sync = () => { if (S.running) S.left = Math.max(0, Math.ceil((S.endAt - Date.now()) / 1000)); };
  const modal = (html) => { const el = document.createElement('div'); el.className = 'b-modal'; el.innerHTML = html; board.append(el); return { el, close: () => el.remove() }; };

  const winModal = () => {
    const side = S.red > S.blue ? 'red' : 'blue', mdl = modal(`<div class="b-card ${side}"><span class="b-lbl ${side}">GANADOR</span><h2>${side === 'red' ? 'ROJO' : 'AZUL'}</h2><p>${esc(m0[side + '_name'])}</p>
      <div class="b-pts2 ${side}">${pad(S[side])}</div><small>PUNTOS</small><button class="b-cta ${side}" id="ok">CONTINUAR</button><button class="b-link" id="no">Volver al combate</button></div>`);
    $('#no', mdl.el).onclick = mdl.close;
    $('#ok', mdl.el).onclick = async () => {
      try { S.over = true; S.running = false; clearTimeout(saveT); await api('PATCH', `/matches/${matchId}/score`, body()); await api('POST', `/matches/${matchId}/finish`); toast('Combate finalizado'); location.hash = `#/categoria/${k.id}`; }
      catch (x) { S.over = false; mdl.close(); toast(x.message, 'error'); paint(); }
    };
  };
  const tieModal = () => {
    const mdl = modal(`<div class="b-card gold"><span class="b-lbl gold">${S.left === 0 ? 'TIEMPO TERMINADO' : 'COMBATE EMPATADO'}</span><h2>EMPATE</h2>
      <div class="b-vs"><div><b class="red">${pad(S.red)}</b><small>ROJO</small></div><span>vs</span><div><b class="blue">${pad(S.blue)}</b><small>AZUL</small></div></div>
      <p>El combate queda listo para registrar el desempate.</p><button class="b-cta gold" id="ok">CERRAR Y MARCAR DESEMPATE</button></div>`);
    $('#ok', mdl.el).onclick = () => { S.tiebreak = true; mdl.close(); paint(); };
  };
  const decide = () => (S.red === S.blue ? tieModal() : winModal());

  const iv = setInterval(() => {
    if (!S.running) return;
    S.left = Math.max(0, Math.ceil((S.endAt - Date.now()) / 1000)); paint();
    if (S.left === 0) { S.running = false; paint(); save(); decide(); }
  }, 200);
  let coachT;
  onLeave = () => { clearInterval(iv); clearInterval(coachT); clearTimeout(saveT); if (!S.over && S.started) { sync(); api('PATCH', `/matches/${matchId}/score`, body()).catch(() => {}); } };

  board.onclick = async (e) => {
    const pt = e.target.closest('[data-pt]'), tm = e.target.closest('[data-t]');
    if (S.over) return;
    if (pt) { const [side, dv] = pt.dataset.pt.split(':'); S[side] = Math.max(0, S[side] + Number(dv)); paint(); save(); }
    if (tm) { sync(); S.left = Math.min(3600, Math.max(0, S.left + Number(tm.dataset.t))); if (S.running) S.endAt = Date.now() + S.left * 1000; paint(); save(); }
  };
  $('#go').onclick = async () => {
    try {
      if (S.running) { sync(); S.running = false; }
      else { if (!S.started) { await api('POST', `/matches/${matchId}/start`); S.started = true; } S.running = true; S.endAt = Date.now() + S.left * 1000; }
      paint(); save();
    } catch (x) { toast(x.message, 'error'); }
  };
  $('#fin').onclick = () => { if (S.over) return; sync(); S.running = false; paint(); decide(); };
  $('#rst').onclick = () => {
    if (!confirm('¿Reiniciar el combate? Los puntos y el tiempo vuelven a empezar.')) return;
    S.red = S.blue = 0; S.left = 120; S.running = false; S.tiebreak = false; paint(); save();
  };
  $('#back').onclick = () => { sync(); S.running = false; location.hash = `#/categoria/${k.id}`; };
  $('#coach').onclick = () => {
    if (S.over || $('.b-coach', board)) return;
    sync(); const was = S.running; S.running = false; let c = 10;
    const mdl = modal('<div class="b-card gold b-coach"><span class="b-lbl gold">TIEMPO DE COACH</span><h2>COACH</h2><div class="ring" id="cc">10</div><small>EL COMBATE SE REANUDARÁ AUTOMÁTICAMENTE</small></div>');
    paint();
    coachT = setInterval(() => {
      c -= 1; $('#cc', mdl.el).textContent = c;
      if (c <= 0) { clearInterval(coachT); mdl.close(); if (was && S.left > 0) { S.running = true; S.endAt = Date.now() + S.left * 1000; } paint(); save(); }
    }, 1000);
  };
  paint();
}

/* ---------- Kata (kata tradicional, kata con arma y especiales): tabla y tablero de jueces ---------- */
const KS = (n) => (n == null ? '—' : (n / 100).toFixed(2));            // nota de un juez (centésimas → 9.95)
const KT = (n) => (n == null ? '0.00' : (n / 100).toFixed(2));         // total de los 3 jueces
const KA = (n) => (n == null ? '—' : (n / 300).toFixed(2));            // promedio = total / 3
const KSCORES = Array.from({ length: 10 }, (_, i) => 990 + i);         // 9.90 … 9.99
const KATA_MAX = 3600;                                                 // el cronómetro cuenta desde 0:00 hasta lo que dure la presentación (tope 60:00)
const clock = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
const kWho = (c) => `<div class="k-comp"><div><strong>${esc(c.full_name)}</strong><small>${esc(c.club || 'Sin academia')} | Cinta: ${esc(c.belt || '')}</small></div></div>`;
const kCat = (k) => `<div class="k-catchip"><span>${esc(k.modality)}</span><span>${esc(k.name.split(' · ').slice(1).join(' · ') || k.name)}</span></div>`;

async function kataPage(catId) {
  let d = await api('GET', `/categories/${catId}/kata`);
  const k = d.category;
  const main = shell('eventos', `<a class="crumb" href="#/eventos/${k.event_id}/control">← Volver al control</a><div class="bk" id="bk"></div>`);
  const draw = () => {
    const open = k.status === 'in_progress' && can('category:run'), done = k.status === 'finished';
    const ages = k.age_min == null && k.age_max == null ? '' : `${k.age_min ?? ''}${k.age_max != null && k.age_max !== k.age_min ? ' a ' + k.age_max : ''} años · `;
    const names = (g) => g.map((x) => esc(x.full_name)).join(' y ');
    const tieBox = d.ties.length ? `<div class="k-warn" role="alert"><b>⚠ Empate de nota en la tabla</b>${d.ties.map((g) => `<p>${names(g)} tienen la misma nota total (<b>${KT(g[0].total)}</b>). Los jueces deben decidir la nota oficial: abre «Ver detalle» de cada uno y corrige la nota.</p>`).join('')}</div>` : '';
    const rank = (c) => (c.rank == null ? '<span class="meta">—</span>' : `<span class="k-rank r${Math.min(c.rank, 5)}">${c.rank}.º</span>`);
    const row = (c) => `<tr class="${c.tied ? 'tied' : ''}"><td class="num">${c.turn}</td><td>${kWho(c)}</td><td>${kCat(k)}</td>
      <td><span class="k-pts ${c.total == null ? '' : 'on'}">${KT(c.total)}</span>${c.total == null ? '' : `<small class="k-avg">Prom. ${KA(c.total)}</small>`}</td>
      <td class="c">${c.seconds == null ? '—' : clock(c.seconds)}</td><td>${rank(c)}${c.tied ? ' <span class="k-tag">EMPATE</span>' : ''}</td>
      <td class="act">${open || c.total != null ? `<button class="k-btn" data-act="score" data-id="${c.registration_id}">${c.total == null ? '▶ Iniciar' : '👁 Ver detalle'}</button>` : '<span class="meta">Sin nota</span>'}</td></tr>`;
    const rows = [...d.competitors].sort((a, b) => a.turn - b.turn);
    $('#bk', main).innerHTML = `<div class="bk-head"><span class="bk-code">${esc(k.code)}</span><div><h1>${esc(k.name)}</h1><p>${ages}${esc((k.belts || []).join(' y '))}${(k.belts || []).length ? ' · ' : ''}${GENDER[k.gender]} · ${esc(k.modality)}</p></div>
        <div class="bk-stats"><div><small>HORARIO</small><b>${k.start_time || '—'}</b></div><div><small>RING</small><b>${esc((k.ring_name || '').replace('Ring ', '') || '—')}</b></div><div><small>CALIFICADOS</small><b>${d.competitors.length - d.pending}/${d.competitors.length}</b></div></div></div>
      <div class="bk-panel"><div class="bk-top"><div><h2>Tabla de clasificación</h2><p>${done ? 'Categoría cerrada.' : 'Pulsa «Iniciar» para pasar al escenario del competidor. El puntaje es la suma de los 3 jueces.'}</p></div>
        <div class="acts">${open && !d.competitors.some((c) => c.total != null) ? '<button class="btn" data-act="shuffle">Sortear de nuevo</button>' : ''}
          ${open ? `<button class="btn primary" data-act="close" ${d.complete ? '' : 'disabled'} title="${d.complete ? '' : 'Faltan competidores por calificar'}">Cerrar categoría y guardar resultados</button>` : ''}</div></div>
        ${open && !d.complete ? `<p class="meta">Faltan ${d.pending} por calificar para poder cerrar la categoría.</p>` : ''}${tieBox}
        <div class="scroll"><table class="k-table"><thead><tr><th class="num">No.</th><th>Nombre del competidor</th><th>Categoría</th><th>Puntaje</th><th class="c">Presentación</th><th>Lugar</th><th class="act">Acciones</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>
        ${d.podium && d.podium.length ? `<div class="bk-podium">${d.podium.map((p) => `<div><b>${PLACE[p.place]}</b><span>${esc(p.full_name)}</span></div>`).join('')}</div>` : ''}</div>`;
  };
  const reload = async () => { d = await api('GET', `/categories/${catId}/kata`); draw(); };
  wire(main, {
    score: (rid) => { location.hash = `#/kata/${catId}/${rid}`; },
    shuffle: async () => { await api('POST', `/categories/${catId}/kata/shuffle`); await reload(); },
    close: async () => {
      if (d.ties.length) { // advertencia: no se guarda hasta que los jueces definan la nota oficial
        alert('⚠ No se puede cerrar la categoría todavía.\n\n' + d.ties.map((g) => `${g.map((x) => x.full_name).join(' y ')} tienen la misma nota total (${KT(g[0].total)}).`).join('\n') + '\n\nLos jueces deben decidir la nota oficial para definir el lugar. Corrige la nota de quien corresponda y vuelve a cerrar.');
        return;
      }
      if (!confirm('Se cerrará la categoría con estos resultados:\n\n' + d.podium.map((p) => `${PLACE[p.place]}: ${p.full_name}`).join('\n'))) return;
      await api('POST', `/categories/${catId}/close`, {});
      toast('Categoría cerrada y resultados guardados'); location.hash = `#/eventos/${k.event_id}/control`;
    },
  });
  draw();
}

async function kataBoard(catId, regId) {
  const d = await api('GET', `/categories/${catId}/kata`), k = d.category, c = d.competitors.find((x) => x.registration_id === regId);
  if (!c) throw new Error('Competidor no encontrado');
  const editable = k.status === 'in_progress' && can('category:run');
  const S = { j: [c.j1, c.j2, c.j3], secs: 0, running: false, startAt: 0, started: false, saving: false };
  const judge = (i) => `<label class="k-judge"><span>Juez ${i + 1}</span><select data-j="${i}" ${editable ? '' : 'disabled'} aria-label="Nota del juez ${i + 1}"><option value="">Selecciona nota...</option>${KSCORES.map((n) => `<option value="${n}" ${S.j[i] === n ? 'selected' : ''}>${KS(n)}</option>`).join('')}</select></label>`;
  app.innerHTML = `<div class="board kb"><header class="kb-top"><div class="kb-brand"><b>DOKAN</b><small>SYSTEM</small><span class="kb-ring">${esc(k.ring_name || '')}</span></div><div class="kb-user"><b>${esc(me.name)}</b><small>${esc(me.role_name)}</small></div></header>
    <main class="kb-main"><h1 class="kb-title">${/exhib|especial/i.test(`${k.modality} ${k.name}`) ? 'EXHIBICIÓN' : 'KATA'} <i>•</i> ESCENARIO</h1>
      <div class="kb-cards"><div class="kb-card"><div><small>Turno ${c.turn} de ${d.competitors.length}</small><strong>${esc(c.full_name)}</strong><span>${esc(c.club || 'Sin academia')} | Cinta: ${esc((c.belt || '').toUpperCase())}</span></div></div>
        <div class="kb-card cat"><div class="kb-trophy">🏆</div><div><small>Categoría</small><strong>${esc(k.modality)}</strong><span>${esc(k.name.split(' · ').slice(1, 2).join(''))} ${GENDER[k.gender] ? '· ' + esc(GENDER[k.gender]) : ''}</span></div></div></div>
      <section class="kb-clock"><div class="kb-time" id="tm">0:00</div><div class="kb-judges">${[0, 1, 2].map(judge).join('')}</div><p class="kb-sum" id="ks"></p></section>
      <div class="kb-btns"><button class="kb-btn go" id="go" ${editable ? '' : 'disabled'}>▶ INICIAR</button><button class="kb-btn pause" id="ps" ${editable ? '' : 'disabled'}>❚❚ PAUSA</button><button class="kb-btn reset" id="rst" ${editable ? '' : 'disabled'}>⟲ RESET</button><button class="kb-btn fin" id="fin" ${editable ? '' : 'disabled'}>⚑ FINALIZAR</button></div></main>
    <footer class="kb-foot"><button class="kb-back" id="back">← REGRESAR</button><span class="kb-sig"><i></i> <b>DOKAN</b> SYSTEM <i></i></span><button class="kb-full" id="full" aria-label="Pantalla completa">⛶</button></footer></div>`;
  const board = $('.board'), ready = () => S.j.every((n) => n != null), total = () => S.j.reduce((a, n) => a + (n ?? 0), 0);
  const sync = () => { if (S.running) S.secs = Math.min(KATA_MAX, Math.floor((Date.now() - S.startAt) / 1000)); };
  const paint = () => {
    $('#tm').textContent = clock(S.secs);
    $('#ks').innerHTML = ready() ? `Total <b>${KT(total())}</b> · Promedio <b>${KA(total())}</b>` : `Faltan ${S.j.filter((n) => n == null).length} nota(s) de juez`;
    if (editable) { $('#go').disabled = S.running || S.secs >= KATA_MAX; $('#ps').disabled = !S.running; $('#fin').disabled = S.saving; }
  };
  const iv = setInterval(() => { if (!S.running) return; sync(); paint(); if (S.secs >= KATA_MAX) { S.running = false; beep(); toast('Se alcanzó el tope de 60:00'); paint(); } }, 200);
  onLeave = () => clearInterval(iv);
  board.onchange = (e) => { const sel = e.target.closest('[data-j]'); if (!sel) return; S.j[Number(sel.dataset.j)] = sel.value ? Number(sel.value) : null; paint(); };
  $('#go').onclick = () => { S.running = true; S.started = true; S.startAt = Date.now() - S.secs * 1000; paint(); };
  $('#ps').onclick = () => { sync(); S.running = false; paint(); };
  $('#rst').onclick = () => {
    if (!confirm('¿Reiniciar? El cronómetro vuelve a 0:00 y se borran las notas seleccionadas.')) return;
    S.running = false; S.started = false; S.secs = 0; S.j = [null, null, null]; board.querySelectorAll('[data-j]').forEach((x) => { x.value = ''; }); paint();
  };
  $('#back').onclick = () => { location.hash = `#/kata/${catId}`; };
  $('#full').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
  $('#fin').onclick = () => {
    sync(); S.running = false; paint();
    if (!ready()) { toast('Selecciona la nota de los 3 jueces antes de finalizar', 'error'); return; }
    const used = S.started ? S.secs : null;
    const el = document.createElement('div'); el.className = 'b-modal';
    el.innerHTML = `<div class="b-card k-final"><span class="b-lbl gold">NOTA FINAL</span><h2 class="k-name">${esc(c.full_name)}</h2><div class="k-avgbig">${KA(total())}</div><button class="b-cta gold" id="ok">CONFIRMAR NOTA</button><button class="b-link" id="no">Volver a editar</button></div>`;
    board.append(el);
    $('#no', el).onclick = () => el.remove();
    $('#ok', el).onclick = async () => {
      try { S.saving = true; await api('PUT', `/categories/${catId}/kata/${regId}/scores`, { j1: KS(S.j[0]), j2: KS(S.j[1]), j3: KS(S.j[2]), seconds: used }); toast('Nota guardada'); location.hash = `#/kata/${catId}`; }
      catch (x) { S.saving = false; el.remove(); toast(x.message, 'error'); paint(); }
    };
  };
  paint();
}

/* ---------- Usuarios ---------- */
async function usersPage() {
  const main = shell('usuarios', `<header class="bar"><h1>Usuarios</h1><button class="btn primary" data-act="new">Nuevo usuario</button></header><div class="card" id="list"></div>`);
  let users = [], roles = [];
  const rname = (id) => roles.find((r) => r.id === id)?.name ?? id;
  const load = async () => {
    [users, roles] = await Promise.all([api('GET', '/users'), api('GET', '/roles')]);
    $('#list').innerHTML = `<div class="scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>${users.map((u) => `<tr>
      <td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${esc(rname(u.role_id))}</td>
      <td>${u.active ? badge(['Activo', 'ok']) : badge(['Inactivo', 'warn'])}</td><td><div class="acts"><button class="btn sm" data-act="edit" data-id="${u.id}">Editar</button></div></td></tr>`).join('')}</tbody></table></div>`;
  };
  const roleOpts = () => roles.map((r) => [r.id, r.name]);
  wire(main, {
    new: () => openForm({ title: 'Nuevo usuario', submit: 'Crear usuario',
      fields: [{ name: 'name', label: 'Nombre', req: true, wide: true }, { name: 'email', label: 'Correo', type: 'email', req: true }, { name: 'role_id', label: 'Rol', type: 'select', options: roleOpts(), value: 'ring_operator' },
        { name: 'password', label: 'Contraseña (mínimo 10 caracteres)', type: 'password', req: true, wide: true, attrs: 'minlength="10" autocomplete="new-password"' }],
      onSave: async (b) => { await api('POST', '/users', b); toast('Usuario creado'); load(); } }),
    edit: (id) => { const u = users.find((x) => x.id === id); openForm({ title: `Editar ${u.name}`, submit: 'Guardar cambios', values: u,
      fields: [{ name: 'name', label: 'Nombre', req: true, wide: true }, { name: 'role_id', label: 'Rol', type: 'select', options: roleOpts() }, { name: 'active', label: 'Estado', type: 'select', options: [['1', 'Activo'], ['0', 'Inactivo']] },
        { name: 'password', label: 'Nueva contraseña (déjala vacía para no cambiarla)', type: 'password', wide: true, attrs: 'minlength="10" autocomplete="new-password"' }],
      onSave: async (b) => { b.active = b.active === '1'; if (!b.password) delete b.password; await api('PATCH', `/users/${id}`, b); toast('Cambios guardados'); load(); } }); },
  });
  await load();
}

window.addEventListener('hashchange', route);
// La sesión es una cookie compartida por todas las pestañas del navegador. Si en otra pestaña se entra con otro usuario,
// esta pestaña seguiría mostrando el menú del anterior; al volver a ella se detecta y se actualiza.
window.addEventListener('focus', async () => {
  if (!me) return;
  try {
    const r = await fetch('/api/auth/me'), d = await r.json().catch(() => ({}));
    if (r.status === 401) { me = null; renderLogin(); }
    else if (r.ok && d.user.id !== me.id) { me = d.user; toast(`La sesión cambió en otra pestaña: ahora estás como ${me.name}`, 'error'); location.hash = '#/eventos'; route(); }
  } catch { /* sin conexión */ }
});
api('GET', '/auth/me').then((r) => { me = r.user; route(); }).catch(renderLogin);
