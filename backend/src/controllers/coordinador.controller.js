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
      SELECT id, nombre, orden, activo, existe
      FROM analistas
      WHERE idRol = 1 AND existe = 1
      ORDER BY nombre
    `);
    res.json(result.recordset);
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

const getHorarios = async (_req, res) => {
  try {
    const result = await (await pool).request().query(`
      SELECT
        id,
        CONVERT(VARCHAR(8), HoraEntrada,        108) AS HoraEntrada,
        CONVERT(VARCHAR(8), HoraSalida,          108) AS HoraSalida,
        CONVERT(VARCHAR(8), HoraAlmuerzoInicio,  108) AS HoraAlmuerzoInicio,
        CONVERT(VARCHAR(8), HoraAlmuerzoFin,     108) AS HoraAlmuerzoFin
      FROM Horarios
      ORDER BY HoraEntrada
    `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAnalistasHorarios = async (_req, res) => {
  try {
    const result = await (await pool).request().query(`
      SELECT
        a.id, a.nombre, a.idhorario,
        CONVERT(VARCHAR(8), h.HoraEntrada,        108) AS HoraEntrada,
        CONVERT(VARCHAR(8), h.HoraSalida,          108) AS HoraSalida,
        CONVERT(VARCHAR(8), h.HoraAlmuerzoInicio,  108) AS HoraAlmuerzoInicio,
        CONVERT(VARCHAR(8), h.HoraAlmuerzoFin,     108) AS HoraAlmuerzoFin
      FROM analistas a
      LEFT JOIN Horarios h ON a.idhorario = h.id
      WHERE a.idRol = 1 AND a.existe = 1
      ORDER BY a.nombre
    `);
    res.json(result.recordset);
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
      .input('idhorario', sql.Int, idhorario)
      .query(`UPDATE analistas SET idhorario = @idhorario WHERE id = @id`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  login,
  getAnalistas, cambiarEstadoAnalista, eliminarAnalista, actualizarOrden,
  getCategorias, crearCategoria, toggleCategoria,
  getEDS, crearEDS, toggleEDS,
  getHorarios, getAnalistasHorarios, asignarHorario
};
