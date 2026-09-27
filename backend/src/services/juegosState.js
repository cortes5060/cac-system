// Estado de "Tiempo muerto" — todo en memoria (RAM), nada se guarda en base de
// datos. Si el servidor se reinicia, se pierde el estado y no pasa nada.

const TIPOS = ['triki', 'ppt', 'memoria'];
const LINEAS_TRIKI = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

const estado = {};
for (const t of TIPOS) estado[t] = { jugadores: [], cola: [], partida: null };

function nuevoTriki() {
  return { tablero: Array(9).fill(null), turno: 0, primerTurno: 0, ganadorRonda: null, marcador: [0, 0], ganador: null };
}

// Empieza una ronda nueva dentro de la misma partida (mejor de 3), alternando
// quién sale primero. Se llama con delay después de que se ve el resultado
// de la ronda anterior, para no borrar el tablero de golpe.
function siguienteRondaTriki() {
  const e = estado.triki;
  if (!e.partida) return;
  e.partida.tablero = Array(9).fill(null);
  e.partida.ganadorRonda = null;
  e.partida.primerTurno = e.partida.primerTurno === 0 ? 1 : 0;
  e.partida.turno = e.partida.primerTurno;
}

function nuevoPpt() {
  return { elecciones: [null, null], marcador: [0, 0], historial: [], ganador: null };
}

function nuevoMemoria() {
  const mazo = [];
  for (let i = 0; i < 8; i++) mazo.push(i, i);
  for (let i = mazo.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return { mazo, volteadas: [], encontradas: [], turno: 0, puntaje: [0, 0], bloqueado: false, ganador: null };
}

function iniciarPartida(tipo) {
  const e = estado[tipo];
  if (tipo === 'triki') e.partida = nuevoTriki();
  else if (tipo === 'ppt') e.partida = nuevoPpt();
  else if (tipo === 'memoria') e.partida = nuevoMemoria();
}

function jugadorOcupadoEn(idJugador) {
  for (const t of TIPOS) {
    const e = estado[t];
    if (e.jugadores.some(j => j.id === idJugador)) return t;
    if (e.cola.some(j => j.id === idJugador)) return t;
  }
  return null;
}

function promoverCola(tipo) {
  const e = estado[tipo];
  e.jugadores = e.cola.splice(0, 2);
  e.partida = null;
  if (e.jugadores.length === 2) iniciarPartida(tipo);
}

function postularse(tipo, jugador) {
  if (!TIPOS.includes(tipo)) return { error: 'Juego inválido' };
  const ocupadoEn = jugadorOcupadoEn(jugador.id);
  if (ocupadoEn) return { error: `Ya estás postulado en ${ocupadoEn === 'ppt' ? 'Piedra, Papel o Tijera' : ocupadoEn === 'triki' ? 'Triki' : 'Memoria'}` };

  const e = estado[tipo];
  if (e.jugadores.length < 2) {
    e.jugadores.push(jugador);
    if (e.jugadores.length === 2) iniciarPartida(tipo);
  } else {
    e.cola.push(jugador);
  }
  return { ok: true };
}

function salir(tipo, idJugador) {
  if (!TIPOS.includes(tipo)) return;
  const e = estado[tipo];
  const idx = e.jugadores.findIndex(j => j.id === idJugador);
  if (idx !== -1) {
    e.jugadores.splice(idx, 1);
    e.partida = null;
    if (e.cola.length) e.jugadores.push(e.cola.shift());
    if (e.jugadores.length === 2) iniciarPartida(tipo);
  } else {
    e.cola = e.cola.filter(j => j.id !== idJugador);
  }
}

function jugadaTriki(idJugador, index) {
  const e = estado.triki;
  if (!e.partida || e.partida.ganadorRonda !== null) return { error: 'No hay partida activa' };
  const idx = e.jugadores.findIndex(j => j.id === idJugador);
  if (idx === -1) return { error: 'No eres jugador de esta partida' };
  if (e.partida.turno !== idx) return { error: 'No es tu turno' };
  if (typeof index !== 'number' || index < 0 || index > 8 || e.partida.tablero[index] !== null) {
    return { error: 'Movimiento inválido' };
  }

  e.partida.tablero[index] = idx;
  const t = e.partida.tablero;
  const gano = LINEAS_TRIKI.some(([a, b, c]) => t[a] !== null && t[a] === t[b] && t[b] === t[c]);

  let rondaTerminada = false;
  if (gano) {
    e.partida.ganadorRonda = idx;
    e.partida.marcador[idx]++;
    rondaTerminada = true;
    if (e.partida.marcador[idx] === 2) e.partida.ganador = idx;
  } else if (t.every(c => c !== null)) {
    e.partida.ganadorRonda = 'EMPATE';
    rondaTerminada = true;
  } else {
    e.partida.turno = idx === 0 ? 1 : 0;
  }

  return { ok: true, rondaTerminada, matchFinalizado: e.partida.ganador !== null };
}

function jugadaPpt(idJugador, eleccion) {
  const e = estado.ppt;
  if (!e.partida || e.partida.ganador !== null) return { error: 'No hay partida activa' };
  const idx = e.jugadores.findIndex(j => j.id === idJugador);
  if (idx === -1) return { error: 'No eres jugador de esta partida' };
  if (!['PIEDRA', 'PAPEL', 'TIJERA'].includes(eleccion)) return { error: 'Elección inválida' };
  if (e.partida.elecciones[idx]) return { error: 'Ya elegiste en esta ronda' };

  e.partida.elecciones[idx] = eleccion;
  const [e1, e2] = e.partida.elecciones;
  let finalizado = false;

  if (e1 && e2) {
    let ganadorRonda;
    if (e1 === e2) ganadorRonda = null;
    else if (
      (e1 === 'PIEDRA' && e2 === 'TIJERA') ||
      (e1 === 'PAPEL' && e2 === 'PIEDRA') ||
      (e1 === 'TIJERA' && e2 === 'PAPEL')
    ) ganadorRonda = 0;
    else ganadorRonda = 1;

    e.partida.historial.push({ elecciones: [e1, e2], ganadorRonda });
    if (ganadorRonda !== null) e.partida.marcador[ganadorRonda]++;
    e.partida.elecciones = [null, null];

    if (e.partida.marcador[0] === 2 || e.partida.marcador[1] === 2) {
      e.partida.ganador = e.partida.marcador[0] === 2 ? 0 : 1;
      finalizado = true;
    }
  }
  return { ok: true, finalizado };
}

function jugadaMemoria(idJugador, index) {
  const e = estado.memoria;
  if (!e.partida || e.partida.ganador !== null) return { error: 'No hay partida activa' };
  if (e.partida.bloqueado) return { error: 'Espera un momento' };
  const idx = e.jugadores.findIndex(j => j.id === idJugador);
  if (idx === -1) return { error: 'No eres jugador de esta partida' };
  if (e.partida.turno !== idx) return { error: 'No es tu turno' };
  if (typeof index !== 'number' || index < 0 || index > 15) return { error: 'Carta inválida' };
  if (e.partida.encontradas.includes(index) || e.partida.volteadas.includes(index)) return { error: 'Carta ya usada' };
  if (e.partida.volteadas.length >= 2) return { error: 'Espera un momento' };

  e.partida.volteadas.push(index);
  const necesitaResolver = e.partida.volteadas.length === 2;
  if (necesitaResolver) e.partida.bloqueado = true;
  return { ok: true, necesitaResolver };
}

// Se llama con un pequeño delay después de voltear la segunda carta, para que
// se alcancen a ver ambas antes de ocultarlas si no hicieron pareja.
function resolverParMemoria() {
  const e = estado.memoria;
  if (!e.partida || e.partida.volteadas.length !== 2) return { finalizado: false };

  const [i1, i2] = e.partida.volteadas;
  const esPareja = e.partida.mazo[i1] === e.partida.mazo[i2];

  if (esPareja) {
    e.partida.encontradas.push(i1, i2);
    e.partida.puntaje[e.partida.turno]++;
  } else {
    e.partida.turno = e.partida.turno === 0 ? 1 : 0;
  }
  e.partida.volteadas = [];
  e.partida.bloqueado = false;

  let finalizado = false;
  if (e.partida.encontradas.length === e.partida.mazo.length) {
    e.partida.ganador = e.partida.puntaje[0] === e.partida.puntaje[1]
      ? 'EMPATE'
      : (e.partida.puntaje[0] > e.partida.puntaje[1] ? 0 : 1);
    finalizado = true;
  }
  return { finalizado };
}

function estadoPublico() {
  const out = {};
  for (const t of TIPOS) {
    const e = estado[t];
    out[t] = { jugadores: e.jugadores, cola: e.cola, partida: null };
    if (!e.partida) continue;

    if (t === 'triki') {
      out[t].partida = {
        tablero: e.partida.tablero,
        turno: e.partida.turno,
        marcador: e.partida.marcador,
        ganadorRonda: e.partida.ganadorRonda,
        ganador: e.partida.ganador,
      };
    } else if (t === 'ppt') {
      out[t].partida = {
        haEligido: e.partida.elecciones.map(x => !!x),
        marcador: e.partida.marcador,
        historial: e.partida.historial,
        ganador: e.partida.ganador,
      };
    } else if (t === 'memoria') {
      const mazoVisible = e.partida.mazo.map((valor, i) =>
        (e.partida.encontradas.includes(i) || e.partida.volteadas.includes(i)) ? valor : null
      );
      out[t].partida = {
        mazo: mazoVisible,
        encontradas: e.partida.encontradas,
        volteadas: e.partida.volteadas,
        turno: e.partida.turno,
        puntaje: e.partida.puntaje,
        ganador: e.partida.ganador,
        bloqueado: e.partida.bloqueado,
      };
    }
  }
  return out;
}

// Limpia cualquier rastro de un jugador desconectado (por ejemplo si cierra la
// app sin darle a "Abandonar") para que no bloquee el cupo indefinidamente.
function desconectar(idJugador) {
  const tipo = jugadorOcupadoEn(idJugador);
  if (tipo) salir(tipo, idJugador);
  return tipo;
}

module.exports = {
  TIPOS, postularse, salir, desconectar,
  jugadaTriki, siguienteRondaTriki, jugadaPpt, jugadaMemoria, resolverParMemoria,
  promoverCola, estadoPublico,
};
