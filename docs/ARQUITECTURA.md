# Arquitectura

## Decisiones
- **API:** Node 22 + TypeScript (se ejecuta directo, sin compilar) con `node:http`. Sin dependencias.
- **Base de datos:** SQLite (`node:sqlite`) con migraciones SQL numeradas en `apps/api/migrations`.
  Elegida para la Etapa 1 por simplicidad de despliegue y pruebas. Los IDs son UUID y el esquema usa SQL estándar,
  para poder migrar a PostgreSQL cuando la carga lo pida (hay que reescribir la capa de consultas).
- **Web:** HTML + JS nativo servido por la misma API (sin build).
- **Sesión:** cookie HttpOnly + SameSite=Strict firmada (HMAC), 12 h. Contraseñas con scrypt. Límite de intentos de login.
- **Permisos:** por acción (`event:write`, `category:write`…); los roles son conjuntos de permisos (tablas `roles`, `permissions`, `role_permissions`).
- **Auditoría:** `audit_log` registra login y cambios.

## Modelo de datos (objetivo)
`users → roles → permissions` · `events → rings → categories → registrations ← people (global) → matches`
Hoy existen: users, roles, permissions, role_permissions, events, audit_log.

## Etapas
1. Base, login, roles, eventos ✅
2. Rings, categorías y horarios dinámicos (+ operador asignado por ring)
3. Participantes, inscripciones, importación CSV/Excel, inscripción de último momento
4. Dashboard en vivo y llamados de categorías
5. Llaves, combates, marcador y resultados
6. Producción: despliegue, respaldos, logs
