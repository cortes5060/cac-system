const { sql, pool } = require('../config/db');

const getMetricas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'fechaInicio y fechaFin son requeridos' });
    }

    const connection = await pool;
    const result = await connection.request()
      .input('fechaInicio', sql.Date, fechaInicio)
      .input('fechaFin',    sql.Date, fechaFin)
      .query(`
        WITH casoEstado AS (
          SELECT idCaso, MAX(CASE WHEN estado = 'FINALIZADO' THEN 1 ELSE 0 END) AS finalizado
          FROM casos3cx_estados
          GROUP BY idCaso
        )
        SELECT
          a.nombre,
          SUM(CASE WHEN c.id IS NOT NULL AND ISNULL(ce.finalizado, 0) = 0 THEN 1 ELSE 0 END) AS activos,
          SUM(CASE WHEN c.id IS NOT NULL AND ISNULL(ce.finalizado, 0) = 1 THEN 1 ELSE 0 END) AS cerrados
        FROM analistas a
        LEFT JOIN casos3cx c
          ON a.id = c.idAnalista
          AND CAST(c.fecha AS DATE) BETWEEN @fechaInicio AND @fechaFin
        LEFT JOIN casoEstado ce ON ce.idCaso = c.id
        WHERE a.existe = 1 AND a.idRol = 1
        GROUP BY a.id, a.nombre
        ORDER BY COUNT(c.id) DESC, a.nombre
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error en métricas:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getMetricas };
