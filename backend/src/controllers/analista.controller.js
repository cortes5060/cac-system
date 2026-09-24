const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

const loginAnalista = async (req, res) => {
  try {
    const { id, password } = req.body;
    const result = await query(
      `SELECT id, nombre, "idRol", "passwordHash" FROM analistas WHERE id = @id AND existe = '1'`,
      { id }
    );

    const ana = result.rows[0];

    if (!ana || ana.idRol !== 1) {
      return res.status(401).json({ error: 'Acceso no autorizado' });
    }
    if (!ana.passwordHash) {
      return res.status(401).json({ error: 'Este analista no tiene contraseña configurada' });
    }

    const match = await bcrypt.compare(password, ana.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    res.json({ ok: true, analista: { id: ana.id, nombre: ana.nombre } });
  } catch (error) {
    console.error('Error login analista:', error);
    res.status(500).json({ error: error.message });
  }
};

const getAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
        SELECT
          a.id, a.nombre, a.orden, a.activo::int AS activo, a."idRol",
          COALESCE((
            SELECT COUNT(*)::int
            FROM casos3cx
            WHERE "idAnalista" = a.id
              AND fecha::date = CURRENT_DATE
          ), 0) AS "casosHoy"
        FROM analistas a
        WHERE a.id = @id
      `, { id });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo analista:', error);
    res.status(500).json({ message: 'Error al obtener analista' });
  }
};

const cambiarEstado = async (req, res) => {
  try {

    const { id } = req.params;
    const { activo } = req.body;

    const result = await query(`
        SELECT
          CASE
          WHEN LOCALTIME
              BETWEEN "HoraEntrada"::time AND "HoraSalida"::time
              AND LOCALTIME
              NOT BETWEEN "HoraAlmuerzoInicio"::time AND "HoraAlmuerzoFin"::time
          THEN 0
          ELSE 1
          END AS "puedeInactivarse"
          FROM "Horarios"
          WHERE id = (
              SELECT idhorario FROM analistas WHERE id = @id
          )
      `, { id });


    if (result.rows[0]?.puedeInactivarse == 0 && activo == 0) {
      return res.status(400).json(
        {
          "bloquear": true
        });
    }

    const resultado = await query(`
        SELECT
            id,
            nombre,
            orden,
            activo::int AS activo
        FROM analistas
        WHERE id = @id
      `, { id });

    const analista = resultado.rows[0];

    if (activo == 1) {

      const casosHoyResult = await query(`
          SELECT COUNT(*)::int AS casos
          FROM casos3cx
          WHERE "idAnalista" = @id
            AND fecha::date = CURRENT_DATE
        `, { id });

      const casosHoy = casosHoyResult.rows[0].casos;

      if (casosHoy === 0) {
        const primerConCasosResult = await query(`
            SELECT COALESCE(MIN(a.orden), 0) AS "primerConCasos"
            FROM analistas a
            INNER JOIN (
              SELECT DISTINCT "idAnalista"
              FROM casos3cx
              WHERE fecha::date = CURRENT_DATE
            ) c ON a.id = c."idAnalista"
            WHERE a.activo = '1'
          `);

        const primerConCasos = primerConCasosResult.rows[0].primerConCasos;

        if (primerConCasos > 0) {
          await query(`
              UPDATE analistas
              SET orden = orden + 1
              WHERE activo = '1' AND orden >= @desde
            `, { desde: primerConCasos });

          await query(`
              UPDATE analistas
              SET activo = '1', orden = @nuevoOrden
              WHERE id = @id
            `, { id, nuevoOrden: primerConCasos });
        } else {
          const maxOrdenResult = await query(
            `SELECT COALESCE(MAX(orden), 0) AS "maxOrden" FROM analistas WHERE activo = '1'`
          );

          await query(`
              UPDATE analistas
              SET activo = '1', orden = @nuevoOrden
              WHERE id = @id
            `, { id, nuevoOrden: maxOrdenResult.rows[0].maxOrden + 1 });
        }
      } else {
        const maxOrdenResult = await query(
          `SELECT COALESCE(MAX(orden), 0) AS "maxOrden" FROM analistas WHERE activo = '1'`
        );

        await query(`
            UPDATE analistas
            SET activo = '1', orden = @nuevoOrden
            WHERE id = @id
          `, { id, nuevoOrden: maxOrdenResult.rows[0].maxOrden + 1 });
      }

      const io = req.app.get("io");
      io.emit("analistaActualizado", { id, activo });
      res.json({ ok: true });

    } else {

      await query(`
          UPDATE analistas
          SET activo = '0',
              orden = 0
          WHERE id = @id
        `, { id });

      await query(`
          UPDATE analistas
          SET orden = orden - 1
          WHERE activo = '1'
          AND orden > @orden
        `, { orden: analista.orden });

      const io = req.app.get("io");
      io.emit("analistaActualizado", { id, activo });
      res.json({ ok: true });
    }

  } catch (error) {

    console.error("ERROR REAL:", error);
    res.status(500).json({ error: error.message });

  }
};

module.exports = {
  loginAnalista,
  getAnalista,
  cambiarEstado
}
