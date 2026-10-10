const catActual = localStorage.getItem('selCat') || "Categoría General";
document.getElementById('catTitulo').innerText = catActual;

const STORAGE_COMPETIDORES = `dokan_comp_${catActual}`;
const STORAGE_PELEAS = `dokan_peleas_${catActual}`;
const STORAGE_FASE = `dokan_fase_${catActual}`;

// Inicialización de la "carpeta" en localStorage si no existe
let carpetaTorneo = JSON.parse(localStorage.getItem('dokan_torneo')) || {};

// Carga de datos desde la "carpeta" simulada o fallback al formato antiguo para compatibilidad
let competidores = carpetaTorneo[STORAGE_COMPETIDORES] || JSON.parse(localStorage.getItem(STORAGE_COMPETIDORES)) || [];
let peleas = carpetaTorneo[STORAGE_PELEAS] || JSON.parse(localStorage.getItem(STORAGE_PELEAS)) || [];
let faseActual = carpetaTorneo[STORAGE_FASE] || localStorage.getItem(STORAGE_FASE) || 'inscripcion'; 

let activeIdx = null;
let timerInterval;
let time = 120; 

function guardarEnStorage() {
    carpetaTorneo = JSON.parse(localStorage.getItem('dokan_torneo')) || {};
    
    carpetaTorneo[STORAGE_COMPETIDORES] = competidores;
    carpetaTorneo[STORAGE_PELEAS] = peleas;
    carpetaTorneo[STORAGE_FASE] = faseActual;
    
    localStorage.setItem('dokan_torneo', JSON.stringify(carpetaTorneo));
}

function registrarCompetidor(e) {
    e.preventDefault();
    const nuevo = {
        id: Date.now(),
        nombre: document.getElementById('regNombre').value.trim(),
        cinta: document.getElementById('regCinta').value.trim(),
        academia: document.getElementById('regAcademia').value.trim(),
        edad: document.getElementById('regEdad').value,
        peso: document.getElementById('regPeso').value,
        asignado: false
    };
    competidores.push(nuevo);
    document.getElementById('formRegistro').reset();
    guardarEnStorage();
    actualizarListaInscritos();
    if (faseActual === 'peleas') {
        alert(`${nuevo.nombre} agregado con éxito.`);
        activarFaseSorteoManual(); 
    }
}

function actualizarListaInscritos() {
    document.getElementById('totalInscritos').innerText = competidores.length;
    document.getElementById('listaInscritos').innerHTML = competidores.map(c => `<li>${c.nombre} (${c.academia})</li>`).join('');
}

function finalizarInscripcion() {
    if (competidores.length < 2) return alert("Registra mínimo 2 competidores.");
    activarFaseSorteoManual();
}

function abrirInscripcionExtra() {
    document.getElementById('faseInscripcion').style.display = 'block';
    document.getElementById('faseInscripcion').scrollIntoView({ behavior: 'smooth' });
}

function activarFaseSorteoManual() {
    faseActual = 'sorteo'; guardarEnStorage();
    document.getElementById('faseInscripcion').style.display = 'none';
    document.getElementById('faseSorteoManual').style.display = 'block';
    document.getElementById('fasePeleas').style.display = 'none';
    rellenarSelectores();
}

function rellenarSelectores() {
    const selectRojo = document.getElementById('selectRojo');
    const selectAzul = document.getElementById('selectAzul');
    const disponibles = competidores.filter(c => !c.asignado);
    let opciones = `<option value="">-- Escoger Competidor --</option>`;
    disponibles.forEach(c => { opciones += `<option value="${c.id}">${c.nombre} [${c.academia}]</option>`; });
    selectRojo.innerHTML = opciones; selectAzul.innerHTML = opciones;
    document.getElementById('btnFinalizarSorteo').style.display = disponibles.length < 2 ? 'inline-block' : 'none';
}

function armarPareja() {
    const idRojo = document.getElementById('selectRojo').value;
    const idAzul = document.getElementById('selectAzul').value;
    if (!idRojo || !idAzul) return alert("Selecciona ambos perfiles.");
    if (idRojo === idAzul) return alert("No se permite emparejar al mismo atleta.");
    
    const compRojo = competidores.find(c => c.id == idRojo);
    const compAzul = competidores.find(c => c.id == idAzul);
    compRojo.asignado = true; compAzul.asignado = true;
    
    peleas.push({
        id: peleas.length + 1, p1: compRojo, p2: compAzul, a1: 'SI', a2: 'SI',
        res1: '-', res2: '-', puntos1: 0, puntos2: 0, terminada: false
    });
    guardarEnStorage(); rellenarSelectores();
    if (competidores.filter(c => !c.asignado).length < 2) activarFasePeleas();
}

function activarFasePeleas() {
    faseActual = 'peleas'; guardarEnStorage();
    document.getElementById('faseInscripcion').style.display = 'none';
    document.getElementById('faseSorteoManual').style.display = 'none';
    document.getElementById('fasePeleas').style.display = 'block';
    dibujarPeleas();
}

function dibujarPeleas() {
    const contenedor = document.getElementById('contenedorPeleas');
    contenedor.innerHTML = '';
    if (peleas.length === 0) {
        contenedor.innerHTML = `<p class="center" style="padding:20px;">No se registran versus vigentes.</p>`;
        return;
    }
    peleas.forEach((p, index) => {
        const puedeIniciar = (p.a1 === 'SI' && p.a2 === 'SI' && !p.terminada) ? '' : 'disabled';
        contenedor.innerHTML += `
        <div class="fight-box">
            <div class="fight-header">
                <span>RECUADRO DE ENCUENTRO - COMBATE NO. ${p.id}</span>
                <button class="btn-iniciar" ${puedeIniciar} onclick="irMarcador(${index})">CARGAR EN MARCADOR >></button>
            </div>
            <table>
                <tr><th>ID</th><th>ATLETA</th><th>PRESENCIA</th><th>ESTADO REPORTE</th></tr>
                <tr>
                    <td>1</td>
                    <td><strong>${p.p1.nombre}</strong> (${p.p1.academia})</td>
                    <td>
                        <select onchange="checkAusente(${index}, 1, this.value)" ${p.terminada ? 'disabled' : ''}>
                            <option value="SI" ${p.a1=='SI'?'selected':''}>PRESENTE ✅</option>
                            <option value="NO" ${p.a1=='NO'?'selected':''}>AUSENTE ❌</option>
                        </select>
                    </td>
                    <td>${p.res1}</td>
                </tr>
                <tr>
                    <td>2</td>
                    <td><strong>${p.p2.nombre}</strong> (${p.p2.academia})</td>
                    <td>
                        <select onchange="checkAusente(${index}, 2, this.value)" ${p.terminada ? 'disabled' : ''}>
                            <option value="SI" ${p.a2=='SI'?'selected':''}>PRESENTE ✅</option>
                            <option value="NO" ${p.a2=='NO'?'selected':''}>AUSENTE ❌</option>
                        </select>
                    </td>
                    <td>${p.res2}</td>
                </tr>
            </table>
        </div>`;
    });
    verificarFinDeTorneo();
}

function checkAusente(idx, competidorNum, val) {
    if(competidorNum === 1) peleas[idx].a1 = val; else peleas[idx].a2 = val;
    if(peleas[idx].a1 == 'SI' && peleas[idx].a2 == 'NO') { 
        peleas[idx].res1 = '1. LUGAR (W.O.)'; peleas[idx].res2 = '2. LUGAR'; peleas[idx].terminada = true; 
    } else if(peleas[idx].a1 == 'NO' && peleas[idx].a2 == 'SI') { 
        peleas[idx].res1 = '2. LUGAR'; peleas[idx].res2 = '1. LUGAR (W.O.)'; peleas[idx].terminada = true; 
    } else { 
        peleas[idx].res1 = '-'; peleas[idx].res2 = '-'; peleas[idx].terminada = false; 
    }
    guardarEnStorage(); dibujarPeleas();
}

function irMarcador(idx) {
    activeIdx = idx;
    document.getElementById('p1').innerText = '00'; 
    document.getElementById('p2').innerText = '00';
    setTiempoManual(120);
    
    document.getElementById('n1').innerText = peleas[idx].p1.nombre;
    document.getElementById('n2').innerText = peleas[idx].p2.nombre;
    if(document.getElementById('kumiteCatTitulo')) {
        document.getElementById('kumiteCatTitulo').innerText = catActual;
    }
    
    document.getElementById('coachTime1').style.display = 'none';
    document.getElementById('coachTime2').style.display = 'none';
    
    document.getElementById('vistaSorteo').style.display = 'none';
    document.getElementById('vistaMarcador').style.display = 'block';
}

function updatePuntos(id, v) { 
    let actual = parseInt(document.getElementById(id).innerText) + v;
    if (actual < 0) actual = 0; 
    document.getElementById(id).innerText = actual < 10 ? '0' + actual : actual; 
}

function resetPuntosIndividual(id) {
    document.getElementById(id).innerText = '00';
}

function setTiempoManual(segundos) {
    clearInterval(timerInterval);
    time = segundos;
    let m = Math.floor(time/60), s = time%60;
    document.getElementById('timer').innerText = `${m<10?'0':''}${m}:${s<10?'0':''}${s}`;
}

function toggleTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if(time <= 0) {
            clearInterval(timerInterval);
            alert("¡FIN DEL TIEMPO!");
            return;
        }
        time--;
        let m = Math.floor(time/60), s = time%60;
        document.getElementById('timer').innerText = `${m<10?'0':''}${m}:${s<10?'0':''}${s}`;
    }, 1000);
}

function pausarTimer() {
    clearInterval(timerInterval);
}

function resetTimer() {
    setTiempoManual(120);
}

function alterarSegundos(segundos) {
    time += segundos;
    if (time < 0) time = 0; 
    let m = Math.floor(time / 60), s = time % 60;
    document.getElementById('timer').innerText = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function activarCoach(atletaNum) {
    const tag = document.getElementById(`coachTime${atletaNum}`);
    if (tag.style.display === 'block') return; 

    let seg = 10;
    tag.style.display = 'block';
    tag.innerText = "10s";
    
    const interval = setInterval(() => {
        seg--;
        tag.innerText = seg + "s";
        if (seg <= 0) {
            clearInterval(interval);
            tag.style.display = 'none';
        }
    }, 1000);
}

function terminarPelea() {
    clearInterval(timerInterval);
    let s1 = parseInt(document.getElementById('p1').innerText);
    let s2 = parseInt(document.getElementById('p2').innerText);
    if (s1 === s2) {
        let decision = prompt(`Empate (${s1}-${s2}). Marca 1 para Ganador Izquierda o 2 para Derecha:`);
        if (decision === "1") s1 += 0.1; else s2 += 0.1;
    }
    peleas[activeIdx].puntos1 = Math.floor(s1);
    peleas[activeIdx].puntos2 = Math.floor(s2);
    peleas[activeIdx].res1 = s1 > s2 ? `GANADOR (${Math.floor(s1)} pts)` : `PERDEDOR (${Math.floor(s1)} pts)`;
    peleas[activeIdx].res2 = s2 > s1 ? `GANADOR (${Math.floor(s2)} pts)` : `PERDEDOR (${Math.floor(s2)} pts)`;
    peleas[activeIdx].terminada = true;
    guardarEnStorage();
    forzarSalidaMarcador();
}

function forzarSalidaMarcador(){
    clearInterval(timerInterval);
    document.getElementById('vistaMarcador').style.display = 'none';
    document.getElementById('vistaSorteo').style.display = 'block';
    dibujarPeleas();
}

function verificarFinDeTorneo() {
    const todasTerminadas = peleas.length > 0 && peleas.every(p => p.terminada);
    document.getElementById('areaPodio').style.display = todasTerminadas ? 'block' : 'none';
}

function abrirModalGanadores() {
    document.getElementById('modalCatTitulo').innerText = catActual;
    const listaOro = document.getElementById('listaOro');
    const listaPlata = document.getElementById('listaPlata');
    listaOro.innerHTML = ''; listaPlata.innerHTML = '';
    
    peleas.forEach(p => {
        if (p.res1.includes('GANADOR')) {
            listaOro.innerHTML += `<li>🥇 ${p.p1.nombre} (${p.p1.academia})</li>`;
            listaPlata.innerHTML += `<li>🥈 ${p.p2.nombre} (${p.p2.academia})</li>`;
        } else {
            listaOro.innerHTML += `<li>🥇 ${p.p2.nombre} (${p.p2.academia})</li>`;
            listaPlata.innerHTML += `<li>🥈 ${p.p1.nombre} (${p.p1.academia})</li>`;
        }
    });
    document.getElementById('modalGanadores').style.display = 'flex';
}

function cerrarModalGanadores() { document.getElementById('modalGanadores').style.display = 'none'; }

function borrarTodosLosCompetidores() {
    if (confirm("¿Limpiar por completo los registros?")) {
        localStorage.removeItem('dokan_torneo');
        localStorage.removeItem(STORAGE_COMPETIDORES);
        localStorage.removeItem(STORAGE_PELEAS);
        localStorage.removeItem(STORAGE_FASE);
        location.reload();
    }
}

// ==========================================
// RESPALDO COMPLETO DE TODAS LAS CATEGORÍAS
// ==========================================

function exportarTorneoCompleto() {
    // Tomamos la carpeta maestra que contiene TODAS las categorías compiladas
    const datosCompletos = localStorage.getItem('dokan_torneo');
    if (!datosCompletos || datosCompletos === '{}') {
        return alert("No hay datos globales registrados en este sistema para exportar.");
    }
    
    const blob = new Blob([datosCompletos], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RESPALDO_TOTAL_DOKAN_SISTEM.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importarTorneoCompleto(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    
    const lector = new FileReader();
    lector.onload = function(e) {
        try {
            const datosParsed = JSON.parse(e.target.result);
            if (typeof datosParsed !== 'object') throw new Error();
            
            // Reemplaza de un solo golpe la base de datos completa del torneo
            localStorage.setItem('dokan_torneo', JSON.stringify(datosParsed));
            alert("¡Base de datos global restaurada con éxito! Se actualizará la pantalla.");
            location.reload();
        } catch (error) {
            alert("Error: El archivo seleccionado no corresponde a un backup integral válido de DOKAN.");
        }
    };
    lector.readAsText(archivo);
}

// Inicialización de flujos de fase
if (faseActual === 'sorteo') activarFaseSorteoManual();
else if (faseActual === 'peleas') activarFasePeleas();
else actualizarListaInscritos();