const { sql, pool } = require('../config/db');

const TIPOS = ['CHAT', 'LLAMADA'];

const getCasos = async (req, res) => {
  try {

    const connection = await pool;

    const result = await connection.request()
      .query(`
        SELECT TOP 10 a.nombre, c.numerochat, c.fecha, c.id, c.tipo, c.nombreEDS, c.ticketReferencia2WD
        FROM casos3cx c
        JOIN analistas a ON c.idAnalista = a.id
        ORDER BY c.fecha DESC, c.id DESC
      `);

    res.json(result.recordset);

  } catch (error) {

    console.error('Error obteniendo casos:', error);
    res.status(500).json({ message: 'Error al obtener casos' });

  }
};


// Casos de hoy del analista, con veces y tiempos (en segundos) de cada estado.
// El tramo en curso ya viene sumado hasta el momento de la consulta.
const getMisCasos = async (req, res) => {

  const idAnalista = parseInt(req.params.idAnalista, 10);

  if (!idAnalista) {
    return res.status(400).json({ error: 'idAnalista inválido' });
  }

  try {

    const connection = await pool;

    const result = await connection.request()
      .input('idAnalista', sql.Int, idAnalista)
      .query(`
        SELECT
          c.id, c.numerochat, c.nombreEDS, c.tipo, c.fecha, c.ticketReferencia2WD,
          t.id AS idTicket, es.nombre AS estatusTicket,
          c.idAnalista, ah.nombre AS titular,
          (SELECT TOP 1 ad.nombre FROM casos3cx_traspasos tr JOIN analistas ad ON ad.id = tr.deAnalista
            WHERE tr.idCaso = c.id ORDER BY tr.id DESC) AS recibidoDe,
          -- estado actual = último tramo; NULL si el caso no tiene seguimiento (casos anteriores a la migración)
          (SELECT TOP 1 estado FROM casos3cx_estados WHERE idCaso = c.id ORDER BY id DESC) AS estado,
          ISNULL(e.vecesActivo, 0)     AS vecesActivo,
          ISNULL(e.vecesInactivo, 0)   AS vecesInactivo,
          ISNULL(e.segActivo, 0)       AS segActivo,
          ISNULL(e.segInactivo, 0)     AS segInactivo
        FROM casos3cx c
        LEFT JOIN (
          SELECT
            idCaso,
            SUM(CASE WHEN estado = 'ACTIVO'    THEN 1 ELSE 0 END) AS vecesActivo,
            SUM(CASE WHEN estado = 'INACTIVO'  THEN 1 ELSE 0 END) AS vecesInactivo,
            SUM(CASE WHEN estado = 'ACTIVO'
                     THEN DATEDIFF(SECOND, inicio, ISNULL(fin, GETDATE())) ELSE 0 END) AS segActivo,
            SUM(CASE WHEN estado = 'INACTIVO'
                     THEN DATEDIFF(SECOND, inicio, ISNULL(fin, GETDATE())) ELSE 0 END) AS segInactivo
          FROM casos3cx_estados
          WHERE idAnalista = @idAnalista
          GROUP BY idCaso
        ) e ON e.idCaso = c.id
        LEFT JOIN tickets t  ON t.codigo2wd = c.ticketReferencia2WD
        LEFT JOIN estatus es ON es.id = t.idEstatus
        LEFT JOIN analistas ah ON ah.id = c.idAnalista
        WHERE (c.idAnalista = @idAnalista
               OR EXISTS (SELECT 1 FROM casos3cx_traspasos tr
                           WHERE tr.idCaso = c.id AND (tr.deAnalista = @idAnalista OR tr.aAnalista = @idAnalista)))
          AND CAST(c.fecha AS DATE) = CAST(GETDATE() AS DATE)
        ORDER BY c.fecha DESC, c.id DESC
      `);

    res.json(result.recordset);

  } catch (error) {

    console.error('Error obteniendo mis casos:', error);
    res.status(500).json({ message: 'Error al obtener mis casos' });

  }
};


// Ticket 2WD: solo dígitos (los códigos de 2WD son numéricos). Vacío = sin ticket todavía.
function parseTicket(valor) {
  const t = String(valor ?? '').trim();
  if (!t) return { ok: true, ticket: null };
  if (!/^\d{1,50}$/.test(t)) return { ok: false, ticket: null };
  return { ok: true, ticket: t };
}

// Relación 1:1: un ticket de 2WD solo puede estar vinculado a un caso
function mensajeTicketDuplicado(ticket, otro) {
  const donde = otro ? ` al caso #${otro.id} (${otro.numerochat}, ${otro.nombre})` : ' a otro caso';
  return `El ticket ${ticket} ya está vinculado${donde}. Cada ticket solo puede ir en un caso.`;
}

// 2601 / 2627: violación del índice único (respaldo si dos analistas guardan el mismo ticket a la vez)
function esDuplicado(error) {
  return error && (error.number === 2601 || error.number === 2627);
}

// Busca entre todos los casos del analista (chat y llamada), con filtros opcionales
const buscarCasos = async (req, res) => {

  const idAnalista = parseInt(req.query.idAnalista, 10);

  if (!idAnalista) {
    return res.status(400).json({ error: 'idAnalista inválido' });
  }

  const q          = String(req.query.q ?? '').trim().slice(0, 100);
  const tipo       = String(req.query.tipo ?? '').toUpperCase();
  const desde      = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde ?? '') ? req.query.desde : null;
  const hasta      = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta ?? '') ? req.query.hasta : null;
  const sinTicket  = req.query.sinTicket === '1';

  try {

    const connection = await pool;
    const request = connection.request().input('idAnalista', sql.Int, idAnalista);

    // Mis casos: los que tengo ahora y los que pasé o recibí
    let where = `(c.idAnalista = @idAnalista
      OR EXISTS (SELECT 1 FROM casos3cx_traspasos tr
                  WHERE tr.idCaso = c.id AND (tr.deAnalista = @idAnalista OR tr.aAnalista = @idAnalista)))`;

    if (q) {
      // Escapa los comodines de LIKE para que el texto se busque literal
      const like = '%' + q.replace(/[%_\[]/g, m => '[' + m + ']') + '%';
      request.input('like', sql.NVarChar(210), like);
      where += ' AND (c.numerochat LIKE @like OR c.nombreEDS LIKE @like OR c.ticketReferencia2WD LIKE @like)';
    }

    if (TIPOS.includes(tipo)) {
      request.input('tipo', sql.VarChar(10), tipo);
      where += ' AND c.tipo = @tipo';
    }

    if (desde) {
      request.input('desde', sql.Date, desde);
      where += ' AND CAST(c.fecha AS DATE) >= @desde';
    }

    if (hasta) {
      request.input('hasta', sql.Date, hasta);
      where += ' AND CAST(c.fecha AS DATE) <= @hasta';
    }

    if (sinTicket) {
      where += ' AND c.ticketReferencia2WD IS NULL';
    }

    const result = await request.query(`
      SELECT TOP 200
        c.id, c.numerochat, c.nombreEDS, c.tipo, c.fecha, c.ticketReferencia2WD,
        c.idAnalista, ah.nombre AS titular,
        (SELECT TOP 1 ad.nombre FROM casos3cx_traspasos tr JOIN analistas ad ON ad.id = tr.deAnalista
          WHERE tr.idCaso = c.id ORDER BY tr.id DESC) AS recibidoDe,
        (SELECT TOP 1 estado FROM casos3cx_estados WHERE idCaso = c.id ORDER BY id DESC) AS estado,
        ISNULL(s.vecesActivo, 0)   AS vecesActivo,
        ISNULL(s.vecesInactivo, 0) AS vecesInactivo,
        ISNULL(s.segActivo, 0)   AS segActivo,
        ISNULL(s.segInactivo, 0) AS segInactivo,
        t.id     AS idTicket,
        es.nombre AS estatusTicket
      FROM casos3cx c
      OUTER APPLY (
        SELECT
          SUM(CASE WHEN e.estado = 'ACTIVO'    THEN 1 ELSE 0 END) AS vecesActivo,
          SUM(CASE WHEN e.estado = 'INACTIVO'  THEN 1 ELSE 0 END) AS vecesInactivo,
          SUM(CASE WHEN e.estado = 'ACTIVO'
                   THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) AS segActivo,
          SUM(CASE WHEN e.estado = 'INACTIVO'
                   THEN DATEDIFF(SECOND, e.inicio, ISNULL(e.fin, GETDATE())) ELSE 0 END) AS segInactivo
        FROM casos3cx_estados e
        WHERE e.idCaso = c.id AND e.idAnalista = @idAnalista
      ) s
      LEFT JOIN tickets t  ON t.codigo2wd = c.ticketReferencia2WD
      LEFT JOIN estatus es ON es.id = t.idEstatus
      LEFT JOIN analistas ah ON ah.id = c.idAnalista
      WHERE ${where}
      ORDER BY c.fecha DESC, c.id DESC
    `);

    res.json(result.recordset);

  } catch (error) {

    console.error('Error buscando casos:', error);
    res.status(500).json({ message: 'Error al buscar casos' });

  }
};


// Vincula (o desvincula, si viene vacío) el ticket de 2WD de un caso propio
const actualizarTicketCaso = async (req, res) => {

  const idCaso     = parseInt(req.params.id, 10);
  const idAnalista = parseInt(req.body?.idAnalista, 10);
  const t          = parseTicket(req.body?.ticket);

  if (!idCaso || !idAnalista) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  if (!t.ok) {
    return res.status(400).json({ error: 'El ticket debe contener solo dígitos' });
  }

  try {

    const connection = await pool;

    const caso = await connection.request()
      .input('idCaso', sql.Int, idCaso)
      .input('idAnalista', sql.Int, idAnalista)
      .query(`
        SELECT c.idAnalista,
          (SELECT COUNT(*) FROM casos3cx_traspasos tr
            WHERE tr.idCaso = c.id AND (tr.deAnalista = @idAnalista OR tr.aAnalista = @idAnalista)) AS participo
        FROM casos3cx c WHERE c.id = @idCaso
      `);

    if (caso.recordset.length === 0) {
      return res.status(404).json({ error: 'Caso no encontrado' });
    }

    // Solo quien tiene el caso, o quien lo pasó / recibió, puede vincular el ticket
    if (caso.recordset[0].idAnalista !== idAnalista && caso.recordset[0].participo === 0) {
      return res.status(403).json({ error: 'El caso pertenece a otro analista' });
    }

    if (t.ticket) {

      const dup = await connection.request()
        .input('idCaso', sql.Int, idCaso)
        .input('ticket', sql.NVarChar(50), t.ticket)
        .query(`
          SELECT TOP 1 c.id, c.numerochat, a.nombre
          FROM casos3cx c
          JOIN analistas a ON a.id = c.idAnalista
          WHERE c.ticketReferencia2WD = @ticket AND c.id <> @idCaso
        `);

      if (dup.recordset.length) {
        return res.status(409).json({ error: mensajeTicketDuplicado(t.ticket, dup.recordset[0]) });
      }
    }

    await connection.request()
      .input('idCaso', sql.Int, idCaso)
      .input('ticket', sql.NVarChar(50), t.ticket)
      .query(`UPDATE casos3cx SET ticketReferencia2WD = @ticket WHERE id = @idCaso`);

    let existeEn2WD = false;
    let estatus = null;

    if (t.ticket) {

      const info = await connection.request()
        .input('ticket', sql.NVarChar(50), t.ticket)
        .query(`
          SELECT
            (SELECT TOP 1 es.nombre
               FROM tickets tk LEFT JOIN estatus es ON es.id = tk.idEstatus
              WHERE tk.codigo2wd = @ticket) AS estatus,
            (SELECT COUNT(*) FROM tickets WHERE codigo2wd = @ticket) AS existe
        `);

      existeEn2WD = info.recordset[0].existe > 0;
      estatus     = info.recordset[0].estatus;
    }

    res.json({ ok: true, ticket: t.ticket, existeEn2WD, estatus });

  } catch (error) {

    if (esDuplicado(error)) {
      return res.status(409).json({ error: mensajeTicketDuplicado(parseTicket(req.body?.ticket).ticket) });
    }

    console.error('Error vinculando ticket:', error);
    res.status(500).json({ error: 'Error al vincular el ticket' });

  }
};


const tomarCaso = async (req, res) => {

  const numerochat = String(req.body?.numerochat ?? '').trim();
  const nombreEDS  = String(req.body?.nombreEDS ?? '').trim().slice(0, 200) || null;
  const tipo       = String(req.body?.tipo ?? 'CHAT').toUpperCase();
  const idAnalistaLlamada = parseInt(req.body?.idAnalista, 10);
  const ticket     = parseTicket(req.body?.ticketReferencia2WD);

  if (!numerochat) {
    return res.status(400).json({ error: 'numerochat es obligatorio' });
  }

  if (!/^\d{1,50}$/.test(numerochat)) {
    return res.status(400).json({ error: 'numerochat debe contener solo dígitos' });
  }

  if (!TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser CHAT o LLAMADA' });
  }

  if (!ticket.ok) {
    return res.status(400).json({ error: 'El ticket debe contener solo dígitos' });
  }

  if (tipo === 'LLAMADA' && !idAnalistaLlamada) {
    return res.status(400).json({ error: 'idAnalista es obligatorio para llamadas' });
  }

  const connection = await pool;
  const transaction = new sql.Transaction(connection);

  try {

    await transaction.begin();

    if (ticket.ticket) {

      const dup = await new sql.Request(transaction)
        .input('ticket', sql.NVarChar(50), ticket.ticket)
        .query(`
          SELECT TOP 1 c.id, c.numerochat, a.nombre
          FROM casos3cx c
          JOIN analistas a ON a.id = c.idAnalista
          WHERE c.ticketReferencia2WD = @ticket
        `);

      if (dup.recordset.length) {
        await transaction.rollback();
        return res.status(409).json({ error: mensajeTicketDuplicado(ticket.ticket, dup.recordset[0]) });
      }
    }

    let idAnalista;

    if (tipo === 'CHAT') {

      // Obtener analista siguiente
      const analistaResult = await new sql.Request(transaction).query(`
        SELECT TOP 1 id, nombre, orden
        FROM analistas WITH (UPDLOCK, ROWLOCK)
        WHERE activo = 1
        ORDER BY orden
      `);

      if (analistaResult.recordset.length === 0) {

        await transaction.rollback();
        return res.status(400).json({ error: 'No hay analistas activos' });

      }

      const analista = analistaResult.recordset[0];
      idAnalista = analista.id;

      // Ajustar orden
      await new sql.Request(transaction)
        .input('orden', sql.Int, analista.orden)
        .query(`
          UPDATE analistas
          SET orden = orden - 1
          WHERE activo = 1
          AND orden > @orden
        `);

      // Obtener último orden
      const maxOrdenResult = await new sql.Request(transaction).query(`
        SELECT count(orden) AS maxOrden
        FROM analistas
        WHERE activo = 1
      `);

      const maxOrden = maxOrdenResult.recordset[0].maxOrden;

      // Enviar analista al final
      if (analista.orden !== maxOrden) {
        await new sql.Request(transaction)
          .input('nuevoOrden', sql.Int, maxOrden)
          .input('idAnalistaCola', sql.Int, analista.id)
          .query(`
            UPDATE analistas
            SET orden = @nuevoOrden
            WHERE id = @idAnalistaCola
          `);
      }

    } else {

      // Llamada: se registra a nombre de quien la atendió y la cola no se mueve
      const analistaResult = await new sql.Request(transaction)
        .input('idAnalista', sql.Int, idAnalistaLlamada)
        .query(`SELECT id FROM analistas WHERE id = @idAnalista AND idRol = 1`);

      if (analistaResult.recordset.length === 0) {

        await transaction.rollback();
        return res.status(400).json({ error: 'Analista no válido' });

      }

      idAnalista = idAnalistaLlamada;

    }

    // Insertar caso
    const insertResult = await new sql.Request(transaction)
      .input('idAnalista', sql.Int, idAnalista)
      .input('numerochat', sql.VarChar(50), numerochat)
      .input('nombreEDS', sql.NVarChar(200), nombreEDS)
      .input('tipo', sql.VarChar(10), tipo)
      .input('ticket', sql.NVarChar(50), ticket.ticket)
      .query(`
        INSERT INTO casos3cx (idAnalista, numerochat, fecha, nombreEDS, tipo, ticketReferencia2WD)
        OUTPUT INSERTED.id
        VALUES (@idAnalista, @numerochat, GETDATE(), @nombreEDS, @tipo, @ticket)
      `);

    const idCaso = insertResult.recordset[0].id;

    // Tramo inicial: queda activo (se está dando respuesta)
    await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .input('idAnalista', sql.Int, idAnalista)
      .query(`
        INSERT INTO casos3cx_estados (idCaso, estado, inicio, idAnalista)
        VALUES (@idCaso, 'ACTIVO', GETDATE(), @idAnalista)
      `);

    await transaction.commit();

    // Caso recién insertado
    const nuevoCaso = await connection.request()
      .input('idCaso', sql.Int, idCaso)
      .query(`
        SELECT a.nombre, a.activo, c.idAnalista, c.numerochat, c.fecha, c.id, c.tipo, c.nombreEDS, c.ticketReferencia2WD
        FROM casos3cx c
        JOIN analistas a ON c.idAnalista = a.id
        WHERE c.id = @idCaso
      `);

    const caso = nuevoCaso.recordset[0];

    // Socket
    const io = req.app.get("io");
    io.emit("nuevoCaso3CX", caso);

    res.json({ ok: true, id: idCaso });

  } catch (error) {

    await transaction.rollback().catch(() => {});

    if (esDuplicado(error)) {
      return res.status(409).json({ error: mensajeTicketDuplicado(ticket.ticket) });
    }

    console.error(error);
    res.status(500).json({ error: 'Error al tomar el caso' });

  }
};


// Pasar caso: quien tiene un caso abierto se lo asigna a otro analista.
// El reloj sigue corriendo en el mismo estado, pero el nuevo tramo de tiempo es del receptor.
const pasarCaso = async (req, res) => {

  const idCaso = parseInt(req.params.id, 10);
  const de     = parseInt(req.body?.idAnalista, 10);
  const a      = parseInt(req.body?.aAnalista, 10);

  if (!idCaso || !de || !a) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  if (de === a) {
    return res.status(400).json({ error: 'No puedes pasarte el caso a ti mismo' });
  }

  const connection = await pool;
  const transaction = new sql.Transaction(connection);

  try {

    await transaction.begin();

    const caso = await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .query(`SELECT idAnalista, numerochat, tipo FROM casos3cx WITH (UPDLOCK, ROWLOCK) WHERE id = @idCaso`);

    if (caso.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Caso no encontrado' });
    }

    if (caso.recordset[0].idAnalista !== de) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Solo quien tiene el caso puede pasarlo' });
    }

    const ultimo = await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .query(`
        SELECT TOP 1 estado
        FROM casos3cx_estados WITH (UPDLOCK, ROWLOCK)
        WHERE idCaso = @idCaso
        ORDER BY id DESC
      `);

    const estadoActual = ultimo.recordset[0]?.estado;

    if (estadoActual === 'FINALIZADO') {
      await transaction.rollback();
      return res.status(409).json({ error: 'El caso ya está finalizado y no se puede pasar' });
    }

    const personas = await new sql.Request(transaction)
      .input('de', sql.Int, de)
      .input('a', sql.Int, a)
      .query(`
        SELECT id, nombre FROM analistas
        WHERE id IN (@de, @a) AND idRol = 1 AND existe = 1
      `);

    const receptor = personas.recordset.find(p => p.id === a);
    const emisor   = personas.recordset.find(p => p.id === de);

    if (!receptor || !emisor) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Analista no válido' });
    }

    await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .input('a', sql.Int, a)
      .query(`UPDATE casos3cx SET idAnalista = @a WHERE id = @idCaso`);

    await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .input('de', sql.Int, de)
      .input('a', sql.Int, a)
      .query(`
        INSERT INTO casos3cx_traspasos (idCaso, deAnalista, aAnalista, fecha)
        VALUES (@idCaso, @de, @a, GETDATE())
      `);

    // Corta el tramo del emisor y abre uno del receptor en el mismo estado (ACTIVO o INACTIVO)
    if (estadoActual) {

      await new sql.Request(transaction)
        .input('idCaso', sql.Int, idCaso)
        .query(`UPDATE casos3cx_estados SET fin = GETDATE() WHERE idCaso = @idCaso AND fin IS NULL`);

      await new sql.Request(transaction)
        .input('idCaso', sql.Int, idCaso)
        .input('estado', sql.VarChar(12), estadoActual)
        .input('a', sql.Int, a)
        .query(`
          INSERT INTO casos3cx_estados (idCaso, estado, inicio, idAnalista)
          VALUES (@idCaso, @estado, GETDATE(), @a)
        `);
    }

    await transaction.commit();

    const io = req.app.get('io');
    io.emit('casoPasado', {
      idCaso,
      de, a,
      deNombre: emisor.nombre,
      aNombre: receptor.nombre,
      numerochat: caso.recordset[0].numerochat,
      tipo: caso.recordset[0].tipo
    });

    res.json({ ok: true, aNombre: receptor.nombre });

  } catch (error) {

    await transaction.rollback().catch(() => {});

    console.error('Error pasando el caso:', error);
    res.status(500).json({ error: 'Error al pasar el caso' });

  }
};


// Cambia el estado de un caso:
//   ACTIVO     -> el cliente responde
//   INACTIVO   -> el cliente no responde
//   FINALIZADO -> caso cerrado
// El tiempo de ejecución del caso es ACTIVO + INACTIVO (corre hasta que se finaliza).
// Cierra el tramo abierto y abre uno nuevo; si ya está en ese estado no hace nada.
// FINALIZADO es definitivo: detiene el reloj y el caso ya no admite más cambios.
const ESTADOS = ['ACTIVO', 'INACTIVO', 'FINALIZADO'];

const cambiarEstadoCaso = async (req, res) => {

  const idCaso      = parseInt(req.params.id, 10);
  const idAnalista  = parseInt(req.body?.idAnalista, 10);
  const nuevoEstado = String(req.body?.estado ?? '').toUpperCase();

  if (!idCaso || !idAnalista || !ESTADOS.includes(nuevoEstado)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const connection = await pool;
  const transaction = new sql.Transaction(connection);

  try {

    await transaction.begin();

    const caso = await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .query(`SELECT idAnalista FROM casos3cx WHERE id = @idCaso`);

    if (caso.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Caso no encontrado' });
    }

    if (caso.recordset[0].idAnalista !== idAnalista) {
      await transaction.rollback();
      return res.status(403).json({ error: 'El caso pertenece a otro analista' });
    }

    const ultimo = await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .query(`
        SELECT TOP 1 estado
        FROM casos3cx_estados WITH (UPDLOCK, ROWLOCK)
        WHERE idCaso = @idCaso
        ORDER BY id DESC
      `);

    const estadoActual = ultimo.recordset[0]?.estado;

    if (estadoActual === 'FINALIZADO') {
      await transaction.rollback();
      return res.status(409).json({ error: 'El caso ya está finalizado' });
    }

    if (estadoActual === nuevoEstado) {
      await transaction.rollback();
      return res.json({ ok: true, sinCambios: true });
    }

    await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .query(`UPDATE casos3cx_estados SET fin = GETDATE() WHERE idCaso = @idCaso AND fin IS NULL`);

    // El tramo FINALIZADO se guarda ya cerrado para que no acumule tiempo
    await new sql.Request(transaction)
      .input('idCaso', sql.Int, idCaso)
      .input('estado', sql.VarChar(12), nuevoEstado)
      .input('idAnalista', sql.Int, idAnalista)
      .query(`
        INSERT INTO casos3cx_estados (idCaso, estado, inicio, fin, idAnalista)
        VALUES (@idCaso, @estado, GETDATE(),
                CASE WHEN @estado = 'FINALIZADO' THEN GETDATE() END,
                @idAnalista)
      `);

    await transaction.commit();

    res.json({ ok: true });

  } catch (error) {

    await transaction.rollback().catch(() => {});

    console.error('Error cambiando estado del caso:', error);
    res.status(500).json({ error: 'Error al cambiar el estado del caso' });

  }
};


module.exports = {
  tomarCaso,
  getCasos,
  getMisCasos,
  cambiarEstadoCaso,
  buscarCasos,
  actualizarTicketCaso,
  pasarCaso
};
