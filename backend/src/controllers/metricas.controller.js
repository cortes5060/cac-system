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
        SELECT
          a.nombre,
          COUNT(c.id) AS casos
        FROM analistas a
        LEFT JOIN casos3cx c
          ON a.id = c.idAnalista
          AND CAST(c.fecha AS DATE) BETWEEN @fechaInicio AND @fechaFin
        WHERE a.existe = 1 AND a.idRol = 1
        GROUP BY a.id, a.nombre
        ORDER BY casos DESC, a.nombre
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error en métricas:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getMetricas };
