/* ============================= */
/* TIEMPO MUERTO — MINIJUEGOS    */
/* Compartido entre Coordinador y Dashboard. Se apoya en el `socket` y el      */
/* `API` que cada uno de esos archivos ya declara globalmente.                 */
/* ============================= */

const JUEGO_INFO = {
    triki:   { label: 'Triki',                   icono: '❌', accent: '#2563EB' },
    ppt:     { label: 'Piedra, Papel o Tijera',   icono: '✊', accent: '#EA580C' },
    memoria: { label: 'Memoria',                  icono: '🧠', accent: '#16A34A' },
};
const JUEGO_LABEL = Object.fromEntries(Object.entries(JUEGO_INFO).map(([k, v]) => [k, v.label]));
const AVATAR_PALETE = ['#7C3AED', '#2563EB', '#EA580C', '#16A34A', '#DB2777', '#0891B2', '#C41E3A', '#9333EA'];

// el bundle de Tailwind está recortado a lo que ya se usaba en el resto de la app,
// así que estos estilos se definen aparte
(function inyectarEstilosJuegos() {
    if (document.getElementById('tm-estilos')) return;
    const style = document.createElement('style');
    style.id = 'tm-estilos';
    style.textContent = `
        .tm-header { display:flex; align-items:center; gap:14px; margin-bottom:24px; }
        .tm-header-icon {
            width:46px; height:46px; border-radius:14px; flex-shrink:0;
            background:linear-gradient(135deg,#7C3AED,#4C1D95); display:flex; align-items:center; justify-content:center;
            font-size:22px; box-shadow:0 6px 16px rgba(124,58,237,.35);
        }
        .tm-header h2 { font-size:16px; font-weight:800; color:#1F2937; margin:0; letter-spacing:.02em; }
        .tm-header p { font-size:12px; color:#9CA3AF; margin:2px 0 0; }

        .tm-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        @media (max-width:700px) { .tm-grid { grid-template-columns:1fr; } }

        .tm-card {
            position:relative; border-radius:20px; padding:20px; background:#fff; border:1px solid #E5E7EB;
            cursor:pointer; overflow:hidden; transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
            animation:tm-card-in .35s ease both;
        }
        .tm-card::before {
            content:''; position:absolute; inset:0;
            background:linear-gradient(135deg, color-mix(in srgb, var(--tm-accent) 10%, transparent), transparent 65%);
            pointer-events:none;
        }
        .tm-card:hover { transform:translateY(-3px); box-shadow:0 12px 26px rgba(17,24,39,.09); border-color:var(--tm-accent); }
        .tm-card-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; position:relative; }
        .tm-card-icon {
            width:38px; height:38px; border-radius:12px; display:flex; align-items:center; justify-content:center;
            font-size:18px; background:var(--tm-accent); box-shadow:0 4px 10px rgba(0,0,0,.16);
        }
        .tm-card-title { font-weight:800; font-size:14px; color:#1F2937; margin:0 0 12px; position:relative; }
        .tm-card-players { display:flex; align-items:center; gap:7px; min-height:30px; position:relative; }
        .tm-avatar {
            width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
            color:#fff; font-size:11px; font-weight:800; flex-shrink:0; box-shadow:0 0 0 2px #fff;
        }
        .tm-vs-tag { font-size:10px; font-weight:800; color:#C4C9D4; letter-spacing:.05em; }
        .tm-card-empty { font-size:12px; color:#9CA3AF; font-style:italic; position:relative; }
        .tm-status-pill {
            display:inline-flex; align-items:center; gap:5px; font-size:9.5px; font-weight:800; letter-spacing:.05em;
            padding:4px 9px; border-radius:999px; text-transform:uppercase; position:relative; white-space:nowrap;
        }
        .tm-status-libre { background:#ECFDF5; color:#059669; }
        .tm-status-espera { background:#FFF7ED; color:#C2410C; }
        .tm-status-curso { background:var(--tm-accent); color:#fff; }
        .tm-dot { width:6px; height:6px; border-radius:999px; background:currentColor; flex-shrink:0; }
        .tm-dot-live { animation:tm-pulse-dot 1.3s ease infinite; }
        .tm-card-cola { font-size:11px; color:#9CA3AF; margin:9px 0 0; position:relative; }
        .tm-card-action { margin-top:15px; position:relative; }
        .tm-btn-jugar {
            border:none; color:#fff; font-size:12px; font-weight:700; padding:8px 16px; border-radius:10px;
            background:var(--tm-accent); transition:transform .12s ease, opacity .12s ease; cursor:pointer;
        }
        .tm-btn-jugar:hover { transform:scale(1.05); opacity:.92; }
        .tm-btn-jugar:active { transform:scale(.97); }
        .tm-badge-postulado { font-size:11.5px; font-weight:800; color:var(--tm-accent); display:inline-flex; align-items:center; gap:4px; position:relative; }

        @keyframes tm-pulse-dot { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes tm-card-in { from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:none} }

        /* ── Vista de juego ───────────────────────────────── */
        .tm-scoreboard { display:flex; align-items:center; justify-content:space-between; margin-bottom:22px; gap:10px; }
        .tm-volver, .tm-abandonar-btn { background:none; border:none; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0; }
        .tm-volver { color:#6B7280; }
        .tm-volver:hover { color:#374151; }
        .tm-abandonar-btn { color:#EF4444; }
        .tm-abandonar-btn:hover { color:#B91C1C; }
        .tm-spacer { width:60px; flex-shrink:0; }

        .tm-vs-panel { display:flex; align-items:center; gap:14px; }
        .tm-vs-player { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:70px; transition:transform .2s ease; }
        .tm-avatar-lg {
            width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center;
            color:#fff; font-size:16px; font-weight:800; box-shadow:0 4px 10px rgba(0,0,0,.15); transition:box-shadow .25s ease;
        }
        .tm-vs-player.tm-vs-active .tm-avatar-lg { animation:tm-glow 1.4s ease infinite; }
        .tm-vs-player.tm-vs-active span.tm-vs-name { color:var(--tm-accent); }
        .tm-vs-name { font-size:11px; font-weight:700; color:#6B7280; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tm-vs-score { font-size:15px; font-weight:900; color:#1F2937; }
        .tm-vs-mid { display:flex; flex-direction:column; align-items:center; font-size:18px; color:#D1D5DB; font-weight:900; }
        .tm-vs-mid span { font-size:9px; letter-spacing:.1em; margin-top:-2px; }
        @keyframes tm-glow {
            0%,100% { box-shadow:0 0 0 0 color-mix(in srgb, var(--tm-accent) 55%, transparent), 0 4px 10px rgba(0,0,0,.15); }
            50% { box-shadow:0 0 0 8px color-mix(in srgb, var(--tm-accent) 0%, transparent), 0 4px 10px rgba(0,0,0,.15); }
        }

        .tm-estado-linea { text-align:center; font-size:13px; font-weight:700; color:#6B7280; margin-top:16px; min-height:20px; }
        .tm-estado-linea.tm-estado-ganador { color:var(--tm-accent); }
        .tm-banner-ganador {
            text-align:center; font-size:14px; font-weight:900; color:#fff; margin-top:12px; padding:10px 18px;
            border-radius:14px; background:linear-gradient(135deg, var(--tm-accent), color-mix(in srgb, var(--tm-accent) 60%, black));
            display:inline-block; animation:tm-banner-pop .4s cubic-bezier(.34,1.56,.64,1) both;
            box-shadow:0 8px 20px color-mix(in srgb, var(--tm-accent) 35%, transparent);
        }
        .tm-banner-wrap { text-align:center; }
        @keyframes tm-banner-pop { from{opacity:0; transform:scale(.7)} to{opacity:1; transform:none} }

        /* Triki */
        .tm-triki-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; width:260px; margin:0 auto; }
        .tm-celda {
            aspect-ratio:1/1; border-radius:16px; background:#F8FAFC; border:2px solid #E5E7EB;
            display:flex; align-items:center; justify-content:center; transition:background .15s ease, border-color .15s ease;
        }
        .tm-celda.tm-clic { cursor:pointer; }
        .tm-celda.tm-clic:hover { background:#EEF2FF; border-color:#C7D2FE; }
        .tm-celda.tm-ganadora { background:color-mix(in srgb, var(--tm-accent) 14%, white); border-color:var(--tm-accent); }
        .tm-ficha { font-size:30px; font-weight:900; animation:tm-pop .25s cubic-bezier(.34,1.56,.64,1) both; }
        .tm-ficha-x { color:#2563EB; }
        .tm-ficha-o { color:#DC2626; }
        .tm-img-contain { width:44px; height:44px; object-fit:contain; animation:tm-pop .25s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes tm-pop { from{transform:scale(0)} to{transform:scale(1)} }

        /* Piedra, papel o tijera */
        .tm-ppt-fila { display:flex; gap:14px; justify-content:center; }
        .tm-ppt-btn {
            width:66px; height:66px; border-radius:20px; border:2px solid #FED7AA; background:#fff; font-size:28px;
            display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform .12s ease, border-color .15s ease, background .15s ease;
        }
        .tm-ppt-btn:not(:disabled):hover { border-color:#EA580C; background:#FFF7ED; transform:translateY(-2px); }
        .tm-ppt-btn:not(:disabled):active { transform:scale(.93); }
        .tm-ppt-btn:disabled { opacity:.35; cursor:default; }
        .tm-ppt-espera { text-align:center; font-size:12px; color:#9CA3AF; margin-top:10px; }
        .tm-ppt-espera .tm-dot-live { display:inline-block; }
        .tm-ronda-hist { text-align:center; font-size:11.5px; color:#9CA3AF; margin-top:14px; }
        .tm-ronda-hist b { color:#374151; }

        /* Memoria */
        .tm-memoria-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; width:100%; max-width:380px; margin:0 auto; }
        .tm-carta {
            border-radius:14px; border:2px solid #E5E7EB; background:#F3F4F6; overflow:hidden;
            display:flex; align-items:center; justify-content:center; transition:transform .15s ease, border-color .15s ease, background .15s ease;
            transform-style:preserve-3d;
        }
        .tm-carta.tm-clickable { cursor:pointer; }
        .tm-carta.tm-clickable:hover { background:#E5E7EB; transform:translateY(-2px); }
        .tm-carta.tm-carta-visible { border-color:#16A34A; background:#F0FDF4; animation:tm-flip .35s ease both; }
        .tm-carta.tm-carta-ok { border-color:#16A34A; background:#ECFDF5; opacity:.55; }
        @keyframes tm-flip { from{transform:rotateY(90deg)} to{transform:rotateY(0)} }
        .tm-img-cover { width:100%; height:100%; object-fit:cover; }
        .tm-carta-signo { color:#9CA3AF; font-size:20px; font-weight:700; }

        .tm-vacio { text-align:center; padding:56px 0; color:#9CA3AF; font-size:13px; }
        .tm-vacio-icono { font-size:34px; margin-bottom:10px; display:block; }
    `;
    document.head.appendChild(style);
})();

let _estadoJuegos = null;
let _juegoAbierto = null;
let _tmContenedorId = null;

function _miIdJuego() {
    if (typeof coordId !== 'undefined' && coordId) return parseInt(coordId);
    if (typeof idActual !== 'undefined' && idActual) return parseInt(idActual);
    return null;
}

function _colorAvatar(id) {
    return AVATAR_PALETE[Math.abs(Number(id) || 0) % AVATAR_PALETE.length];
}

function _avatarChip(jugador) {
    const inicial = (jugador.nombre || '?').charAt(0).toUpperCase();
    return `<div class="tm-avatar" style="background:${_colorAvatar(jugador.id)}" title="${escapeHtmlJuego(jugador.nombre)}">${inicial}</div>`;
}

if (typeof socket !== 'undefined') {
    socket.on('juego:estado', (estado) => {
        _estadoJuegos = estado;
        _pintarTiempoMuerto();
    });
    socket.on('juego:error', (msg) => {
        if (typeof mostrarAviso === 'function') mostrarAviso(msg);
    });
}

function abrirTiempoMuerto(contenedorId) {
    _tmContenedorId = contenedorId;
    _juegoAbierto = null;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const c = document.getElementById(contenedorId);
    if (!c) return;
    c.innerHTML = `<div id="tm_root" class="fade-in"></div>`;
    if (typeof socket !== 'undefined') socket.emit('juego:solicitarEstado');
    _pintarTiempoMuerto();
}

function _pintarTiempoMuerto() {
    const root = document.getElementById('tm_root');
    if (!root) return;

    if (!_estadoJuegos) {
        root.innerHTML = '<div class="tm-vacio">Cargando...</div>';
        return;
    }

    if (_juegoAbierto) {
        root.innerHTML = _pintarJuego(_juegoAbierto);
        return;
    }

    root.innerHTML = `
        <div class="tm-header">
            <div class="tm-header-icon">🎮</div>
            <div>
                <h2>Tiempo muerto</h2>
                <p>Postúlate a un juego — todos pueden ver la partida en vivo</p>
            </div>
        </div>
        <div class="tm-grid">
            ${Object.keys(JUEGO_INFO).map(tipo => _tarjetaJuego(tipo)).join('')}
        </div>`;
}

function _tarjetaJuego(tipo) {
    const info = JUEGO_INFO[tipo];
    const e = _estadoJuegos[tipo];
    const miId = _miIdJuego();
    const soyJugador = e.jugadores.some(j => j.id === miId);
    const enCola = e.cola.some(j => j.id === miId);

    let pill, jugadoresHtml;
    if (e.jugadores.length === 2) {
        pill = `<span class="tm-status-pill tm-status-curso"><span class="tm-dot tm-dot-live"></span>En vivo</span>`;
        jugadoresHtml = `${_avatarChip(e.jugadores[0])}<span class="tm-vs-tag">VS</span>${_avatarChip(e.jugadores[1])}`;
    } else if (e.jugadores.length === 1) {
        pill = `<span class="tm-status-pill tm-status-espera"><span class="tm-dot"></span>Esperando</span>`;
        jugadoresHtml = `${_avatarChip(e.jugadores[0])}<span class="tm-card-empty">espera rival</span>`;
    } else {
        pill = `<span class="tm-status-pill tm-status-libre"><span class="tm-dot"></span>Libre</span>`;
        jugadoresHtml = `<span class="tm-card-empty">Nadie está jugando</span>`;
    }

    return `
        <div class="tm-card" style="--tm-accent:${info.accent}" onclick="_abrirJuego('${tipo}')">
            <div class="tm-card-top">
                <div class="tm-card-icon">${info.icono}</div>
                ${pill}
            </div>
            <p class="tm-card-title">${info.label}</p>
            <div class="tm-card-players">${jugadoresHtml}</div>
            ${e.cola.length ? `<p class="tm-card-cola">⏳ ${e.cola.length} en cola</p>` : ''}
            <div class="tm-card-action">
                ${soyJugador || enCola
                    ? `<span class="tm-badge-postulado">✓ Estás postulado</span>`
                    : `<button onclick="event.stopPropagation(); _postularseJuego('${tipo}')" class="tm-btn-jugar">Postularme</button>`}
            </div>
        </div>`;
}

function _abrirJuego(tipo) {
    _juegoAbierto = tipo;
    _pintarTiempoMuerto();
}

function _cerrarJuego() {
    _juegoAbierto = null;
    _pintarTiempoMuerto();
}

function _postularseJuego(tipo) {
    socket.emit('juego:postularse', { tipo, id: _miIdJuego() });
}

function _salirJuego(tipo) {
    socket.emit('juego:salir', { tipo, id: _miIdJuego() });
}

function escapeHtmlJuego(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function _pintarJuego(tipo) {
    const info = JUEGO_INFO[tipo];
    const e = _estadoJuegos[tipo];
    const miId = _miIdJuego();
    const soyJugador = e.jugadores.some(j => j.id === miId);

    if (e.jugadores.length < 2) {
        const esperando = e.jugadores[0];
        return `
            <div class="tm-scoreboard" style="--tm-accent:${info.accent}">
                <button onclick="_cerrarJuego()" class="tm-volver">← Volver</button>
                <h2 style="font-size:14px;font-weight:800;color:#1F2937;margin:0">${info.label}</h2>
                ${soyJugador ? `<button onclick="_salirJuego('${tipo}')" class="tm-abandonar-btn">Abandonar</button>` : '<span class="tm-spacer"></span>'}
            </div>
            <div class="tm-vacio">
                <span class="tm-vacio-icono">${info.icono}</span>
                ${esperando ? `${escapeHtmlJuego(esperando.nombre)} está esperando un rival...` : 'Esperando jugadores...'}
            </div>`;
    }

    let cuerpo, marcadorTxt;
    if (tipo === 'triki') { cuerpo = _tableroTriki(e, miId, soyJugador); marcadorTxt = e.partida.marcador; }
    else if (tipo === 'ppt') { cuerpo = _tableroPpt(e, miId, soyJugador); marcadorTxt = e.partida.marcador; }
    else { cuerpo = _tableroMemoria(e, miId, soyJugador); marcadorTxt = e.partida.puntaje; }

    const turnoIdx = e.partida.turno;

    return `
        <div class="tm-scoreboard" style="--tm-accent:${info.accent}">
            <button onclick="_cerrarJuego()" class="tm-volver">← Volver</button>
            <div class="tm-vs-panel">
                <div class="tm-vs-player ${turnoIdx === 0 ? 'tm-vs-active' : ''}">
                    <div class="tm-avatar-lg" style="background:${_colorAvatar(e.jugadores[0].id)}">${e.jugadores[0].nombre.charAt(0).toUpperCase()}</div>
                    <span class="tm-vs-name">${escapeHtmlJuego(e.jugadores[0].nombre)}</span>
                    <span class="tm-vs-score">${marcadorTxt[0]}</span>
                </div>
                <div class="tm-vs-mid">${info.icono}<span>VS</span></div>
                <div class="tm-vs-player ${turnoIdx === 1 ? 'tm-vs-active' : ''}">
                    <div class="tm-avatar-lg" style="background:${_colorAvatar(e.jugadores[1].id)}">${e.jugadores[1].nombre.charAt(0).toUpperCase()}</div>
                    <span class="tm-vs-name">${escapeHtmlJuego(e.jugadores[1].nombre)}</span>
                    <span class="tm-vs-score">${marcadorTxt[1]}</span>
                </div>
            </div>
            ${soyJugador ? `<button onclick="_salirJuego('${tipo}')" class="tm-abandonar-btn">Abandonar</button>` : '<span class="tm-spacer"></span>'}
        </div>
        <div style="--tm-accent:${info.accent}">${cuerpo}</div>`;
}

/* ── Triki ─────────────────────────────────────────────────── */

const LINEAS_TRIKI = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function _lineaGanadoraTriki(tablero) {
    for (const linea of LINEAS_TRIKI) {
        const [a, b, c] = linea;
        if (tablero[a] !== null && tablero[a] === tablero[b] && tablero[b] === tablero[c]) return linea;
    }
    return [];
}

function _fichaTriki(valor) {
    if (valor === null) return '';
    const src = valor === 0 ? 'img/juegos/ficha-x.png' : 'img/juegos/ficha-o.png';
    const texto = valor === 0 ? 'X' : 'O';
    const clase = valor === 0 ? 'tm-ficha-x' : 'tm-ficha-o';
    return `<img src="${src}" class="tm-img-contain"
                onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${texto}',className:'tm-ficha ${clase}'}))"/>`;
}

function _tableroTriki(e, miId, soyJugador) {
    const p = e.partida;
    const idxYo = e.jugadores.findIndex(j => j.id === miId);
    const miTurno = soyJugador && p.turno === idxYo && p.ganadorRonda === null;
    const lineaGanadora = p.ganadorRonda !== null && p.ganadorRonda !== 'EMPATE' ? _lineaGanadoraTriki(p.tablero) : [];

    const celdas = p.tablero.map((val, i) => {
        const clickable = miTurno && val === null;
        const ganadora = lineaGanadora.includes(i);
        return `<div class="tm-celda ${clickable ? 'tm-clic' : ''} ${ganadora ? 'tm-ganadora' : ''}"
                     ${clickable ? `onclick="_jugarTriki(${i})"` : ''}>${_fichaTriki(val)}</div>`;
    }).join('');

    return `
        <div class="tm-triki-grid">${celdas}</div>
        <p class="tm-estado-linea ${p.ganadorRonda !== null ? 'tm-estado-ganador' : ''}">
            ${p.ganadorRonda === null
                ? (miTurno ? '🎯 Tu turno' : `Turno de ${escapeHtmlJuego(e.jugadores[p.turno].nombre)}`)
                : p.ganadorRonda === 'EMPATE' ? '🤝 Empate en esta ronda' : `Ronda para ${escapeHtmlJuego(e.jugadores[p.ganadorRonda].nombre)}`}
        </p>
        ${p.ganador !== null ? `<div class="tm-banner-wrap"><span class="tm-banner-ganador">🏆 ¡Ganó ${escapeHtmlJuego(e.jugadores[p.ganador].nombre)}! (mejor de 3)</span></div>` : ''}`;
}

function _jugarTriki(index) {
    socket.emit('juego:jugada', { tipo: 'triki', id: _miIdJuego(), data: { index } });
}

/* ── Piedra, Papel o Tijera ───────────────────────────────────*/

const _OPCIONES_PPT = [['PIEDRA', '✊'], ['PAPEL', '✋'], ['TIJERA', '✌️']];

function _tableroPpt(e, miId, soyJugador) {
    const p = e.partida;
    const idxYo = e.jugadores.findIndex(j => j.id === miId);
    const yaElegi = soyJugador && p.haEligido[idxYo];
    const ultimaRonda = p.historial[p.historial.length - 1];

    return `
        ${soyJugador && p.ganador === null ? `
            <div class="tm-ppt-fila">
                ${_OPCIONES_PPT.map(([val, emoji]) => `
                    <button ${yaElegi ? 'disabled' : ''} onclick="_jugarPpt('${val}')" class="tm-ppt-btn">${emoji}</button>`).join('')}
            </div>
            ${yaElegi ? '<p class="tm-ppt-espera"><span class="tm-dot tm-dot-live">●</span> Esperando al rival...</p>' : ''}
        ` : p.ganador === null ? `<p class="tm-ppt-espera">${p.haEligido.filter(Boolean).length}/2 ya eligieron esta ronda</p>` : ''}

        ${ultimaRonda ? `
            <p class="tm-ronda-hist">
                Última ronda: <b>${ultimaRonda.elecciones[0]}</b> vs <b>${ultimaRonda.elecciones[1]}</b>
                — ${ultimaRonda.ganadorRonda === null ? 'empate' : `ganó ${escapeHtmlJuego(e.jugadores[ultimaRonda.ganadorRonda].nombre)}`}
            </p>` : ''}

        ${p.ganador !== null ? `<div class="tm-banner-wrap"><span class="tm-banner-ganador">🏆 ¡Ganó ${escapeHtmlJuego(e.jugadores[p.ganador].nombre)}! (mejor de 3)</span></div>` : ''}`;
}

function _jugarPpt(eleccion) {
    socket.emit('juego:jugada', { tipo: 'ppt', id: _miIdJuego(), data: { eleccion } });
}

/* ── Memoria ───────────────────────────────────────────────── */

function _tableroMemoria(e, miId, soyJugador) {
    const p = e.partida;
    const idxYo = e.jugadores.findIndex(j => j.id === miId);
    const miTurno = soyJugador && p.turno === idxYo && !p.bloqueado && p.ganador === null;

    const cartas = p.mazo.map((valor, i) => {
        const visible = valor !== null;
        const encontrada = p.encontradas.includes(i);
        const clickable = miTurno && !visible;
        const contenido = visible
            ? `<img src="img/juegos/memoria-${valor + 1}.jpg" class="tm-img-cover"
                   onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${valor + 1}',className:'tm-carta-signo'}))"/>`
            : '<span class="tm-carta-signo">?</span>';
        const clase = encontrada ? 'tm-carta-ok' : visible ? 'tm-carta-visible' : (clickable ? 'tm-clickable' : '');
        return `<div class="tm-carta ${clase}" style="aspect-ratio:1/1" ${clickable ? `onclick="_jugarMemoria(${i})"` : ''}>${contenido}</div>`;
    }).join('');

    return `
        <div class="tm-memoria-grid">${cartas}</div>
        <p class="tm-estado-linea ${p.ganador !== null ? 'tm-estado-ganador' : ''}">
            ${p.ganador === null
                ? (miTurno ? '🎯 Tu turno' : `Turno de ${escapeHtmlJuego(e.jugadores[p.turno].nombre)}`)
                : p.ganador === 'EMPATE' ? '🤝 Empate' : `Ronda para ${escapeHtmlJuego(e.jugadores[p.ganador].nombre)}`}
        </p>
        ${p.ganador !== null ? `<div class="tm-banner-wrap"><span class="tm-banner-ganador">🏆 ¡Ganó ${escapeHtmlJuego(e.jugadores[p.ganador].nombre)}!</span></div>` : ''}`;
}

function _jugarMemoria(index) {
    socket.emit('juego:jugada', { tipo: 'memoria', id: _miIdJuego(), data: { index } });
}
