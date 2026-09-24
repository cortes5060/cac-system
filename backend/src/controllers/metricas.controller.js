const { query } = require('../config/db');

const getMetricas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'fechaInicio y fechaFin son requeridos' });
    }

    const result = await query(`
        SELECT
          a.nombre,
          COUNT(c.id)::int AS casos
        FROM analistas a
        LEFT JOIN casos3cx c
          ON a.id = c."idAnalista"
          AND c.fecha::date BETWEEN @fechaInicio::date AND @fechaFin::date
        WHERE a.existe = '1' AND a."idRol" = 1
        GROUP BY a.id, a.nombre
        ORDER BY casos DESC, a.nombre
      `, { fechaInicio, fechaFin });

    res.json(result.rows);
  } catch (error) {
    console.error('Error en métricas:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getMetricas };
