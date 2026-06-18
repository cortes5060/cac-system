const { sql, pool } = require('../config/db');

const getCasos = async (req, res) => {
  try {

    const connection = await pool;

    const result = await connection.request()
      .query(`
        SELECT TOP 5 a.nombre, c.numerochat, c.fecha, c.id, c.nombreEDS
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

  const { numerochat, nombreEDS } = req.body;

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
      .input('numerochat', sql.VarChar(50), numerochat)
      .input('nombreEDS',  sql.NVarChar, nombreEDS || null)
      .query(`
        INSERT INTO casos3cx (idAnalista, numerochat, fecha, nombreEDS)
        VALUES (@idAnalista, @numerochat, GETDATE(), @nombreEDS)
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
      SELECT TOP 1 a.nombre, a.activo, c.numerochat, c.fecha, c.id, c.nombreEDS
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


const deshacerCaso = async (req, res) => {

  const { idAnalista } = req.body;

  if (!idAnalista) {
    return res.status(400).json({ error: 'idAnalista es obligatorio' });
  }

  const connection = await pool;
  const transaction = new sql.Transaction(connection);

  try {

    await transaction.begin();
    const request = new sql.Request(transaction);

    // Verificar que el analista es el último en cola
    const colaResult = await request
      .input('idA', sql.Int, idAnalista)
      .query(`
        SELECT a.orden,
               (SELECT COUNT(*) FROM analistas WHERE activo = 1) AS total
        FROM analistas a
        WHERE a.id = @idA AND a.activo = 1
      `);

    if (!colaResult.recordset.length) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Analista no encontrado o inactivo' });
    }

    const { orden, total } = colaResult.recordset[0];

    if (orden !== total) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Solo el último en cola puede deshacer' });
    }

    // Subir a todos los demás 1 posición en la cola
    await request
      .input('idA3', sql.Int, idAnalista)
      .query(`
        UPDATE analistas
        SET orden = orden + 1
        WHERE activo = 1 AND id <> @idA3
      `);

    // Poner al analista en primer lugar
    await request
      .input('idA4', sql.Int, idAnalista)
      .query(`UPDATE analistas SET orden = 1 WHERE id = @idA4`);

    await transaction.commit();

    const io = req.app.get("io");
    io.emit("casoDeshacho", { idAnalista });

    res.json({ ok: true });

  } catch (error) {

    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: 'Error al deshacer el caso' });

  }
};


module.exports = {
  tomarCaso,
  getCasos,
  deshacerCaso
};