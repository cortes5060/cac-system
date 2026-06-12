const { pool } = require('../config/db');

const getEstaciones = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request()
      .query(`SELECT id, nombre FROM estaciones WHERE existe = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCategorias = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request()
      .query(`SELECT id, nombre FROM categorias WHERE activo = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTiposCaso = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request()
      .query(`SELECT id, nombre FROM tiposCaso WHERE activo = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getEstaciones, getCategorias, getTiposCaso };
