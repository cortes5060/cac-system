const { sql, pool } = require('../config/db');

const getAnalistas = async (req, res) => {
  try {
    const result = await (await pool).request().query(`
      SELECT id, nombre, orden, activo, idRol
      FROM analistas
      WHERE existe = 1
      ORDER BY orden
    `);
      res.json(result.recordset);
  } catch (error) {
    console.error('Error obteniendo analistas:', error);
    res.status(500).json({ message: 'Error al obtener analistas' });
  }
};

module.exports = {
  getAnalistas
};