const { sql, pool } = require('../config/db');
const { transporter, configurado } = require('../config/mailer');

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
    idAnalista:         req.query.idAnalista    ? parseInt(req.query.idAnalista)  : null,
    eds:                req.query.eds           || null,
    idCategoria:        req.query.idCategoria   ? parseInt(req.query.idCategoria) : null,
    grupoCategoria:     req.query.grupoCategoria || null,
    idGrupoColaborador: req.query.idGrupo       ? parseInt(req.query.idGrupo)     : null,
  };
}

function addInputs(r, p, f) {
  r.input('anio', sql.Int, p.anio);
  if (p.mes > 0)              r.input('mes',  sql.Int,      p.mes);
  if (f.idAnalista)           r.input('fAna', sql.Int,      f.idAnalista);
  if (f.eds)                  r.input('fEDS', sql.NVarChar, f.eds);
  if (f.idCategoria)          r.input('fCat', sql.Int,      f.idCategoria);
  if (f.grupoCategoria)       r.input('fGrupoCat', sql.NVarChar, f.grupoCategoria);
  if (f.idGrupoColaborador)   r.input('fGrp', sql.Int,      f.idGrupoColaborador);
}

// Una categoría es del tipo "Autoatendido - Datafono / Cambio Datafono". El grupo amplio
// ("Autoatendido") es lo que va antes del primer " - " dentro de categoriaprincipal.
const SQL_GRUPO_CATEGORIA =
  `LEFT(RTRIM(categoriaprincipal), CHARINDEX(' - ', RTRIM(categoriaprincipal) + ' - ') - 1)`;

function periodoWhere(p, alias = '') {
  const pre = alias ? alias + '.' : '';
  let w = `YEAR(${pre}fechaHora) = @anio`;
  if (p.mes > 0) w += ` AND MONTH(${pre}fechaHora) = @mes`;
  return w;
}

function filtroWhere(f, alias = '') {
  const pre = alias ? alias + '.' : '';
  let w = '';
  if (f.idAnalista)          w += ` AND ${pre}escalado            = @fAna`;
  if (f.eds)                 w += ` AND ${pre}EDS                 = @fEDS`;
  if (f.idCategoria)         w += ` AND ${pre}idCategoria         = @fCat`;
  if (f.grupoCategoria)      w += ` AND ${pre}idCategoria IN (SELECT id FROM categorias WHERE ${SQL_GRUPO_CATEGORIA} = @fGrupoCat)`;
  if (f.idGrupoColaborador)  w += ` AND ${pre}idGrupoColaborador  = @fGrp`;
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
        FROM analistas a JOIN tickets t ON a.id=t.escalado
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
      JOIN analistas a ON a.id = t.escalado
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

// Tickets que aún no están Cerrado ni Cancelado, agrupados por cuántos días llevan abiertos
const getAntiguedadAbiertos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const db = await pool;
    const pw = periodoWhere(p, 't'), fw = filtroWhere(f, 't');
    const abiertoWhere = `(e.nombre IS NULL OR e.nombre NOT IN ('Cerrado', 'Cancelado'))`;

    const [bucketsR, masAntiguosR] = await Promise.all([
      mkReq(db, p, f).query(`
        SELECT
          SUM(CASE WHEN DATEDIFF(DAY, t.fechaHora, GETDATE()) <= 1 THEN 1 ELSE 0 END) AS d0_1,
          SUM(CASE WHEN DATEDIFF(DAY, t.fechaHora, GETDATE()) BETWEEN 2 AND 3 THEN 1 ELSE 0 END) AS d2_3,
          SUM(CASE WHEN DATEDIFF(DAY, t.fechaHora, GETDATE()) BETWEEN 4 AND 7 THEN 1 ELSE 0 END) AS d4_7,
          SUM(CASE WHEN DATEDIFF(DAY, t.fechaHora, GETDATE()) > 7 THEN 1 ELSE 0 END) AS dmas7
        FROM tickets t LEFT JOIN estatus e ON t.idEstatus = e.id
        WHERE ${pw}${fw} AND ${abiertoWhere}`),

      mkReq(db, p, f).query(`
        SELECT TOP 10
          t.id, t.codigo2wd, t.casoAtendido, t.EDS,
          ISNULL(a.nombre, '—') AS responsable,
          ISNULL(e.nombre, 'Sin estatus') AS estatus,
          DATEDIFF(DAY, t.fechaHora, GETDATE()) AS dias
        FROM tickets t
        LEFT JOIN analistas a ON a.id = COALESCE(t.escalado, t.idAnalista)
        LEFT JOIN estatus e ON t.idEstatus = e.id
        WHERE ${pw}${fw} AND ${abiertoWhere}
        ORDER BY t.fechaHora ASC`),
    ]);

    const b = bucketsR.recordset[0];

    res.json({
      buckets: [
        { rango: '0-1 día',  total: b.d0_1  || 0 },
        { rango: '2-3 días', total: b.d2_3  || 0 },
        { rango: '4-7 días', total: b.d4_7  || 0 },
        { rango: '+7 días',  total: b.dmas7 || 0 },
      ],
      masAntiguos: masAntiguosR.recordset,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TABLAS ────────────────────────────────────────────────── */

const getUltimosTickets = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const r = mkReq(await pool, p, f);
    const result = await r.query(`
      SELECT TOP 10
        t.id, t.codigo2wd, t.casoAtendido,
        ISNULL(a.nombre,  '—') AS analista,
        t.EDS,
        ISNULL(c.nombre,  '—') AS categoria,
        ISNULL(tc.nombre, '—') AS tipoCaso,
        ISNULL(e.nombre,  '—') AS estatus,
        ISNULL(pr.nombre, '—') AS prioridad,
        FORMAT(t.fechaHora, 'dd/MM/yyyy HH:mm') AS fechaRegistro
      FROM tickets t
      LEFT JOIN analistas a  ON t.escalado    = a.id
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
      SELECT EDS, COUNT(*) AS total
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
      SELECT TOP 10
        t.id, t.codigo2wd, t.casoAtendido, t.EDS,
        ISNULL(cr.nombre, '—') AS creador,
        ISNULL(es.nombre, '—') AS escaladoA,
        ISNULL(e.nombre,  '—') AS estatus,
        ISNULL(pr.nombre, '—') AS prioridad,
        FORMAT(t.fechaHora, 'dd/MM/yyyy HH:mm') AS fechaRegistro,
        CASE WHEN t.idAnalista != t.escalado AND t.escalado IS NOT NULL THEN 1 ELSE 0 END AS fueEscalado
      FROM tickets t
      LEFT JOIN analistas  cr ON t.idAnalista  = cr.id
      LEFT JOIN analistas  es ON t.escalado    = es.id
      LEFT JOIN estatus    e  ON t.idEstatus   = e.id
      LEFT JOIN prioridad  pr ON t.idPrioridad = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
        AND pr.nombre = 'Alta'
        AND e.nombre NOT IN ('Cerrado','Cancelado')
      ORDER BY t.fechaHora DESC
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
      SELECT TOP 20
        t.id, t.codigo2wd, t.casoAtendido, t.EDS,
        ISNULL(cr.nombre, '—') AS creador,
        ISNULL(es.nombre, '—') AS escaladoA,
        ISNULL(e.nombre,  '—') AS estatus,
        ISNULL(pr.nombre, '—') AS prioridad,
        ISNULL(g.nombre,  '—') AS grupo,
        FORMAT(t.fechaHora, 'dd/MM/yyyy HH:mm') AS fechaRegistro
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
      ORDER BY pr.nombre ASC, t.fechaHora DESC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TIEMPOS DE RESPUESTA (casos 3CX cruzados con tickets 2WD) ─────────── */

// Casos con sus tiempos por estado. El cruce con 2WD es por casos3cx.ticketReferencia2WD = tickets.codigo2wd
const TIEMPOS_FROM = `
  FROM casos3cx c
  OUTER APPLY (
    SELECT
      SUM(CASE WHEN e.estado = 'ACTIVO'
               THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) AS segAct,
      SUM(CASE WHEN e.estado = 'INACTIVO'
               THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) AS segIna,
      MAX(CASE WHEN e.estado = 'FINALIZADO' THEN 1 ELSE 0 END) AS finalizado,
      MAX(CASE WHEN e.estado = 'FINALIZADO' AND e.automatico = 1 THEN 1 ELSE 0 END) AS auto
    FROM casos3cx_estados e
    WHERE e.idCaso = c.id
  ) s
  OUTER APPLY (SELECT COUNT(*) AS n FROM casos3cx_traspasos tr WHERE tr.idCaso = c.id) tp
  LEFT JOIN tickets    t  ON t.codigo2wd = c.ticketReferencia2WD
  LEFT JOIN estatus    es ON es.id = t.idEstatus
  LEFT JOIN prioridad  pr ON pr.id = t.idPrioridad
  LEFT JOIN categorias ct ON ct.id = t.idCategoria
  LEFT JOIN analistas  a  ON a.id  = c.idAnalista
`;

// Promedios solo sobre casos finalizados: uno abierto todavía está corriendo y falsearía el promedio
const TIEMPOS_PROM = `
  COUNT(*) AS casos,
  AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct + s.segIna AS FLOAT) END) AS promEjec,
  AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct AS FLOAT) END)            AS promResp,
  AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segIna AS FLOAT) END)            AS promSinResp
`;

function tiemposWhere(p, f) {
  let w = 'YEAR(c.fecha) = @anio';
  if (p.mes > 0)             w += ' AND MONTH(c.fecha) = @mes';
  if (f.idAnalista)          w += ` AND (c.idAnalista = @fAna OR EXISTS (SELECT 1 FROM casos3cx_traspasos x
                                   WHERE x.idCaso = c.id AND (x.deAnalista = @fAna OR x.aAnalista = @fAna)))`;
  if (f.eds)                 w += ' AND COALESCE(t.EDS, c.nombreEDS) = @fEDS';
  if (f.idCategoria)         w += ' AND t.idCategoria = @fCat';
  if (f.grupoCategoria)      w += ` AND t.idCategoria IN (SELECT id FROM categorias WHERE ${SQL_GRUPO_CATEGORIA} = @fGrupoCat)`;
  if (f.idGrupoColaborador)  w += ' AND t.idGrupoColaborador = @fGrp';
  return w;
}

const getMetricasTiempos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const w = tiemposWhere(p, f);
    const db = await pool;

    // Agrupa solo casos finalizados que ya tienen ticket en 2WD (para cortar por dato del ticket)
    const porTicket = (col, alias) => mkReq(db, p, f).query(`
      SELECT TOP 10 ${col} AS nombre, ${TIEMPOS_PROM}
      ${TIEMPOS_FROM}
      WHERE ${w} AND s.finalizado = 1 AND t.id IS NOT NULL AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY COUNT(*) DESC`);

    const [kpiR, analistaR, tipoR, catR, prioR, estR, sinTicketR] = await Promise.all([
      mkReq(db, p, f).query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN c.ticketReferencia2WD IS NOT NULL THEN 1 ELSE 0 END) AS conTicket,
          SUM(CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END)                   AS conTicketEn2WD,
          SUM(CASE WHEN s.finalizado = 1 THEN 1 ELSE 0 END)                   AS finalizados,
          SUM(CASE WHEN s.finalizado = 0 THEN 1 ELSE 0 END)                   AS abiertos,
          SUM(CASE WHEN s.auto = 1 THEN 1 ELSE 0 END)                         AS autoFinalizados,
          SUM(CASE WHEN tp.n > 0 THEN 1 ELSE 0 END)                           AS traspasados,
          AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct + s.segIna AS FLOAT) END) AS promEjec,
          AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct AS FLOAT) END)            AS promResp,
          AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segIna AS FLOAT) END)            AS promSinResp
        ${TIEMPOS_FROM}
        WHERE ${w}`),

      // Cada analista con el tiempo de SUS tramos: si un caso se pasó, el tiempo se reparte entre quienes lo atendieron
      mkReq(db, p, f).query(`
        SELECT a.nombre,
          COUNT(DISTINCT c.id) AS casos,
          SUM(CASE WHEN e.estado IN ('ACTIVO','INACTIVO')
                   THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) * 1.0 / COUNT(DISTINCT c.id) AS promEjec,
          SUM(CASE WHEN e.estado = 'ACTIVO'
                   THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) * 1.0 / COUNT(DISTINCT c.id) AS promResp,
          SUM(CASE WHEN e.estado = 'INACTIVO'
                   THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) * 1.0 / COUNT(DISTINCT c.id) AS promSinResp
        FROM casos3cx c
        JOIN casos3cx_estados e ON e.idCaso = c.id
        JOIN analistas a ON a.id = e.idAnalista
        LEFT JOIN tickets t ON t.codigo2wd = c.ticketReferencia2WD
        WHERE ${w}
          AND EXISTS (SELECT 1 FROM casos3cx_estados fz WHERE fz.idCaso = c.id AND fz.estado = 'FINALIZADO')
          ${f.idAnalista ? 'AND a.id = @fAna' : ''}
        GROUP BY a.id, a.nombre ORDER BY COUNT(DISTINCT c.id) DESC`),

      mkReq(db, p, f).query(`
        SELECT c.tipo AS nombre, ${TIEMPOS_PROM}
        ${TIEMPOS_FROM}
        WHERE ${w} AND s.finalizado = 1
        GROUP BY c.tipo ORDER BY c.tipo`),

      porTicket('ct.nombre'),
      porTicket('pr.nombre'),
      porTicket('es.nombre'),

      // Casos sin ticket vinculado (los más recientes primero)
      mkReq(db, p, f).query(`
        SELECT TOP 20
          c.id, c.fecha, c.numerochat, c.tipo, c.nombreEDS, a.nombre AS analista,
          CASE WHEN s.finalizado = 1 THEN 1 ELSE 0 END AS finalizado,
          ISNULL(s.segAct, 0) + ISNULL(s.segIna, 0)   AS segEjec
        ${TIEMPOS_FROM}
        WHERE ${w} AND c.ticketReferencia2WD IS NULL
        ORDER BY c.fecha DESC, c.id DESC`),
    ]);

    res.json({
      kpis:        kpiR.recordset[0],
      porAnalista: analistaR.recordset,
      porTipo:     tipoR.recordset,
      porCategoria: catR.recordset,
      porPrioridad: prioR.recordset,
      porEstatus:   estR.recordset,
      sinTicket:    sinTicketR.recordset,
    });
  } catch (error) {
    console.error('Error en métricas de tiempos:', error);
    res.status(500).json({ error: error.message });
  }
};

/* ── ENVÍO DE INFORMES POR CORREO ─────────────────────────────── */

// Solo dígitos, guiones/puntos y arroba: valida cada dirección sin depender de una librería aparte
function esCorreoValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const enviarReporte = async (req, res) => {
  try {

    if (!configurado()) {
      return res.status(503).json({
        error: 'El envío de correo no está configurado. Falta MAIL_USER / MAIL_PASS en el .env del servidor.'
      });
    }

    const destinatarios = String(req.body?.destinatarios ?? '')
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    if (!destinatarios.length) {
      return res.status(400).json({ error: 'Escribe al menos un destinatario' });
    }

    const invalidos = destinatarios.filter(d => !esCorreoValido(d));
    if (invalidos.length) {
      return res.status(400).json({ error: `Correo(s) inválido(s): ${invalidos.join(', ')}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Falta el archivo del informe' });
    }

    const periodoTexto = String(req.body?.periodo ?? '').trim() || 'Sistema CAC';
    const mensaje = String(req.body?.mensaje ?? '').trim().slice(0, 1000);

    await transporter.sendMail({
      from: `"Sistema CAC INSEPET" <${process.env.MAIL_USER}>`,
      to: destinatarios.join(', '),
      subject: `Informe CAC INSEPET — ${periodoTexto}`,
      text: mensaje || `Adjunto el informe de métricas del CAC correspondiente a ${periodoTexto}.`,
      attachments: [{
        filename: req.file.originalname || 'informe-cac.pdf',
        content: req.file.buffer,
        contentType: req.file.mimetype || 'application/pdf',
      }],
    });

    res.json({ ok: true, enviados: destinatarios.length });

  } catch (error) {
    console.error('Error enviando el informe por correo:', error);
    res.status(500).json({ error: 'No se pudo enviar el correo. Revisa la configuración de MAIL_USER / MAIL_PASS.' });
  }
};

module.exports = {
  getKPIs, getTicketsPorAnalista, getTopCategorias, getTicketsPorDia,
  getDistribucionTipo, getDistribucionEstatus, getDistribucionPrioridad,
  getAntiguedadAbiertos, getUltimosTickets, getRankingEDS,
  getTopAltaPrioridad, getMetricasEscalacion, getTablaEscaladosActivos,
  getMetricasTiempos, enviarReporte,
};
