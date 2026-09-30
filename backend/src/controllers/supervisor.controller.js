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

// Grupo derivado del prefijo antes de " - " en categoriaprincipal (ej. "Autoatendido - Datafono")
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

    const [totalR, activosR, altaPrioR, escalaR, topCatR, topEdsR, topAnaR, promResolR] = await Promise.all([
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
        SELECT TOP 10 c.nombre, COUNT(t.id) AS total
        FROM tickets t JOIN categorias c ON t.idCategoria = c.id
        WHERE ${pwt}${fwt} GROUP BY c.id,c.nombre ORDER BY total DESC`),
      mkReq(db,p,f).query(`
        SELECT TOP 10 EDS, COUNT(*) AS total FROM tickets
        WHERE ${pw} AND EDS IS NOT NULL AND EDS!=''${fw}
        GROUP BY EDS ORDER BY total DESC`),
      mkReq(db,p,f).query(`
        SELECT TOP 1 a.nombre, COUNT(t.id) AS total
        FROM analistas a JOIN tickets t ON a.id=t.escalado
        WHERE ${pwt}${fwt} GROUP BY a.id,a.nombre ORDER BY total DESC`),
      mkReq(db,p,f).query(`
        SELECT AVG(CAST(DATEDIFF(MINUTE, t.fechaHora, t.fechaCaso) AS FLOAT)) AS promMinutos
        FROM tickets t
        WHERE t.fechaCaso IS NOT NULL AND ${pw}${fw}`),
    ]);

    // Comparativo con el mes anterior (solo tiene sentido cuando se eligió un mes puntual)
    let comparativoMesAnterior = null;
    if (p.mes > 0) {
      const prevMes  = p.mes === 1 ? 12 : p.mes - 1;
      const prevAnio = p.mes === 1 ? p.anio - 1 : p.anio;
      const p2  = { mes: prevMes, anio: prevAnio };
      const pw2 = periodoWhere(p2);

      const [totalPrevR, activosPrevR, altaPrioPrevR, escalaPrevR] = await Promise.all([
        mkReq(db,p2,f).query(`SELECT COUNT(*) AS total FROM tickets WHERE ${pw2}${fw}`),
        mkReq(db,p2,f).query(`
          SELECT COUNT(*) AS total FROM tickets t LEFT JOIN estatus e ON t.idEstatus = e.id
          WHERE ${pw2}${fw}
            AND e.nombre IN ('En curso','Esperando cliente','Servicio programado',
                            'Servicio Técnico En Curso','En Pausa','Nuevo')`),
        mkReq(db,p2,f).query(`
          SELECT COUNT(*) AS total FROM tickets t LEFT JOIN prioridad pr ON t.idPrioridad = pr.id
          WHERE ${pw2}${fw} AND pr.nombre = 'Alta'`),
        mkReq(db,p2,f).query(`
          SELECT COUNT(*) AS total FROM tickets t LEFT JOIN estatus e ON t.idEstatus = e.id
          WHERE ${pw2}${fw}
            AND e.nombre IN ('Escalado a cotizaciones','Escalado Servicio Técnico')`),
      ]);

      comparativoMesAnterior = {
        mes: prevMes, anio: prevAnio,
        totalTickets:         totalPrevR.recordset[0].total,
        ticketsActivos:       activosPrevR.recordset[0].total,
        ticketsAltaPrioridad: altaPrioPrevR.recordset[0].total,
        ticketsEscalados:     escalaPrevR.recordset[0].total,
      };
    }

    res.json({
      totalTickets:         totalR.recordset[0].total,
      ticketsActivos:       activosR.recordset[0].total,
      ticketsAltaPrioridad: altaPrioR.recordset[0].total,
      ticketsEscalados:     escalaR.recordset[0].total,
      topCategorias:        topCatR.recordset,
      topEDS:               topEdsR.recordset,
      analistaTop:          topAnaR.recordset[0] || null,
      promResolucion2WD:    promResolR.recordset[0].promMinutos,
      comparativoMesAnterior,
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
        SELECT
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

    const q          = String(req.query.q ?? '').trim().slice(0, 100);
    const desde      = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde ?? '') ? req.query.desde : null;
    const hasta      = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta ?? '') ? req.query.hasta : null;
    const estatus    = String(req.query.estatus ?? '').trim();
    const idTipoCaso = req.query.idTipoCaso ? parseInt(req.query.idTipoCaso) : null;

    let where = `${periodoWhere(p,'t')}${filtroWhere(f,'t')}`;

    if (q) {
      const like = '%' + q.replace(/[%_\[]/g, m => '[' + m + ']') + '%';
      r.input('qLike', sql.NVarChar(110), like);
      where += ' AND (t.codigo2wd LIKE @qLike OR t.casoAtendido LIKE @qLike)';
    }
    if (desde) { r.input('desdeReg', sql.Date, desde); where += ' AND CAST(t.fechaHora AS DATE) >= @desdeReg'; }
    if (hasta) { r.input('hastaReg', sql.Date, hasta); where += ' AND CAST(t.fechaHora AS DATE) <= @hastaReg'; }
    if (estatus)    { r.input('fEstatusHist', sql.NVarChar(100), estatus); where += ' AND e.nombre = @fEstatusHist'; }
    if (idTipoCaso) { r.input('fTipoCasoHist', sql.Int, idTipoCaso); where += ' AND t.idTipoCaso = @fTipoCasoHist'; }

    const hayFiltro = !!(q || desde || hasta || estatus || idTipoCaso);
    const top = hayFiltro ? 'TOP 200' : 'TOP 10';

    const result = await r.query(`
      SELECT ${top}
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
      WHERE ${where}
      ORDER BY t.fechaHora DESC
    `);
    res.json({ tickets: result.recordset, filtrado: hayFiltro });
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

    const [totalEscR, recibR, enviR, activosEscR, totalTicketsR, porDiaEscR] = await Promise.all([
      // Total escalados (creador != responsable)
      mkReq(db,p,f).query(`
        SELECT COUNT(*) AS total FROM tickets t
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
          AND t.escalado != t.idAnalista`),
      mkReq(db,p,f).query(`
        SELECT TOP 8 a.nombre, COUNT(*) AS total
        FROM tickets t JOIN analistas a ON t.escalado = a.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
          AND t.escalado != t.idAnalista
        GROUP BY a.id, a.nombre ORDER BY total DESC`),
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
      // Total de tickets del período (para calcular el % de escalados)
      mkReq(db,p,f).query(`SELECT COUNT(*) AS total FROM tickets t WHERE ${pw}${fw}`),
      // Tendencia diaria: % de tickets escalados sobre el total, por día
      mkReq(db,p,f).query(`
        SELECT CAST(t.fechaHora AS DATE) AS fecha,
          COUNT(*) AS total,
          SUM(CASE WHEN t.escalado IS NOT NULL AND t.idAnalista IS NOT NULL
                        AND t.escalado != t.idAnalista THEN 1 ELSE 0 END) AS escalados
        FROM tickets t
        WHERE ${pw}${fw}
        GROUP BY CAST(t.fechaHora AS DATE)
        ORDER BY fecha`),
    ]);

    const totalTickets = totalTicketsR.recordset[0].total;
    const totalEscalados = totalEscR.recordset[0].total;

    res.json({
      totalEscalados,
      escaladosActivos:    activosEscR.recordset[0].total,
      reciben:             recibR.recordset,
      envian:              enviR.recordset,
      porcentajeEscalados: totalTickets > 0 ? (totalEscalados / totalTickets) * 100 : 0,
      porDia: porDiaEscR.recordset.map(r => ({
        fecha:      r.fecha,
        total:      r.total,
        escalados:  r.escalados,
        porcentaje: r.total > 0 ? (r.escalados / r.total) * 100 : 0,
      })),
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
      ORDER BY t.fechaHora ASC
    `);
    res.json(result.recordset);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TIEMPOS DE RESPUESTA (casos 3CX cruzados con tickets 2WD) ─────────── */

// Cruza casos3cx con tickets de 2WD por ticketReferencia2WD = codigo2wd
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

// Promedios solo sobre casos finalizados: uno abierto todavía está corriendo y falsearía el promedio.
// sumEjec sí es un total (no promedio) — cuánto tiempo del equipo se fue en esta categoría en total.
const TIEMPOS_PROM = `
  COUNT(*) AS casos,
  AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct + s.segIna AS FLOAT) END) AS promEjec,
  AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct AS FLOAT) END)            AS promResp,
  AVG(CASE WHEN s.finalizado = 1 THEN CAST(s.segIna AS FLOAT) END)            AS promSinResp,
  SUM(CASE WHEN s.finalizado = 1 THEN CAST(s.segAct + s.segIna AS FLOAT) ELSE 0 END) AS sumEjec
`;

function tiemposFiltrosExtra(f) {
  let w = '';
  if (f.idAnalista)          w += ` AND (c.idAnalista = @fAna OR EXISTS (SELECT 1 FROM casos3cx_traspasos x
                                   WHERE x.idCaso = c.id AND (x.deAnalista = @fAna OR x.aAnalista = @fAna)))`;
  if (f.eds)                 w += ' AND COALESCE(t.EDS, c.nombreEDS) = @fEDS';
  if (f.idCategoria)         w += ' AND t.idCategoria = @fCat';
  if (f.grupoCategoria)      w += ` AND t.idCategoria IN (SELECT id FROM categorias WHERE ${SQL_GRUPO_CATEGORIA} = @fGrupoCat)`;
  // filtra por grupo del analista, no del ticket: muchos casos 3CX no tienen ticket vinculado
  if (f.idGrupoColaborador)  w += ' AND a.idGrupoColaborador = @fGrp';
  return w;
}

function tiemposWhere(p, f, rango) {
  let w;
  if (rango) {
    w = 'CAST(c.fecha AS DATE) BETWEEN @fDesde AND @fHasta';
  } else {
    w = 'YEAR(c.fecha) = @anio';
    if (p.mes > 0) w += ' AND MONTH(c.fecha) = @mes';
  }
  return w + tiemposFiltrosExtra(f);
}

const getMetricasTiempos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);

    const parseFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : null;
    let desde = parseFecha(req.query.desde);
    let hasta = parseFecha(req.query.hasta);
    if (desde && !hasta) hasta = desde;
    if (hasta && !desde) desde = hasta;
    const rango = (desde && hasta) ? { desde, hasta } : null;

    const w = tiemposWhere(p, f, rango);
    const db = await pool;

    const nuevoReq = () => {
      const rq = mkReq(db, p, f);
      if (rango) { rq.input('fDesde', sql.Date, rango.desde); rq.input('fHasta', sql.Date, rango.hasta); }
      return rq;
    };

    // La tabla de casos (abajo del todo) no sigue el mes/año de arriba: usa el rango si hay, si no el día de hoy
    let wCasosTabla = (rango ? w : ('CAST(c.fecha AS DATE) = CAST(GETDATE() AS DATE)' + tiemposFiltrosExtra(f)));

    // Filtros propios de esa tabla: tipo de caso, si tiene ticket 2WD vinculado, y estado actual
    const reqCasosTabla = nuevoReq();
    const tipoCaso = ['CHAT', 'LLAMADA'].includes(req.query.tipoCaso) ? req.query.tipoCaso : null;
    if (tipoCaso) { reqCasosTabla.input('fTipoCaso', sql.VarChar(10), tipoCaso); wCasosTabla += ' AND c.tipo = @fTipoCaso'; }

    if (req.query.conTicket === 'si') wCasosTabla += ' AND c.ticketReferencia2WD IS NOT NULL';
    else if (req.query.conTicket === 'no') wCasosTabla += ' AND c.ticketReferencia2WD IS NULL';

    const estadoCaso = ['ACTIVO', 'INACTIVO', 'FINALIZADO'].includes(req.query.estadoCaso) ? req.query.estadoCaso : null;
    if (estadoCaso) {
      reqCasosTabla.input('fEstadoCaso', sql.VarChar(12), estadoCaso);
      wCasosTabla += ' AND (SELECT TOP 1 estado FROM casos3cx_estados WHERE idCaso = c.id ORDER BY id DESC) = @fEstadoCaso';
    }

    const porTicket = (col, alias) => nuevoReq().query(`
      SELECT TOP 10 ${col} AS nombre, ${TIEMPOS_PROM}
      ${TIEMPOS_FROM}
      WHERE ${w} AND s.finalizado = 1 AND t.id IS NOT NULL AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY COUNT(*) DESC`);

    const [kpiR, analistaR, tipoR, catR, prioR, estR, casosTablaR] = await Promise.all([
      nuevoReq().query(`
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
      nuevoReq().query(`
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

      nuevoReq().query(`
        SELECT c.tipo AS nombre, ${TIEMPOS_PROM}
        ${TIEMPOS_FROM}
        WHERE ${w} AND s.finalizado = 1
        GROUP BY c.tipo ORDER BY c.tipo`),

      porTicket('ct.nombre'),
      porTicket('pr.nombre'),
      porTicket('es.nombre'),

      reqCasosTabla.query(`
        SELECT TOP 500
          c.id, c.fecha, c.numerochat, c.tipo, c.nombreEDS, a.nombre AS analista,
          c.ticketReferencia2WD,
          (SELECT TOP 1 estado FROM casos3cx_estados WHERE idCaso = c.id ORDER BY id DESC) AS estado,
          CASE WHEN s.finalizado = 1 THEN 1 ELSE 0 END AS finalizado,
          ISNULL(s.segAct, 0) + ISNULL(s.segIna, 0)   AS segEjec
        ${TIEMPOS_FROM}
        WHERE ${wCasosTabla}
        ORDER BY c.fecha DESC, c.id DESC`),
    ]);

    res.json({
      kpis:        kpiR.recordset[0],
      porAnalista: analistaR.recordset,
      porTipo:     tipoR.recordset,
      porCategoria: catR.recordset,
      porPrioridad: prioR.recordset,
      porEstatus:   estR.recordset,
      casosTabla:   casosTablaR.recordset,
    });
  } catch (error) {
    console.error('Error en métricas de tiempos:', error);
    res.status(500).json({ error: error.message });
  }
};

/* ── AUDITORÍA DIARIA POR ANALISTA ─────────────────────────────
   Un analista puede tener varios casos activos a la vez, así que sumar el
   tiempo de cada caso por separado infla el total (doble conteo en los
   tramos donde se solapan). Para saber cuánto trabajó *de verdad* dentro
   de su turno, se fusionan los intervalos de todos sus casos ese día:
   si en un instante tiene AL MENOS un caso en ACTIVO, ese instante cuenta
   como "trabajando" (está atendiendo), aunque otro caso suyo esté
   simultáneamente en INACTIVO (esperando respuesta del cliente). Solo
   cuenta como "esperando" el tiempo en que NINGÚN caso suyo está activo
   pero sí hay alguno esperando. */
function fusionarCobertura(intervalos, rangoInicioMs, rangoFinMs) {
  const puntos = [];
  for (const iv of intervalos) {
    const ini = Math.max(new Date(iv.inicio).getTime(), rangoInicioMs);
    const finRaw = iv.fin ? new Date(iv.fin).getTime() : Date.now();
    const fin = Math.min(finRaw, rangoFinMs);
    if (fin <= ini) continue;
    puntos.push([ini, 1, iv.estado]);
    puntos.push([fin, -1, iv.estado]);
  }
  puntos.sort((a, b) => a[0] - b[0]);

  let activos = 0, inactivos = 0, trabajandoMs = 0, esperandoMs = 0, ultimoT = null;
  for (const [t, delta, estado] of puntos) {
    if (ultimoT !== null && t > ultimoT) {
      const dur = t - ultimoT;
      if (activos > 0) trabajandoMs += dur;
      else if (inactivos > 0) esperandoMs += dur;
    }
    if (estado === 'ACTIVO') activos += delta; else inactivos += delta;
    ultimoT = t;
  }
  return { trabajandoSeg: Math.round(trabajandoMs / 1000), esperandoSeg: Math.round(esperandoMs / 1000) };
}

// Cuántos casos ACTIVO reales (chat/llamada, no desconexiones) tuvo un analista abiertos
// al mismo tiempo, en su peor momento — evidencia de sobrecarga que no depende de qué tan
// rápido responde el cliente.
function picoConcurrencia(intervalosActivos, rangoInicioMs, rangoFinMs) {
  const puntos = [];
  for (const iv of intervalosActivos) {
    const ini = Math.max(new Date(iv.inicio).getTime(), rangoInicioMs);
    const finRaw = iv.fin ? new Date(iv.fin).getTime() : Date.now();
    const fin = Math.min(finRaw, rangoFinMs);
    if (fin <= ini) continue;
    puntos.push([ini, 1]);
    puntos.push([fin, -1]);
  }
  puntos.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // cierra antes de abrir si coinciden, no infla el pico

  let actuales = 0, pico = 0;
  for (const [, delta] of puntos) {
    actuales += delta;
    if (actuales > pico) pico = actuales;
  }
  return pico;
}

// En el momento de mayor carga del día, cuántos casos ACTIVO había entre todo el equipo
// y cuántos analistas distintos los estaban atendiendo — el ratio muestra el desbalance
// real en el peor instante, no solo en promedio.
function picoEquipo(porAnalistaIntervalos, rangoInicioMs, rangoFinMs) {
  const eventos = [];
  for (const [idAnalista, intervalos] of porAnalistaIntervalos) {
    for (const iv of intervalos) {
      const ini = Math.max(new Date(iv.inicio).getTime(), rangoInicioMs);
      const finRaw = iv.fin ? new Date(iv.fin).getTime() : Date.now();
      const fin = Math.min(finRaw, rangoFinMs);
      if (fin <= ini) continue;
      eventos.push([ini, 1, idAnalista]);
      eventos.push([fin, -1, idAnalista]);
    }
  }
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const abiertosPorAnalista = new Map();
  let totalActivos = 0, pico = 0, analistasEnPico = 0, horaPico = null;

  for (const [t, delta, idAnalista] of eventos) {
    abiertosPorAnalista.set(idAnalista, (abiertosPorAnalista.get(idAnalista) ?? 0) + delta);
    totalActivos += delta;

    if (totalActivos > pico) {
      pico = totalActivos;
      horaPico = t;
      analistasEnPico = [...abiertosPorAnalista.values()].filter(c => c > 0).length;
    }
  }

  return {
    picoCasosSimultaneos: pico,
    analistasEnPico,
    ratioPico: analistasEnPico ? +(pico / analistasEnPico).toFixed(2) : null,
    horaPico: horaPico ? new Date(horaPico).toISOString() : null,
  };
}

// Total de casos 3CX atendidos, agrupado por mes si se ve el año completo o por
// día si hay un mes puntual elegido — mismo criterio adaptativo que getTicketsPorDia.
const getCasosPorMes = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const db = await pool;

    let w = 'YEAR(c.fecha) = @anio';
    if (p.mes > 0) w += ' AND MONTH(c.fecha) = @mes';
    if (f.idAnalista) {
      w += ` AND (c.idAnalista = @fAna OR EXISTS (SELECT 1 FROM casos3cx_traspasos x
              WHERE x.idCaso = c.id AND (x.deAnalista = @fAna OR x.aAnalista = @fAna)))`;
    }
    if (f.idGrupoColaborador) w += ' AND an.idGrupoColaborador = @fGrp';

    const r = db.request();
    r.input('anio', sql.Int, p.anio);
    if (p.mes > 0)              r.input('mes', sql.Int, p.mes);
    if (f.idAnalista)           r.input('fAna', sql.Int, f.idAnalista);
    if (f.idGrupoColaborador)   r.input('fGrp', sql.Int, f.idGrupoColaborador);

    if (p.mes === 0) {
      const result = await r.query(`
        SELECT MONTH(c.fecha) AS periodo, COUNT(*) AS total
        FROM casos3cx c JOIN analistas an ON an.id = c.idAnalista
        WHERE ${w}
        GROUP BY MONTH(c.fecha) ORDER BY periodo
      `);
      return res.json({ modo: 'mes', datos: result.recordset });
    }

    const result = await r.query(`
      SELECT DAY(c.fecha) AS dia, COUNT(*) AS total
      FROM casos3cx c JOIN analistas an ON an.id = c.idAnalista
      WHERE ${w}
      GROUP BY DAY(c.fecha) ORDER BY dia
    `);
    res.json({ modo: 'dia', datos: result.recordset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTiemposDiario = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const db = await pool;

    const parseFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : null;
    let desde = parseFecha(req.query.desde);
    let hasta = parseFecha(req.query.hasta);
    // Compatibilidad con el parámetro viejo de un solo día
    const fechaUnica = parseFecha(req.query.fecha);
    if (fechaUnica && !desde && !hasta) { desde = fechaUnica; hasta = fechaUnica; }
    if (desde && !hasta) hasta = desde;
    if (hasta && !desde) desde = hasta;

    let rangoInicio, rangoFin, wFecha;
    if (desde && hasta) {
      rangoInicio = new Date(`${desde}T00:00:00`);
      rangoFin    = new Date(`${hasta}T23:59:59.999`);
      wFecha = 'CAST(c.fecha AS DATE) BETWEEN @fDesde AND @fHasta';
    } else if (p.mes > 0) {
      rangoInicio = new Date(p.anio, p.mes - 1, 1);
      rangoFin    = new Date(p.anio, p.mes, 0, 23, 59, 59, 999);
      wFecha = 'YEAR(c.fecha) = @anio AND MONTH(c.fecha) = @mes';
    } else {
      rangoInicio = new Date(p.anio, 0, 1);
      rangoFin    = new Date(p.anio, 11, 31, 23, 59, 59, 999);
      wFecha = 'YEAR(c.fecha) = @anio';
    }

    // Nota: se filtra por e.idAnalista (quién trabajó cada tramo), no por el dueño
    // actual del caso — así un caso transferido no mezcla horas de otro analista
    // cuando se filtra por uno en particular.
    let w = wFecha;
    if (f.idAnalista)         w += ' AND e.idAnalista = @fAna';
    if (f.idGrupoColaborador) w += ' AND an.idGrupoColaborador = @fGrp';

    const nuevoReq = () => {
      const rq = mkReq(db, p, f);
      if (desde && hasta) { rq.input('fDesde', sql.Date, desde); rq.input('fHasta', sql.Date, hasta); }
      return rq;
    };

    // Intervalos crudos ACTIVO/INACTIVO de cada caso, por analista (se fusionan en JS)
    const intervalosR = await nuevoReq().query(`
      SELECT e.idAnalista, an.nombre, e.idCaso, e.estado, e.inicio, e.fin
      FROM casos3cx_estados e
      JOIN casos3cx c  ON c.id  = e.idCaso
      JOIN analistas an ON an.id = e.idAnalista
      WHERE e.estado IN ('ACTIVO','INACTIVO') AND ${w}
      ORDER BY e.idAnalista, e.inicio
    `);

    // Casos atendidos y su promedio individual (sin fusión: cada caso es independiente)
    const casosR = await nuevoReq().query(`
      SELECT e.idAnalista, an.nombre,
        COUNT(DISTINCT e.idCaso) AS casosAtendidos,
        AVG(CAST(s.segAct + s.segIna AS FLOAT)) AS promEjecCaso
      FROM casos3cx_estados e
      JOIN casos3cx c   ON c.id  = e.idCaso
      JOIN analistas an ON an.id = e.idAnalista
      OUTER APPLY (
        SELECT
          SUM(CASE WHEN e2.estado = 'ACTIVO'   THEN DATEDIFF(SECOND, e2.inicio, ISNULL(e2.fin, GETDATE())) ELSE 0 END) AS segAct,
          SUM(CASE WHEN e2.estado = 'INACTIVO' THEN DATEDIFF(SECOND, e2.inicio, ISNULL(e2.fin, GETDATE())) ELSE 0 END) AS segIna
        FROM casos3cx_estados e2 WHERE e2.idCaso = e.idCaso
      ) s
      WHERE e.estado IN ('ACTIVO','INACTIVO') AND ${w}
      GROUP BY e.idAnalista, an.nombre
    `);

    // Casos que ese analista tocó en el rango y que a día de hoy siguen sin FINALIZADO
    const abiertosR = await nuevoReq().query(`
      SELECT e.idAnalista, COUNT(DISTINCT e.idCaso) AS casosAbiertos
      FROM casos3cx_estados e
      JOIN casos3cx c ON c.id = e.idCaso
      JOIN analistas an ON an.id = e.idAnalista
      WHERE e.estado IN ('ACTIVO','INACTIVO') AND ${w}
        AND NOT EXISTS (SELECT 1 FROM casos3cx_estados fz WHERE fz.idCaso = e.idCaso AND fz.estado = 'FINALIZADO')
      GROUP BY e.idAnalista
    `);

    // desconexión supervisada aprobada = sigue "trabajando" aunque no esté en la cola 3CX,
    // se inyecta como un tramo ACTIVO más
    const rDesc = db.request();
    rDesc.input('rIni', sql.DateTime, rangoInicio);
    rDesc.input('rFin', sql.DateTime, rangoFin);
    if (f.idAnalista)         rDesc.input('fAna', sql.Int, f.idAnalista);
    if (f.idGrupoColaborador) rDesc.input('fGrp', sql.Int, f.idGrupoColaborador);
    const desconexionesR = await rDesc.query(`
      SELECT ds.idAnalista, an.nombre, ds.resueltoEn AS inicio, ISNULL(ds.finalizadoEn, GETDATE()) AS fin
      FROM desconexionesSupervisadas ds
      JOIN analistas an ON an.id = ds.idAnalista
      WHERE ds.estado IN ('APROBADA','FINALIZADA')
        AND ds.resueltoEn IS NOT NULL
        AND ds.resueltoEn < @rFin AND ISNULL(ds.finalizadoEn, GETDATE()) > @rIni
        ${f.idAnalista ? 'AND ds.idAnalista = @fAna' : ''}
        ${f.idGrupoColaborador ? 'AND an.idGrupoColaborador = @fGrp' : ''}
    `);

    // días con actividad por analista, para promediar por día en vez del total del mes
    const diasR = await nuevoReq().query(`
      SELECT e.idAnalista, COUNT(DISTINCT CAST(e.inicio AS DATE)) AS dias
      FROM casos3cx_estados e
      JOIN casos3cx c ON c.id = e.idCaso
      JOIN analistas an ON an.id = e.idAnalista
      WHERE e.estado IN ('ACTIVO','INACTIVO') AND ${w}
      GROUP BY e.idAnalista
    `);

    const porAnalista = new Map();
    for (const row of intervalosR.recordset) {
      if (!porAnalista.has(row.idAnalista)) {
        porAnalista.set(row.idAnalista, { idAnalista: row.idAnalista, nombre: row.nombre, intervalos: [] });
      }
      porAnalista.get(row.idAnalista).intervalos.push(row);
    }
    for (const row of desconexionesR.recordset) {
      if (!porAnalista.has(row.idAnalista)) {
        porAnalista.set(row.idAnalista, { idAnalista: row.idAnalista, nombre: row.nombre, intervalos: [] });
      }
      porAnalista.get(row.idAnalista).intervalos.push({ estado: 'ACTIVO', inicio: row.inicio, fin: row.fin });
    }

    const casosPorAnalista    = new Map(casosR.recordset.map(r => [r.idAnalista, r]));
    const abiertosPorAnalista = new Map(abiertosR.recordset.map(r => [r.idAnalista, r.casosAbiertos]));
    const diasPorAnalista     = new Map(diasR.recordset.map(r => [r.idAnalista, r.dias]));

    const rangoInicioMs = rangoInicio.getTime(), rangoFinMs = rangoFin.getTime();
    const TURNO_SEG = 6 * 3600;
    const esUnSoloDia = !!(desde && hasta && desde === hasta);

    // Solo tramos de casos reales (idCaso presente), sin las desconexiones inyectadas —
    // la concurrencia de sobrecarga se mide sobre chats/llamadas de verdad.
    const intervalosActivosPorAnalista = new Map();
    for (const a of porAnalista.values()) {
      intervalosActivosPorAnalista.set(
        a.idAnalista,
        a.intervalos.filter(iv => iv.idCaso != null && iv.estado === 'ACTIVO')
      );
    }

    const resultado = Array.from(porAnalista.values()).map(a => {
      const { trabajandoSeg, esperandoSeg } = fusionarCobertura(a.intervalos, rangoInicioMs, rangoFinMs);
      const casos = casosPorAnalista.get(a.idAnalista);
      const dias = Math.max(diasPorAnalista.get(a.idAnalista) ?? 1, 1);

      // con un mes completo, promedia entre los días trabajados para comparar contra un turno de 6h
      const trabajandoPromDiaSeg = Math.round(trabajandoSeg / dias);
      const esperandoPromDiaSeg  = Math.round(esperandoSeg / dias);

      return {
        idAnalista:        a.idAnalista,
        nombre:            a.nombre,
        casosAtendidos:    casos?.casosAtendidos ?? 0,
        promEjecCaso:      casos?.promEjecCaso ?? null,
        diasConActividad:  dias,
        trabajandoTotalSeg: trabajandoSeg,
        esperandoTotalSeg:  esperandoSeg,
        trabajandoSeg:      trabajandoPromDiaSeg,
        esperandoSeg:       esperandoPromDiaSeg,
        porcentajeTurno:    (trabajandoPromDiaSeg / TURNO_SEG) * 100,
        casosAbiertos:      abiertosPorAnalista.get(a.idAnalista) ?? 0,
        picoConcurrente:    picoConcurrencia(intervalosActivosPorAnalista.get(a.idAnalista) ?? [], rangoInicioMs, rangoFinMs),
      };
    }).sort((x, y) => y.trabajandoSeg - x.trabajandoSeg);

    const equipo = picoEquipo(intervalosActivosPorAnalista, rangoInicioMs, rangoFinMs);

    res.json({
      desde, hasta, mes: p.mes, anio: p.anio,
      picoEquipo: equipo,
      turnoHoras: 6,
      esUnSoloDia,
      analistas: resultado,
    });
  } catch (error) {
    console.error('Error en tiempos diarios:', error);
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
  getMetricasTiempos, getTiemposDiario, getCasosPorMes, enviarReporte,
};
