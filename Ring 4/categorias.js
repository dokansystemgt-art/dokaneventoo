// ==========================================================================
// 1. GENERACIÓN DE LA TABLA DE CATEGORÍAS EN LA INTERFAZ
// ==========================================================================

const catData = [
    {c: "DU-25", n: "DUPLETA PUNTOS 16 A 17 AÑOS PRINCIPIANTES MASCULINO", h: "9:00:00"},
    {c: "DU-26", n: "DUPLETA PUNTOS 16 A 17 AÑOS INTERMEDIO MASCULINO", h: "9:30:00"},
    {c: "DU-27", n: "DUPLETA PUNTOS 16 A 17 AÑOS AVANZADO MASCULINO", h: "10:00:00"},
    {c: "DL-15", n: "LIGHT CONTACT 10 A 12 AÑOS AVANZADO MASCULINO", h: "10:30:00"},
    {c: "DL-4", n: "LIGHT CONTACT 4 A 6 AÑOS PRINCIPIANTE FEMENINO", h: "11:00:00"},
    {c: "DL-7", n: "LIGHT CONTACT 7 A 9 AÑOS PRINCIPIANTE MASCULINO", h: "11:30:00"},
    {c: "DL-8", n: "LIGHT CONTACT 7 A 9 AÑOS INTERMEDIO MASCULINO", h: "12:00:00"},
    {c: "DL-10", n: "LIGHT CONTACT 7 A 9 AÑOS PRINCIPIANTE FEMENINO", h: "12:30:00"},
    {c: "DL-1", n: "LIGHT CONTACT 4 A 6 AÑOS PRINCIPIANTE MASCULINO", h: "1:00:00"},
    {c: "DL-18", n: "LIGHT CONTACT 10 A 12 AÑOS AVANZADO FEMENINO", h: "1:30:00"},
    {c: "DL-31", n: "LIGHT CONTACT 18+ AÑOS PRINCIPIANTE MASCULINO", h: "2:00:00"},
    {c: "DL-32", n: "LIGHT CONTACT 18+ AÑOS INTERMEDIO MASCULINO", h: "2:30:00"},
    {c: "DL-33", n: "LIGHT CONTACT 18+ AÑOS AVANZADO MASCULINO", h: "3:00:00"},
    {c: "DL-35", n: "LIGHT CONTACT 18+ AÑOS INTERMEDIO FEMENINO", h: "3:30:00"},
    {c: "DU-29", n: "DUPLETA PUNTOS 16 A 17 AÑOS INTERMEDIO FEMENINO", h: "4:00:00"}
];

const lista = document.getElementById('lista');

if (lista) {
    lista.innerHTML = "";

    catData.forEach(item => {
        const nombreCompletoCat = `${item.c} - ${item.n}`;
        
        lista.innerHTML += `<tr>
            <td>${item.c}</td>
            <td>${item.n}</td>
            <td>4</td>
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