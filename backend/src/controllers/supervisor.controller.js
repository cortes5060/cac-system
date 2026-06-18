const { sql, pool } = require('../config/db');

/* ── HELPERS ────────────────────────────────────────────────── */

function periodo(req) {
  const now = new Date();
  return {
    mes:  req.query.mes ? parseInt(req.query.mes) : 0,   // 0 = todos los meses
    anio: parseInt(req.query.anio) || now.getFullYear()
  };
}

function filtros(req) {
  return {
    idAnalista:         req.query.idAnalista         ? parseInt(req.query.idAnalista)  : null,
    eds:                req.query.eds                || null,
    categoriaPrincipal: req.query.categoriaPrincipal || null,
    idCategoria:        req.query.idCategoria        ? parseInt(req.query.idCategoria) : null,
    idGrupoColaborador: req.query.idGrupo            ? parseInt(req.query.idGrupo)     : null,
  };
}

function addInputs(r, p, f) {
  r.input('anio', sql.Int, p.anio);
  if (p.mes > 0)             r.input('mes',   sql.Int,      p.mes);
  if (f.idAnalista)          r.input('fAna',  sql.Int,      f.idAnalista);
  if (f.eds)                 r.input('fEDS',  sql.NVarChar, f.eds);
  if (f.categoriaPrincipal)  r.input('fCatP', sql.NVarChar, f.categoriaPrincipal);
  if (f.idCategoria)         r.input('fCat',  sql.Int,      f.idCategoria);
  if (f.idGrupoColaborador)  r.input('fGrp',  sql.Int,      f.idGrupoColaborador);
}

function periodoWhere(p, alias = '') {
  const pre = alias ? alias + '.' : '';
  let w = `YEAR(${pre}fechaHora) = @anio`;
  if (p.mes > 0) w += ` AND MONTH(${pre}fechaHora) = @mes`;
  return w;
}

function filtroWhere(f, alias = '') {
  const pre = alias ? alias + '.' : '';
  let w = '';
  if (f.idAnalista)         w += ` AND ISNULL(${pre}escalado, ${pre}idAnalista) = @fAna`;
  if (f.eds)                w += ` AND ${pre}EDS = @fEDS`;
  if (f.categoriaPrincipal) w += ` AND EXISTS (SELECT 1 FROM categorias _c WHERE _c.id = ${pre}idCategoria AND _c.categoriaprincipal = @fCatP)`;
  if (f.idCategoria)        w += ` AND ${pre}idCategoria = @fCat`;
  if (f.idGrupoColaborador) w += ` AND ${pre}idGrupoColaborador = @fGrp`;
  return w;
}

function mkReq(db, p, f) {
  const r = db.request();
  addInputs(r, p, f);
  return r;
}

/* ── KPIs ──────────────────────────────────────────────────── */

const getKPIs = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const db = await pool;
    const pw  = periodoWhere(p);
    const pwt = periodoWhere(p, 't');
    const fw  = filtroWhere(f);
    const fwt = filtroWhere(f, 't');

    const [totalR, activosR, altaPrioR, escalaR, topCatR, topEdsR, topAnaR] = await Promise.all([
      mkReq(db,p,f).query(`SELECT COUNT(*) AS total FROM tickets WHERE ${pw}${fw}`),
      mkReq(db,p,f).query(`
        SELECT COUNT(*) AS total FROM tickets t LEFT JOIN estatus e ON t.idEstatus = e.id
        WHERE ${pw}${fw}
          AND e.nombre IN ('En curso','Esperando cliente','Servicio programado',
                          'Servicio Técnico En Curso','En Pausa','Nuevo')`),
      mkReq(db,p,f).query(`
        SELECT COUNT(*) AS total FROM tickets t LEFT JOIN prioridad pr ON t.idPrioridad = pr.id
        WHERE ${pw}${fw} AND pr.nombre = 'Alta'`),
      mkReq(db,p,f).query(`
        SELECT COUNT(*) AS total FROM tickets t LEFT JOIN estatus e ON t.idEstatus = e.id
        WHERE ${pw}${fw}
          AND e.nombre IN ('Escalado a cotizaciones','Escalado Servicio Técnico')`),
      mkReq(db,p,f).query(`
        SELECT TOP 5 c.nombre, COUNT(t.id) AS total
        FROM tickets t JOIN categorias c ON t.idCategoria = c.id
        WHERE ${pwt}${fwt} GROUP BY c.id,c.nombre ORDER BY total DESC`),
      mkReq(db,p,f).query(`
        SELECT TOP 5 EDS, COUNT(*) AS total FROM tickets
        WHERE ${pw} AND EDS IS NOT NULL AND EDS!=''${fw}
        GROUP BY EDS ORDER BY total DESC`),
      mkReq(db,p,f).query(`
        SELECT TOP 1 a.nombre, COUNT(t.id) AS total
        FROM analistas a JOIN tickets t ON a.id=ISNULL(t.escalado,t.idAnalista)
        WHERE ${pwt}${fwt} GROUP BY a.id,a.nombre ORDER BY total DESC`),
    ]);

    res.json({
      totalTickets:         totalR.recordset[0].total,
      ticketsActivos:       activosR.recordset[0].total,
      ticketsAltaPrioridad: altaPrioR.recordset[0].total,
      ticketsEscalados:     escalaR.recordset[0].total,
      topCategorias:        topCatR.recordset,
      topEDS:               topEdsR.recordset,
      analistaTop:          topAnaR.recordset[0] || null,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── GRÁFICOS ──────────────────────────────────────────────── */

const getTicketsPorAnalista = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const pw = periodoWhere(p, 't'), fw = filtroWhere(f, 't');
    // Incluye todos los analistas (existe=0 también) que tengan tickets en el período
    const result = await r.query(`
      SELECT a.nombre, COUNT(t.id) AS tickets
      FROM tickets t
      JOIN analistas a ON a.id = ISNULL(t.escalado, t.idAnalista)
      WHERE ${pw}${fw} AND a.idRol = 1${f.idAnalista ? ' AND a.id = @fAna' : ''}
      GROUP BY a.id, a.nombre ORDER BY tickets DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTopCategorias = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT TOP 10 c.nombre, COUNT(t.id) AS total
      FROM tickets t JOIN categorias c ON t.idCategoria = c.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY c.id, c.nombre ORDER BY total DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTicketsPorDia = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const pw = periodoWhere(p), fw = filtroWhere(f);

    // When no month selected → group by month instead of day
    if (p.mes === 0) {
      const result = await r.query(`
        SELECT MONTH(fechaHora) AS periodo, COUNT(*) AS total
        FROM tickets WHERE ${pw}${fw}
        GROUP BY MONTH(fechaHora) ORDER BY periodo
      `);
      return res.json({ modo: 'mes', datos: result.recordset });
    }

    const result = await r.query(`
      SELECT DAY(fechaHora) AS dia, COUNT(*) AS total
      FROM tickets WHERE ${pw}${fw}
      GROUP BY DAY(fechaHora) ORDER BY dia
    `);
    res.json({ modo: 'dia', datos: result.recordset });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionTipo = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT tc.nombre, COUNT(t.id) AS total
      FROM tickets t JOIN tiposCaso tc ON t.idTipoCaso = tc.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY tc.id, tc.nombre
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionEstatus = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT ISNULL(e.nombre, 'Sin estatus') AS estatus, COUNT(t.id) AS total
      FROM tickets t LEFT JOIN estatus e ON t.idEstatus = e.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY e.id, e.nombre ORDER BY total DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getHeatmapEDS = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT t.EDS, c.nombre AS categoria, COUNT(*) AS total
      FROM tickets t JOIN categorias c ON t.idCategoria = c.id
      WHERE ${periodoWhere(p,'t')} AND t.EDS IS NOT NULL AND t.EDS != ''${filtroWhere(f,'t')}
      GROUP BY t.EDS, c.id, c.nombre ORDER BY t.EDS, total DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TABLAS ────────────────────────────────────────────────── */

const getUltimosTickets = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT TOP 500
        t.id, t.codigo2wd, t.casoAtendido,
        ISNULL(a.nombre,  '—') AS analista,
        t.EDS,
        ISNULL(c.nombre,  '—') AS categoria,
        ISNULL(tc.nombre, '—') AS tipoCaso,
        ISNULL(e.nombre,  '—') AS estatus,
        ISNULL(pr.nombre, '—') AS prioridad,
        FORMAT(t.fechaHora, 'dd/MM/yyyy HH:mm') AS fechaRegistro
      FROM tickets t
      LEFT JOIN analistas a  ON ISNULL(t.escalado, t.idAnalista) = a.id
      LEFT JOIN categorias c ON t.idCategoria = c.id
      LEFT JOIN tiposCaso tc ON t.idTipoCaso  = tc.id
      LEFT JOIN estatus   e  ON t.idEstatus   = e.id
      LEFT JOIN prioridad pr ON t.idPrioridad = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      ORDER BY t.fechaHora DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getRankingEDS = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT TOP 30 EDS, COUNT(*) AS total
      FROM tickets
      WHERE ${periodoWhere(p)} AND EDS IS NOT NULL AND EDS != ''${filtroWhere(f)}
      GROUP BY EDS ORDER BY total DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionPrioridad = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT ISNULL(pr.nombre, 'Sin prioridad') AS prioridad, COUNT(t.id) AS total
      FROM tickets t LEFT JOIN prioridad pr ON t.idPrioridad = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY pr.id, pr.nombre ORDER BY total DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── ESCALACIÓN ────────────────────────────────────────────── */

const getTopAltaPrioridad = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT
        t.id, t.codigo2wd, t.casoAtendido, t.EDS,
        ISNULL(cr.nombre, '—') AS creador,
        ISNULL(es.nombre, '—') AS escaladoA,
        ISNULL(e.nombre,  '—') AS estatus,
        ISNULL(pr.nombre, '—') AS prioridad,
        FORMAT(t.fechaHora, 'dd/MM/yyyy HH:mm') AS fechaRegistro,
        DATEDIFF(DAY, t.fechaHora, GETDATE()) AS diasAbierto,
        CASE WHEN t.idAnalista != t.escalado AND t.escalado IS NOT NULL THEN 1 ELSE 0 END AS fueEscalado
      FROM tickets t
      LEFT JOIN analistas  cr ON t.idAnalista  = cr.id
      LEFT JOIN analistas  es ON t.escalado    = es.id
      LEFT JOIN estatus    e  ON t.idEstatus   = e.id
      LEFT JOIN prioridad  pr ON t.idPrioridad = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
        AND pr.nombre = 'Alta'
        AND e.nombre NOT IN ('Cerrado','Cancelado')
      ORDER BY t.fechaHora ASC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getMetricasEscalacion = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const pw = periodoWhere(p,'t'), fw = filtroWhere(f,'t');
    const db = await pool;

    const [totalEscR, recibR, enviR, activosEscR] = await Promise.all([
      // Total escalados (creador != responsable)
      mkReq(db,p,f).query(`
        SELECT COUNT(*) AS total FROM tickets t
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
          AND t.escalado != t.idAnalista`),
      // Quiénes reciben más escalaciones
      mkReq(db,p,f).query(`
        SELECT TOP 8 a.nombre, COUNT(*) AS total
        FROM tickets t JOIN analistas a ON t.escalado = a.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
          AND t.escalado != t.idAnalista
        GROUP BY a.id, a.nombre ORDER BY total DESC`),
      // Quiénes envían más escalaciones
      mkReq(db,p,f).query(`
        SELECT TOP 8 a.nombre, COUNT(*) AS total
        FROM tickets t JOIN analistas a ON t.idAnalista = a.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
          AND t.escalado != t.idAnalista
        GROUP BY a.id, a.nombre ORDER BY total DESC`),
      // Escalados activos (no cerrados)
      mkReq(db,p,f).query(`
        SELECT COUNT(*) AS total FROM tickets t
        LEFT JOIN estatus e ON t.idEstatus = e.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
          AND t.escalado != t.idAnalista
          AND (e.nombre IS NULL OR e.nombre NOT IN ('Cerrado','Cancelado'))`),
    ]);

    res.json({
      totalEscalados:  totalEscR.recordset[0].total,
      escaladosActivos: activosEscR.recordset[0].total,
      reciben:         recibR.recordset,
      envian:          enviR.recordset,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTablaEscaladosActivos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT
        t.id, t.codigo2wd, t.casoAtendido, t.EDS,
        ISNULL(cr.nombre, '—') AS creador,
        ISNULL(es.nombre, '—') AS escaladoA,
        ISNULL(e.nombre,  '—') AS estatus,
        ISNULL(pr.nombre, '—') AS prioridad,
        ISNULL(g.nombre,  '—') AS grupo,
        FORMAT(t.fechaHora, 'dd/MM/yyyy HH:mm') AS fechaRegistro,
        DATEDIFF(DAY, t.fechaHora, GETDATE()) AS diasAbierto
      FROM tickets t
      LEFT JOIN analistas  cr ON t.idAnalista  = cr.id
      LEFT JOIN analistas  es ON t.escalado    = es.id
      LEFT JOIN estatus    e  ON t.idEstatus   = e.id
      LEFT JOIN prioridad  pr ON t.idPrioridad = pr.id
      LEFT JOIN gruposColaborador g ON t.idGrupoColaborador = g.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
        AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
        AND t.escalado != t.idAnalista
        AND (e.nombre IS NULL OR e.nombre NOT IN ('Cerrado','Cancelado'))
      ORDER BY t.fechaHora ASC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── ANÁLISIS AVANZADO ─────────────────────────────────────── */

const getComparacion = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const db = await pool;

    const mesAnt  = p.mes > 1 ? p.mes - 1 : (p.mes === 1 ? 12 : 0);
    const anioAnt = p.mes === 1 ? p.anio - 1 : (p.mes === 0 ? p.anio - 1 : p.anio);

    const mkMetrica = async (anio, mes) => {
      const pp = { anio, mes };
      const r  = db.request();
      addInputs(r, pp, f);
      const result = await r.query(`
        SELECT
          COUNT(t.id) AS total,
          SUM(CASE WHEN pr.nombre = 'Alta' THEN 1 ELSE 0 END) AS altaPrio,
          SUM(CASE WHEN e.nombre IN ('Escalado a cotizaciones','Escalado Servicio Técnico') THEN 1 ELSE 0 END) AS escalados
        FROM tickets t
        LEFT JOIN prioridad pr ON t.idPrioridad = pr.id
        LEFT JOIN estatus   e  ON t.idEstatus   = e.id
        WHERE ${periodoWhere(pp, 't')}${filtroWhere(f, 't')}
      `);
      return result.recordset[0];
    };

    const [actual, anterior] = await Promise.all([
      mkMetrica(p.anio, p.mes),
      mkMetrica(anioAnt, mesAnt),
    ]);

    res.json({ actual, anterior, mesAnt, anioAnt });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getPorDiaSemana = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT DATEPART(WEEKDAY, fechaHora) AS dia, COUNT(*) AS total
      FROM tickets
      WHERE ${periodoWhere(p)}${filtroWhere(f)}
      GROUP BY DATEPART(WEEKDAY, fechaHora)
      ORDER BY dia
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTasaResolucion = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT
        a.nombre,
        COUNT(t.id) AS total,
        SUM(CASE WHEN e.nombre = 'Cerrado' THEN 1 ELSE 0 END) AS cerrados
      FROM tickets t
      JOIN analistas a ON ISNULL(t.escalado, t.idAnalista) = a.id
      LEFT JOIN estatus e ON t.idEstatus = e.id
      WHERE ${periodoWhere(p, 't')}${filtroWhere(f, 't')}
        AND a.idRol = 1
      GROUP BY a.id, a.nombre
      HAVING COUNT(t.id) >= 3
      ORDER BY cerrados * 100.0 / COUNT(t.id) DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getCargaActual = async (req, res) => {
  try {
    const f = filtros(req);
    const db = await pool;
    const r  = db.request();
    if (f.idGrupoColaborador) r.input('fGrp', sql.Int, f.idGrupoColaborador);
    const fw = f.idGrupoColaborador ? ` AND t.idGrupoColaborador = @fGrp` : '';
    const result = await r.query(`
      SELECT
        a.nombre,
        COUNT(t.id) AS activos,
        SUM(CASE WHEN pr.nombre = 'Alta' THEN 1 ELSE 0 END) AS altaPrio,
        SUM(CASE WHEN t.escalado != t.idAnalista AND t.idAnalista IS NOT NULL THEN 1 ELSE 0 END) AS escalados
      FROM tickets t
      JOIN analistas a ON ISNULL(t.escalado, t.idAnalista) = a.id
      LEFT JOIN estatus   e  ON t.idEstatus   = e.id
      LEFT JOIN prioridad pr ON t.idPrioridad = pr.id
      WHERE a.idRol = 1 AND a.activo = 1 AND a.existe = 1
        AND (e.nombre IS NULL OR e.nombre NOT IN ('Cerrado','Cancelado'))${fw}
      GROUP BY a.id, a.nombre
      HAVING COUNT(t.id) > 0
      ORDER BY activos DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getReincidenciaEDS = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT TOP 60 t.EDS, c.nombre AS categoria, COUNT(*) AS total
      FROM tickets t
      JOIN categorias c ON t.idCategoria = c.id
      WHERE ${periodoWhere(p, 't')}${filtroWhere(f, 't')}
        AND t.EDS IS NOT NULL AND t.EDS != ''
      GROUP BY t.EDS, c.id, c.nombre
      HAVING COUNT(*) >= 3
      ORDER BY total DESC, t.EDS
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getCategoriasEscaladas = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT TOP 10 c.nombre, COUNT(t.id) AS total
      FROM tickets t
      JOIN categorias c ON t.idCategoria = c.id
      WHERE ${periodoWhere(p, 't')}${filtroWhere(f, 't')}
        AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL AND t.escalado != t.idAnalista
      GROUP BY c.id, c.nombre
      ORDER BY total DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

module.exports = {
  getKPIs, getTicketsPorAnalista, getTopCategorias, getTicketsPorDia,
  getDistribucionTipo, getDistribucionEstatus, getDistribucionPrioridad,
  getHeatmapEDS, getUltimosTickets, getRankingEDS,
  getTopAltaPrioridad, getMetricasEscalacion, getTablaEscaladosActivos,
  getComparacion, getPorDiaSemana, getTasaResolucion,
  getCargaActual, getReincidenciaEDS, getCategoriasEscaladas,
};
