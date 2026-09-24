const { pool, query } = require('../config/db');

// Un caso que lleva más de estas horas abierto se finaliza solo, para que no siga sumando tiempo
const HORAS_MAX = parseInt(process.env.HORAS_MAX_CASO, 10) || 12;
const CADA_MS = 5 * 60 * 1000;

let corriendo = false;

async function finalizarVencidos(io) {

  if (corriendo) return;
  corriendo = true;

  try {

    const client = await pool.connect();

    try {

      await client.query('BEGIN');

      // Cierra el tramo abierto justo al cumplir las horas máximas (no en el momento en que corre la tarea),
      // así el tiempo del caso queda en el límite y no lo excede.
      const result = await query(`
          WITH cerrar AS (
            UPDATE casos3cx_estados e
            SET fin = GREATEST(c.fecha + make_interval(hours => @horas), e.inicio)
            FROM casos3cx c
            WHERE c.id = e."idCaso"
              AND e.fin IS NULL
              AND e.estado IN ('ACTIVO', 'INACTIVO')
              AND c.fecha + make_interval(hours => @horas) <= LOCALTIMESTAMP
            RETURNING e."idCaso", e.fin, e."idAnalista"
          ), finalizados AS (
            INSERT INTO casos3cx_estados ("idCaso", estado, inicio, fin, automatico, "idAnalista")
            SELECT "idCaso", 'FINALIZADO', fin, fin, '1', "idAnalista" FROM cerrar
          )
          SELECT COUNT(*)::int AS cerrados FROM cerrar
        `, { horas: HORAS_MAX }, client);

      await client.query('COMMIT');

      const cantidad = result.rows[0].cerrados;

      if (cantidad > 0) {
        console.log(`Auto-finalización: ${cantidad} caso(s) cerrado(s) por superar ${HORAS_MAX} h`);
        io.emit('casosAutoFinalizados', { cantidad });
      }

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
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
