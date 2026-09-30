const { sql, pool } = require('../config/db');
const bcrypt = require('bcryptjs');

/* ---------- AUTH ---------- */

const login = async (req, res) => {
  try {
    const { id, password } = req.body;
    const connection = await pool;
    const result = await connection.request()
      .input('id', sql.Int, id)
      .query(`SELECT id, nombre, idRol, passwordHash FROM analistas WHERE id = @id AND existe = 1`);

    const ana = result.recordset[0];

    if (!ana || ana.idRol !== 2) {
      return res.status(401).json({ error: 'Acceso no autorizado' });
    }
    if (!ana.passwordHash) {
      return res.status(401).json({ error: 'Contraseña no configurada. Ejecuta: node setup-password.js' });
    }

    const match = await bcrypt.compare(password, ana.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    res.json({ ok: true, coordinador: { id: ana.id, nombre: ana.nombre } });
  } catch (error) {
    console.error('Error login coordinador:', error);
    res.status(500).json({ error: error.message });
  }
};

/* ---------- ANALISTAS ---------- */

const getAnalistas = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request().query(`
      SELECT a.id, a.nombre, a.orden, a.activo, a.existe,
        a.idGrupoColaborador, g.nombre AS nombreGrupo,
        CASE WHEN a.passwordHash IS NOT NULL THEN 1 ELSE 0 END AS tienePassword
      FROM analistas a
      LEFT JOIN gruposColaborador g ON g.id = a.idGrupoColaborador
      WHERE a.idRol = 1 AND a.existe = 1
      ORDER BY a.nombre
    `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// incluye también los que el import crea con existe=0, son personas reales igual
const getTodosLosAnalistas = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request().query(`
      SELECT a.id, a.nombre, a.activo, a.existe, a.idGrupoColaborador, g.nombre AS nombreGrupo
      FROM analistas a
      LEFT JOIN gruposColaborador g ON g.id = a.idGrupoColaborador
      WHERE a.idRol = 1
      ORDER BY a.nombre
    `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getGruposColaborador = async (req, res) => {
  try {
    const connection = await pool;
    const result = await connection.request()
      .query(`SELECT id, nombre FROM gruposColaborador ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const crearGrupoColaborador = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre del grupo es obligatorio' });

    const connection = await pool;
    const existente = await connection.request()
      .input('nombre', sql.NVarChar, nombre)
      .query(`SELECT id FROM gruposColaborador WHERE nombre = @nombre`);
    if (existente.recordset.length) {
      return res.status(409).json({ error: 'Ya existe un grupo con ese nombre' });
    }

    const result = await connection.request()
      .input('nombre', sql.NVarChar, nombre)
      .query(`INSERT INTO gruposColaborador (nombre) OUTPUT INSERTED.id VALUES (@nombre)`);

    res.json({ ok: true, id: result.recordset[0].id, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// asignación manual del coordinador, idGrupo puede venir vacío para quitarlo
const asignarGrupoAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const idGrupo = req.body?.idGrupo ? parseInt(req.body.idGrupo) : null;

    const connection = await pool;
    const result = await connection.request()
      .input('id', sql.Int, id)
      .input('idGrupo', sql.Int, idGrupo)
      .query(`
        UPDATE analistas SET idGrupoColaborador = @idGrupo
        WHERE id = @id AND idRol = 1
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Analista no encontrado' });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const cambiarEstadoAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const connection = await pool;

    if (activo == 1) {
      // Desplaza a todos los activos una posición y pone al nuevo en #1
      await connection.request()
        .query(`UPDATE analistas SET orden = orden + 1 WHERE activo = 1`);

      await connection.request()
        .input('id', sql.Int, id)
        .query(`UPDATE analistas SET activo = 1, orden = 1 WHERE id = @id`);
    } else {
      const anaR = await connection.request()
        .input('id', sql.Int, id)
        .query(`SELECT orden FROM analistas WHERE id = @id`);
      const ordenActual = anaR.recordset[0]?.orden || 0;

      await connection.request()
        .input('id', sql.Int, id)
        .query(`UPDATE analistas SET activo = 0, orden = 0 WHERE id = @id`);

      if (ordenActual > 0) {
        await connection.request()
          .input('orden', sql.Int, ordenActual)
          .query(`UPDATE analistas SET orden = orden - 1 WHERE activo = 1 AND orden > @orden`);
      }
    }

    req.app.get('io').emit('analistaActualizado', { id: parseInt(id), activo: parseInt(activo) });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const eliminarAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool;

    const anaR = await connection.request()
      .input('id', sql.Int, id)
      .query(`SELECT orden, activo FROM analistas WHERE id = @id`);
    const ana = anaR.recordset[0];

    if (ana?.activo && ana.orden > 0) {
      await connection.request()
        .input('orden', sql.Int, ana.orden)
        .query(`UPDATE analistas SET orden = orden - 1 WHERE activo = 1 AND orden > @orden`);
    }

    await connection.request()
      .input('id', sql.Int, id)
      .query(`UPDATE analistas SET existe = 0, activo = 0, orden = 0 WHERE id = @id`);

    req.app.get('io').emit('analistaActualizado', { id: parseInt(id), activo: 0 });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// el coordinador resetea la clave sin necesitar la anterior; restringido a idRol=1,
// la clave del coordinador se cambia directo en BD, no desde acá
const asignarPasswordAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const connection = await pool;
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await connection.request()
      .input('id', sql.Int, id)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .query(`
        UPDATE analistas SET passwordHash = @passwordHash
        WHERE id = @id AND idRol = 1 AND existe = 1
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Analista no encontrado' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error asignando contraseña:', error);
    res.status(500).json({ error: error.message });
  }
};

const actualizarOrden = async (req, res) => {
  try {
    const { ordenes } = req.body;
    const connection = await pool;

    for (const { id, orden } of ordenes) {
      await connection.request()
        .input('id', sql.Int, id)
        .input('orden', sql.Int, orden)
        .query(`UPDATE analistas SET orden = @orden WHERE id = @id`);
    }

    req.app.get('io').emit('analistaActualizado', { reordenado: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ---------- CATEGORÍAS ---------- */

const getCategorias = async (req, res) => {
  try {
    const result = await (await pool).request()
      .query(`SELECT id, nombre, activo FROM categorias ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const crearCategoria = async (req, res) => {
  try {
    const { nombre } = req.body;
    await (await pool).request()
      .input('nombre', sql.NVarChar, nombre)
      .query(`INSERT INTO categorias (nombre, activo) VALUES (@nombre, 1)`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    await (await pool).request()
      .input('id', sql.Int, id)
      .input('activo', sql.Int, activo)
      .query(`UPDATE categorias SET activo = @activo WHERE id = @id`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ---------- EDS ---------- */

const getEDS = async (req, res) => {
  try {
    const result = await (await pool).request()
      .query(`SELECT id, nombre, NIT, direccion, existe FROM estaciones ORDER BY nombre`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Nombres de EDS realmente vistos en los tickets de 2WD (no el catálogo interno de
// "estaciones") — para el filtro de Buscar Casos, que cruza contra el ticket vinculado.
const getEDSDeTickets = async (req, res) => {
  try {
    const result = await (await pool).request()
      .query(`SELECT DISTINCT EDS AS nombre FROM tickets WHERE EDS IS NOT NULL AND EDS <> '' ORDER BY EDS`);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const crearEDS = async (req, res) => {
  try {
    const { nombre, NIT, direccion } = req.body;
    const db = await pool;

    if (NIT) {
      const dup = await db.request()
        .input('NIT', sql.NVarChar, NIT)
        .query(`SELECT id FROM estaciones WHERE NIT = @NIT`);
      if (dup.recordset.length > 0) {
        return res.status(409).json({ error: `Ya existe una EDS con el NIT ${NIT}` });
      }
    }

    await db.request()
      .input('nombre',    sql.NVarChar, nombre)
      .input('NIT',       sql.NVarChar, NIT       || null)
      .input('direccion', sql.NVarChar, direccion || null)
      .query(`INSERT INTO estaciones (nombre, NIT, direccion, existe) VALUES (@nombre, @NIT, @direccion, 1)`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleEDS = async (req, res) => {
  try {
    const { id } = req.params;
    const { existe } = req.body;
    await (await pool).request()
      .input('id', sql.Int, id)
      .input('existe', sql.Int, existe)
      .query(`UPDATE estaciones SET existe = @existe WHERE id = @id`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ---------- HORARIOS ---------- */

// 0=Domingo, 1=Lunes, ..., 6=Sábado — mismo criterio que Date.getDay() en JS
const getHorarios = async (_req, res) => {
  try {
    const db = await pool;
    const horariosR = await db.request().query(`SELECT id, nombre FROM Horarios ORDER BY nombre`);
    const detalleR = await db.request().query(`
      SELECT
        idHorario, diaSemana,
        CONVERT(VARCHAR(8), HoraEntrada,        108) AS HoraEntrada,
        CONVERT(VARCHAR(8), HoraSalida,          108) AS HoraSalida,
        CONVERT(VARCHAR(8), HoraAlmuerzoInicio,  108) AS HoraAlmuerzoInicio,
        CONVERT(VARCHAR(8), HoraAlmuerzoFin,     108) AS HoraAlmuerzoFin
      FROM HorariosDetalle
    `);
    const horarios = horariosR.recordset.map(h => ({
      ...h,
      detalle: detalleR.recordset
        .filter(d => d.idHorario === h.id)
        .sort((a, b) => a.diaSemana - b.diaSemana),
    }));
    res.json(horarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAnalistasHorarios = async (_req, res) => {
  try {
    const diaHoy = new Date().getDay();
    const result = await (await pool).request()
      .input('dia', sql.Int, diaHoy)
      .query(`
        SELECT
          a.id, a.nombre, a.idhorario, h.nombre AS nombreHorario,
          CONVERT(VARCHAR(8), d.HoraEntrada,        108) AS HoraEntradaHoy,
          CONVERT(VARCHAR(8), d.HoraSalida,          108) AS HoraSalidaHoy,
          CONVERT(VARCHAR(8), d.HoraAlmuerzoInicio,  108) AS HoraAlmuerzoInicioHoy,
          CONVERT(VARCHAR(8), d.HoraAlmuerzoFin,     108) AS HoraAlmuerzoFinHoy
        FROM analistas a
        LEFT JOIN Horarios h ON a.idhorario = h.id
        LEFT JOIN HorariosDetalle d ON d.idHorario = h.id AND d.diaSemana = @dia
        WHERE a.idRol = 1 AND a.existe = 1
        ORDER BY a.nombre
      `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function insertarDetalleHorario(db, idHorario, detalle) {
  for (const d of detalle) {
    if (d.libre) continue;
    await db.request()
      .input('idHorario', sql.Int, idHorario)
      .input('dia', sql.Int, d.diaSemana)
      .input('he', sql.VarChar(8), d.horaEntrada || null)
      .input('hs', sql.VarChar(8), d.horaSalida || null)
      .input('hai', sql.VarChar(8), d.horaAlmuerzoInicio || null)
      .input('haf', sql.VarChar(8), d.horaAlmuerzoFin || null)
      .query(`
        INSERT INTO HorariosDetalle (idHorario, diaSemana, HoraEntrada, HoraSalida, HoraAlmuerzoInicio, HoraAlmuerzoFin)
        VALUES (@idHorario, @dia, @he, @hs, @hai, @haf)
      `);
  }
}

const crearHorario = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim().slice(0, 60);
    const { detalle } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!Array.isArray(detalle) || detalle.length !== 7) return res.status(400).json({ error: 'Debes enviar los 7 días de la semana' });

    const db = await pool;
    const dupR = await db.request().input('n', sql.NVarChar, nombre).query(`SELECT id FROM Horarios WHERE nombre = @n`);
    if (dupR.recordset.length) return res.status(409).json({ error: 'Ya existe un horario con ese nombre' });

    const insR = await db.request().input('n', sql.NVarChar, nombre)
      .query(`INSERT INTO Horarios (nombre) OUTPUT INSERTED.id VALUES (@n)`);
    const idHorario = insR.recordset[0].id;

    await insertarDetalleHorario(db, idHorario, detalle);
    res.json({ ok: true, id: idHorario });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const actualizarHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const nombre = String(req.body?.nombre ?? '').trim().slice(0, 60);
    const { detalle } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!Array.isArray(detalle) || detalle.length !== 7) return res.status(400).json({ error: 'Debes enviar los 7 días de la semana' });

    const db = await pool;
    const dupR = await db.request().input('n', sql.NVarChar, nombre).input('id', sql.Int, id)
      .query(`SELECT id FROM Horarios WHERE nombre = @n AND id <> @id`);
    if (dupR.recordset.length) return res.status(409).json({ error: 'Ya existe un horario con ese nombre' });

    await db.request().input('id', sql.Int, id).input('n', sql.NVarChar, nombre)
      .query(`UPDATE Horarios SET nombre = @n WHERE id = @id`);
    await db.request().input('id', sql.Int, id).query(`DELETE FROM HorariosDetalle WHERE idHorario = @id`);
    await insertarDetalleHorario(db, id, detalle);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const eliminarHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await pool;
    const usoR = await db.request().input('id', sql.Int, id).query(`SELECT COUNT(*) AS n FROM analistas WHERE idhorario = @id`);
    if (usoR.recordset[0].n > 0) {
      return res.status(409).json({ error: `Este horario está asignado a ${usoR.recordset[0].n} analista(s). Reasígnalos antes de eliminarlo.` });
    }
    await db.request().input('id', sql.Int, id).query(`DELETE FROM HorariosDetalle WHERE idHorario = @id`);
    await db.request().input('id', sql.Int, id).query(`DELETE FROM Horarios WHERE id = @id`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const asignarHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const { idhorario } = req.body;
    await (await pool).request()
      .input('id',        sql.Int, id)
      .input('idhorario', sql.Int, idhorario || null)
      .query(`UPDATE analistas SET idhorario = @idhorario WHERE id = @id`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const buscarCasos = async (req, res) => {
  try {
    const { numero, ticketNumero, nombreeds, fechaini, fechafin, tipo, idAnalista, estado, conTicket, idCategoria } = req.query;
    const connection = await pool;
    const request = connection.request();

    let where = 'WHERE 1=1';

    if (numero) {
      request.input('numero', sql.NVarChar, `%${numero}%`);
      where += ' AND CAST(c.numerochat AS NVARCHAR) LIKE @numero';
    }
    if (ticketNumero) {
      request.input('ticketNumero', sql.NVarChar, `%${ticketNumero}%`);
      where += ' AND c.ticketReferencia2WD LIKE @ticketNumero';
    }
    if (nombreeds) {
      request.input('nombreeds', sql.NVarChar, `%${nombreeds}%`);
      where += ' AND (c.nombreEDS LIKE @nombreeds OR t.EDS LIKE @nombreeds)';
    }
    if (fechaini) {
      request.input('fechaini', sql.Date, fechaini);
      where += ' AND CAST(c.fecha AS DATE) >= @fechaini';
    }
    if (fechafin) {
      request.input('fechafin', sql.Date, fechafin);
      where += ' AND CAST(c.fecha AS DATE) <= @fechafin';
    }
    if (tipo === 'CHAT' || tipo === 'LLAMADA') {
      request.input('tipo', sql.VarChar(10), tipo);
      where += ' AND c.tipo = @tipo';
    }
    if (idAnalista) {
      request.input('idAnalista', sql.Int, parseInt(idAnalista));
      where += ' AND c.idAnalista = @idAnalista';
    }
    if (idCategoria) {
      request.input('idCategoria', sql.Int, parseInt(idCategoria));
      where += ' AND t.idCategoria = @idCategoria';
    }
    if (conTicket === 'si') where += ' AND c.ticketReferencia2WD IS NOT NULL';
    else if (conTicket === 'no') where += ' AND c.ticketReferencia2WD IS NULL';

    if (estado === 'ACTIVO' || estado === 'INACTIVO' || estado === 'FINALIZADO') {
      request.input('estado', sql.VarChar(12), estado);
      where += ` AND (SELECT TOP 1 e.estado FROM casos3cx_estados e WHERE e.idCaso = c.id ORDER BY e.id DESC) = @estado`;
    }

    const result = await request.query(`
      SELECT TOP 500
        c.id, c.numerochat, c.tipo, c.nombreEDS, c.fecha,
        a.id AS idAnalista, a.nombre,
        c.ticketReferencia2WD, t.EDS AS ticketEDS, ct.nombre AS categoria,
        (SELECT TOP 1 e.estado FROM casos3cx_estados e WHERE e.idCaso = c.id ORDER BY e.id DESC) AS estado,
        ISNULL(s.segAct, 0) + ISNULL(s.segIna, 0) AS segEjec
      FROM casos3cx c
      JOIN analistas a ON c.idAnalista = a.id
      LEFT JOIN tickets t ON t.codigo2wd = c.ticketReferencia2WD
      LEFT JOIN categorias ct ON ct.id = t.idCategoria
      OUTER APPLY (
        SELECT
          SUM(CASE WHEN e2.estado = 'ACTIVO'   THEN DATEDIFF(SECOND, e2.inicio, ISNULL(e2.fin, GETDATE())) ELSE 0 END) AS segAct,
          SUM(CASE WHEN e2.estado = 'INACTIVO' THEN DATEDIFF(SECOND, e2.inicio, ISNULL(e2.fin, GETDATE())) ELSE 0 END) AS segIna
        FROM casos3cx_estados e2 WHERE e2.idCaso = c.id
      ) s
      ${where}
      ORDER BY c.fecha DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ---------- ALERTAS ---------- */

const getAlertas = async (_req, res) => {
  try {
    const result = await (await pool).request().query(`
      SELECT id, tipo, idReferencia, mensaje, creadaEn
      FROM Alertas
      WHERE resueltaEn IS NULL
      ORDER BY creadaEn DESC
    `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resolverAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    await (await pool).request()
      .input('id', sql.Int, id)
      .query(`UPDATE Alertas SET resueltaEn = GETDATE() WHERE id = @id AND resueltaEn IS NULL`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  login,
  getAnalistas, getTodosLosAnalistas, cambiarEstadoAnalista, eliminarAnalista, actualizarOrden, asignarPasswordAnalista,
  getCategorias, crearCategoria, toggleCategoria,
  getEDS, crearEDS, toggleEDS, getEDSDeTickets,
  getHorarios, getAnalistasHorarios, asignarHorario, crearHorario, actualizarHorario, eliminarHorario,
  getGruposColaborador, crearGrupoColaborador, asignarGrupoAnalista,
  getAlertas, resolverAlerta,
  buscarCasos
};
