const { sql, pool } = require('../config/db');


const getAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool;
    const result = await connection.request()
      .input("id", id)
      .query(`
        SELECT
          a.id, a.nombre, a.orden, a.activo, a.idRol,
          ISNULL((
            SELECT COUNT(*)
            FROM casos3cx
            WHERE idAnalista = a.id
              AND CAST(fecha AS DATE) = CAST(GETDATE() AS DATE)
          ), 0) AS casosHoy
        FROM analistas a
        WHERE a.id = @id
      `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error obteniendo analista:', error);
    res.status(500).json({ message: 'Error al obtener analista' });
  }
};

const cambiarEstado = async (req, res) => {
  try {

    const { id } = req.params;
    const { activo } = req.body;

    const connection = await pool;

    const result = await connection.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
          CASE 
          WHEN CAST(GETDATE() AS TIME) 
              BETWEEN horaentrada AND horasalida
              AND CAST(GETDATE() AS TIME) 
              NOT BETWEEN horaalmuerzoinicio AND horaalmuerzofin
          THEN 0
          ELSE 1
          END AS puedeInactivarse
          FROM horarios
          WHERE id = (
              SELECT idhorario FROM analistas WHERE id = @id 
          )
      `);


    if (result.recordset[0].puedeInactivarse == 0 && activo == 0) {
      return res.status(400).json(
        {
          "bloquear": true
        });
    }

    const resultado = await connection.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
            id,
            nombre,
            orden,
            activo
        FROM analistas 
        WHERE id = @id
      `);

    const analista = resultado.recordset[0];

    if (activo == 1) {

      // Verificar si el analista ya tomó algún caso hoy
      const casosHoyResult = await connection.request()
        .input("id", sql.Int, id)
        .query(`
          SELECT COUNT(*) AS casos
          FROM casos3cx
          WHERE idAnalista = @id
            AND CAST(fecha AS DATE) = CAST(GETDATE() AS DATE)
        `);

      const casosHoy = casosHoyResult.recordset[0].casos;

      if (casosHoy === 0) {
        // Sin casos hoy: debe quedar antes de quienes ya tomaron casos
        const primerConCasosResult = await connection.request()
          .query(`
            SELECT ISNULL(MIN(a.orden), 0) AS primerConCasos
            FROM analistas a
            INNER JOIN (
              SELECT DISTINCT idAnalista
              FROM casos3cx
              WHERE CAST(fecha AS DATE) = CAST(GETDATE() AS DATE)
            ) c ON a.id = c.idAnalista
            WHERE a.activo = 1
          `);

        const primerConCasos = primerConCasosResult.recordset[0].primerConCasos;

        if (primerConCasos > 0) {
          // Hay analistas con casos hoy: desplazarlos para insertar antes de ellos
          await connection.request()
            .input("desde", sql.Int, primerConCasos)
            .query(`
              UPDATE analistas
              SET orden = orden + 1
              WHERE activo = 1 AND orden >= @desde
            `);

          await connection.request()
            .input("id", sql.Int, id)
            .input("nuevoOrden", sql.Int, primerConCasos)
            .query(`
              UPDATE analistas
              SET activo = 1, orden = @nuevoOrden
              WHERE id = @id
            `);
        } else {
          // Nadie ha tomado casos hoy: ir al final de la cola (orden normal)
          const maxOrdenResult = await connection.request()
            .query(`SELECT ISNULL(MAX(orden), 0) AS maxOrden FROM analistas WHERE activo = 1`);

          await connection.request()
            .input("id", sql.Int, id)
            .input("nuevoOrden", sql.Int, maxOrdenResult.recordset[0].maxOrden + 1)
            .query(`
              UPDATE analistas
              SET activo = 1, orden = @nuevoOrden
              WHERE id = @id
            `);
        }
      } else {
        // Ya tomó casos hoy: va al final de la cola
        const maxOrdenResult = await connection.request()
          .query(`SELECT ISNULL(MAX(orden), 0) AS maxOrden FROM analistas WHERE activo = 1`);

        await connection.request()
          .input("id", sql.Int, id)
          .input("nuevoOrden", sql.Int, maxOrdenResult.recordset[0].maxOrden + 1)
          .query(`
            UPDATE analistas
            SET activo = 1, orden = @nuevoOrden
            WHERE id = @id
          `);
      }

      const io = req.app.get("io");
      io.emit("analistaActualizado", { id, activo });
      res.json({ ok: true });

    } else {

      await connection.request()
        .input("id", sql.Int, id)
        .query(`
          UPDATE analistas
          SET activo = 0,
              orden = 0
          WHERE id = @id
        `);

      await connection.request()
        .input("orden", sql.Int, analista.orden)
        .query(`
          UPDATE analistas
          SET orden = orden - 1
          WHERE activo = 1
          AND orden > @orden
        `);

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
  getAnalista,
  cambiarEstado
}
