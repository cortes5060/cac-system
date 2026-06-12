const { sql, pool } = require('../config/db');

const crearTicket = async (req, res) => {
  try {
    const {
      casoAtendido, EDS, idTipoCaso, idCategoria,
      origenFalla, solucion, idAnalista,
      tiempoAtencionMin, versiones, observaciones, fechaCaso
    } = req.body;

    const connection = await pool;
    await connection.request()
      .input('casoAtendido',     sql.NVarChar, casoAtendido)
      .input('EDS',              sql.NVarChar, EDS)
      .input('idTipoCaso',       sql.Int,      idTipoCaso)
      .input('idCategoria',      sql.Int,      idCategoria)
      .input('origenFalla',      sql.NVarChar, origenFalla      || null)
      .input('solucion',         sql.NVarChar, solucion         || null)
      .input('idAnalista',       sql.Int,      idAnalista)
      .input('tiempoAtencionMin',sql.Int,      tiempoAtencionMin|| null)
      .input('versiones',        sql.NVarChar, versiones        || null)
      .input('observaciones',    sql.NVarChar, observaciones    || null)
      .input('fechaCaso',        sql.Date,     fechaCaso        || null)
      .query(`
        INSERT INTO tickets
          (casoAtendido, EDS, idTipoCaso, idCategoria, origenFalla, solucion,
           idAnalista, fechaHora, tiempoAtencionMin, versiones, observaciones, fechaCaso)
        VALUES
          (@casoAtendido, @EDS, @idTipoCaso, @idCategoria, @origenFalla, @solucion,
           @idAnalista, GETDATE(), @tiempoAtencionMin, @versiones, @observaciones, @fechaCaso)
      `);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error creando ticket:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { crearTicket };
