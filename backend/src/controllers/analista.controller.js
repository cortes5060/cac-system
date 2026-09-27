const { sql, pool } = require('../config/db');
const bcrypt = require('bcryptjs');
const { salirDeCola, entrarACola } = require('../services/colaAnalistas');

const loginAnalista = async (req, res) => {
  try {
    const { id, password } = req.body;
    const connection = await pool;
    const result = await connection.request()
      .input('id', sql.Int, id)
      .query(`SELECT id, nombre, idRol, passwordHash FROM analistas WHERE id = @id AND existe = 1`);

    const ana = result.recordset[0];

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
    const diaHoy = new Date().getDay(); // 0=Domingo...6=Sábado, igual que diaSemana en HorariosDetalle

    const result = await connection.request()
      .input("id", sql.Int, id)
      .input("dia", sql.Int, diaHoy)
      .query(`
        SELECT
          CASE
          WHEN d.HoraEntrada IS NULL THEN 1
          WHEN CAST(GETDATE() AS TIME) BETWEEN d.HoraEntrada AND d.HoraSalida
              AND (d.HoraAlmuerzoInicio IS NULL OR CAST(GETDATE() AS TIME) NOT BETWEEN d.HoraAlmuerzoInicio AND d.HoraAlmuerzoFin)
          THEN 0
          ELSE 1
          END AS puedeInactivarse
          FROM analistas a
          LEFT JOIN HorariosDetalle d ON d.idHorario = a.idhorario AND d.diaSemana = @dia
          WHERE a.id = @id
      `);


    if (result.recordset[0].puedeInactivarse == 0 && activo == 0) {
      return res.status(400).json(
        {
          "bloquear": true
        });
    }

    const io = req.app.get("io");

    if (activo == 1) {
      await entrarACola(connection, id);
    } else {
      const { casosPasadosANoResponde } = await salirDeCola(connection, id);
      if (casosPasadosANoResponde.length) io.emit("casosActualizados");
    }

    io.emit("analistaActualizado", { id, activo });
    res.json({ ok: true });

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
