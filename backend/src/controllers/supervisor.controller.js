const { sql, pool } = require('../config/db');

function periodo(req) {
  const now = new Date();
  return {
    mes:  parseInt(req.query.mes)  || (now.getMonth() + 1),
    anio: parseInt(req.query.anio) || now.getFullYear()
  };
}

/* ── KPIs ──────────────────────────────────────────────────── */

const getKPIs = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const db = await pool;

    const [totalR, tiempoR, catR, edsR, topAnaR, sinTiempoR] = await Promise.all([
      db.request().input('mes', sql.Int, mes).input('anio', sql.Int, anio)
        .query(`SELECT COUNT(*) AS total FROM tickets WHERE YEAR(fechaCaso)=@anio AND MONTH(fechaCaso)=@mes`),
      db.request().input('mes', sql.Int, mes).input('anio', sql.Int, anio)
        .query(`SELECT AVG(CAST(tiempoAtencionMin AS FLOAT)) AS promedio FROM tickets WHERE YEAR(fechaCaso)=@anio AND MONTH(fechaCaso)=@mes AND tiempoAtencionMin IS NOT NULL AND tiempoAtencionMin > 0`),
      db.request().input('mes', sql.Int, mes).input('anio', sql.Int, anio)
        .query(`SELECT TOP 1 c.nombre, COUNT(*) AS total FROM tickets t JOIN categorias c ON t.idCategoria=c.id WHERE YEAR(t.fechaCaso)=@anio AND MONTH(t.fechaCaso)=@mes GROUP BY c.id,c.nombre ORDER BY total DESC`),
      db.request().input('mes', sql.Int, mes).input('anio', sql.Int, anio)
        .query(`SELECT TOP 1 EDS, COUNT(*) AS total FROM tickets WHERE YEAR(fechaCaso)=@anio AND MONTH(fechaCaso)=@mes AND EDS IS NOT NULL AND EDS!='' GROUP BY EDS ORDER BY total DESC`),
      db.request().input('mes', sql.Int, mes).input('anio', sql.Int, anio)
        .query(`SELECT TOP 1 a.nombre, COUNT(t.id) AS total FROM analistas a JOIN tickets t ON a.id=t.idAnalista WHERE YEAR(t.fechaCaso)=@anio AND MONTH(t.fechaCaso)=@mes GROUP BY a.id,a.nombre ORDER BY total DESC`),
      db.request().input('mes', sql.Int, mes).input('anio', sql.Int, anio)
        .query(`SELECT COUNT(*) AS total FROM tickets WHERE YEAR(fechaCaso)=@anio AND MONTH(fechaCaso)=@mes AND (tiempoAtencionMin IS NULL OR tiempoAtencionMin=0)`),
    ]);

    res.json({
      totalTickets:   totalR.recordset[0].total,
      tiempoPromedio: tiempoR.recordset[0].promedio != null
        ? Math.round(tiempoR.recordset[0].promedio * 10) / 10 : null,
      categoriaTop:   catR.recordset[0]    || null,
      edsTop:         edsR.recordset[0]    || null,
      analistaTop:    topAnaR.recordset[0] || null,
      sinTiempo:      sinTiempoR.recordset[0].total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ── GRÁFICOS ──────────────────────────────────────────────── */

const getTicketsPorAnalista = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT a.nombre, COUNT(t.id) AS tickets
        FROM analistas a
        LEFT JOIN tickets t ON a.id = t.idAnalista
          AND YEAR(t.fechaCaso) = @anio AND MONTH(t.fechaCaso) = @mes
        WHERE a.existe = 1 AND a.idRol = 1
        GROUP BY a.id, a.nombre
        ORDER BY tickets DESC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTopCategorias = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT TOP 10 c.nombre, COUNT(t.id) AS total
        FROM tickets t JOIN categorias c ON t.idCategoria = c.id
        WHERE YEAR(t.fechaCaso) = @anio AND MONTH(t.fechaCaso) = @mes
        GROUP BY c.id, c.nombre ORDER BY total DESC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTicketsPorDia = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT DAY(fechaCaso) AS dia, COUNT(*) AS total
        FROM tickets
        WHERE YEAR(fechaCaso) = @anio AND MONTH(fechaCaso) = @mes
        GROUP BY DAY(fechaCaso) ORDER BY dia
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionTipo = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT tc.nombre, COUNT(t.id) AS total
        FROM tickets t JOIN tiposCaso tc ON t.idTipoCaso = tc.id
        WHERE YEAR(t.fechaCaso) = @anio AND MONTH(t.fechaCaso) = @mes
        GROUP BY tc.id, tc.nombre
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTiempoPromedioPorAnalista = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT a.nombre,
          ROUND(AVG(CAST(t.tiempoAtencionMin AS FLOAT)), 1) AS promedio,
          COUNT(t.id) AS tickets
        FROM analistas a
        JOIN tickets t ON a.id = t.idAnalista
        WHERE YEAR(t.fechaCaso) = @anio AND MONTH(t.fechaCaso) = @mes
          AND t.tiempoAtencionMin IS NOT NULL AND t.tiempoAtencionMin > 0
        GROUP BY a.id, a.nombre
        ORDER BY promedio ASC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getHeatmapEDS = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT t.EDS, c.nombre AS categoria, COUNT(*) AS total
        FROM tickets t
        JOIN categorias c ON t.idCategoria = c.id
        WHERE YEAR(t.fechaCaso) = @anio AND MONTH(t.fechaCaso) = @mes
          AND t.EDS IS NOT NULL AND t.EDS != ''
        GROUP BY t.EDS, c.id, c.nombre
        ORDER BY t.EDS, total DESC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TABLAS ────────────────────────────────────────────────── */

const getUltimosTickets = async (_req, res) => {
  try {
    const result = await (await pool).request()
      .query(`
        SELECT TOP 10
          t.id, t.casoAtendido, a.nombre AS analista, t.EDS,
          c.nombre AS categoria, tc.nombre AS tipoCaso,
          t.tiempoAtencionMin,
          FORMAT(t.fechaCaso,  'dd/MM/yyyy')       AS fechaCaso,
          FORMAT(t.fechaHora,  'dd/MM/yyyy HH:mm') AS fechaRegistro
        FROM tickets t
        JOIN analistas a  ON t.idAnalista  = a.id
        JOIN categorias c ON t.idCategoria = c.id
        JOIN tiposCaso tc ON t.idTipoCaso  = tc.id
        ORDER BY t.fechaCaso DESC, t.fechaHora DESC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getRankingEDS = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT EDS,
          COUNT(*) AS total,
          ROUND(AVG(CAST(tiempoAtencionMin AS FLOAT)), 1) AS promedio
        FROM tickets
        WHERE YEAR(fechaCaso) = @anio AND MONTH(fechaCaso) = @mes
          AND EDS IS NOT NULL AND EDS != ''
        GROUP BY EDS ORDER BY total DESC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getCategoriasTiempo = async (req, res) => {
  try {
    const { mes, anio } = periodo(req);
    const result = await (await pool).request()
      .input('mes', sql.Int, mes).input('anio', sql.Int, anio)
      .query(`
        SELECT TOP 10 c.nombre,
          COUNT(t.id) AS total,
          ROUND(AVG(CAST(t.tiempoAtencionMin AS FLOAT)), 1) AS promedio
        FROM tickets t JOIN categorias c ON t.idCategoria = c.id
        WHERE YEAR(t.fechaCaso) = @anio AND MONTH(t.fechaCaso) = @mes
          AND t.tiempoAtencionMin IS NOT NULL AND t.tiempoAtencionMin > 0
        GROUP BY c.id, c.nombre ORDER BY promedio DESC
      `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

module.exports = {
  getKPIs,
  getTicketsPorAnalista,
  getTopCategorias,
  getTicketsPorDia,
  getDistribucionTipo,
  getTiempoPromedioPorAnalista,
  getHeatmapEDS,
  getUltimosTickets,
  getRankingEDS,
  getCategoriasTiempo
};
