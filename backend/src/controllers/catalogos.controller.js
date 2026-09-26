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
      .query(`SELECT id, nombre, categoriaprincipal FROM categorias WHERE activo = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Grupo derivado del prefijo antes de " - " en categoriaprincipal; no es una tabla propia
const getGruposCategoria = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request()
      .query(`
        SELECT DISTINCT LEFT(RTRIM(categoriaprincipal), CHARINDEX(' - ', RTRIM(categoriaprincipal) + ' - ') - 1) AS nombre
        FROM categorias
        WHERE activo = 1 AND categoriaprincipal IS NOT NULL AND RTRIM(categoriaprincipal) != ''
        ORDER BY nombre
      `);
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

const getAnalistas = async (req, res) => {
  try {
    const result = await (await pool).request()
      .query(`SELECT id, nombre FROM analistas WHERE idRol = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getGrupos = async (req, res) => {
  try {
    const result = await (await pool).request()
      .query(`SELECT id, nombre FROM gruposColaborador ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getEstaciones, getCategorias, getGruposCategoria, getTiposCaso, getAnalistas, getGrupos };
