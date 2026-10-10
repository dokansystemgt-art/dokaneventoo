# DOKAN — Gestión de torneos de karate

Plataforma multi-evento: **Evento → Rings → Categorías → Participantes → Emparejamientos → Combates**.
Estado actual: **Etapa 1** (base, login, roles y eventos). Arquitectura en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Requisitos
Node.js **22.18 o superior** (https://nodejs.org). No hay que instalar paquetes.

## Arrancar
```bash
cp .env.example .env        # en Windows: copy .env.example .env
# los 4 usuarios del sistema están en apps/api/src/usuarios.ts y se sincronizan al arrancar
npm start                   # http://localhost:3000
npm test                    # pruebas automáticas del servidor
```

## Flujo del torneo
1. **Inscritos:** manual (con las categorías compatibles según género, edad y cinta), importando un CSV o con «Inscripción de último momento».
   Solo las categorías con inscritos aparecen en **Control**.
2. **Horarios:** «Asignar y ordenar por horario» reparte las categorías con inscritos entre los rings y les pone hora, saltando los descansos.
3. **Control:** al abrir una categoría se ve la lista de competidores y la hoja de asistencia (imprimible). El operador pulsa **Llamar**;
   el administrador lo ve en el banner de llamados y el **locutor** (pestaña Micrófono) hace el llamado y confirma «Ya hice el llamado».
   Luego el ring **inicia** la categoría y al terminar la **cierra** guardando 1.º, 2.º y 3.er lugar.
   - **Combates** (kumite, cuartetas…): tabla de llaves → tablero del combate.
   - **Katas** (Kata tradicional, Kata con arma, Especiales/Exhibición): tabla de clasificación → «Iniciar» abre el tablero de los 3 jueces
     (nota de 9.90 a 9.99 cada uno) y un cronómetro que cuenta desde 0:00 (INICIAR, PAUSA, RESET, FINALIZAR); el tiempo usado queda en la columna Presentación. Total = suma de los 3 y promedio = total / 3. La tabla ordena por total y asigna 1.º a 4.º lugar.
     Si dos competidores empatan en los puestos 1–4, se marca el empate y **no deja cerrar** hasta que los jueces definan la nota oficial («Corregir nota»).
4. **Cerradas:** las categorías finalizadas salen de Control y pasan a esta pestaña con sus resultados (se pueden reabrir).
Las pantallas de Control y Micrófono se actualizan solas cada pocos segundos.

## Importar categorías (CSV)
Evento → **Categorías** → **Importar CSV**. En `ejemplos/categorias-dokan-2026.csv` está el catálogo completo del sitio de
inscripciones (133 categorías). Columnas: `codigo` (obligatoria), `nombre`, `modalidad`, `genero`, `edad_min`, `edad_max`,
`nivel`, `cintas` (separadas por `|`), `ring` (número), `hora` (HH:MM), `minutos`, `orden`. Las categorías con el mismo código se
actualizan; una celda vacía no modifica ese dato. Si una fila tiene errores no se importa nada y se indica la fila.
Tip: rellena `ring` y `hora` en Excel, guarda como CSV y vuelve a importar para armar el horario de golpe.

## Producción
Definir `NODE_ENV=production`, un `AUTH_SECRET` de 32+ caracteres aleatorios, `TZ=America/Guatemala` y
`DB_PATH` apuntando a un disco persistente. Servir detrás de HTTPS. Respaldar el archivo de la base de datos.

## Roles
| Rol | Alcance |
|---|---|
| Administrador | Todo |
| Coordinador | Ver eventos; rings, categorías, horarios, inscripciones, emparejamientos |
| Operador de ring | Ver eventos y operar su ring (la asignación por ring llega en la Etapa 2) |

## Flujo de Git
`main` estable · `develop` integración · `feature/<nombre>` por funcionalidad. Commits tipo `feat: ...`, `fix: ...`, `docs: ...`.
