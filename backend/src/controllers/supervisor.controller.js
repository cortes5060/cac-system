const { query, segundos } = require('../config/db');
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

function params(p, f) {
  const r = { anio: p.anio };
  if (p.mes > 0)              r.mes       = p.mes;
  if (f.idAnalista)           r.fAna      = f.idAnalista;
  if (f.eds)                  r.fEDS      = f.eds;
  if (f.idCategoria)          r.fCat      = f.idCategoria;
  if (f.grupoCategoria)       r.fGrupoCat = f.grupoCategoria;
  if (f.idGrupoColaborador)   r.fGrp      = f.idGrupoColaborador;
  return r;
}

// Una categoría es del tipo "Autoatendido - Datafono / Cambio Datafono". El grupo amplio
// ("Autoatendido") es lo que va antes del primer " - " dentro de categoriaprincipal.
const SQL_GRUPO_CATEGORIA = `split_part(RTRIM(categoriaprincipal), ' - ', 1)`;

function periodoWhere(p, alias = '') {
  const pre = alias ? alias + '.' : '';
  let w = `EXTRACT(YEAR FROM ${pre}"fechaHora") = @anio`;
  if (p.mes > 0) w += ` AND EXTRACT(MONTH FROM ${pre}"fechaHora") = @mes`;
  return w;
}

function filtroWhere(f, alias = '') {
  const pre = alias ? alias + '.' : '';
  let w = '';
  if (f.idAnalista)          w += ` AND ${pre}escalado              = @fAna`;
  if (f.eds)                 w += ` AND LOWER(${pre}"EDS")          = LOWER(@fEDS)`;
  if (f.idCategoria)         w += ` AND ${pre}"idCategoria"         = @fCat`;
  if (f.grupoCategoria)      w += ` AND ${pre}"idCategoria" IN (SELECT id FROM categorias WHERE ${SQL_GRUPO_CATEGORIA} = @fGrupoCat)`;
  if (f.idGrupoColaborador)  w += ` AND ${pre}"idGrupoColaborador"  = @fGrp`;
  return w;
}

// Ejecuta una consulta con los parámetros de período y filtros
function mkQuery(p, f) {
  const prm = params(p, f);
  return text => query(text, prm);
}

/* ── KPIs ──────────────────────────────────────────────────── */

const getKPIs = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const q = mkQuery(p, f);
    const pw  = periodoWhere(p);
    const pwt = periodoWhere(p, 't');
    const fw  = filtroWhere(f);
    const fwt = filtroWhere(f, 't');

    const [totalR, activosR, altaPrioR, escalaR, topCatR, topEdsR, topAnaR] = await Promise.all([
      q(`SELECT COUNT(*)::int AS total FROM tickets WHERE ${pw}${fw}`),
      q(`
        SELECT COUNT(*)::int AS total FROM tickets t LEFT JOIN estatus e ON t."idEstatus" = e.id
        WHERE ${pwt}${fwt}
          AND LOWER(e.nombre) IN ('en curso','esperando cliente','servicio programado',
                          'servicio técnico en curso','en pausa','nuevo')`),
      q(`
        SELECT COUNT(*)::int AS total FROM tickets t LEFT JOIN prioridad pr ON t."idPrioridad" = pr.id
        WHERE ${pwt}${fwt} AND LOWER(pr.nombre) = 'alta'`),
      q(`
        SELECT COUNT(*)::int AS total FROM tickets t LEFT JOIN estatus e ON t."idEstatus" = e.id
        WHERE ${pwt}${fwt}
          AND LOWER(e.nombre) IN ('escalado a cotizaciones','escalado servicio técnico')`),
      q(`
        SELECT c.nombre, COUNT(t.id)::int AS total
        FROM tickets t JOIN categorias c ON t."idCategoria" = c.id
        WHERE ${pwt}${fwt} GROUP BY c.id,c.nombre ORDER BY total DESC LIMIT 5`),
      q(`
        SELECT "EDS", COUNT(*)::int AS total FROM tickets
        WHERE ${pw} AND "EDS" IS NOT NULL AND "EDS"!=''${fw}
        GROUP BY "EDS" ORDER BY total DESC LIMIT 5`),
      q(`
        SELECT a.nombre, COUNT(t.id)::int AS total
        FROM analistas a JOIN tickets t ON a.id=t.escalado
        WHERE ${pwt}${fwt} GROUP BY a.id,a.nombre ORDER BY total DESC LIMIT 1`),
    ]);

    res.json({
      totalTickets:         totalR.rows[0].total,
      ticketsActivos:       activosR.rows[0].total,
      ticketsAltaPrioridad: altaPrioR.rows[0].total,
      ticketsEscalados:     escalaR.rows[0].total,
      topCategorias:        topCatR.rows,
      topEDS:               topEdsR.rows,
      analistaTop:          topAnaR.rows[0] || null,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── GRÁFICOS ──────────────────────────────────────────────── */

const getTicketsPorAnalista = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const pw = periodoWhere(p, 't'), fw = filtroWhere(f, 't');
    // Incluye todos los analistas (existe=0 también) que tengan tickets en el período
    const result = await mkQuery(p, f)(`
      SELECT a.nombre, COUNT(t.id)::int AS tickets
      FROM tickets t
      JOIN analistas a ON a.id = t.escalado
      WHERE ${pw}${fw} AND a."idRol" = 1${f.idAnalista ? ' AND a.id = @fAna' : ''}
      GROUP BY a.id, a.nombre ORDER BY tickets DESC
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTopCategorias = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT c.nombre, COUNT(t.id)::int AS total
      FROM tickets t JOIN categorias c ON t."idCategoria" = c.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY c.id, c.nombre ORDER BY total DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTicketsPorDia = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const q = mkQuery(p, f);
    const pw = periodoWhere(p), fw = filtroWhere(f);

    // When no month selected → group by month instead of day
    if (p.mes === 0) {
      const result = await q(`
        SELECT EXTRACT(MONTH FROM "fechaHora")::int AS periodo, COUNT(*)::int AS total
        FROM tickets WHERE ${pw}${fw}
        GROUP BY 1 ORDER BY periodo
      `);
      return res.json({ modo: 'mes', datos: result.rows });
    }

    const result = await q(`
      SELECT EXTRACT(DAY FROM "fechaHora")::int AS dia, COUNT(*)::int AS total
      FROM tickets WHERE ${pw}${fw}
      GROUP BY 1 ORDER BY dia
    `);
    res.json({ modo: 'dia', datos: result.rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionTipo = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT tc.nombre, COUNT(t.id)::int AS total
      FROM tickets t JOIN "tiposCaso" tc ON t."idTipoCaso" = tc.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY tc.id, tc.nombre
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionEstatus = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT COALESCE(e.nombre, 'Sin estatus') AS estatus, COUNT(t.id)::int AS total
      FROM tickets t LEFT JOIN estatus e ON t."idEstatus" = e.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY e.id, e.nombre ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// Tickets que aún no están Cerrado ni Cancelado, agrupados por cuántos días llevan abiertos
const getAntiguedadAbiertos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const q = mkQuery(p, f);
    const pw = periodoWhere(p, 't'), fw = filtroWhere(f, 't');
    const abiertoWhere = `(e.nombre IS NULL OR LOWER(e.nombre) NOT IN ('cerrado','cancelado'))`;
    const dias = `(CURRENT_DATE - t."fechaHora"::date)`;

    const [bucketsR, masAntiguosR] = await Promise.all([
      q(`
        SELECT
          SUM(CASE WHEN ${dias} <= 1 THEN 1 ELSE 0 END)::int AS d0_1,
          SUM(CASE WHEN ${dias} BETWEEN 2 AND 3 THEN 1 ELSE 0 END)::int AS d2_3,
          SUM(CASE WHEN ${dias} BETWEEN 4 AND 7 THEN 1 ELSE 0 END)::int AS d4_7,
          SUM(CASE WHEN ${dias} > 7 THEN 1 ELSE 0 END)::int AS dmas7
        FROM tickets t LEFT JOIN estatus e ON t."idEstatus" = e.id
        WHERE ${pw}${fw} AND ${abiertoWhere}`),

      q(`
        SELECT
          t.id, t.codigo2wd, t."casoAtendido", t."EDS",
          COALESCE(a.nombre, '—') AS responsable,
          COALESCE(e.nombre, 'Sin estatus') AS estatus,
          ${dias} AS dias
        FROM tickets t
        LEFT JOIN analistas a ON a.id = COALESCE(t.escalado, t."idAnalista")
        LEFT JOIN estatus e ON t."idEstatus" = e.id
        WHERE ${pw}${fw} AND ${abiertoWhere}
        ORDER BY t."fechaHora" ASC
        LIMIT 10`),
    ]);

    const b = bucketsR.rows[0];

    res.json({
      buckets: [
        { rango: '0-1 día',  total: b.d0_1  || 0 },
        { rango: '2-3 días', total: b.d2_3  || 0 },
        { rango: '4-7 días', total: b.d4_7  || 0 },
        { rango: '+7 días',  total: b.dmas7 || 0 },
      ],
      masAntiguos: masAntiguosR.rows,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TABLAS ────────────────────────────────────────────────── */

const getUltimosTickets = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT
        t.id, t.codigo2wd, t."casoAtendido",
        COALESCE(a.nombre,  '—') AS analista,
        t."EDS",
        COALESCE(c.nombre,  '—') AS categoria,
        COALESCE(tc.nombre, '—') AS "tipoCaso",
        COALESCE(e.nombre,  '—') AS estatus,
        COALESCE(pr.nombre, '—') AS prioridad,
        to_char(t."fechaHora", 'DD/MM/YYYY HH24:MI') AS "fechaRegistro"
      FROM tickets t
      LEFT JOIN analistas a    ON t.escalado      = a.id
      LEFT JOIN categorias c   ON t."idCategoria" = c.id
      LEFT JOIN "tiposCaso" tc ON t."idTipoCaso"  = tc.id
      LEFT JOIN estatus   e    ON t."idEstatus"   = e.id
      LEFT JOIN prioridad pr   ON t."idPrioridad" = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      ORDER BY t."fechaHora" DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getRankingEDS = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT "EDS", COUNT(*)::int AS total
      FROM tickets
      WHERE ${periodoWhere(p)} AND "EDS" IS NOT NULL AND "EDS" != ''${filtroWhere(f)}
      GROUP BY "EDS" ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getDistribucionPrioridad = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT COALESCE(pr.nombre, 'Sin prioridad') AS prioridad, COUNT(t.id)::int AS total
      FROM tickets t LEFT JOIN prioridad pr ON t."idPrioridad" = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
      GROUP BY pr.id, pr.nombre ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── ESCALACIÓN ────────────────────────────────────────────── */

const getTopAltaPrioridad = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT
        t.id, t.codigo2wd, t."casoAtendido", t."EDS",
        COALESCE(cr.nombre, '—') AS creador,
        COALESCE(es.nombre, '—') AS "escaladoA",
        COALESCE(e.nombre,  '—') AS estatus,
        COALESCE(pr.nombre, '—') AS prioridad,
        to_char(t."fechaHora", 'DD/MM/YYYY HH24:MI') AS "fechaRegistro",
        CASE WHEN t."idAnalista" != t.escalado AND t.escalado IS NOT NULL THEN 1 ELSE 0 END AS "fueEscalado"
      FROM tickets t
      LEFT JOIN analistas  cr ON t."idAnalista"  = cr.id
      LEFT JOIN analistas  es ON t.escalado      = es.id
      LEFT JOIN estatus    e  ON t."idEstatus"   = e.id
      LEFT JOIN prioridad  pr ON t."idPrioridad" = pr.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
        AND LOWER(pr.nombre) = 'alta'
        AND LOWER(e.nombre) NOT IN ('cerrado','cancelado')
      ORDER BY t."fechaHora" DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getMetricasEscalacion = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const pw = periodoWhere(p,'t'), fw = filtroWhere(f,'t');
    const q = mkQuery(p, f);

    const [totalEscR, recibR, enviR, activosEscR] = await Promise.all([
      // Total escalados (creador != responsable)
      q(`
        SELECT COUNT(*)::int AS total FROM tickets t
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t."idAnalista" IS NOT NULL
          AND t.escalado != t."idAnalista"`),
      // Quiénes reciben más escalaciones
      q(`
        SELECT a.nombre, COUNT(*)::int AS total
        FROM tickets t JOIN analistas a ON t.escalado = a.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t."idAnalista" IS NOT NULL
          AND t.escalado != t."idAnalista"
        GROUP BY a.id, a.nombre ORDER BY total DESC LIMIT 8`),
      // Quiénes envían más escalaciones
      q(`
        SELECT a.nombre, COUNT(*)::int AS total
        FROM tickets t JOIN analistas a ON t."idAnalista" = a.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t."idAnalista" IS NOT NULL
          AND t.escalado != t."idAnalista"
        GROUP BY a.id, a.nombre ORDER BY total DESC LIMIT 8`),
      // Escalados activos (no cerrados)
      q(`
        SELECT COUNT(*)::int AS total FROM tickets t
        LEFT JOIN estatus e ON t."idEstatus" = e.id
        WHERE ${pw}${fw}
          AND t.escalado IS NOT NULL AND t."idAnalista" IS NOT NULL
          AND t.escalado != t."idAnalista"
          AND (e.nombre IS NULL OR LOWER(e.nombre) NOT IN ('cerrado','cancelado'))`),
    ]);

    res.json({
      totalEscalados:  totalEscR.rows[0].total,
      escaladosActivos: activosEscR.rows[0].total,
      reciben:         recibR.rows,
      envian:          enviR.rows,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTablaEscaladosActivos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const result = await mkQuery(p, f)(`
      SELECT
        t.id, t.codigo2wd, t."casoAtendido", t."EDS",
        COALESCE(cr.nombre, '—') AS creador,
        COALESCE(es.nombre, '—') AS "escaladoA",
        COALESCE(e.nombre,  '—') AS estatus,
        COALESCE(pr.nombre, '—') AS prioridad,
        COALESCE(g.nombre,  '—') AS grupo,
        to_char(t."fechaHora", 'DD/MM/YYYY HH24:MI') AS "fechaRegistro"
      FROM tickets t
      LEFT JOIN analistas  cr ON t."idAnalista"  = cr.id
      LEFT JOIN analistas  es ON t.escalado      = es.id
      LEFT JOIN estatus    e  ON t."idEstatus"   = e.id
      LEFT JOIN prioridad  pr ON t."idPrioridad" = pr.id
      LEFT JOIN "gruposColaborador" g ON t."idGrupoColaborador" = g.id
      WHERE ${periodoWhere(p,'t')}${filtroWhere(f,'t')}
        AND t.escalado IS NOT NULL AND t."idAnalista" IS NOT NULL
        AND t.escalado != t."idAnalista"
        AND (e.nombre IS NULL OR LOWER(e.nombre) NOT IN ('cerrado','cancelado'))
      ORDER BY pr.nombre ASC, t."fechaHora" DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

/* ── TIEMPOS DE RESPUESTA (casos 3CX cruzados con tickets 2WD) ─────────── */

// Casos con sus tiempos por estado. El cruce con 2WD es por casos3cx.ticketReferencia2WD = tickets.codigo2wd
const TIEMPOS_FROM = `
  FROM casos3cx c
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN e.estado = 'ACTIVO'
               THEN ${segundos('e.inicio', 'e.fin')} ELSE 0 END) AS "segAct",
      SUM(CASE WHEN e.estado = 'INACTIVO'
               THEN ${segundos('e.inicio', 'e.fin')} ELSE 0 END) AS "segIna",
      MAX(CASE WHEN e.estado = 'FINALIZADO' THEN 1 ELSE 0 END) AS finalizado,
      MAX(CASE WHEN e.estado = 'FINALIZADO' AND e.automatico = '1' THEN 1 ELSE 0 END) AS auto
    FROM casos3cx_estados e
    WHERE e."idCaso" = c.id
  ) s ON true
  LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM casos3cx_traspasos tr WHERE tr."idCaso" = c.id) tp ON true
  LEFT JOIN tickets    t  ON t.codigo2wd = c."ticketReferencia2WD"
  LEFT JOIN estatus    es ON es.id = t."idEstatus"
  LEFT JOIN prioridad  pr ON pr.id = t."idPrioridad"
  LEFT JOIN categorias ct ON ct.id = t."idCategoria"
  LEFT JOIN analistas  a  ON a.id  = c."idAnalista"
`;

// Promedios solo sobre casos finalizados: uno abierto todavía está corriendo y falsearía el promedio
const TIEMPOS_PROM = `
  COUNT(*)::int AS casos,
  AVG(CASE WHEN s.finalizado = 1 THEN (s."segAct" + s."segIna")::float8 END) AS "promEjec",
  AVG(CASE WHEN s.finalizado = 1 THEN s."segAct"::float8 END)                AS "promResp",
  AVG(CASE WHEN s.finalizado = 1 THEN s."segIna"::float8 END)                AS "promSinResp"
`;

function tiemposWhere(p, f) {
  let w = 'EXTRACT(YEAR FROM c.fecha) = @anio';
  if (p.mes > 0)             w += ' AND EXTRACT(MONTH FROM c.fecha) = @mes';
  if (f.idAnalista)          w += ` AND (c."idAnalista" = @fAna OR EXISTS (SELECT 1 FROM casos3cx_traspasos x
                                   WHERE x."idCaso" = c.id AND (x."deAnalista" = @fAna OR x."aAnalista" = @fAna)))`;
  if (f.eds)                 w += ' AND LOWER(COALESCE(t."EDS", c."nombreEDS")) = LOWER(@fEDS)';
  if (f.idCategoria)         w += ' AND t."idCategoria" = @fCat';
  if (f.grupoCategoria)      w += ` AND t."idCategoria" IN (SELECT id FROM categorias WHERE ${SQL_GRUPO_CATEGORIA} = @fGrupoCat)`;
  if (f.idGrupoColaborador)  w += ' AND t."idGrupoColaborador" = @fGrp';
  return w;
}

const getMetricasTiempos = async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const w = tiemposWhere(p, f);
    const q = mkQuery(p, f);
    const segTramo = segundos('e.inicio', 'e.fin');

    // Agrupa solo casos finalizados que ya tienen ticket en 2WD (para cortar por dato del ticket)
    const porTicket = (col) => q(`
      SELECT ${col} AS nombre, ${TIEMPOS_PROM}
      ${TIEMPOS_FROM}
      WHERE ${w} AND s.finalizado = 1 AND t.id IS NOT NULL AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY COUNT(*) DESC
      LIMIT 10`);

    const [kpiR, analistaR, tipoR, catR, prioR, estR, sinTicketR] = await Promise.all([
      q(`
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN c."ticketReferencia2WD" IS NOT NULL THEN 1 ELSE 0 END)::int AS "conTicket",
          SUM(CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END)::int                    AS "conTicketEn2WD",
          SUM(CASE WHEN s.finalizado = 1 THEN 1 ELSE 0 END)::int                    AS finalizados,
          SUM(CASE WHEN s.finalizado = 0 THEN 1 ELSE 0 END)::int                    AS abiertos,
          SUM(CASE WHEN s.auto = 1 THEN 1 ELSE 0 END)::int                          AS "autoFinalizados",
          SUM(CASE WHEN tp.n > 0 THEN 1 ELSE 0 END)::int                            AS traspasados,
          AVG(CASE WHEN s.finalizado = 1 THEN (s."segAct" + s."segIna")::float8 END) AS "promEjec",
          AVG(CASE WHEN s.finalizado = 1 THEN s."segAct"::float8 END)                AS "promResp",
          AVG(CASE WHEN s.finalizado = 1 THEN s."segIna"::float8 END)                AS "promSinResp"
        ${TIEMPOS_FROM}
        WHERE ${w}`),

      // Cada analista con el tiempo de SUS tramos: si un caso se pasó, el tiempo se reparte entre quienes lo atendieron
      q(`
        SELECT a.nombre,
          COUNT(DISTINCT c.id)::int AS casos,
          (SUM(CASE WHEN e.estado IN ('ACTIVO','INACTIVO')
                    THEN ${segTramo} ELSE 0 END) / COUNT(DISTINCT c.id))::float8 AS "promEjec",
          (SUM(CASE WHEN e.estado = 'ACTIVO'
                    THEN ${segTramo} ELSE 0 END) / COUNT(DISTINCT c.id))::float8 AS "promResp",
          (SUM(CASE WHEN e.estado = 'INACTIVO'
                    THEN ${segTramo} ELSE 0 END) / COUNT(DISTINCT c.id))::float8 AS "promSinResp"
        FROM casos3cx c
        JOIN casos3cx_estados e ON e."idCaso" = c.id
        JOIN analistas a ON a.id = e."idAnalista"
        LEFT JOIN tickets t ON t.codigo2wd = c."ticketReferencia2WD"
        WHERE ${w}
          AND EXISTS (SELECT 1 FROM casos3cx_estados fz WHERE fz."idCaso" = c.id AND fz.estado = 'FINALIZADO')
          ${f.idAnalista ? 'AND a.id = @fAna' : ''}
        GROUP BY a.id, a.nombre ORDER BY COUNT(DISTINCT c.id) DESC`),

      q(`
        SELECT c.tipo AS nombre, ${TIEMPOS_PROM}
        ${TIEMPOS_FROM}
        WHERE ${w} AND s.finalizado = 1
        GROUP BY c.tipo ORDER BY c.tipo`),

      porTicket('ct.nombre'),
      porTicket('pr.nombre'),
      porTicket('es.nombre'),

      // Casos sin ticket vinculado (los más recientes primero)
      q(`
        SELECT
          c.id, c.fecha, c.numerochat, c.tipo, c."nombreEDS", a.nombre AS analista,
          CASE WHEN s.finalizado = 1 THEN 1 ELSE 0 END AS finalizado,
          (COALESCE(s."segAct", 0) + COALESCE(s."segIna", 0))::int AS "segEjec"
        ${TIEMPOS_FROM}
        WHERE ${w} AND c."ticketReferencia2WD" IS NULL
        ORDER BY c.fecha DESC, c.id DESC
        LIMIT 20`),
    ]);

    res.json({
      kpis:        kpiR.rows[0],
      porAnalista: analistaR.rows,
      porTipo:     tipoR.rows,
      porCategoria: catR.rows,
      porPrioridad: prioR.rows,
      porEstatus:   estR.rows,
      sinTicket:    sinTicketR.rows,
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
