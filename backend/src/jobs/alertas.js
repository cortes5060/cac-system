const { sql, pool } = require('../config/db');

const CADA_MS = 2 * 60 * 1000;

const UMBRAL_CASO_INACTIVO_MIN     = 30;
const UMBRAL_DESCONEXION_MIN       = 2;
const UMBRAL_AUSENTE_MIN           = 5;
const UMBRAL_CASOS_ACUMULADOS_HORAS = 1;
const UMBRAL_CASOS_ACUMULADOS_MIN   = 3; // más de este número de casos 3CX activos acumulados

let corriendo = false;

// analistas detectados fuera de cola durante su horario, con la hora en que se detectaron por primera vez
const ausentesDesde = new Map();

async function insertarSiNueva(connection, tipo, idReferencia, mensaje) {
  await connection.request()
    .input('tipo', sql.VarChar(30), tipo)
    .input('idReferencia', sql.Int, idReferencia)
    .input('mensaje', sql.NVarChar(300), mensaje)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM Alertas WHERE tipo = @tipo AND idReferencia = @idReferencia AND resueltaEn IS NULL)
        INSERT INTO Alertas (tipo, idReferencia, mensaje) VALUES (@tipo, @idReferencia, @mensaje)
      ELSE
        UPDATE Alertas SET mensaje = @mensaje WHERE tipo = @tipo AND idReferencia = @idReferencia AND resueltaEn IS NULL
    `);
}

async function resolverExcepto(connection, tipo, idsVigentes) {
  const r = connection.request().input('tipo', sql.VarChar(30), tipo);
  const lista = idsVigentes.length ? idsVigentes.join(',') : '-1';
  await r.query(`
    UPDATE Alertas SET resueltaEn = GETDATE()
    WHERE tipo = '${tipo}' AND resueltaEn IS NULL AND idReferencia NOT IN (${lista})
  `);
}

async function checkCasosInactivos(connection, io) {
  const r = await connection.request()
    .input('min', sql.Int, UMBRAL_CASO_INACTIVO_MIN)
    .query(`
      SELECT e.idCaso, a.nombre, DATEDIFF(MINUTE, e.inicio, GETDATE()) AS minutos
      FROM casos3cx_estados e
      JOIN analistas a ON a.id = e.idAnalista
      WHERE e.estado = 'INACTIVO' AND e.fin IS NULL
        AND DATEDIFF(MINUTE, e.inicio, GETDATE()) >= @min
    `);

  for (const row of r.recordset) {
    const mensaje = `Caso 3CX #${row.idCaso} de ${row.nombre} lleva ${row.minutos} min sin respuesta en la cola`;
    await insertarSiNueva(connection, 'CASO_INACTIVO', row.idCaso, mensaje);
  }
  if (r.recordset.length) io.emit('nuevaAlerta');

  await resolverExcepto(connection, 'CASO_INACTIVO', r.recordset.map(x => x.idCaso));
}

async function checkDesconexionesPendientes(connection, io) {
  const r = await connection.request()
    .input('min', sql.Int, UMBRAL_DESCONEXION_MIN)
    .query(`
      SELECT ds.id, a.nombre, DATEDIFF(MINUTE, ds.solicitadoEn, GETDATE()) AS minutos
      FROM desconexionesSupervisadas ds
      JOIN analistas a ON a.id = ds.idAnalista
      WHERE ds.estado = 'PENDIENTE'
        AND DATEDIFF(MINUTE, ds.solicitadoEn, GETDATE()) >= @min
    `);

  for (const row of r.recordset) {
    const mensaje = `Solicitud de salida de la cola 3CX de ${row.nombre} lleva ${row.minutos} min sin resolver`;
    await insertarSiNueva(connection, 'DESCONEXION_PENDIENTE', row.id, mensaje);
  }
  if (r.recordset.length) io.emit('nuevaAlerta');

  await resolverExcepto(connection, 'DESCONEXION_PENDIENTE', r.recordset.map(x => x.id));
}

async function checkAnalistasAusentes(connection, io) {
  const diaHoy = new Date().getDay();
  const r = await connection.request()
    .input('dia', sql.Int, diaHoy)
    .query(`
      SELECT a.id, a.nombre
      FROM analistas a
      JOIN HorariosDetalle d ON d.idHorario = a.idhorario AND d.diaSemana = @dia
      WHERE a.idRol = 1 AND a.existe = 1 AND a.activo = 0
        AND d.HoraEntrada IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM desconexionesSupervisadas ds
          WHERE ds.idAnalista = a.id AND ds.estado = 'APROBADA'
        )
        AND (
          (d.HoraEntrada <= d.HoraSalida AND CAST(GETDATE() AS TIME) BETWEEN d.HoraEntrada AND d.HoraSalida)
          OR
          (d.HoraEntrada > d.HoraSalida AND (CAST(GETDATE() AS TIME) >= d.HoraEntrada OR CAST(GETDATE() AS TIME) <= d.HoraSalida))
        )
    `);

  const idsAusentesAhora = r.recordset.map(x => x.id);
  const ahora = Date.now();
  const vigentes = [];

  for (const row of r.recordset) {
    if (!ausentesDesde.has(row.id)) ausentesDesde.set(row.id, ahora);
    const minutos = Math.floor((ahora - ausentesDesde.get(row.id)) / 60000);
    if (minutos >= UMBRAL_AUSENTE_MIN) {
      vigentes.push(row.id);
      const mensaje = `${row.nombre} lleva ${minutos} min fuera de la cola de 3CX durante su horario`;
      await insertarSiNueva(connection, 'ANALISTA_AUSENTE', row.id, mensaje);
    }
  }

  for (const id of [...ausentesDesde.keys()]) {
    if (!idsAusentesAhora.includes(id)) ausentesDesde.delete(id);
  }

  if (vigentes.length) io.emit('nuevaAlerta');
  await resolverExcepto(connection, 'ANALISTA_AUSENTE', vigentes.length ? vigentes : idsAusentesAhora);
}

// Casos 3CX (chats/llamadas) que un analista tiene en ACTIVO al mismo tiempo,
// acumulados sin cerrar por mucho tiempo — señal de que se está quedando atrás en la cola.
async function checkCasosAcumulados(connection, io) {
  const r = await connection.request()
    .input('horas', sql.Int, UMBRAL_CASOS_ACUMULADOS_HORAS)
    .input('minCasos', sql.Int, UMBRAL_CASOS_ACUMULADOS_MIN)
    .query(`
      SELECT e.idAnalista, a.nombre, COUNT(*) AS acumulados
      FROM casos3cx_estados e
      JOIN analistas a ON a.id = e.idAnalista
      WHERE e.estado = 'ACTIVO' AND e.fin IS NULL
        AND DATEDIFF(HOUR, e.inicio, GETDATE()) >= @horas
      GROUP BY e.idAnalista, a.nombre
      HAVING COUNT(*) > @minCasos
    `);

  for (const row of r.recordset) {
    const mensaje = `${row.nombre} tiene ${row.acumulados} casos 3CX activos acumulados hace más de ${UMBRAL_CASOS_ACUMULADOS_HORAS} hora(s)`;
    await insertarSiNueva(connection, 'CASOS_ACUMULADOS', row.idAnalista, mensaje);
  }
  if (r.recordset.length) io.emit('nuevaAlerta');

  await resolverExcepto(connection, 'CASOS_ACUMULADOS', r.recordset.map(x => x.idAnalista));
}

async function chequearAlertas(io) {
  if (corriendo) return;
  corriendo = true;
  try {
    const connection = await pool;
    await checkCasosInactivos(connection, io);
    await checkDesconexionesPendientes(connection, io);
    await checkAnalistasAusentes(connection, io);
    await checkCasosAcumulados(connection, io);
  } catch (error) {
    console.error('Error revisando alertas:', error.message);
  } finally {
    corriendo = false;
  }
}

function iniciarAlertas(io) {
  setTimeout(() => chequearAlertas(io), 20 * 1000);
  setInterval(() => chequearAlertas(io), CADA_MS);
}

module.exports = { iniciarAlertas, chequearAlertas };
