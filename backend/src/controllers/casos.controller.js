const { pool, query, segundos } = require('../config/db');

const TIPOS = ['CHAT', 'LLAMADA'];

const getCasos = async (req, res) => {
  try {

    const result = await query(`
        SELECT a.nombre, c.numerochat, c.fecha, c.id, c.tipo, c."nombreEDS", c."ticketReferencia2WD"
        FROM casos3cx c
        JOIN analistas a ON c."idAnalista" = a.id
        ORDER BY c.fecha DESC, c.id DESC
        LIMIT 10
      `);

    res.json(result.rows);

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

    const result = await query(`
        SELECT
          c.id, c.numerochat, c."nombreEDS", c.tipo, c.fecha, c."ticketReferencia2WD",
          t.id AS "idTicket", es.nombre AS "estatusTicket",
          c."idAnalista", ah.nombre AS titular,
          (SELECT ad.nombre FROM casos3cx_traspasos tr JOIN analistas ad ON ad.id = tr."deAnalista"
            WHERE tr."idCaso" = c.id ORDER BY tr.id DESC LIMIT 1) AS "recibidoDe",
          -- estado actual = último tramo; NULL si el caso no tiene seguimiento (casos anteriores a la migración)
          (SELECT estado FROM casos3cx_estados WHERE "idCaso" = c.id ORDER BY id DESC LIMIT 1) AS estado,
          COALESCE(e."vecesActivo", 0)     AS "vecesActivo",
          COALESCE(e."vecesInactivo", 0)   AS "vecesInactivo",
          COALESCE(e."segActivo", 0)       AS "segActivo",
          COALESCE(e."segInactivo", 0)     AS "segInactivo"
        FROM casos3cx c
        LEFT JOIN (
          SELECT
            "idCaso",
            SUM(CASE WHEN estado = 'ACTIVO'    THEN 1 ELSE 0 END)::int AS "vecesActivo",
            SUM(CASE WHEN estado = 'INACTIVO'  THEN 1 ELSE 0 END)::int AS "vecesInactivo",
            SUM(CASE WHEN estado = 'ACTIVO'
                     THEN ${segundos('inicio', 'fin')} ELSE 0 END)::int AS "segActivo",
            SUM(CASE WHEN estado = 'INACTIVO'
                     THEN ${segundos('inicio', 'fin')} ELSE 0 END)::int AS "segInactivo"
          FROM casos3cx_estados
          WHERE "idAnalista" = @idAnalista
          GROUP BY "idCaso"
        ) e ON e."idCaso" = c.id
        LEFT JOIN tickets t  ON t.codigo2wd = c."ticketReferencia2WD"
        LEFT JOIN estatus es ON es.id = t."idEstatus"
        LEFT JOIN analistas ah ON ah.id = c."idAnalista"
        WHERE (c."idAnalista" = @idAnalista
               OR EXISTS (SELECT 1 FROM casos3cx_traspasos tr
                           WHERE tr."idCaso" = c.id AND (tr."deAnalista" = @idAnalista OR tr."aAnalista" = @idAnalista)))
          AND c.fecha::date = CURRENT_DATE
        ORDER BY c.fecha DESC, c.id DESC
      `, { idAnalista });

    res.json(result.rows);

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

// 23505: violación del índice único del ticket (respaldo si dos analistas guardan el mismo ticket a la vez).
// Se mira el nombre del índice para no confundirlo con otro choque, p. ej. el de la llave primaria.
function esDuplicado(error) {
  return error && error.code === '23505' && /ticket/i.test(error.constraint || '');
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

    const params = { idAnalista };

    // Mis casos: los que tengo ahora y los que pasé o recibí
    let where = `(c."idAnalista" = @idAnalista
      OR EXISTS (SELECT 1 FROM casos3cx_traspasos tr
                  WHERE tr."idCaso" = c.id AND (tr."deAnalista" = @idAnalista OR tr."aAnalista" = @idAnalista)))`;

    if (q) {
      // Escapa los comodines de LIKE para que el texto se busque literal
      params.like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';
      where += ` AND (c.numerochat::text ILIKE @like OR c."nombreEDS" ILIKE @like OR c."ticketReferencia2WD" ILIKE @like)`;
    }

    if (TIPOS.includes(tipo)) {
      params.tipo = tipo;
      where += ' AND c.tipo = @tipo';
    }

    if (desde) {
      params.desde = desde;
      where += ' AND c.fecha::date >= @desde::date';
    }

    if (hasta) {
      params.hasta = hasta;
      where += ' AND c.fecha::date <= @hasta::date';
    }

    if (sinTicket) {
      where += ' AND c."ticketReferencia2WD" IS NULL';
    }

    const result = await query(`
      SELECT
        c.id, c.numerochat, c."nombreEDS", c.tipo, c.fecha, c."ticketReferencia2WD",
        c."idAnalista", ah.nombre AS titular,
        (SELECT ad.nombre FROM casos3cx_traspasos tr JOIN analistas ad ON ad.id = tr."deAnalista"
          WHERE tr."idCaso" = c.id ORDER BY tr.id DESC LIMIT 1) AS "recibidoDe",
        (SELECT estado FROM casos3cx_estados WHERE "idCaso" = c.id ORDER BY id DESC LIMIT 1) AS estado,
        COALESCE(s."vecesActivo", 0)   AS "vecesActivo",
        COALESCE(s."vecesInactivo", 0) AS "vecesInactivo",
        COALESCE(s."segActivo", 0)   AS "segActivo",
        COALESCE(s."segInactivo", 0) AS "segInactivo",
        t.id     AS "idTicket",
        es.nombre AS "estatusTicket"
      FROM casos3cx c
      LEFT JOIN LATERAL (
        SELECT
          SUM(CASE WHEN e.estado = 'ACTIVO'    THEN 1 ELSE 0 END)::int AS "vecesActivo",
          SUM(CASE WHEN e.estado = 'INACTIVO'  THEN 1 ELSE 0 END)::int AS "vecesInactivo",
          SUM(CASE WHEN e.estado = 'ACTIVO'
                   THEN ${segundos('e.inicio', 'e.fin')} ELSE 0 END)::int AS "segActivo",
          SUM(CASE WHEN e.estado = 'INACTIVO'
                   THEN ${segundos('e.inicio', 'e.fin')} ELSE 0 END)::int AS "segInactivo"
        FROM casos3cx_estados e
        WHERE e."idCaso" = c.id AND e."idAnalista" = @idAnalista
      ) s ON true
      LEFT JOIN tickets t  ON t.codigo2wd = c."ticketReferencia2WD"
      LEFT JOIN estatus es ON es.id = t."idEstatus"
      LEFT JOIN analistas ah ON ah.id = c."idAnalista"
      WHERE ${where}
      ORDER BY c.fecha DESC, c.id DESC
      LIMIT 200
    `, params);

    res.json(result.rows);

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

    const caso = await query(`
        SELECT c."idAnalista",
          (SELECT COUNT(*)::int FROM casos3cx_traspasos tr
            WHERE tr."idCaso" = c.id AND (tr."deAnalista" = @idAnalista OR tr."aAnalista" = @idAnalista)) AS participo
        FROM casos3cx c WHERE c.id = @idCaso
      `, { idCaso, idAnalista });

    if (caso.rows.length === 0) {
      return res.status(404).json({ error: 'Caso no encontrado' });
    }

    // Solo quien tiene el caso, o quien lo pasó / recibió, puede vincular el ticket
    if (caso.rows[0].idAnalista !== idAnalista && caso.rows[0].participo === 0) {
      return res.status(403).json({ error: 'El caso pertenece a otro analista' });
    }

    if (t.ticket) {

      const dup = await query(`
          SELECT c.id, c.numerochat, a.nombre
          FROM casos3cx c
          JOIN analistas a ON a.id = c."idAnalista"
          WHERE c."ticketReferencia2WD" = @ticket AND c.id <> @idCaso
          LIMIT 1
        `, { idCaso, ticket: t.ticket });

      if (dup.rows.length) {
        return res.status(409).json({ error: mensajeTicketDuplicado(t.ticket, dup.rows[0]) });
      }
    }

    await query(
      `UPDATE casos3cx SET "ticketReferencia2WD" = @ticket WHERE id = @idCaso`,
      { idCaso, ticket: t.ticket }
    );

    let existeEn2WD = false;
    let estatus = null;

    if (t.ticket) {

      const info = await query(`
          SELECT
            (SELECT es.nombre
               FROM tickets tk LEFT JOIN estatus es ON es.id = tk."idEstatus"
              WHERE tk.codigo2wd = @ticket LIMIT 1) AS estatus,
            (SELECT COUNT(*)::int FROM tickets WHERE codigo2wd = @ticket) AS existe
        `, { ticket: t.ticket });

      existeEn2WD = info.rows[0].existe > 0;
      estatus     = info.rows[0].estatus;
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

  let client;

  try {

    client = await pool.connect();
    await client.query('BEGIN');

    if (ticket.ticket) {

      const dup = await query(`
          SELECT c.id, c.numerochat, a.nombre
          FROM casos3cx c
          JOIN analistas a ON a.id = c."idAnalista"
          WHERE c."ticketReferencia2WD" = @ticket
          LIMIT 1
        `, { ticket: ticket.ticket }, client);

      if (dup.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: mensajeTicketDuplicado(ticket.ticket, dup.rows[0]) });
      }
    }

    let idAnalista;

    if (tipo === 'CHAT') {

      // Obtener analista siguiente (su fila queda bloqueada hasta el COMMIT)
      const analistaResult = await query(`
        SELECT id, nombre, orden
        FROM analistas
        WHERE activo = '1'
        ORDER BY orden
        LIMIT 1
        FOR UPDATE
      `, {}, client);

      if (analistaResult.rows.length === 0) {

        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No hay analistas activos' });

      }

      const analista = analistaResult.rows[0];
      idAnalista = analista.id;

      // Ajustar orden
      await query(`
          UPDATE analistas
          SET orden = orden - 1
          WHERE activo = '1'
          AND orden > @orden
        `, { orden: analista.orden }, client);

      // Obtener último orden
      const maxOrdenResult = await query(`
        SELECT COUNT(orden)::int AS "maxOrden"
        FROM analistas
        WHERE activo = '1'
      `, {}, client);

      const maxOrden = maxOrdenResult.rows[0].maxOrden;

      // Enviar analista al final
      if (analista.orden !== maxOrden) {
        await query(`
            UPDATE analistas
            SET orden = @nuevoOrden
            WHERE id = @idAnalistaCola
          `, { nuevoOrden: maxOrden, idAnalistaCola: analista.id }, client);
      }

    } else {

      // Llamada: se registra a nombre de quien la atendió y la cola no se mueve
      const analistaResult = await query(
        `SELECT id FROM analistas WHERE id = @idAnalista AND "idRol" = 1`,
        { idAnalista: idAnalistaLlamada }, client
      );

      if (analistaResult.rows.length === 0) {

        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Analista no válido' });

      }

      idAnalista = idAnalistaLlamada;

    }

    // Insertar caso
    const insertResult = await query(`
        INSERT INTO casos3cx ("idAnalista", numerochat, fecha, "nombreEDS", tipo, "ticketReferencia2WD")
        VALUES (@idAnalista, @numerochat, LOCALTIMESTAMP, @nombreEDS, @tipo, @ticket)
        RETURNING id
      `, { idAnalista, numerochat, nombreEDS, tipo, ticket: ticket.ticket }, client);

    const idCaso = insertResult.rows[0].id;

    // Tramo inicial: queda activo (se está dando respuesta)
    await query(`
        INSERT INTO casos3cx_estados ("idCaso", estado, inicio, "idAnalista")
        VALUES (@idCaso, 'ACTIVO', LOCALTIMESTAMP, @idAnalista)
      `, { idCaso, idAnalista }, client);

    await client.query('COMMIT');

    // Caso recién insertado
    const nuevoCaso = await query(`
        SELECT a.nombre, a.activo::int AS activo, c."idAnalista", c.numerochat, c.fecha, c.id, c.tipo, c."nombreEDS", c."ticketReferencia2WD"
        FROM casos3cx c
        JOIN analistas a ON c."idAnalista" = a.id
        WHERE c.id = @idCaso
      `, { idCaso });

    const caso = nuevoCaso.rows[0];

    // Socket
    const io = req.app.get("io");
    io.emit("nuevoCaso3CX", caso);

    res.json({ ok: true, id: idCaso });

  } catch (error) {

    if (client) await client.query('ROLLBACK').catch(() => {});

    if (esDuplicado(error)) {
      return res.status(409).json({ error: mensajeTicketDuplicado(ticket.ticket) });
    }

    console.error(error);
    res.status(500).json({ error: 'Error al tomar el caso' });

  } finally {

    if (client) client.release();

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

  let client;

  try {

    client = await pool.connect();
    await client.query('BEGIN');

    const caso = await query(
      `SELECT "idAnalista", numerochat, tipo FROM casos3cx WHERE id = @idCaso FOR UPDATE`,
      { idCaso }, client
    );

    if (caso.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Caso no encontrado' });
    }

    if (caso.rows[0].idAnalista !== de) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo quien tiene el caso puede pasarlo' });
    }

    const ultimo = await query(`
        SELECT estado
        FROM casos3cx_estados
        WHERE "idCaso" = @idCaso
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `, { idCaso }, client);

    const estadoActual = ultimo.rows[0]?.estado;

    if (estadoActual === 'FINALIZADO') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El caso ya está finalizado y no se puede pasar' });
    }

    const personas = await query(`
        SELECT id, nombre FROM analistas
        WHERE id IN (@de, @a) AND "idRol" = 1 AND existe = '1'
      `, { de, a }, client);

    const receptor = personas.rows.find(p => p.id === a);
    const emisor   = personas.rows.find(p => p.id === de);

    if (!receptor || !emisor) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Analista no válido' });
    }

    await query(`UPDATE casos3cx SET "idAnalista" = @a WHERE id = @idCaso`, { idCaso, a }, client);

    await query(`
        INSERT INTO casos3cx_traspasos ("idCaso", "deAnalista", "aAnalista", fecha)
        VALUES (@idCaso, @de, @a, LOCALTIMESTAMP)
      `, { idCaso, de, a }, client);

    // Corta el tramo del emisor y abre uno del receptor en el mismo estado (ACTIVO o INACTIVO)
    if (estadoActual) {

      await query(
        `UPDATE casos3cx_estados SET fin = LOCALTIMESTAMP WHERE "idCaso" = @idCaso AND fin IS NULL`,
        { idCaso }, client
      );

      await query(`
          INSERT INTO casos3cx_estados ("idCaso", estado, inicio, "idAnalista")
          VALUES (@idCaso, @estado, LOCALTIMESTAMP, @a)
        `, { idCaso, estado: estadoActual, a }, client);
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    io.emit('casoPasado', {
      idCaso,
      de, a,
      deNombre: emisor.nombre,
      aNombre: receptor.nombre,
      numerochat: caso.rows[0].numerochat,
      tipo: caso.rows[0].tipo
    });

    res.json({ ok: true, aNombre: receptor.nombre });

  } catch (error) {

    if (client) await client.query('ROLLBACK').catch(() => {});

    console.error('Error pasando el caso:', error);
    res.status(500).json({ error: 'Error al pasar el caso' });

  } finally {

    if (client) client.release();

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

  let client;

  try {

    client = await pool.connect();
    await client.query('BEGIN');

    const caso = await query(`SELECT "idAnalista" FROM casos3cx WHERE id = @idCaso`, { idCaso }, client);

    if (caso.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Caso no encontrado' });
    }

    if (caso.rows[0].idAnalista !== idAnalista) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'El caso pertenece a otro analista' });
    }

    const ultimo = await query(`
        SELECT estado
        FROM casos3cx_estados
        WHERE "idCaso" = @idCaso
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `, { idCaso }, client);

    const estadoActual = ultimo.rows[0]?.estado;

    if (estadoActual === 'FINALIZADO') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El caso ya está finalizado' });
    }

    if (estadoActual === nuevoEstado) {
      await client.query('ROLLBACK');
      return res.json({ ok: true, sinCambios: true });
    }

    await query(
      `UPDATE casos3cx_estados SET fin = LOCALTIMESTAMP WHERE "idCaso" = @idCaso AND fin IS NULL`,
      { idCaso }, client
    );

    // El tramo FINALIZADO se guarda ya cerrado para que no acumule tiempo
    await query(`
        INSERT INTO casos3cx_estados ("idCaso", estado, inicio, fin, "idAnalista")
        VALUES (@idCaso, @estado, LOCALTIMESTAMP,
                CASE WHEN @cerrado::boolean THEN LOCALTIMESTAMP END,
                @idAnalista)
      `, { idCaso, estado: nuevoEstado, cerrado: nuevoEstado === 'FINALIZADO', idAnalista }, client);

    await client.query('COMMIT');

    res.json({ ok: true });

  } catch (error) {

    if (client) await client.query('ROLLBACK').catch(() => {});

    console.error('Error cambiando estado del caso:', error);
    res.status(500).json({ error: 'Error al cambiar el estado del caso' });

  } finally {

    if (client) client.release();

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
