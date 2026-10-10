// ==========================================================================
// 1. GENERACIÓN DE LA TABLA DE CATEGORÍAS EN LA INTERFAZ
// ==========================================================================

const catData = [
    {c: "DU-42", n: "DUPLETA PUNTOS 10 A 12 AÑOS CINTAS NEGRAS FEMENINO", h: "9:00:00"},
    {c: "DU-44", n: "DUPLETA PUNTOS 16 A 17 AÑOS CINTAS NEGRAS FEMENINO", h: "9:30:00"},
    {c: "DU-46", n: "DUPLETA PUNTOS 16 A 17 AÑOS CINTAS NEGRAS FEMENINO", h: "10:00:00"},
    {c: "DU-48", n: "DUPLETA PUNTOS 18+ AÑOS CINTAS NEGRAS FEMENINO", h: "10:30:00"},
    {c: "DU-13", n: "DUPLETA PUNTOS 10 A 12 AÑOS PRINCIPIANTE MASCULINO", h: "11:00:00"},
    {c: "DU-14", n: "DUPLETA PUNTOS 10 A 12 AÑOS INTERMEDIO MASCULINO", h: "11:30:00"},
    {c: "DU-15", n: "DUPLETA PUNTOS 10 A 12 AÑOS AVANZADO MASCULINO", h: "12:00:00"},
    {c: "DU-16", n: "DUPLETA PUNTOS 10 A 12 AÑOS PRINCIPIANTE FEMENINO", h: "12:30:00"},
    {c: "DU-17", n: "DUPLETA PUNTOS 10 A 12 AÑOS INTERMEDIO FEMENINO", h: "1:00:00"},
    {c: "DU-19", n: "DUPLETA PUNTOS 13 A 15 AÑOS PRINCIPIANTE MASCULINO", h: "1:30:00"},
    {c: "DU-20", n: "DUPLETA PUNTOS 13 A 15 AÑOS INTERMEDIO MASCULINO", h: "2:00:00"},
    {c: "DU-21", n: "DUPLETA PUNTOS 13 A 15 AÑOS AVANZADO MASCULINO", h: "2:30:00"},
    {c: "DU-22", n: "DUPLETA PUNTOS 13 A 15 AÑOS PRINCIPIANTE FEMENINO", h: "3:00:00"},
    {c: "DU-23", n: "DUPLETA PUNTOS 13 A 15 AÑOS INTERMEDIO FEMENINO", h: "3:30:00"},
    {c: "DU-24", n: "DUPLETA PUNTOS 13 A 15 AÑOS AVANZADO FEMENINO", h: "4:00:00"},
    {c: "DU-35", n: "DUPLETA PUNTOS 18+ AÑOS INTERMEDIO FEMENINO", h: "4:30:00"},
    {c: "DU-36", n: "DUPLETA PUNTOS 18+ AÑOS AVANZADO FEMENINO", h: "5:00:00"}
];

const lista = document.getElementById('lista');

if (lista) {
    lista.innerHTML = "";

    catData.forEach(item => {
        const nombreCompletoCat = `${item.c} - ${item.n}`;
        
        lista.innerHTML += `<tr>
            <td>${item.c}</td>
            <td>${item.n}</td>
            <td>2</td>
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