const { sql } = require('../config/db');

// si el analista se inactiva con casos ACTIVO, pasan a INACTIVO (ya no hay quien responda)
async function pasarCasosActivosANoResponde(connection, id) {
  const abiertosR = await connection.request()
    .input('id', sql.Int, id)
    .query(`SELECT idCaso FROM casos3cx_estados WHERE idAnalista = @id AND estado = 'ACTIVO' AND fin IS NULL`);

  for (const { idCaso } of abiertosR.recordset) {
    await connection.request()
      .input('idCaso', sql.Int, idCaso)
      .query(`UPDATE casos3cx_estados SET fin = GETDATE() WHERE idCaso = @idCaso AND fin IS NULL`);

    await connection.request()
      .input('idCaso', sql.Int, idCaso)
      .input('id', sql.Int, id)
      .query(`INSERT INTO casos3cx_estados (idCaso, estado, inicio, idAnalista) VALUES (@idCaso, 'INACTIVO', GETDATE(), @id)`);
  }

  return abiertosR.recordset.map(r => r.idCaso);
}

// Saca al analista de la cola de atención (activo=0) y recorre el orden de los demás
async function salirDeCola(connection, id) {
  const resultado = await connection.request()
    .input('id', sql.Int, id)
    .query(`SELECT orden FROM analistas WHERE id = @id`);
  const orden = resultado.recordset[0]?.orden ?? 0;

  await connection.request()
    .input('id', sql.Int, id)
    .query(`UPDATE analistas SET activo = 0, orden = 0 WHERE id = @id`);

  await connection.request()
    .input('orden', sql.Int, orden)
    .query(`UPDATE analistas SET orden = orden - 1 WHERE activo = 1 AND orden > @orden`);

  return { casosPasadosANoResponde: await pasarCasosActivosANoResponde(connection, id) };
}

// Reingresa al analista a la cola: si ya atendió casos hoy va al final, si no
// se intercala antes del primero que sí tiene casos (mismo criterio que cambiarEstado)
async function entrarACola(connection, id) {
  const casosHoyResult = await connection.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT COUNT(*) AS casos FROM casos3cx
      WHERE idAnalista = @id AND CAST(fecha AS DATE) = CAST(GETDATE() AS DATE)
    `);
  const casosHoy = casosHoyResult.recordset[0].casos;

  if (casosHoy === 0) {
    const primerConCasosResult = await connection.request().query(`
      SELECT ISNULL(MIN(a.orden), 0) AS primerConCasos
      FROM analistas a
      INNER JOIN (
        SELECT DISTINCT idAnalista FROM casos3cx WHERE CAST(fecha AS DATE) = CAST(GETDATE() AS DATE)
      ) c ON a.id = c.idAnalista
      WHERE a.activo = 1
    `);
    const primerConCasos = primerConCasosResult.recordset[0].primerConCasos;

    if (primerConCasos > 0) {
      await connection.request()
        .input('desde', sql.Int, primerConCasos)
        .query(`UPDATE analistas SET orden = orden + 1 WHERE activo = 1 AND orden >= @desde`);

      await connection.request()
        .input('id', sql.Int, id)
        .input('nuevoOrden', sql.Int, primerConCasos)
        .query(`UPDATE analistas SET activo = 1, orden = @nuevoOrden WHERE id = @id`);
      return;
    }
  }

  const maxOrdenResult = await connection.request()
    .query(`SELECT ISNULL(MAX(orden), 0) AS maxOrden FROM analistas WHERE activo = 1`);

  await connection.request()
    .input('id', sql.Int, id)
    .input('nuevoOrden', sql.Int, maxOrdenResult.recordset[0].maxOrden + 1)
    .query(`UPDATE analistas SET activo = 1, orden = @nuevoOrden WHERE id = @id`);
}

module.exports = { salirDeCola, entrarACola };
