const catActual = localStorage.getItem('selCat') || "KE-1 Kata Tradicional";
document.getElementById('catTitulo').innerText = `EXHIBICIONES: ${catActual}`;
document.getElementById('tablaSubtitulo').innerText = `COMPETIDORES - CATEGORIA ${catActual}`;

const STORAGE_ATLETAS_KATA = `dokan_katas_atleta_${catActual}`;
const STORAGE_FASE_KATA = `dokan_katas_fase_${catActual}`;

// Inicialización de la carpeta maestra global en localStorage
let carpetaTorneo = JSON.parse(localStorage.getItem('dokan_torneo')) || {};

// Carga de datos integrada con la estructura máster (o fallback para no romper lo viejo)
let atletas = carpetaTorneo[STORAGE_ATLETAS_KATA] || JSON.parse(localStorage.getItem(STORAGE_ATLETAS_KATA)) || [];
let faseActual = carpetaTorneo[STORAGE_FASE_KATA] || localStorage.getItem(STORAGE_FASE_KATA) || 'inscripcion';

let activeAtletaIdx = null;
let timerInterval;
let time = 0; 

function guardarEnStorageKata() {
    carpetaTorneo = JSON.parse(localStorage.getItem('dokan_torneo')) || {};
    
    carpetaTorneo[STORAGE_ATLETAS_KATA] = atletas;
    carpetaTorneo[STORAGE_FASE_KATA] = faseActual;
    
    localStorage.setItem('dokan_torneo', JSON.stringify(carpetaTorneo));
}

function registrarAtletaKata(e) {
    e.preventDefault();
    const nuevoAtleta = {
        id: Date.now(),
        nombre: document.getElementById('regNombreKata').value.trim(),
        academia: document.getElementById('regAcademiaKata').value.trim(),
        cinta: document.getElementById('regCintaKata').value.trim(),
        asistencia: 'PRESENTE', puntaje: 0.00, evaluado: false
    };
    atletas.push(nuevoAtleta);
    document.getElementById('formRegistroKata').reset();
    guardarEnStorageKata();
    actualizarListaInscritosKata();
    if (faseActual === 'presentacion') {
        alert(`Atleta registrado exitosamente.`);
        activarFasePresentacionKata();
    }
}

function actualizarListaInscritosKata() {
    document.getElementById('totalInscritosKata').innerText = atletas.length;
    document.getElementById('listaInscritosKata').innerHTML = atletas.map(a => `<li>${a.nombre} [${a.academia}]</li>`).join('');
}

function finalizarInscripcionKata() {
    if (atletas.length < 1) return alert("Registra al menos un atleta.");
    activarFasePresentacionKata();
}

function abrirInscripcionExtraKata() {
    document.getElementById('faseInscripcionKata').style.display = 'block';
    document.getElementById('faseInscripcionKata').scrollIntoView({ behavior: 'smooth' });
}

function activarFasePresentacionKata() {
    faseActual = 'presentacion'; guardarEnStorageKata();
    document.getElementById('faseInscripcionKata').style.display = 'none';
    document.getElementById('fasePresentacionKata').style.display = 'block';
    dibujarTablaKatas();
}

function dibujarTablaKatas() {
    const tbody = document.getElementById('tablaAtletasKata');
    tbody.innerHTML = '';
    if (atletas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="center">No hay atletas en esta categoría.</td></tr>`;
        return;
    }
    atletas.forEach((a, idx) => {
        const deshabilitado = (a.asistencia === 'AUSENTE' || a.evaluado) ? 'disabled' : '';
        const textoBoton = a.evaluado ? 'EVALUADO ✓' : 'INICIAR »';
        tbody.innerHTML += `
        <tr>
            <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
            <td><strong>${a.nombre}</strong><div style="color:#555; font-size:11px;">${a.academia} | Cinta: ${a.cinta}</div></td>
            <td style="text-align:center;">
                <select onchange="cambiarAsistenciaKata(${idx}, this.value)" ${a.evaluado ? 'disabled' : ''}>
                    <option value="PRESENTE" ${a.asistencia === 'PRESENTE' ? 'selected' : ''}>PRESENTE ✅</option>
                    <option value="AUSENTE" ${a.asistencia === 'AUSENTE' ? 'selected' : ''}>AUSENTE ❌</option>
                </select>
            </td>
            <td style="text-align:center;"><span class="puntaje-label">${a.puntaje.toFixed(2)}</span></td>
            <td style="text-align:center;"><button class="btn-play-atleta" ${deshabilitado} onclick="evaluarAtletaPantalla(${idx})">${textoBoton}</button></td>
        </tr>`;
    });
    verificarFinDeKata();
}

function cambiarAsistenciaKata(idx, valor) {
    atletas[idx].asistencia = valor;
    if (valor === 'AUSENTE') { atletas[idx].puntaje = 0.00; atletas[idx].evaluado = true; } 
    else { atletas[idx].evaluado = false; }
    guardarEnStorageKata(); dibujarTablaKatas();
}

function evaluarAtletaPantalla(idx) {
    activeAtletaIdx = idx; 
    time = 0;
    document.getElementById('timerKata').innerText = '00:00';
    document.getElementById('btnPlayKata').innerText = 'Iniciar';
    
    document.getElementById('juez1').value = "9.00";
    document.getElementById('juez2').value = "9.00";
    document.getElementById('juez3').value = "9.00";
    document.getElementById('puntajeFinalInput').value = "9.00";
    
    clearInterval(timerInterval);
    document.getElementById('atletaEvaluando').innerText = atletas[idx].nombre;
    document.getElementById('vistaSorteo').style.display = 'none';
    document.getElementById('vistaMarcadorKata').style.display = 'block';
}

function calcularPromedioKata() {
    let j1 = parseFloat(document.getElementById('juez1').value) || 0;
    let j2 = parseFloat(document.getElementById('juez2').value) || 0;
    let j3 = parseFloat(document.getElementById('juez3').value) || 0;

    if(document.getElementById('juez1').value.length >= 4 && (j1 < 9.00 || j1 > 9.99)) { alert("Rango permitido por Juez: 9.00 a 9.99"); document.getElementById('juez1').value = "9.00"; j1 = 9.00; }
    if(document.getElementById('juez2').value.length >= 4 && (j2 < 9.00 || j2 > 9.99)) { alert("Rango permitido por Juez: 9.00 a 9.99"); document.getElementById('juez2').value = "9.00"; j2 = 9.00; }
    if(document.getElementById('juez3').value.length >= 4 && (j3 < 9.00 || j3 > 9.99)) { alert("Rango permitido por Juez: 9.00 a 9.99"); document.getElementById('juez3').value = "9.00"; j3 = 9.00; }

    const promedio = (j1 + j2 + j3) / 3;
    document.getElementById('puntajeFinalInput').value = promedio.toFixed(2);
}

function toggleTimerKata() {
    clearInterval(timerInterval);
    document.getElementById('btnPlayKata').innerText = "Corriendo";
    timerInterval = setInterval(() => {
        time++;
        let m = Math.floor(time / 60), s = time % 60;
        document.getElementById('timerKata').innerText = `${m<10?'0':''}${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);
}

function pausarTimerKata() {
    clearInterval(timerInterval);
    document.getElementById('btnPlayKata').innerText = "Iniciar";
}

function resetTimerKata() {
    clearInterval(timerInterval);
    time = 0;
    document.getElementById('timerKata').innerText = '00:00';
    document.getElementById('btnPlayKata').innerText = "Iniciar";
}

function guardarEvaluacionKata() {
    clearInterval(timerInterval);
    const notaInput = parseFloat(document.getElementById('puntajeFinalInput').value);
    if (isNaN(notaInput) || notaInput < 0 || notaInput > 10) return alert("Puntaje total inválido.");
    atletas[activeAtletaIdx].puntaje = notaInput;
    atletas[activeAtletaIdx].evaluado = true;
    guardarEnStorageKata();
    forzarSalidaKata();
}

function forzarSalidaKata() {
    clearInterval(timerInterval);
    document.getElementById('vistaMarcadorKata').style.display = 'none';
    document.getElementById('vistaSorteo').style.display = 'block';
    dibujarTablaKatas();
}

function verificarFinDeKata() {
    const todosListos = atletas.length > 0 && atletas.every(a => a.evaluado);
    document.getElementById('areaPodioKata').style.display = todosListos ? 'block' : 'none';
}

function abrirModalPodioKata() {
    document.getElementById('modalKataCatTitulo').innerText = catActual;
    const medallero = document.getElementById('listaMedalleroKata');
    medallero.innerHTML = '';
    let clasificados = [...atletas].sort((x, y) => y.puntaje - x.puntaje);
    clasificados.forEach((atleta, index) => {
        medallero.innerHTML += `<li>${index + 1}. ${atleta.nombre} - ${atleta.puntaje.toFixed(2)} Pts</li>`;
    });
    document.getElementById('modalPodioKata').style.display = 'flex';
}

function cerrarModalPodioKata() { document.getElementById('modalPodioKata').style.display = 'none'; }

function borrarTodoKata() {
    if (confirm("⚠️ ¿Deseas borrar por completo todos los atletas inscritos en esta exhibición de Kata?")) {
        localStorage.removeItem('dokan_torneo');
        localStorage.removeItem(STORAGE_ATLETAS_KATA); 
        localStorage.removeItem(STORAGE_FASE_KATA); 
        location.reload();
    }
}

// ==========================================
// RESPALDO COMPLETO DE TODAS LAS CATEGORÍAS
// ==========================================

function exportarTorneoCompleto() {
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
            
            localStorage.setItem('dokan_torneo', JSON.stringify(datosParsed));
            alert("¡Base de datos global restaurada con éxito! Se actualizará la pantalla.");
            location.reload();
        } catch (error) {
            alert("Error: El archivo seleccionado no corresponde a un backup integral válido de DOKAN.");
        }
    };
    lector.readAsText(archivo);
}

if (faseActual === 'presentacion') activarFasePresentacionKata();
else actualizarListaInscritosKata();