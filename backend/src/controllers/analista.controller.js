const { sql, pool } = require('../config/db');


const getAnalista = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool;
    const result = await connection.request()
      .input("id", id)
      .query(`
      SELECT id, nombre, orden, activo
      FROM analistas
      WHERE id = @id
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

      const maxOrdenResult = await connection.request()
        .query(`
          SELECT ISNULL(MAX(orden), 0) AS maxOrden
          FROM analistas
          WHERE activo = 1
        `);

      const maxOrden = maxOrdenResult.recordset[0].maxOrden;

      await connection.request()
        .input("id", sql.Int, id)
        .input("nuevoOrden", sql.Int, maxOrden + 1)
        .query(`
          UPDATE analistas
          SET activo = 1,
              orden = @nuevoOrden
          WHERE id = @id
        `);

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
