const { sql, pool } = require('../config/db');

const getCasos = async (req, res) => {
  try {

    const connection = await pool;

    const result = await connection.request()
      .query(`
        SELECT TOP 5 a.nombre, c.numerochat, FORMAT(c.fecha, 'dd/MM/yyyy HH:mm') AS fecha, c.id
        FROM casos3cx c
        JOIN analistas a ON c.idAnalista = a.id
        ORDER BY c.fecha DESC
      `);

    res.json(result.recordset);

  } catch (error) {

    console.error('Error obteniendo casos:', error);
    res.status(500).json({ message: 'Error al obtener casos' });

  }
};


const tomarCaso = async (req, res) => {

  const numerochat = req.body?.numerochat;

  if (!numerochat) {
    return res.status(400).json({ error: 'numerochat es obligatorio' });
  }

  const connection = await pool;
  const transaction = new sql.Transaction(connection);

  try {

    await transaction.begin();

    const request = new sql.Request(transaction);

    // Obtener analista siguiente
    const analistaResult = await request.query(`
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

    // Insertar caso
    await request
      .input('idAnalista', sql.Int, analista.id)
      .input('numerochat', sql.Int, numerochat)
      .query(`
        INSERT INTO casos3cx (idAnalista, numerochat, fecha)
        VALUES (@idAnalista, @numerochat, GETDATE())
      `);

    // Ajustar orden
    await request
      .input('orden', sql.Int, analista.orden)
      .query(`
        UPDATE analistas
        SET orden = orden - 1
        WHERE activo = 1
        AND orden > @orden
      `);

    // Obtener último orden
    const maxOrdenResult = await request.query(`
      SELECT count(orden) AS maxOrden
      FROM analistas
      WHERE activo = 1
    `);

    const maxOrden = maxOrdenResult.recordset[0].maxOrden;

    // Enviar analista al final
    if (analista.orden !== maxOrden) {
      await request
        .input('nuevoOrden', sql.Int, maxOrden)
        .input('idAnalistaCola', sql.Int, analista.id)
        .query(`
        UPDATE analistas
        SET orden = @nuevoOrden
        WHERE id = @idAnalistaCola
      `);
    } 
    await transaction.commit();

    // Obtener el último caso insertado
    const nuevoCaso = await connection.request().query(`
      SELECT TOP 1 a.nombre, a.activo, c.numerochat, c.fecha, c.id
      FROM casos3cx c
      JOIN analistas a ON c.idAnalista = a.id
      ORDER BY c.id DESC
    `);

    const caso = nuevoCaso.recordset[0];

    // Socket
    const io = req.app.get("io");
    io.emit("nuevoCaso3CX", caso);

    res.json({ ok: true });

  } catch (error) {

    await transaction.rollback();

    console.error(error);
    res.status(500).json({ error: 'Error al tomar el caso' });

  }
};


module.exports = {
  tomarCaso,
  getCasos
};