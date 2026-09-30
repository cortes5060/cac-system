# Pendientes de backend

Cambios que requieren tocar el backend (Node/SQL), acumulados para hacer de una sola vez
cuando se tenga acceso al servidor de producción. No se implementan mientras tanto.

---

## 1. Analistas nuevos creados por el import de 2WD quedan sin grupo de colaborador

**✅ Resuelto.** El import ahora crea automáticamente el `gruposColaborador` que falte
para el **grupo del ticket** (excel > responsable > creador). Un **analista nuevo**
creado por el mismo import (creador/escalado que no existía) sigue quedando con
`idGrupoColaborador = NULL` a propósito — eso se mantiene manual, se asigna desde el
panel de Coordinador (sección "Grupos de Colaboradores" o "Horarios de asignación").

---

## 2. Top 5 Categorías / Top 5 EDS en "Resumen" del supervisor, ampliar a Top 10

**✅ Resuelto.** `topCatR` y `topEdsR` en `getKPIs` ya usan `SELECT TOP 10`.

---

## 3. Reestructurar la tabla de Escalados Activos (vista Escalación)

**Dónde:** `backend/src/controllers/supervisor.controller.js`, función
`getTablaEscaladosActivos`. También existía `getTopAltaPrioridad` (`SELECT TOP 10`) para
la tabla de "Alta Prioridad", que se quitó del frontend (`electron/supervisor.html` y
`supervisor.js`) por ser redundante con esta.

**✅ Ya resuelto:** se quitó el `TOP 20` (trae todos los tickets escalados y abiertos,
sin límite) y el orden ahora es `t.fechaHora ASC` (del más antiguo al más reciente, en
vez de por prioridad). Título del frontend actualizado.

**Sigue pendiente:** rediseñar cómo se muestra para que sea más fácil de entender de un
vistazo — hoy es una tabla ancha con muchas columnas (código, caso, EDS, creador,
escalado a, grupo, estatus, prioridad, registro). Vale la pena repensar el layout:
quizás agrupar por grupo/analista receptor, resaltar mejor la prioridad, o separar
visualmente los muy antiguos de los recientes en vez de una sola tabla plana.

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

**Ya hecho (base de datos):** la columna `fechaCaso` era tipo `date` (sin hora) y por
eso se perdía la precisión, aunque el Excel de 2WD ("FECHA DE FINALIZACIÓN") sí trae
hora completa. Se corrigió con:
```sql
ALTER TABLE tickets ALTER COLUMN fechaCaso DATETIME NULL;
```
Esto ya se aplicó en la base local; **falta correrlo en producción** (el SQL de arriba).

**✅ Código ya resuelto:**
1. `import.controller.js` — `fmtDate` (truncaba a solo fecha) se eliminó, ahora usa
   `fmtDateTime` para `fechaCaso` en el insert/update del import, y los parámetros
   `sql.Date` de `fechaCaso` pasaron a `sql.DateTime` (tanto en el INSERT como en el
   UPDATE). El preview (`previewExcel`) también compara con precisión de minuto
   (`CONVERT(VARCHAR(19), fechaCaso, 120)`) en vez de solo fecha.
2. `ticket.controller.js` — el parámetro `fechaCaso` pasó de `sql.Date` a `sql.DateTime`.
3. Nuevo campo `promResolucion2WD` (minutos) agregado a la respuesta de `getKPIs` en
   `supervisor.controller.js`:
   ```sql
   SELECT AVG(CAST(DATEDIFF(MINUTE, t.fechaHora, t.fechaCaso) AS FLOAT)) AS promMinutos
   FROM tickets t WHERE t.fechaCaso IS NOT NULL AND ${pw}${fw}
   ```
4. Frontend (`electron/supervisor.js`/`.html`): nuevo KPI "Tiempo Promedio 2WD" junto al
   de 3CX, con subtítulos aclarando que son métricas distintas ("atención en 3CX" vs.
   "ciclo de vida del ticket"). Grid de KPIs ajustado a 7 columnas en pantallas grandes.

**Ojo — falta correr en producción antes de que el dato tenga sentido:** el
`ALTER TABLE` de arriba. Mientras la columna siga siendo `date` en el servidor, el
código ya guarda `DateTime` pero SQL Server igual lo trunca a medianoche al insertar,
así que el KPI dará siempre horas completas de más (nunca minutos). Correr el ALTER
antes de considerar el punto totalmente cerrado en producción.

**Ojo dato sin usar:** la columna `tiempoAtencionMin` de `tickets` existe en la tabla
pero el import siempre la inserta en `NULL` (`import.controller.js` línea ~327) — nunca
se calcula ni se llena. Si en algún momento se llena ese campo, sería una forma más
directa de sacar este promedio sin depender de restar fechas.

---

## 6. Buscador real en "Historial de Tickets" (vista Historial del supervisor)

**✅ Resuelto.** `getUltimosTickets` (`backend/src/controllers/supervisor.controller.js`)
ahora acepta `q` (código o texto del caso, con escape de comodines de `LIKE`), `desde`/
`hasta` (rango de fechas sobre `fechaHora`), `estatus` (nombre exacto) e `idTipoCaso`.
Sin ningún filtro nuevo activo se comporta igual que antes (`TOP 10` más recientes); en
cuanto se manda cualquiera de esos filtros, quita el límite (`TOP 200` como tope de
seguridad). La respuesta cambió de un array plano a `{ tickets, filtrado }`.

**Frontend:** `electron/supervisor.html` (vista Historial) tiene la barra de filtros
(texto, desde, hasta, estatus, tipo) con botones Buscar/Limpiar. `electron/supervisor.js`
agrega `buscarHistorial()` / `limpiarHistorial()`, puebla el select de estatus desde
`ESTATUS_COLORS` y el de tipo desde `/api/catalogos/tiposcaso`, y el título de la tabla
cambia a "N tickets encontrados" cuando hay un filtro aplicado.

**Nota:** el filtro por categoría/grupo/EDS/analista ya se hereda del filtro global del
dashboard (no se duplicó en esta barra) — sigue funcionando igual que antes.

---

## 7. Reestructurar el panel "Tiempos 3CX" para que sirva de auditoría

**Dónde:** `backend/src/controllers/supervisor.controller.js`, función
`getMetricasTiempos`, más los gráficos correspondientes en `electron/supervisor.html` /
`supervisor.js`.

**Quitar / bajar prioridad (frontend, no requiere backend):**
- Gráfico "Tiempo promedio por estatus del ticket" — poco accionable para auditar.
- Achicar "Chat vs Llamada" (de gráfico completo a un dato dentro de los KPIs).

**Agregar (sí requiere backend, es lo importante de este punto):** un gráfico de
**tendencia diaria** del tiempo promedio de ejecución dentro del período — hoy
`getMetricasTiempos` solo devuelve el promedio total del período completo, no hay forma
de ver si un día específico se disparó. Se necesita una consulta nueva agrupando por
día (`GROUP BY CAST(c.fecha AS DATE)` sobre `casos3cx` con el mismo `TIEMPOS_FROM`/
`TIEMPOS_PROM` que ya existen), devuelta como un array `{fecha, promEjec}` que el
frontend pueda graficar como línea (mismo patrón que `chart-resumen-tendencia`, que ya
muestra tendencia diaria pero de cantidad de tickets, no de tiempo).

**Este punto queda para el final** de esta ronda de cambios de backend (así lo pidió
el usuario) — hacer primero los puntos 1 al 6.

---

## 8. Import de Excel (confirmarImport) es fila por fila, muy lento con archivos grandes

**Dónde:** `backend/src/controllers/import.controller.js`, función `confirmarImport`.

**✅ Resuelto en código, falta desplegar.** El bucle principal de filas (INSERT/UPDATE de
`tickets`) ya no es secuencial: se agregó un helper `conPool(items, limite, fn)` que
corre hasta 5 filas en simultáneo en vez de una por una (`CONCURRENCIA_FILAS = 5`,
elegido a propósito por debajo del máximo de conexiones del pool de SQL Server, para no
acaparar la base de datos mientras el resto del sistema la sigue usando durante el
import). Los contadores (`insertados`, `actualizados`, `errores`) siguen siendo seguros
porque JS es de un solo hilo: los `await` dentro de cada tarea son los únicos puntos de
intercalado real.

Los bucles de catálogos nuevos (estatus, categorías, tipos, grupos, analistas) se
dejaron secuenciales a propósito — son sobre un `Set` de nombres únicos, normalmente
pocos valores distintos por Excel, así que no valía la pena el riesgo/complejidad extra.

**Probado localmente** (servidor local + backend en local), pendiente de correr contra
un Excel grande en producción para confirmar la mejora real de tiempo antes de darlo por
cerrado del todo.

---
