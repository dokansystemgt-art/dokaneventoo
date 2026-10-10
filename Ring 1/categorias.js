// ==========================================================================
// 1. GENERACIÓN DE LA TABLA DE CATEGORÍAS EN LA INTERFAZ
// ==========================================================================

const catData = [
    {c: "DU-41", n: "DUPLETA PUNTOS 10 A 12 AÑOS CINTAS NEGRAS MASCULINO", h: "9:00:00"},
    {c: "DU-45", n: "DUPLETA PUNTOS 16 A 17 AÑOS CINTAS NEGRAS MASCULINO", h: "9:30:00"},
    {c: "DU-31", n: "DUPLETA PUNTOS 18+ AÑOS PRINCIPIANTE MASCULINO", h: "10:00:00"},
    {c: "DU-1 (3 a 6)", n: "DUPLETA PUNTOS 3 A 6 AÑOS PRINCIPIANTE MASCULINO", h: "10:30:00"},
    {c: "DU-4", n: "DUPLETA PUNTOS 3 A 6 AÑOS PRINCIPIANTE FEMENINO", h: "11:00:00"},
    {c: "DU-32", n: "DUPLETA PUNTOS 18+ AÑOS INTERMEDIO MASCULINO", h: "11:30:00"},
    {c: "DU-33", n: "DUPLETA PUNTOS 18+ AÑOS AVANZADO MASCULINO", h: "12:00:00"},
    {c: "KE-1", n: "KATA TRADICIONAL EXHIBICIÓN - TODA EDAD - TODA CINTA", h: "12:30:00"},
    {c: "KE-2", n: "KATA EXTREMA EXHIBICIÓN - TODA EDAD - TODA CINTA", h: "1:00:00"},
    {c: "KE-3", n: "KATA CON ARMA EXHIBICIÓN - TODA EDAD - TODA CINTA", h: "1:30:00"},
    {c: "KE-4", n: "KATA MUSICA EXHIBICIÓN - TODA EDAD - TODA CINTA", h: "2:00:00"},
    {c: "KE-5", n: "KATA KEMPO EXHIBICIÓN - TODA EDAD - TODA CINTA", h: "2:30:00"},
    {c: "KE-7", n: "KATA EXHIBICIÓN GENERAL - TODA EDAD - TODA CINTA", h: "3:00:00"}
];

const lista = document.getElementById('lista');

if (lista) {
    lista.innerHTML = "";

    catData.forEach(item => {
        const nombreCompletoCat = `${item.c} - ${item.n}`;
        
        lista.innerHTML += `<tr>
            <td>${item.c}</td>
            <td>${item.n}</td>
            <td>1</td>
            <td>${item.h}</td>
            <td>
                <a href="javascript:void(0)" class="btn-inicio" onclick="iniciarCategoria('${nombreCompletoCat}')">✅ INICIO</a>
            </td>
        </tr>`;
    });
}

// ==========================================================================
// 2. LÓGICA DE REDIRECCIÓN INTELIGENTE (DECISIÓN DE PANTALLA)
// ==========================================================================

function iniciarCategoria(nombreCategoria) {
    localStorage.setItem('selCat', nombreCategoria);
    const nombreLimpio = nombreCategoria.trim().toUpperCase();
    
    if (nombreLimpio.startsWith("KE-")) {
        window.location.href = "sorteokatas.html";
    } else {
        window.location.href = "sorteos.html";
    }
}

// ==========================================================================
// 3. BOTÓN GLOBAL: INICIAR NUEVO EVENTO (BORRAR TODO)
// ==========================================================================
function reiniciarTodoElSistema() {
    // Primera confirmación
    const conf1 = confirm("⚠️ ¿Estás seguro de que deseas vaciar por completo el sistema?\nSe borrarán TODOS los competidores, peleas y notas de TODAS las categorías.");
    
    if (conf1) {
        // Segunda confirmación por seguridad
        const conf2 = confirm("🚨 ¡Esta acción no se puede deshacer! ¿Confirmas que vas a iniciar un NUEVO EVENTO?");
        
        if (conf2) {
            localStorage.clear(); // Borra absolutamente todo el LocalStorage
            alert("🧹 ¡Sistema vaciado con éxito! Todo está listo para el nuevo evento.");
            location.reload(); // Recarga la pantalla de categorías
        }
    }
}