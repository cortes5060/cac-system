const { query } = require('../config/db');

const crearTicket = async (req, res) => {
  try {
    const {
      casoAtendido, EDS, idTipoCaso, idCategoria,
      origenFalla, solucion, idAnalista,
      tiempoAtencionMin, versiones, observaciones, fechaCaso
    } = req.body;

    await query(`
        INSERT INTO tickets
          ("casoAtendido", "EDS", "idTipoCaso", "idCategoria", "origenFalla", solucion,
           "idAnalista", escalado, "fechaHora", "tiempoAtencionMin", versiones, observaciones, "fechaCaso")
        VALUES
          (@casoAtendido, @EDS, @idTipoCaso, @idCategoria, @origenFalla, @solucion,
           @idAnalista, @escalado, LOCALTIMESTAMP, @tiempoAtencionMin, @versiones, @observaciones, @fechaCaso)
      `, {
        casoAtendido,
        EDS,
        idTipoCaso,
        idCategoria,
        origenFalla:       origenFalla       || null,
        solucion:          solucion          || null,
        idAnalista,
        escalado:          idAnalista,
        tiempoAtencionMin: tiempoAtencionMin || null,
        versiones:         versiones         || null,
        observaciones:     observaciones     || null,
        fechaCaso:         fechaCaso         || null
      });

    const io = req.app.get('io');
    io.emit('ticketsActualizados');

    res.json({ ok: true });
  } catch (error) {
    console.error('Error creando ticket:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { crearTicket };
