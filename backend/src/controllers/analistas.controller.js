const { query } = require('../config/db');

const getAnalistas = async (req, res) => {
  try {
    const result = await query(`
      SELECT id, nombre, orden, activo::int AS activo, "idRol",
        CASE WHEN "passwordHash" IS NOT NULL THEN 1 ELSE 0 END AS "tienePassword"
      FROM analistas
      WHERE existe = '1'
      ORDER BY orden
    `);
      res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo analistas:', error);
    res.status(500).json({ message: 'Error al obtener analistas' });
  }
};

module.exports = {
  getAnalistas
};