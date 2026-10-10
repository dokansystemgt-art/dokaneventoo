// ==========================================================================
// 1. GENERACIÓN DE LA TABLA DE CATEGORÍAS EN LA INTERFAZ
// ==========================================================================

const catData = [
    {c: "DC-27", n: "DUPLETA CONTINUO 16 A 17 AÑOS AVANZADO MASCULINO", h: "9:00:00"},
    {c: "DC-34", n: "DUPLETA CONTINUO 18+ AÑOS PRINCIPIANTE FEMENINO", h: "9:30:00"},
    {c: "DL-26", n: "LIGHT CONTACT 16 A 17 AÑOS INTERMEDIO MASCULINO", h: "10:00:00"},
    {c: "DL-23", n: "LIGHT CONTACT 13 A 15 AÑOS INTERMEDIO FEMENINO", h: "10:30:00"},
    {c: "DC-15", n: "DUPLETA CONTINUO 10 A 12 AÑOS AVANZADO MASCULINO", h: "11:00:00"},
    {c: "DL-30", n: "LIGHT CONTACT 16 A 17 AÑOS AVANZADO FEMENINO", h: "11:30:00"},
    {c: "DU-9", n: "DUPLETA PUNTOS 7 A 9 AÑOS AVANZADO MASCULINO", h: "12:00:00"},
    {c: "DU-12", n: "DUPLETA PUNTOS 7 A 9 AÑOS AVANZADO FEMENINO", h: "12:30:00"}
];

const lista = document.getElementById('lista');

if (lista) {
    lista.innerHTML = "";

    catData.forEach(item => {
        const nombreCompletoCat = `${item.c} - ${item.n}`;
        
        lista.innerHTML += `<tr>
            <td>${item.c}</td>
            <td>${item.n}</td>
            <td>5</td>
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