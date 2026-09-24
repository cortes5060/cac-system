const { query } = require('../config/db');

const getEstaciones = async (req, res) => {
  try {
    const result = await query(`SELECT id, nombre FROM estaciones WHERE existe = '1' ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCategorias = async (req, res) => {
  try {
    const result = await query(`SELECT id, nombre, categoriaprincipal FROM categorias WHERE activo = '1' ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Grupo amplio de categoría (ej. "Autoatendido"), derivado del texto antes del primer
// " - " en categoriaprincipal. No existe como tabla propia, es agrupar por ese prefijo.
const getGruposCategoria = async (req, res) => {
  try {
    const result = await query(`
        SELECT DISTINCT split_part(RTRIM(categoriaprincipal), ' - ', 1) AS nombre
        FROM categorias
        WHERE activo = '1' AND categoriaprincipal IS NOT NULL AND RTRIM(categoriaprincipal) != ''
        ORDER BY nombre
      `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTiposCaso = async (req, res) => {
  try {
    const result = await query(`SELECT id, nombre FROM "tiposCaso" WHERE activo = '1' ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAnalistas = async (req, res) => {
  try {
    const result = await query(`SELECT id, nombre FROM analistas WHERE "idRol" = 1 ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getGrupos = async (req, res) => {
  try {
    const result = await query(`SELECT id, nombre FROM "gruposColaborador" ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getEstaciones, getCategorias, getGruposCategoria, getTiposCaso, getAnalistas, getGrupos };
