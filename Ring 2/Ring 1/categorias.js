// ==========================================================================
// 1. GENERACIÓN DE LA TABLA DE CATEGORÍAS EN LA INTERFAZ
// ==========================================================================

const catData = [
    {c:"DU-37", n:"Puntos Dupleta 4 a 6 años Cinta Negra Masculino", h:"8:00"},
    {c:"DU-39", n:"Puntos Dupleta 7 a 9 años Cinta Negra Masculino", h:"8:10"},
    {c:"DU-41", n:"Puntos Dupleta 10 a 12 años Cinta Negra Masculino", h:"8:20"},
    {c:"DU-43", n:"Puntos Dupleta 13 a 15 años Cinta Negra Masculino", h:"8:30"},
    {c:"DU-45", n:"Puntos Dupleta 16 a 17 años Cinta Negra Masculino", h:"8:40"},
    {c:"DU-47", n:"Puntos Dupleta 18+ años Cinta Negra Masculino", h:"8:50"},
    {c:"DU-1", n:"Puntos Dupleta 4 a 6 años Principiante Masculino", h:"9:00"},
    {c:"DU-2", n:"Puntos Dupleta 4 a 6 años Intermedio Masculino", h:"9:10"},
    {c:"DU-3", n:"Puntos Dupleta 4 a 6 años Avanzado Masculino", h:"9:20"},
    {c:"DU-4", n:"Puntos Dupleta 4 a 6 años Principiante Femenino", h:"9:30"},
    {c:"DU-5", n:"Puntos Dupleta 4 a 6 años Intermedio Femenino", h:"9:40"},
    {c:"DU-6", n:"Puntos Dupleta 4 a 6 años Avanzado Femenino", h:"9:50"},
    {c:"DU-31", n:"Puntos Dupleta 18+ años Principiante Masculino", h:"10:00"},
    {c:"DU-32", n:"Puntos Dupleta 18+ años Intermedio Masculino", h:"10:10"},
    {c:"DU-33", n:"Puntos Dupleta 18+ años Avanzado Masculino", h:"10:20"},
    {c:"KE-1", n:"Kata Tradicional Exhibición Toda edad Todas Mixto", h:"10:30"},
    {c:"KE-2", n:"Kata Extrema Exhibición Toda edad Todas Mixto", h:"10:45"},
    {c:"KE-3", n:"Kata con Arma Exhibición Toda edad Todas Mixto", h:"11:00"},
    {c:"KE-4", n:"Kata Musical Exhibición Toda edad Todas Mixto", h:"11:15"},
    {c:"KE-5", n:"Kata Kempo Exhibición Toda edad Todas Mixto", h:"11:30"},
    {c:"KE-6", n:"Kata Creativa Exhibición Toda edad Todas Mixto", h:"11:45"},
    {c:"KE-7", n:"Kata Exhibición (General) Toda edad Todas Mixto", h:"12:00"}
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
            <td>${item.h} A.M.</td>
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