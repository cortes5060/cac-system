const { sql, pool } = require('../config/db');

// Un caso que lleva más de estas horas abierto se finaliza solo, para que no siga sumando tiempo
const HORAS_MAX = parseInt(process.env.HORAS_MAX_CASO, 10) || 12;
const CADA_MS = 5 * 60 * 1000;

let corriendo = false;

async function finalizarVencidos(io) {

  if (corriendo) return;
  corriendo = true;

  try {

    const connection = await pool;
    const transaction = new sql.Transaction(connection);

    try {

      await transaction.begin();

      // Cierra el tramo abierto justo al cumplir las horas máximas (no en el momento en que corre la tarea),
      // así el tiempo del caso queda en el límite y no lo excede.
      const result = await new sql.Request(transaction)
        .input('horas', sql.Int, HORAS_MAX)
        .query(`
          DECLARE @cerrar TABLE (idCaso INT, fin DATETIME, idAnalista INT);

          UPDATE e
          SET fin = CASE WHEN DATEADD(HOUR, @horas, c.fecha) > e.inicio
                         THEN DATEADD(HOUR, @horas, c.fecha) ELSE e.inicio END
          OUTPUT INSERTED.idCaso, INSERTED.fin, INSERTED.idAnalista INTO @cerrar
          FROM casos3cx_estados e
          JOIN casos3cx c ON c.id = e.idCaso
          WHERE e.fin IS NULL
            AND e.estado IN ('ACTIVO', 'INACTIVO')
            AND DATEADD(HOUR, @horas, c.fecha) <= GETDATE();

          INSERT INTO casos3cx_estados (idCaso, estado, inicio, fin, automatico, idAnalista)
          SELECT idCaso, 'FINALIZADO', fin, fin, 1, idAnalista FROM @cerrar;

          SELECT COUNT(*) AS cerrados FROM @cerrar;
        `);

      await transaction.commit();

      const cerrados = result.recordset[0].cerrados;

      if (cerrados > 0) {
        console.log(`Auto-finalización: ${cerrados} caso(s) cerrado(s) por superar ${HORAS_MAX} h`);
        io.emit('casosAutoFinalizados', { cantidad: cerrados });
      }

    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    }

  } catch (error) {
    console.error('Error en la auto-finalización de casos:', error.message);
  } finally {
    corriendo = false;
  }
}

function iniciarAutoFinalizacion(io) {
  setTimeout(() => finalizarVencidos(io), 15 * 1000);
  setInterval(() => finalizarVencidos(io), CADA_MS);
}

module.exports = { iniciarAutoFinalizacion, finalizarVencidos };
