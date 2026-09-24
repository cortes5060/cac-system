const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

/* ---------- AUTH ---------- */

const login = async (req, res) => {
  try {
    const { id, password } = req.body;
    const result = await query(
      `SELECT id, nombre, "idRol", "passwordHash" FROM analistas WHERE id = @id AND existe = '1'`,
      { id }
    );

    const ana = result.rows[0];

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
    const result = await query(`
      SELECT id, nombre, orden, activo::int AS activo, existe::int AS existe
      FROM analistas
      WHERE "idRol" = 1 AND existe = '1'
      ORDER BY nombre
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const cambiarEstadoAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (activo == 1) {
      // Desplaza a todos los activos una posición y pone al nuevo en #1
      await query(`UPDATE analistas SET orden = orden + 1 WHERE activo = '1'`);

      await query(`UPDATE analistas SET activo = '1', orden = 1 WHERE id = @id`, { id });
    } else {
      const anaR = await query(`SELECT orden FROM analistas WHERE id = @id`, { id });
      const ordenActual = anaR.rows[0]?.orden || 0;

      await query(`UPDATE analistas SET activo = '0', orden = 0 WHERE id = @id`, { id });

      if (ordenActual > 0) {
        await query(
          `UPDATE analistas SET orden = orden - 1 WHERE activo = '1' AND orden > @orden`,
          { orden: ordenActual }
        );
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

    const anaR = await query(`SELECT orden, activo::int AS activo FROM analistas WHERE id = @id`, { id });
    const ana = anaR.rows[0];

    if (ana?.activo && ana.orden > 0) {
      await query(
        `UPDATE analistas SET orden = orden - 1 WHERE activo = '1' AND orden > @orden`,
        { orden: ana.orden }
      );
    }

    await query(`UPDATE analistas SET existe = '0', activo = '0', orden = 0 WHERE id = @id`, { id });

    req.app.get('io').emit('analistaActualizado', { id: parseInt(id), activo: 0 });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// El coordinador asigna una contraseña nueva a un analista sin necesitar
// la anterior. Restringido a idRol = 1: la contraseña del propio
// coordinador nunca se toca desde aqui, solo se modifica directo en BD.
const asignarPasswordAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(`
        UPDATE analistas SET "passwordHash" = @passwordHash
        WHERE id = @id AND "idRol" = 1 AND existe = '1'
      `, { id, passwordHash });

    if (result.rowCount === 0) {
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

    for (const { id, orden } of ordenes) {
      await query(`UPDATE analistas SET orden = @orden WHERE id = @id`, { id, orden });
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
    const result = await query(`SELECT id, nombre, activo::int AS activo FROM categorias ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const crearCategoria = async (req, res) => {
  try {
    const { nombre } = req.body;
    await query(`INSERT INTO categorias (nombre, activo) VALUES (@nombre, '1')`, { nombre });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    await query(`UPDATE categorias SET activo = @activo WHERE id = @id`, { id, activo: String(Number(activo) ? 1 : 0) });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ---------- EDS ---------- */

const getEDS = async (req, res) => {
  try {
    const result = await query(`SELECT id, nombre, "NIT", direccion, existe::int AS existe FROM estaciones ORDER BY nombre`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const crearEDS = async (req, res) => {
  try {
    const { nombre, NIT, direccion } = req.body;

    if (NIT) {
      const dup = await query(`SELECT id FROM estaciones WHERE "NIT" = @NIT`, { NIT });
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: `Ya existe una EDS con el NIT ${NIT}` });
      }
    }

    await query(
      `INSERT INTO estaciones (nombre, "NIT", direccion, existe) VALUES (@nombre, @NIT, @direccion, '1')`,
      { nombre, NIT: NIT || null, direccion: direccion || null }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleEDS = async (req, res) => {
  try {
    const { id } = req.params;
    const { existe } = req.body;
    await query(`UPDATE estaciones SET existe = @existe WHERE id = @id`, { id, existe: String(Number(existe) ? 1 : 0) });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ---------- HORARIOS ---------- */

const getHorarios = async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        LEFT("HoraEntrada"::time::text,        8) AS "HoraEntrada",
        LEFT("HoraSalida"::time::text,         8) AS "HoraSalida",
        LEFT("HoraAlmuerzoInicio"::time::text, 8) AS "HoraAlmuerzoInicio",
        LEFT("HoraAlmuerzoFin"::time::text,    8) AS "HoraAlmuerzoFin"
      FROM "Horarios"
      ORDER BY "Horarios"."HoraEntrada"
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAnalistasHorarios = async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        a.id, a.nombre, a.idhorario,
        LEFT(h."HoraEntrada"::time::text,        8) AS "HoraEntrada",
        LEFT(h."HoraSalida"::time::text,         8) AS "HoraSalida",
        LEFT(h."HoraAlmuerzoInicio"::time::text, 8) AS "HoraAlmuerzoInicio",
        LEFT(h."HoraAlmuerzoFin"::time::text,    8) AS "HoraAlmuerzoFin"
      FROM analistas a
      LEFT JOIN "Horarios" h ON a.idhorario = h.id
      WHERE a."idRol" = 1 AND a.existe = '1'
      ORDER BY a.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const asignarHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const { idhorario } = req.body;
    await query(`UPDATE analistas SET idhorario = @idhorario WHERE id = @id`, { id, idhorario });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const buscarCasos = async (req, res) => {
  try {
    const { numero, nombreeds, fechaini, fechafin } = req.query;
    const params = {};

    let where = 'WHERE 1=1';

    if (numero) {
      params.numero = `%${numero}%`;
      where += ' AND c.numerochat::text ILIKE @numero';
    }
    if (nombreeds) {
      params.nombreeds = `%${nombreeds}%`;
      where += ' AND c."nombreEDS" ILIKE @nombreeds';
    }
    if (fechaini) {
      params.fechaini = fechaini;
      where += ' AND c.fecha::date >= @fechaini::date';
    }
    if (fechafin) {
      params.fechafin = fechafin;
      where += ' AND c.fecha::date <= @fechafin::date';
    }

    const result = await query(`
      SELECT c.id, c.numerochat, c."nombreEDS", c.fecha, a.nombre
      FROM casos3cx c
      JOIN analistas a ON c."idAnalista" = a.id
      ${where}
      ORDER BY c.fecha DESC
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  login,
  getAnalistas, cambiarEstadoAnalista, eliminarAnalista, actualizarOrden, asignarPasswordAnalista,
  getCategorias, crearCategoria, toggleCategoria,
  getEDS, crearEDS, toggleEDS,
  getHorarios, getAnalistasHorarios, asignarHorario,
  buscarCasos
};
