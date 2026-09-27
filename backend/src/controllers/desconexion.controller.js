const { sql, pool } = require('../config/db');
const { salirDeCola, entrarACola } = require('../services/colaAnalistas');

// El analista pide desconectarse para una actividad asignada. No sale de la
// cola todavía — solo queda PENDIENTE hasta que un coordinador la apruebe.
const solicitarDesconexion = async (req, res) => {
  try {
    const { id } = req.params;
    const motivo = String(req.body?.motivo ?? '').trim().slice(0, 300);
    if (!motivo) return res.status(400).json({ error: 'Debes indicar el motivo de la desconexión' });

    const connection = await pool;

    const pendienteR = await connection.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 id FROM desconexionesSupervisadas WHERE idAnalista = @id AND estado IN ('PENDIENTE','APROBADA')`);
    if (pendienteR.recordset.length) {
      return res.status(409).json({ error: 'Ya tienes una solicitud de desconexión pendiente o aprobada' });
    }

    const insertR = await connection.request()
      .input('id', sql.Int, id)
      .input('motivo', sql.NVarChar, motivo)
      .query(`
        INSERT INTO desconexionesSupervisadas (idAnalista, motivo, estado)
        OUTPUT INSERTED.id, INSERTED.solicitadoEn
        VALUES (@id, @motivo, 'PENDIENTE')
      `);

    const nombreR = await connection.request()
      .input('id', sql.Int, id)
      .query(`SELECT nombre FROM analistas WHERE id = @id`);

    const io = req.app.get('io');
    io.emit('desconexionSolicitada', {
      id: insertR.recordset[0].id,
      idAnalista: Number(id),
      nombre: nombreR.recordset[0]?.nombre ?? '—',
      motivo,
      solicitadoEn: insertR.recordset[0].solicitadoEn,
    });

    res.json({ ok: true, id: insertR.recordset[0].id });
  } catch (error) {
    console.error('Error solicitando desconexión supervisada:', error);
    res.status(500).json({ error: error.message });
  }
};

// Estado actual de desconexión del analista (para saber qué mostrar al recargar la página)
const miDesconexion = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool;
    const r = await connection.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 id, motivo, estado, solicitadoEn, resueltoEn
        FROM desconexionesSupervisadas
        WHERE idAnalista = @id AND estado IN ('PENDIENTE','APROBADA')
        ORDER BY id DESC
      `);
    res.json(r.recordset[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// marca FINALIZADA y reingresa a la cola (mismo criterio de entrarACola); la usan
// tanto el analista como el coordinador
async function _finalizarInterno(connection, io, idSolicitud) {
  const solR = await connection.request()
    .input('id', sql.Int, idSolicitud)
    .query(`SELECT id, idAnalista, estado FROM desconexionesSupervisadas WHERE id = @id`);
  const sol = solR.recordset[0];
  if (!sol) return { status: 404, body: { error: 'Solicitud no encontrada' } };
  if (sol.estado !== 'APROBADA') return { status: 409, body: { error: 'Esta desconexión no está activa' } };

  await connection.request()
    .input('id', sql.Int, idSolicitud)
    .query(`UPDATE desconexionesSupervisadas SET estado = 'FINALIZADA', finalizadoEn = GETDATE() WHERE id = @id`);

  await entrarACola(connection, sol.idAnalista);

  io.emit('desconexionFinalizada', { id: sol.id, idAnalista: sol.idAnalista });
  io.emit('analistaActualizado', { id: sol.idAnalista, activo: 1 });

  return { status: 200, body: { ok: true } };
}

// El analista da por terminada su propia desconexión aprobada
const finalizarDesconexion = async (req, res) => {
  try {
    const { id, idSolicitud } = req.params;
    const connection = await pool;

    const dueñoR = await connection.request()
      .input('id', sql.Int, idSolicitud)
      .input('idAna', sql.Int, id)
      .query(`SELECT id FROM desconexionesSupervisadas WHERE id = @id AND idAnalista = @idAna`);
    if (!dueñoR.recordset.length) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const io = req.app.get('io');
    const { status, body } = await _finalizarInterno(connection, io, idSolicitud);
    res.status(status).json(body);
  } catch (error) {
    console.error('Error finalizando desconexión supervisada:', error);
    res.status(500).json({ error: error.message });
  }
};

// El coordinador da por terminada la desconexión de cualquier analista
const finalizarDesconexionCoordinador = async (req, res) => {
  try {
    const { idSolicitud } = req.params;
    const connection = await pool;
    const io = req.app.get('io');
    const { status, body } = await _finalizarInterno(connection, io, idSolicitud);
    res.status(status).json(body);
  } catch (error) {
    console.error('Error finalizando desconexión supervisada (coordinador):', error);
    res.status(500).json({ error: error.message });
  }
};

/* ── Lado coordinador ─────────────────────────────────────── */

// Sin rango de fechas: las 10 solicitudes más recientes (cualquier estado).
// Con rango: todas las que caigan ahí (tope de seguridad 200).
const listarDesconexiones = async (req, res) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde ?? '') ? req.query.desde : null;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta ?? '') ? req.query.hasta : null;

    const connection = await pool;
    const r = connection.request();
    let where = '1=1';
    if (desde) { r.input('desde', sql.Date, desde); where += ' AND CAST(ds.solicitadoEn AS DATE) >= @desde'; }
    if (hasta) { r.input('hasta', sql.Date, hasta); where += ' AND CAST(ds.solicitadoEn AS DATE) <= @hasta'; }

    const top = (desde || hasta) ? 'TOP 200' : 'TOP 10';

    const result = await r.query(`
      SELECT ${top} ds.id, ds.idAnalista, a.nombre, ds.motivo, ds.estado,
        ds.solicitadoEn, ds.resueltoEn, ds.finalizadoEn, coord.nombre AS coordinadorNombre
      FROM desconexionesSupervisadas ds
      JOIN analistas a ON a.id = ds.idAnalista
      LEFT JOIN analistas coord ON coord.id = ds.idCoordinador
      WHERE ${where}
      ORDER BY ds.solicitadoEn DESC
    `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resolverDesconexion = async (req, res) => {
  try {
    const { idSolicitud } = req.params;
    const { aprobar, idCoordinador } = req.body;

    const connection = await pool;
    const solR = await connection.request()
      .input('id', sql.Int, idSolicitud)
      .query(`SELECT id, idAnalista, estado FROM desconexionesSupervisadas WHERE id = @id`);
    const sol = solR.recordset[0];
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (sol.estado !== 'PENDIENTE') return res.status(409).json({ error: 'Esta solicitud ya fue resuelta' });

    const nuevoEstado = aprobar ? 'APROBADA' : 'RECHAZADA';

    await connection.request()
      .input('id', sql.Int, idSolicitud)
      .input('estado', sql.VarChar(20), nuevoEstado)
      .input('idCoordinador', sql.Int, idCoordinador || null)
      .query(`
        UPDATE desconexionesSupervisadas
        SET estado = @estado, idCoordinador = @idCoordinador, resueltoEn = GETDATE()
        WHERE id = @id
      `);

    const io = req.app.get('io');

    if (aprobar) {
      const { casosPasadosANoResponde } = await salirDeCola(connection, sol.idAnalista);
      if (casosPasadosANoResponde.length) io.emit('casosActualizados');
    }

    io.emit('desconexionResuelta', { id: sol.id, idAnalista: sol.idAnalista, aprobada: !!aprobar });
    if (aprobar) io.emit('analistaActualizado', { id: sol.idAnalista, activo: 0 });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error resolviendo desconexión supervisada:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  solicitarDesconexion, miDesconexion, finalizarDesconexion,
  listarDesconexiones, resolverDesconexion, finalizarDesconexionCoordinador,
};
