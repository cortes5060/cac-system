# Pendientes de backend

Cambios que requieren tocar el backend (Node/SQL), acumulados para hacer de una sola vez
cuando se tenga acceso al servidor de producción. No se implementan mientras tanto.

---

## 1. Analistas nuevos creados por el import de 2WD quedan sin grupo de colaborador

**Dónde:** `backend/src/controllers/import.controller.js`, función `confirmarImport`, el
`INSERT INTO analistas` que crea analistas nuevos detectados en el Excel (creador/escalado
que no existe todavía).

**Qué pasa hoy:** el INSERT solo asigna `nombre, orden, activo, existe, idRol`. El campo
`idGrupoColaborador` queda en `NULL`.

**Por qué importa:** el filtro por grupo de colaborador en el panel de Supervisor usa ese
campo. Un analista sin grupo asignado hace que sus tickets no aparezcan al filtrar por un
grupo específico (solo se ven en "General"), hasta que alguien lo edite manualmente desde
el panel del coordinador.

**Posibles soluciones a evaluar cuando se retome:**
- Heredar el grupo de quien lo escaló/asignó en la misma fila del Excel.
- Tomarlo de una columna del Excel si 2WD llega a incluir esa información.
- Dejarlo en un grupo por defecto configurable en vez de NULL.

---

## 2. Top 5 Categorías / Top 5 EDS en "Resumen" del supervisor, ampliar a Top 10

**Dónde:** `backend/src/controllers/supervisor.controller.js`, función `getKPIs` — las
consultas `topCatR` y `topEdsR` usan `SELECT TOP 5`.

**Qué pasa hoy:** el endpoint `/api/supervisor/kpis` solo devuelve 5 categorías y 5 EDS,
así que el frontend no tiene más datos para mostrar aunque se cambie la vista.

**Solución:** cambiar `TOP 5` → `TOP 10` en ambas consultas. Cambio simple, una vez se
haga el frontend ya está listo para pintar la lista más larga sin tocar nada más
(`renderResumenTopLista` en `electron/supervisor.js` ya es genérica).

---

## 3. Reestructurar la tabla de Escalados Activos (vista Escalación)

**Dónde:** `backend/src/controllers/supervisor.controller.js`, función
`getTablaEscaladosActivos` (`SELECT TOP 20`). También existía `getTopAltaPrioridad`
(`SELECT TOP 10`) para la tabla de "Alta Prioridad", que por ahora se quitó del frontend
(`electron/supervisor.html` y `supervisor.js`) por ser redundante con esta.

**Qué pasa hoy:** la tabla solo trae los primeros 20 tickets escalados y abiertos
(`escalado != idAnalista` y estatus no Cerrado/Cancelado), ordenados por prioridad y
fecha. Si hay más de 20, el resto no se ve en ningún lado.

**Lo que se pidió:**
1. Que traiga **todos** los tickets abiertos que han sido escalados, sin el límite de 20.
2. Rediseñar cómo se muestra para que sea más fácil de entender de un vistazo — hoy es
   una tabla ancha con muchas columnas (código, caso, EDS, creador, escalado a, grupo,
   estatus, prioridad, registro). Vale la pena repensar el layout: quizás agrupar por
   grupo/analista receptor, resaltar mejor la prioridad, o separar visualmente los muy
   antiguos de los recientes en vez de una sola tabla plana.

**Nota relacionada:** también quedó pendiente en el punto de "Escalados" (KPI del
resumen de Escalación) si el conteo de "escalado" debería ampliarse más allá de
`escalado != idAnalista` — revisar junto con esto si tiene sentido.

---

## 4. Tabla "Top 10 más antiguos sin cerrar" (vista Antigüedad), quitar el límite

**Dónde:** `backend/src/controllers/supervisor.controller.js`, función
`getAntiguedadAbiertos` — la subconsulta `masAntiguosR` usa `SELECT TOP 10`.

**Qué se pidió:** que traiga todos los tickets abiertos (respetando el filtro de
mes/año que ya se aplica, eso no cambia), no solo los primeros 10.

**Solución:** quitar el `TOP 10` de esa consulta. El gráfico de buckets (0-1, 2-3, 4-7,
+7 días) ya cuenta el total real sin límite — solo la tabla de detalle está topada.

**Nota:** el resumen "por responsable" (píldoras arriba de la tabla, en
`electron/supervisor.js`) se calcula sobre esta misma lista — al quitar el `TOP 10` en
el backend, ese resumen automáticamente va a reflejar el conteo real sin tocar nada más
en el frontend.

---

## 5. Nuevo KPI: tiempo promedio de resolución basado en la tabla `tickets` (2WD)

**Diferencia con lo que ya existe:** el "Tiempo Promedio" que se agregó en Resumen usa
`casos3cx`/`casos3cx_estados` (el registro de chats/llamadas de 3CX). Esto es otra cosa:
el tiempo entre que se **crea** el ticket en 2WD y se **cierra**, usando la tabla
`tickets` directamente. No existe hoy en ningún lado del sistema.

**Ya hecho (base de datos, no requiere migración pendiente):** la columna `fechaCaso`
era tipo `date` (sin hora) y por eso se perdía la precisión, aunque el Excel de 2WD
("FECHA DE FINALIZACIÓN") sí trae hora completa. Se corrigió con:
```sql
ALTER TABLE tickets ALTER COLUMN fechaCaso DATETIME NULL;
```
Esto ya se aplicó en la base local; **falta correrlo en producción** (el SQL de arriba).

**Lo que sigue pendiente (código del backend):**
1. `import.controller.js` línea ~207 (`fechaCaso: fmtDate(dFin)`) y línea ~330/366
   (`sql.Date` al insertar/actualizar `fechaCaso`) — hoy igual truncan la hora al
   guardar, aunque la columna ya la pueda recibir. Hay que cambiar `fmtDate` por algo
   que conserve hora:minuto, y el tipo del parámetro de `sql.Date` a `sql.DateTime`.
2. `ticket.controller.js` línea ~24 — mismo caso, usa `sql.Date` para `fechaCaso`.
3. Nueva consulta en `supervisor.controller.js` para el KPI en sí, ya con precisión de
   horas:
   ```sql
   SELECT AVG(CAST(DATEDIFF(MINUTE, fechaHora, fechaCaso) AS FLOAT)) AS promMinutos
   FROM tickets
   WHERE fechaCaso IS NOT NULL AND ${periodoWhere}${filtroWhere}
   ```
   Agregar como campo nuevo en la respuesta de `getKPIs` (o un endpoint aparte), y en el
   frontend mostrarlo junto al de `casos3cx` pero dejando claro que son dos métricas
   distintas (una es "atención en 3CX", la otra "ciclo de vida del ticket en 2WD").

**Ojo dato sin usar:** la columna `tiempoAtencionMin` de `tickets` existe en la tabla
pero el import siempre la inserta en `NULL` (`import.controller.js` línea ~327) — nunca
se calcula ni se llena. Si en algún momento se llena ese campo, sería una forma más
directa de sacar este promedio sin depender de restar fechas.

---

## 6. Buscador real en "Historial de Tickets" (vista Historial del supervisor)

**Dónde:** `backend/src/controllers/supervisor.controller.js`, función
`getUltimosTickets` — hoy siempre hace `SELECT TOP 10 ... ORDER BY fechaHora DESC`, sin
ningún filtro de búsqueda propio (solo hereda período/analista/EDS/categoría/grupo que
ya trae el resto del dashboard).

**Qué se pidió:** una barra de búsqueda dedicada en Historial, con filtros por:
- Número / código de ticket (2WD)
- Rango de fechas
- Estatus (Cerrado, En curso, Pendiente facturación, etc.)
- (Idealmente también EDS y prioridad, ya que la tabla los muestra)

**Comportamiento esperado:** sin ningún filtro activo, se comporta como hoy — muestra
los 10 más recientes (para no cargar de más al abrir la vista). En cuanto se aplica
**cualquier** filtro, trae **todos** los tickets que coincidan, sin límite de 10.

**Cómo implementarlo (patrón ya existe en el proyecto, se puede copiar):**
`casos.controller.js` → `buscarCasos` (endpoint `/api/casos/buscar`) ya hace exactamente
este patrón — búsqueda por texto libre + rango de fechas + tipo, con escape de
comodines de `LIKE`, y sin `TOP` fijo (usa `TOP 200` como tope de seguridad, no de UX).
Se puede replicar esa misma lógica para un endpoint nuevo tipo
`GET /api/supervisor/buscar-tickets`, agregando estatus como filtro adicional
(`JOIN estatus e ON t.idEstatus = e.id WHERE e.nombre = @estatus`).

**Frontend:** ya hay un ejemplo de UI de filtros de búsqueda funcionando en
`electron/dashboard.js` (`ejecutarBusquedaCasos`, sección "Buscar Casos" del analista) —
mismo estilo de inputs (texto, fecha desde/hasta, select) se puede reutilizar en
`electron/supervisor.html`/`supervisor.js` para esta vista de Historial.

---
