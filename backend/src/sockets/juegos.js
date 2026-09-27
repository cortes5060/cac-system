const { sql, pool } = require('../config/db');
const juegos = require('../services/juegosState');

// Solo analistas activos (existe=1) o el coordinador pueden postularse
async function jugadorElegible(id) {
  try {
    const db = await pool;
    const r = await db.request()
      .input('id', sql.Int, id)
      .query(`SELECT id, nombre, idRol FROM analistas WHERE id = @id AND existe = 1 AND idRol IN (1, 2)`);
    return r.recordset[0] || null;
  } catch (e) {
    return null;
  }
}

function registrarJuegos(io, socket) {
  socket.on('juego:solicitarEstado', () => {
    socket.emit('juego:estado', juegos.estadoPublico());
  });

  socket.on('juego:postularse', async ({ tipo, id }) => {
    const jugador = await jugadorElegible(id);
    if (!jugador) return socket.emit('juego:error', 'No puedes postularte a los juegos');

    const r = juegos.postularse(tipo, { id: jugador.id, nombre: jugador.nombre, idRol: jugador.idRol });
    if (r.error) return socket.emit('juego:error', r.error);

    socket.data.jugadorId = jugador.id;
    io.emit('juego:estado', juegos.estadoPublico());
  });

  socket.on('juego:salir', ({ tipo, id }) => {
    juegos.salir(tipo, id);
    io.emit('juego:estado', juegos.estadoPublico());
  });

  // Si cierra la app sin darle a "Abandonar", igual liberamos su cupo
  socket.on('disconnect', () => {
    if (socket.data.jugadorId != null && juegos.desconectar(socket.data.jugadorId)) {
      io.emit('juego:estado', juegos.estadoPublico());
    }
  });

  socket.on('juego:jugada', ({ tipo, id, data }) => {
    let r;
    if (tipo === 'triki') r = juegos.jugadaTriki(id, data?.index);
    else if (tipo === 'ppt') r = juegos.jugadaPpt(id, data?.eleccion);
    else if (tipo === 'memoria') r = juegos.jugadaMemoria(id, data?.index);
    else return;

    if (r.error) return socket.emit('juego:error', r.error);

    io.emit('juego:estado', juegos.estadoPublico());

    if (tipo === 'memoria' && r.necesitaResolver) {
      setTimeout(() => {
        const { finalizado } = juegos.resolverParMemoria();
        io.emit('juego:estado', juegos.estadoPublico());
        if (finalizado) {
          setTimeout(() => {
            juegos.promoverCola('memoria');
            io.emit('juego:estado', juegos.estadoPublico());
          }, 4000);
        }
      }, 1200);
    }

    if (tipo === 'ppt' && r.finalizado) {
      setTimeout(() => {
        juegos.promoverCola('ppt');
        io.emit('juego:estado', juegos.estadoPublico());
      }, 4000);
    }

    if (tipo === 'triki' && r.rondaTerminada) {
      if (r.matchFinalizado) {
        setTimeout(() => {
          juegos.promoverCola('triki');
          io.emit('juego:estado', juegos.estadoPublico());
        }, 4000);
      } else {
        setTimeout(() => {
          juegos.siguienteRondaTriki();
          io.emit('juego:estado', juegos.estadoPublico());
        }, 2500);
      }
    }
  });

}

module.exports = { registrarJuegos };
