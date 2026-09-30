/* API se carga desde config.js */
const socket = io(API);

// guard
const coordId     = localStorage.getItem('coordId');
const coordNombre = localStorage.getItem('coordNombre');

if (!coordId) {
    window.location.href = 'index.html';
}

const sonidoAlertaCoordinador = new Audio('sonidos/alerta-coordinador.mp3');
function reproducirSonidoAlertaCoordinador() {
    sonidoAlertaCoordinador.currentTime = 0;
    sonidoAlertaCoordinador.play().catch(err => console.warn('No se pudo reproducir el sonido de alerta:', err));
}

// el backend manda hora local con "Z" como si fuera UTC, así que se parsea el texto tal cual
function formatearFechaCruda(f) {
    const m = String(f).match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return '—';
    const [, y, mo, d, h, mi] = m;
    const h12 = (+h % 12) || 12;
    const ampm = +h < 12 ? 'a. m.' : 'p. m.';
    return `${d}/${mo}/${y}, ${String(h12).padStart(2, '0')}:${mi} ${ampm}`;
}

window.addEventListener('load', () => {
    document.getElementById('coordNombre').textContent = coordNombre || '';
    initSidebar();
    cargarAlertas();
});

const VISTAS = [
    { id: 'analistas',          label: 'Analistas',              icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { id: 'orden',               label: 'Orden de Cola',           icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' },
    { id: 'casos-vivos',         label: 'Casos en Vivo',           icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
    { id: 'buscar',              label: 'Historial 3CX',           icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
    { id: 'desconexiones',      label: 'Desconexión Supervisada', icon: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>' },
    { id: 'horarios',            label: 'Horarios',                icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
    { id: 'grupos',              label: 'Grupos de Colaboradores', icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
    { id: 'importar',            label: 'Importar Tickets',        icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
    { id: 'importar-clientes',   label: 'Importar Clientes',       icon: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>' },
];
const VISTA_STORAGE_KEY = 'coordinadorVistaActiva';

function initSidebar() {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = VISTAS.map(v => `
        <div class="nav-item" data-target="${v.id}" onclick="activarTab('${v.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${v.icon}</svg>
            ${v.label}
        </div>
    `).join('');

    let inicial = 'analistas';
    try {
        const guardada = localStorage.getItem(VISTA_STORAGE_KEY);
        if (guardada && VISTAS.some(v => v.id === guardada)) inicial = guardada;
    } catch (e) {}
    activarTab(inicial);
}

function activarTab(tipo) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.target === tipo));
    try { localStorage.setItem(VISTA_STORAGE_KEY, tipo); } catch (e) {}
    mostrarSeccion(tipo);
}

function cerrarSesion() {
    localStorage.removeItem('coordId');
    localStorage.removeItem('coordNombre');
    window.location.href = 'index.html';
}

function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}

/* ============================= */
/* ALERTAS                       */
/* ============================= */

const TIPO_ALERTA_META = {
    CASO_INACTIVO:          { label: 'Caso 3CX sin respuesta', color: '#C41E3A' },
    DESCONEXION_PENDIENTE:  { label: 'Salida de cola pendiente', color: '#EA580C' },
    ANALISTA_AUSENTE:       { label: 'Fuera de la cola 3CX',  color: '#7C3AED' },
    CASOS_ACUMULADOS:       { label: 'Casos 3CX acumulados',  color: '#1565C0' },
    CASO_DIA_ANTERIOR:      { label: 'Caso 3CX de día anterior', color: '#B45309' },
};

let _alertasPanelAbierto = false;
let _alertasCantidadPrevia = 0;

socket.on('nuevaAlerta', cargarAlertas);

async function cargarAlertas() {
    try {
        const alertas = await fetch(`${API}/api/coordinador/alertas`).then(r => r.json());
        renderAlertasBadge(alertas.length);
        renderAlertasLista(alertas);
    } catch (e) {}
}

function renderAlertasBadge(n) {
    const badge = document.getElementById('alertasBadge');
    const dot = document.getElementById('alertasBadgeDot');
    const btn = document.getElementById('alertasBtn');
    if (!badge || !dot) return;
    badge.hidden = n === 0;
    dot.textContent = n > 99 ? '99+' : String(n);
    if (n > _alertasCantidadPrevia && btn) {
        btn.classList.remove('ringing');
        void btn.offsetWidth;
        btn.classList.add('ringing');
        reproducirSonidoAlertaCoordinador();
    }
    _alertasCantidadPrevia = n;
}

function renderAlertasLista(alertas) {
    const cont = document.getElementById('alertasLista');
    if (!cont) return;
    if (!alertas.length) {
        cont.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Sin alertas activas</p>';
        return;
    }
    cont.innerHTML = alertas.map(a => {
        const meta = TIPO_ALERTA_META[a.tipo] || { label: a.tipo, color: '#64748B' };
        return `
            <div class="px-5 py-3 border-b border-gray-50 flex items-start gap-3">
                <div class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style="background:${meta.color}"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-bold uppercase tracking-wide" style="color:${meta.color}">${escapeHtml(meta.label)}</p>
                    <p class="text-sm text-gray-700 leading-snug">${escapeHtml(a.mensaje)}</p>
                    <p class="text-[11px] text-gray-400 mt-0.5">${formatearFechaCruda(a.creadaEn)}</p>
                </div>
                <button onclick="resolverAlertaUI(${a.id})" title="Descartar"
                    class="text-gray-300 hover:text-gray-500 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>`;
    }).join('');
}

async function resolverAlertaUI(id) {
    try {
        await fetch(`${API}/api/coordinador/alertas/${id}/resolver`, { method: 'PUT' });
        cargarAlertas();
    } catch (e) {}
}

function toggleAlertasPanel() {
    _alertasPanelAbierto = !_alertasPanelAbierto;
    document.getElementById('alertasPanel').hidden = !_alertasPanelAbierto;
}

document.addEventListener('click', (e) => {
    const panel = document.getElementById('alertasPanel');
    const btn = document.getElementById('alertasBtn');
    if (!panel || panel.hidden) return;
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
        panel.hidden = true;
        _alertasPanelAbierto = false;
    }
});

/* ============================= */
/* DESCONEXIÓN SUPERVISADA       */
/* ============================= */

const ESTADO_DESC = {
    PENDIENTE:  { bg: '#FFF7ED', text: '#C2410C', label: 'Pendiente' },
    APROBADA:   { bg: '#ECFDF5', text: '#047857', label: 'Aprobada · trabajando' },
    RECHAZADA:  { bg: '#FEF2F2', text: '#B91C1C', label: 'Rechazada' },
    FINALIZADA: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Finalizada' },
};

socket.on('desconexionSolicitada', () => { if (document.getElementById('desc_tabla')) cargarDesconexiones(); });
socket.on('desconexionResuelta',   () => { if (document.getElementById('desc_tabla')) cargarDesconexiones(); });
socket.on('desconexionFinalizada', () => { if (document.getElementById('desc_tabla')) cargarDesconexiones(); });

async function seccionDesconexiones(c) {
    c.innerHTML = `
        <div class="fade-in">
            ${seccionHeader('Desconexión Supervisada', '#EA580C')}
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5 bg-gray-50 border border-gray-200 rounded-2xl p-4 items-end">
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Desde</label>
                    <input id="desc_desde" type="date"
                        class="w-full border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 transition"/>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Hasta</label>
                    <input id="desc_hasta" type="date"
                        class="w-full border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 transition"/>
                </div>
                <button onclick="cargarDesconexiones()" style="background:#EA580C;color:#fff"
                    class="text-sm font-semibold px-4 py-2.5 rounded-xl transition hover:opacity-90">Buscar</button>
                <button onclick="limpiarFiltroDesconexiones()"
                    class="text-gray-500 hover:text-gray-700 text-sm font-medium px-2 py-2.5">Limpiar</button>
            </div>
            <p id="desc_titulo" class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Últimas 10 solicitudes</p>
            <div id="desc_tabla"></div>
        </div>`;

    cargarDesconexiones();
}

function limpiarFiltroDesconexiones() {
    document.getElementById('desc_desde').value = '';
    document.getElementById('desc_hasta').value = '';
    cargarDesconexiones();
}

async function cargarDesconexiones() {
    const desde = document.getElementById('desc_desde')?.value || '';
    const hasta = document.getElementById('desc_hasta')?.value || '';
    const div = document.getElementById('desc_tabla');
    if (!div) return;

    const titulo = document.getElementById('desc_titulo');
    if (titulo) titulo.textContent = (desde || hasta) ? 'Solicitudes en el rango elegido' : 'Últimas 10 solicitudes';

    let qs = [];
    if (desde) qs.push(`desde=${desde}`);
    if (hasta) qs.push(`hasta=${hasta}`);

    try {
        const r = await fetch(`${API}/api/coordinador/desconexiones?${qs.join('&')}`);
        const lista = await r.json();
        renderTablaDesconexiones(lista);
    } catch (error) {
        console.error('Error cargando desconexiones:', error);
        div.innerHTML = '<div class="text-center py-10 text-gray-600 text-sm">Error cargando datos</div>';
    }
}

function renderTablaDesconexiones(lista) {
    const div = document.getElementById('desc_tabla');
    if (!div) return;

    if (!lista?.length) {
        div.innerHTML = '<div class="text-center py-10 text-gray-600 text-sm">Sin solicitudes en este rango</div>';
        return;
    }

    div.innerHTML = `
        <table class="w-full rounded-xl overflow-hidden border border-gray-100" style="table-layout:fixed">
            <colgroup>
                <col style="width:4%"><col style="width:16%"><col style="width:28%">
                <col style="width:15%"><col style="width:15%"><col style="width:22%">
            </colgroup>
            <thead><tr style="background:#122B4F">
                ${['#', 'Analista', 'Motivo', 'Solicitado', 'Estado', 'Acciones']
                    .map(x => `<th class="px-4 py-3 text-left text-blue-200 text-xs font-bold uppercase tracking-wide">${x}</th>`).join('')}
            </tr></thead>
            <tbody class="bg-white divide-y divide-gray-100">
                ${lista.map((s, i) => {
                    const e = ESTADO_DESC[s.estado] || { bg: '#F3F4F6', text: '#4B5563', label: s.estado };
                    return `
                    <tr class="hover:bg-gray-50 transition">
                        <td class="px-4 py-2.5 text-gray-600 font-mono">${i + 1}</td>
                        <td class="px-4 py-2.5 font-medium text-gray-800 truncate">${escapeHtml(s.nombre)}</td>
                        <td class="px-4 py-2.5 text-gray-600 truncate" title="${escapeHtml(s.motivo)}">${escapeHtml(s.motivo)}</td>
                        <td class="px-4 py-2.5 text-gray-600 text-xs">${formatearFechaCruda(s.solicitadoEn)}</td>
                        <td class="px-4 py-2.5">
                            <span style="background:${e.bg};color:${e.text}" class="text-xs font-semibold px-2.5 py-1 rounded-full">${e.label}</span>
                        </td>
                        <td class="px-4 py-2.5">
                            ${s.estado === 'PENDIENTE' ? `
                                <div style="display:flex;gap:6px">
                                    <button onclick="resolverDesconexion(${s.id}, true)"
                                        style="background:#16A34A;color:#fff" class="text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition">Aprobar</button>
                                    <button onclick="resolverDesconexion(${s.id}, false)"
                                        style="background:#DC2626;color:#fff" class="text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition">Rechazar</button>
                                </div>` : s.estado === 'APROBADA' ? `
                                <button onclick="finalizarDesconexionCoordinador(${s.id})"
                                    style="background:#1D4ED8;color:#fff" class="text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition">Finalizar</button>
                                ` : '<span class="text-gray-400 text-xs">—</span>'}
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

async function resolverDesconexion(idSolicitud, aprobar) {
    try {
        const r = await fetch(`${API}/api/coordinador/desconexiones/${idSolicitud}/resolver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aprobar, idCoordinador: Number(coordId) })
        });
        if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            mostrarAviso(data.error || 'No se pudo resolver la solicitud');
            return;
        }
        cargarDesconexiones();
    } catch (error) {
        console.error('Error resolviendo desconexión supervisada:', error);
    }
}

async function finalizarDesconexionCoordinador(idSolicitud) {
    try {
        const r = await fetch(`${API}/api/coordinador/desconexiones/${idSolicitud}/finalizar`, { method: 'POST' });
        if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            mostrarAviso(data.error || 'No se pudo finalizar la desconexión');
            return;
        }
        cargarDesconexiones();
    } catch (error) {
        console.error('Error finalizando desconexión supervisada:', error);
    }
}

// router
async function mostrarSeccion(tipo) {
    const c = document.getElementById('tabContenido');
    if (_casosVivosTimer && tipo !== 'casos-vivos') { clearInterval(_casosVivosTimer); _casosVivosTimer = null; }
    if (tipo === 'analistas')     await seccionAnalistas(c);
    else if (tipo === 'grupos')   await seccionGrupos(c);
    else if (tipo === 'desconexiones') await seccionDesconexiones(c);
    else if (tipo === 'orden')    await seccionOrden(c);
    else if (tipo === 'horarios') await seccionHorarios(c);
    else if (tipo === 'buscar')   await seccionBuscar(c);
    else if (tipo === 'casos-vivos') await seccionCasosVivos(c);
    else if (tipo === 'importar')           await seccionImportar(c);
    else if (tipo === 'importar-clientes') await seccionImportarClientes(c);
}

// helpers
function seccionHeader(titulo, colorHex) {
    return `
        <div class="flex items-center gap-2 mb-5">
            <div class="w-1 h-5 rounded-full" style="background:${colorHex}"></div>
            <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">${titulo}</h2>
        </div>`;
}

function cargando(c) {
    c.innerHTML = '<div class="text-gray-600 text-sm text-center py-14">Cargando...</div>';
}

function errorHtml(c) {
    c.innerHTML = '<div class="text-red-500 text-sm text-center py-14">Error al cargar los datos.</div>';
}

function modalConfirm(titulo, msg, onOk) {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 fade-in';
    m.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-96 mx-4 overflow-hidden">
            <div class="px-8 py-5" style="background:#C41E3A">
                <h2 class="text-white text-lg font-bold">${titulo}</h2>
            </div>
            <div class="p-8">
                <p class="text-gray-600 text-sm mb-6">${msg}</p>
                <div class="flex gap-3">
                    <button onclick="this.closest('.fixed').remove()"
                        class="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">
                        Cancelar
                    </button>
                    <button id="_okBtn"
                        class="flex-1 py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-red">
                        Confirmar
                    </button>
                </div>
            </div>
        </div>`;
    m.querySelector('#_okBtn').addEventListener('click', async () => { m.remove(); await onOk(); });
    document.body.appendChild(m);
}

function mostrarAviso(msg, titulo = 'Aviso') {
    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 fade-in';
    m.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-96 mx-4 overflow-hidden">
            <div class="px-8 py-5" style="background:#122B4F">
                <h2 class="text-white text-lg font-bold">${escapeHtml(titulo)}</h2>
            </div>
            <div class="p-8">
                <p class="text-gray-600 text-sm mb-6">${escapeHtml(msg)}</p>
                <button onclick="this.closest('.fixed').remove()"
                    class="w-full py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition" style="background:#122B4F">
                    Entendido
                </button>
            </div>
        </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
}

function notif(elId, texto, tipo) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = texto;
    el.className = `text-sm font-medium ${tipo === 'ok' ? 'text-green-600' : 'text-red-500'}`;
    setTimeout(() => { el.textContent = ''; }, 3000);
}

// ANALISTAS
async function seccionAnalistas(c) {
    cargando(c);
    try {
        const data = await fetch(`${API}/api/coordinador/analistas`).then(r => r.json());

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Gestión de Analistas', '#1565C0')}

                <div class="overflow-x-auto rounded-xl border border-gray-200">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Estado</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Pos. Cola</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            ${data.map(a => `
                            <tr class="hover:bg-gray-50 transition text-sm">
                                <td class="px-5 py-3.5">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style="background:#122B4F">
                                            ${a.nombre.charAt(0).toUpperCase()}
                                        </div>
                                        <span class="font-semibold text-gray-800">${a.nombre}</span>
                                    </div>
                                </td>
                                <td class="px-5 py-3.5">
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${a.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                                        <span class="w-1.5 h-1.5 rounded-full ${a.activo ? 'bg-green-500' : 'bg-gray-400'}"></span>
                                        ${a.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td class="px-5 py-3.5 font-mono text-xs text-gray-600">
                                    ${a.activo && a.orden > 0 ? '#' + a.orden : '—'}
                                </td>
                                <td class="px-5 py-3.5">
                                    <div class="flex gap-2">
                                        <button onclick="toggleAnalista(${a.id}, ${a.activo ? 0 : 1})"
                                            class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition
                                            ${a.activo
                                                ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200'
                                                : 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200'}">
                                            ${a.activo ? 'Inactivar' : 'Activar'}
                                        </button>
                                        <button onclick="abrirModalPasswordAnalista(${a.id}, '${a.nombre.replace(/'/g, "\\'")}', ${a.tienePassword ? 1 : 0})"
                                            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition">
                                            ${a.tienePassword ? 'Cambiar clave' : 'Asignar clave'}
                                        </button>
                                        <button onclick="pedirEliminar(${a.id}, '${a.nombre.replace(/'/g, "\\'")}')"
                                            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition">
                                            Eliminar
                                        </button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch { errorHtml(c); }
}

let _gruposColaborador = [];

async function seccionGrupos(c) {
    cargando(c);
    try {
        const [grupos, analistas] = await Promise.all([
            fetch(`${API}/api/coordinador/grupos-colaborador`).then(r => r.json()),
            fetch(`${API}/api/coordinador/analistas-todos`).then(r => r.json()),
        ]);

        _gruposColaborador = grupos;
        const porGrupo = {};
        analistas.forEach(a => {
            const key = a.idGrupoColaborador || 0;
            (porGrupo[key] = porGrupo[key] || []).push(a.nombre);
        });

        const opcionesGrupo = (idActual) => `
            <option value="">Sin grupo</option>
            ${grupos.map(g => `<option value="${g.id}" ${g.id === idActual ? 'selected' : ''}>${escapeHtml(g.nombre)}</option>`).join('')}
        `;

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Grupos de Colaboradores', '#1565C0')}

                <div class="flex flex-wrap items-end gap-3 mb-5 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nuevo grupo de colaboradores</label>
                        <input id="nuevo-grupo-nombre" type="text" placeholder="Ej. Mesa de Ayuda"
                            class="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition w-64"
                            onkeydown="if(event.key==='Enter') crearGrupoColaborador()">
                    </div>
                    <button onclick="crearGrupoColaborador()"
                        class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">Crear grupo</button>
                </div>

                <p class="section-title mb-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Resumen por grupo</p>
                <div class="overflow-x-auto rounded-xl border border-gray-200 mb-6">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Grupo</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analistas en el grupo</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            ${grupos.length ? grupos.map(g => `
                            <tr class="hover:bg-gray-50 transition text-sm">
                                <td class="px-5 py-3.5 font-semibold text-gray-800 align-top whitespace-nowrap">${escapeHtml(g.nombre)}</td>
                                <td class="px-5 py-3.5 text-gray-600">${(porGrupo[g.id] || []).map(n => escapeHtml(n)).join(', ') || '—'}</td>
                            </tr>`).join('') : `
                            <tr><td colspan="2" class="px-5 py-8 text-center text-gray-500 text-sm">Todavía no hay grupos registrados</td></tr>`}
                            ${porGrupo[0]?.length ? `
                            <tr class="hover:bg-gray-50 transition text-sm">
                                <td class="px-5 py-3.5 font-semibold text-gray-400 align-top whitespace-nowrap">Sin grupo</td>
                                <td class="px-5 py-3.5 text-gray-600">${porGrupo[0].map(n => escapeHtml(n)).join(', ')}</td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>

                <p class="section-title mb-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Asignar grupo por analista</p>
                <div class="overflow-x-auto rounded-xl border border-gray-200">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Grupo de colaboradores</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            ${analistas.map(a => `
                            <tr class="hover:bg-gray-50 transition text-sm">
                                <td class="px-5 py-3.5 font-semibold text-gray-800">${escapeHtml(a.nombre)}</td>
                                <td class="px-5 py-3.5">
                                    <select onchange="cambiarGrupoAnalista(${a.id}, this.value)"
                                        class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                                        ${opcionesGrupo(a.idGrupoColaborador)}
                                    </select>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch { errorHtml(c); }
}

async function crearGrupoColaborador() {
    const input = document.getElementById('nuevo-grupo-nombre');
    const nombre = input?.value.trim();
    if (!nombre) { mostrarAviso('Escribe un nombre para el grupo'); return; }

    try {
        const r = await fetch(`${API}/api/coordinador/grupos-colaborador`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        const data = await r.json();
        if (!r.ok) { mostrarAviso(data.error || 'No se pudo crear el grupo'); return; }
        activarTab('grupos');
    } catch (error) {
        console.error('Error creando grupo de colaboradores:', error);
        mostrarAviso('Error creando el grupo');
    }
}

function recargarSeccionActual() {
    const activo = document.querySelector('.nav-item.active')?.dataset.target;
    if (activo) activarTab(activo);
}

async function cambiarGrupoAnalista(id, idGrupo) {
    try {
        const r = await fetch(`${API}/api/coordinador/analistas/${id}/grupo`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idGrupo: idGrupo || null })
        });
        if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            mostrarAviso(data.error || 'No se pudo asignar el grupo');
        }
        recargarSeccionActual();
    } catch (error) {
        console.error('Error asignando grupo:', error);
        mostrarAviso('Error asignando el grupo');
        recargarSeccionActual();
    }
}

async function toggleAnalista(id, nuevoEstado) {
    try {
        const res = await fetch(`${API}/api/coordinador/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: nuevoEstado })
        });
        if (!res.ok) throw new Error();
        await seccionAnalistas(document.getElementById('tabContenido'));
    } catch {
        mostrarAviso('Error al cambiar el estado.');
    }
}

function abrirModalPasswordAnalista(id, nombre, tienePassword) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 fade-in';
    modal.id = 'modal-password-analista';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-96 mx-4 overflow-hidden">
            <div class="px-8 py-6" style="background: linear-gradient(135deg, #122B4F, #1565C0)">
                <div class="text-blue-200 text-xs font-bold tracking-widest uppercase mb-1">
                    ${tienePassword ? 'Cambiar contraseña' : 'Asignar contraseña'}
                </div>
                <h2 class="text-white text-xl font-bold">${nombre}</h2>
            </div>
            <div class="p-8">
                <p class="text-gray-500 text-sm mb-5">
                    ${tienePassword
                        ? 'Se reemplaza la contraseña actual. No necesitas saber la anterior.'
                        : 'Este analista todavía no tiene contraseña configurada.'}
                </p>
                <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Nueva contraseña</label>
                <input type="password" id="nuevaPasswordAnalista" placeholder="Mínimo 4 caracteres"
                    class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition mb-1"
                    onkeypress="if(event.key==='Enter') confirmarPasswordAnalista(${id})"/>
                <p id="passwordAnalistaError" class="text-red-500 text-xs mb-5 hidden"></p>
                <div class="flex gap-3 mt-5">
                    <button onclick="document.getElementById('modal-password-analista').remove()"
                        class="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">
                        Cancelar
                    </button>
                    <button id="btnConfirmarPasswordAnalista" onclick="confirmarPasswordAnalista(${id})"
                        class="flex-1 py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
                        style="background: linear-gradient(135deg, #122B4F, #1565C0)">
                        Guardar
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('nuevaPasswordAnalista')?.focus(), 80);
}

async function confirmarPasswordAnalista(id) {
    const input = document.getElementById('nuevaPasswordAnalista');
    const btn   = document.getElementById('btnConfirmarPasswordAnalista');
    const error = document.getElementById('passwordAnalistaError');
    const password = input?.value || '';

    if (password.length < 4) {
        error.textContent = 'La contraseña debe tener al menos 4 caracteres';
        error.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    error.classList.add('hidden');

    try {
        const res = await fetch(`${API}/api/coordinador/analistas/${id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo guardar la contraseña');

        document.getElementById('modal-password-analista')?.remove();
        await seccionAnalistas(document.getElementById('tabContenido'));
    } catch (e) {
        error.textContent = e.message || 'Error al guardar la contraseña';
        error.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
}

function pedirEliminar(id, nombre) {
    modalConfirm(
        `¿Eliminar a ${nombre}?`,
        'El analista quedará desactivado y no aparecerá en el sistema. Los datos históricos se conservan.',
        async () => {
            const res = await fetch(`${API}/api/coordinador/${id}`, { method: 'DELETE' });
            if (res.ok) await seccionAnalistas(document.getElementById('tabContenido'));
            else mostrarAviso('Error al eliminar.');
        }
    );
}

// ORDEN DE COLA
let _ordenLocal = [];

async function seccionOrden(c) {
    cargando(c);
    try {
        const data = await fetch(`${API}/api/coordinador/analistas`).then(r => r.json());
        _ordenLocal = data
            .filter(a => a.activo == 1)
            .sort((a, b) => a.orden - b.orden);
        renderOrden(c);
    } catch { errorHtml(c); }
}

function renderOrden(c) {
    if (!_ordenLocal.length) {
        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Orden de Atención', '#C41E3A')}
                <div class="text-center py-12 text-gray-600 text-sm">No hay analistas activos en la cola.</div>
            </div>`;
        return;
    }

    c.innerHTML = `
        <div class="fade-in">
            <div class="flex items-center justify-between mb-5">
                <div class="flex items-center gap-2">
                    <div class="w-1 h-5 rounded-full" style="background:#C41E3A"></div>
                    <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Orden de Atención</h2>
                </div>
                <div class="flex items-center gap-3">
                    <span id="orden_msg" class="text-sm font-medium"></span>
                    <button onclick="guardarOrden()"
                        class="px-5 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-green">
                        Guardar Orden
                    </button>
                </div>
            </div>
            <div class="space-y-2 max-w-lg">
                ${_ordenLocal.map((a, i) => `
                <div class="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-3.5 hover:border-blue-200 transition">
                    <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style="background:${i === 0 ? '#C41E3A' : '#1565C0'}">${i + 1}</span>
                    <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                        ${a.nombre.charAt(0).toUpperCase()}
                    </div>
                    <span class="font-semibold text-gray-800 flex-1 text-sm">${a.nombre}</span>
                    ${i === 0 ? '<span class="text-xs font-bold px-2 py-1 rounded-full text-white" style="background:#C41E3A">▶ Próximo</span>' : ''}
                    <div class="flex gap-1">
                        <button onclick="moverArriba(${i})" ${i === 0 ? 'disabled' : ''}
                            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-25">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                        </button>
                        <button onclick="moverAbajo(${i})" ${i === _ordenLocal.length - 1 ? 'disabled' : ''}
                            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-25">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
}

function moverArriba(i) {
    if (i === 0) return;
    [_ordenLocal[i - 1], _ordenLocal[i]] = [_ordenLocal[i], _ordenLocal[i - 1]];
    renderOrden(document.getElementById('tabContenido'));
}

function moverAbajo(i) {
    if (i === _ordenLocal.length - 1) return;
    [_ordenLocal[i], _ordenLocal[i + 1]] = [_ordenLocal[i + 1], _ordenLocal[i]];
    renderOrden(document.getElementById('tabContenido'));
}

async function guardarOrden() {
    const ordenes = _ordenLocal.map((a, i) => ({ id: a.id, orden: i + 1 }));
    try {
        const res = await fetch(`${API}/api/coordinador/analistas/orden`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ordenes })
        });
        if (!res.ok) throw new Error();
        notif('orden_msg', '✓ Orden guardado', 'ok');
    } catch {
        notif('orden_msg', '✗ Error al guardar', 'err');
    }
}

// HORARIOS

function fmt(val) {
    if (!val) return '--:--';
    return String(val).substring(0, 5);
}

const DIAS_SEMANA = [
    { n: 1, label: 'Lunes',     corto: 'L' },
    { n: 2, label: 'Martes',    corto: 'M' },
    { n: 3, label: 'Miércoles', corto: 'X' },
    { n: 4, label: 'Jueves',    corto: 'J' },
    { n: 5, label: 'Viernes',   corto: 'V' },
    { n: 6, label: 'Sábado',    corto: 'S' },
    { n: 0, label: 'Domingo',   corto: 'D' },
];

let _horariosCache = [];

async function seccionHorarios(c) {
    cargando(c);
    try {
        const [analistas, horarios] = await Promise.all([
            fetch(`${API}/api/coordinador/analistas-horarios`).then(r => r.json()),
            fetch(`${API}/api/coordinador/horarios`).then(r => r.json())
        ]);
        _horariosCache = horarios;

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Horarios', '#1565C0')}

                <div class="flex items-center justify-between mb-4">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plantillas de horario</p>
                    <button onclick="abrirModalHorario()"
                        class="text-xs font-semibold px-4 py-2 rounded-xl text-white hover:opacity-90 transition btn-navy">
                        + Nuevo horario
                    </button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-9">
                    ${horarios.length ? horarios.map(h => tarjetaHorario(h)).join('')
                        : `<div class="col-span-full text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                               Todavía no hay horarios creados
                           </div>`}
                </div>

                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Asignación por analista</p>
                <div class="overflow-x-auto rounded-xl border border-gray-200">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Hoy</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase w-64">Horario asignado</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            ${analistas.map(a => `
                            <tr class="hover:bg-gray-50 transition text-sm" id="hor-row-${a.id}">
                                <td class="px-5 py-3.5">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style="background:#122B4F">
                                            ${a.nombre.charAt(0).toUpperCase()}
                                        </div>
                                        <span class="font-semibold text-gray-800">${a.nombre}</span>
                                    </div>
                                </td>
                                <td class="px-5 py-3.5 text-xs">
                                    ${a.HoraEntradaHoy
                                        ? `<span class="font-bold text-gray-800">${fmt(a.HoraEntradaHoy)} – ${fmt(a.HoraSalidaHoy)}</span>`
                                        : a.idhorario
                                            ? '<span class="text-gray-400 italic">Libre hoy</span>'
                                            : '<span class="text-gray-400 italic">Sin horario</span>'}
                                </td>
                                <td class="px-5 py-3.5">
                                    <select id="sel-hor-${a.id}"
                                        class="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition">
                                        <option value="">— Sin horario —</option>
                                        ${horarios.map(h =>
                                            `<option value="${h.id}" ${h.id === a.idhorario ? 'selected' : ''}>${escapeHtml(h.nombre)}</option>`
                                        ).join('')}
                                    </select>
                                </td>
                                <td class="px-5 py-3.5">
                                    <button onclick="guardarHorario(${a.id})"
                                        class="px-4 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition btn-navy">
                                        Guardar
                                    </button>
                                    <span id="msg-hor-${a.id}" class="block text-xs font-medium mt-1"></span>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch { errorHtml(c); }
}

function tarjetaHorario(h) {
    const porDia = {};
    (h.detalle || []).forEach(d => { porDia[d.diaSemana] = d; });

    const chips = DIAS_SEMANA.map(dia => {
        const d = porDia[dia.n];
        const trabaja = d && d.HoraEntrada;
        return `
            <div class="flex-1 flex flex-col items-center gap-1">
                <span class="w-full h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition"
                    style="${trabaja ? 'background:#1565C0;color:#fff' : 'background:#F1F5F9;color:#94A3B8'}"
                    title="${dia.label}${trabaja ? `: ${fmt(d.HoraEntrada)}–${fmt(d.HoraSalida)}` : ': libre'}">
                    ${dia.corto}
                </span>
            </div>`;
    }).join('');

    return `
        <div class="border border-gray-200 rounded-2xl p-4 bg-white hover:shadow-md hover:-translate-y-0.5 transition">
            <div class="flex items-start justify-between mb-3.5">
                <p class="font-bold text-gray-800 text-sm leading-tight pr-2">${escapeHtml(h.nombre)}</p>
                <div class="flex gap-1 flex-shrink-0">
                    <button onclick="abrirModalHorario(${h.id})" title="Editar"
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button onclick="eliminarHorario(${h.id})" title="Eliminar"
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="flex gap-1">${chips}</div>
        </div>`;
}

function fmtTimeInput(val) {
    if (!val) return '';
    return String(val).substring(0, 5);
}

function abrirModalHorario(id) {
    const h = id ? _horariosCache.find(x => x.id === id) : null;
    const porDia = {};
    (h?.detalle || []).forEach(d => { porDia[d.diaSemana] = d; });

    const m = document.createElement('div');
    m.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 fade-in p-4';
    m.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div class="px-8 py-5 flex-shrink-0" style="background:linear-gradient(135deg,#0F1E38,#1B3A66)">
                <h2 class="text-white text-lg font-bold">${h ? 'Editar horario' : 'Nuevo horario'}</h2>
            </div>
            <div class="p-8 overflow-y-auto">
                <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nombre del horario</label>
                <input id="hor_nombre" type="text" value="${h ? escapeHtml(h.nombre) : ''}" placeholder="Ej. Turno Mañana"
                    class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"/>

                <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Bloques por día</p>
                <div class="space-y-2">
                    ${DIAS_SEMANA.map(dia => {
                        const d = porDia[dia.n];
                        const libre = !d || !d.HoraEntrada;
                        return `
                        <div class="flex flex-wrap items-center gap-2 border border-gray-100 rounded-xl px-3 py-2.5">
                            <span class="w-20 text-xs font-bold text-gray-700 flex-shrink-0">${dia.label}</span>
                            <label class="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0 cursor-pointer select-none">
                                <input type="checkbox" id="hor_libre_${dia.n}" ${libre ? 'checked' : ''} onchange="toggleDiaLibre(${dia.n})" class="rounded">
                                Libre
                            </label>
                            <div id="hor_campos_${dia.n}" class="flex flex-wrap gap-1.5 flex-1 ${libre ? 'opacity-40 pointer-events-none' : ''}">
                                <input type="time" id="hor_entrada_${dia.n}" value="${fmtTimeInput(d?.HoraEntrada)}" title="Entrada"
                                    class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-[92px] focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                                <input type="time" id="hor_salida_${dia.n}" value="${fmtTimeInput(d?.HoraSalida)}" title="Salida"
                                    class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-[92px] focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                                <input type="time" id="hor_almi_${dia.n}" value="${fmtTimeInput(d?.HoraAlmuerzoInicio)}" title="Almuerzo inicio"
                                    class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-[92px] focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                                <input type="time" id="hor_almf_${dia.n}" value="${fmtTimeInput(d?.HoraAlmuerzoFin)}" title="Almuerzo fin"
                                    class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-[92px] focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <p id="hor_error" class="text-xs font-medium text-red-500 mt-4 hidden"></p>
            </div>
            <div class="px-8 py-5 flex gap-3 border-t border-gray-100 flex-shrink-0">
                <button onclick="this.closest('.fixed').remove()"
                    class="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">
                    Cancelar
                </button>
                <button onclick="guardarPlantillaHorario(${h ? h.id : 'null'})"
                    class="flex-1 py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-navy">
                    ${h ? 'Guardar cambios' : 'Crear horario'}
                </button>
            </div>
        </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
}

function toggleDiaLibre(dia) {
    const chk = document.getElementById(`hor_libre_${dia}`);
    const campos = document.getElementById(`hor_campos_${dia}`);
    campos.classList.toggle('opacity-40', chk.checked);
    campos.classList.toggle('pointer-events-none', chk.checked);
}

async function guardarPlantillaHorario(id) {
    const nombre = document.getElementById('hor_nombre').value.trim();
    const errorEl = document.getElementById('hor_error');
    errorEl.classList.add('hidden');

    if (!nombre) {
        errorEl.textContent = 'El nombre es obligatorio';
        errorEl.classList.remove('hidden');
        return;
    }

    const detalle = DIAS_SEMANA.map(dia => {
        const libre = document.getElementById(`hor_libre_${dia.n}`).checked;
        if (libre) return { diaSemana: dia.n, libre: true };
        return {
            diaSemana: dia.n, libre: false,
            horaEntrada: document.getElementById(`hor_entrada_${dia.n}`).value,
            horaSalida: document.getElementById(`hor_salida_${dia.n}`).value,
            horaAlmuerzoInicio: document.getElementById(`hor_almi_${dia.n}`).value || null,
            horaAlmuerzoFin: document.getElementById(`hor_almf_${dia.n}`).value || null,
        };
    });

    const diasConHorario = detalle.filter(d => !d.libre);
    if (!diasConHorario.length) {
        errorEl.textContent = 'Debes definir al menos un día trabajado';
        errorEl.classList.remove('hidden');
        return;
    }
    for (const d of diasConHorario) {
        if (!d.horaEntrada || !d.horaSalida) {
            errorEl.textContent = 'Completa hora de entrada y salida en los días que no son libres';
            errorEl.classList.remove('hidden');
            return;
        }
    }

    try {
        const res = await fetch(`${API}/api/coordinador/horarios${id ? '/' + id : ''}`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, detalle })
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.error || 'Error al guardar';
            errorEl.classList.remove('hidden');
            return;
        }
        document.querySelector('.fixed.inset-0')?.remove();
        activarTab('horarios');
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.remove('hidden');
    }
}

async function eliminarHorario(id) {
    modalConfirm('Eliminar horario', '¿Seguro que quieres eliminar este horario? Esta acción no se puede deshacer.', async () => {
        try {
            const res = await fetch(`${API}/api/coordinador/horarios/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) { mostrarAviso(data.error || 'No se pudo eliminar'); return; }
            activarTab('horarios');
        } catch (e) { mostrarAviso('Error de conexión'); }
    });
}

// BUSCAR CASOS

let _buscarTimer = null;

let _busAnalistas = [];
let _busEDS = [];

// Filtro de búsqueda de casos: campo de texto/fecha en una fila, clasificación
// (selects) en otra, separadas por un rótulo — evita que se vea como una sola
// maraña de 8 campos idénticos.
function _busInyectarEstilos() {
    if (document.getElementById('bus-estilos')) return;
    const style = document.createElement('style');
    style.id = 'bus-estilos';
    style.textContent = `
        .bus-fila { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .bus-fila-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        @media (max-width: 1100px) { .bus-fila-5 { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 860px) { .bus-fila, .bus-fila-5 { grid-template-columns: repeat(2, 1fr); } }
        .bus-rotulo {
            font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
            color: #9CA3AF; margin: 18px 0 10px; padding-top: 14px; border-top: 1px solid #E5E7EB;
        }
        .bus-fila:first-of-type + .bus-rotulo, .bus-panel > .bus-rotulo:first-child { margin-top: 0; padding-top: 0; border-top: none; }
    `;
    document.head.appendChild(style);
}

function _busCampo(label, inputHtml) {
    return `<div><label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">${label}</label>${inputHtml}</div>`;
}

const _busInputCls = 'w-full border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition';
const _busSelectCls = 'w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition';

async function seccionBuscar(c) {
    cargando(c);
    try {
        [_busAnalistas, _busEDS] = await Promise.all([
            fetch(`${API}/api/coordinador/analistas`).then(r => r.json()),
            fetch(`${API}/api/coordinador/eds-tickets`).then(r => r.json()),
        ]);
        _busInyectarEstilos();

        c.innerHTML = `
        <div class="fade-in">
            ${seccionHeader('Historial 3CX', '#1565C0')}
            <div class="bus-panel bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-4">
                <div class="bus-rotulo">Búsqueda</div>
                <div class="bus-fila-5">
                    ${_busCampo('Número de Chat', `<input id="bus_numero" type="text" inputmode="numeric" placeholder="Ej. 123456789" class="${_busInputCls}"/>`)}
                    ${_busCampo('Ticket 2WD', `<input id="bus_ticket_numero" type="text" placeholder="Ej. 2WD-123456" class="${_busInputCls}"/>`)}
                    ${_busCampo('EDS', `
                        <select id="bus_eds" onchange="ejecutarBusqueda()" class="${_busSelectCls}">
                            <option value="">Todas</option>
                            ${_busEDS.map(e => `<option value="${escapeHtml(e.nombre)}">${escapeHtml(e.nombre)}</option>`).join('')}
                        </select>`)}
                    ${_busCampo('Fecha Inicio', `<input id="bus_fecha_ini" type="date" class="${_busInputCls}"/>`)}
                    ${_busCampo('Fecha Fin', `<input id="bus_fecha_fin" type="date" class="${_busInputCls}"/>`)}
                </div>

                <div class="bus-rotulo">Clasificación</div>
                <div class="bus-fila">
                    ${_busCampo('Tipo', `
                        <select id="bus_tipo" onchange="ejecutarBusqueda()" class="${_busSelectCls}">
                            <option value="">Chats y llamadas</option>
                            <option value="CHAT">Solo chats</option>
                            <option value="LLAMADA">Solo llamadas</option>
                        </select>`)}
                    ${_busCampo('Analista', `
                        <select id="bus_analista" onchange="ejecutarBusqueda()" class="${_busSelectCls}">
                            <option value="">Todos</option>
                            ${_busAnalistas.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('')}
                        </select>`)}
                    ${_busCampo('Estado', `
                        <select id="bus_estado" onchange="ejecutarBusqueda()" class="${_busSelectCls}">
                            <option value="">Todos</option>
                            <option value="ACTIVO">Responde</option>
                            <option value="INACTIVO">No responde</option>
                            <option value="FINALIZADO">Cerrado</option>
                        </select>`)}
                    ${_busCampo('Ticket 2WD', `
                        <select id="bus_ticket" onchange="ejecutarBusqueda()" class="${_busSelectCls}">
                            <option value="">Con y sin ticket</option>
                            <option value="si">Solo con ticket</option>
                            <option value="no">Solo sin ticket</option>
                        </select>`)}
                </div>

                <div class="text-right mt-4">
                    <button onclick="limpiarBusqueda()" class="text-xs font-semibold text-gray-500 hover:text-gray-700">Limpiar filtros</button>
                </div>
            </div>
            <div id="bus_resultados">
                <div class="text-center py-10 text-gray-600 text-sm">Escribe algo o elige un filtro para buscar</div>
            </div>
        </div>`;

        const debounce = () => {
            clearTimeout(_buscarTimer);
            _buscarTimer = setTimeout(ejecutarBusqueda, 350);
        };

        document.getElementById('bus_numero').addEventListener('input', debounce);
        document.getElementById('bus_ticket_numero').addEventListener('input', debounce);
        document.getElementById('bus_fecha_ini').addEventListener('change', ejecutarBusqueda);
        document.getElementById('bus_fecha_fin').addEventListener('change', ejecutarBusqueda);
    } catch { errorHtml(c); }
}

function limpiarBusqueda() {
    ['bus_numero', 'bus_ticket_numero', 'bus_fecha_ini', 'bus_fecha_fin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['bus_eds', 'bus_tipo', 'bus_analista', 'bus_estado', 'bus_ticket'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ejecutarBusqueda();
}

async function ejecutarBusqueda() {
    const numero    = document.getElementById('bus_numero')?.value.trim();
    const ticketNumero = document.getElementById('bus_ticket_numero')?.value.trim();
    const eds       = document.getElementById('bus_eds')?.value.trim();
    const fechaIni  = document.getElementById('bus_fecha_ini')?.value;
    const fechaFin  = document.getElementById('bus_fecha_fin')?.value;
    const tipo      = document.getElementById('bus_tipo')?.value;
    const analista  = document.getElementById('bus_analista')?.value;
    const estado    = document.getElementById('bus_estado')?.value;
    const ticket    = document.getElementById('bus_ticket')?.value;
    const div       = document.getElementById('bus_resultados');
    if (!div) return;

    const hayFiltro = numero || ticketNumero || eds || fechaIni || fechaFin || tipo || analista || estado || ticket;
    if (!hayFiltro) {
        div.innerHTML = '<div class="text-center py-10 text-gray-600 text-sm">Escribe algo o elige un filtro para buscar</div>';
        return;
    }

    div.innerHTML = '<div class="text-center py-6 text-gray-600 text-sm">Buscando...</div>';

    const qs = new URLSearchParams();
    if (numero)       qs.set('numero', numero);
    if (ticketNumero) qs.set('ticketNumero', ticketNumero);
    if (eds)          qs.set('nombreeds', eds);
    if (fechaIni)  qs.set('fechaini', fechaIni);
    if (fechaFin)  qs.set('fechafin', fechaFin);
    if (tipo)      qs.set('tipo', tipo);
    if (analista)  qs.set('idAnalista', analista);
    if (estado)    qs.set('estado', estado);
    if (ticket)    qs.set('conTicket', ticket);

    try {
        const data = await fetch(`${API}/api/coordinador/casos?${qs}`).then(r => r.json());

        if (!data.length) {
            div.innerHTML = '<div class="text-center py-10 text-gray-600 text-sm">Sin resultados</div>';
            return;
        }

        div.innerHTML = `
            <div class="overflow-x-auto rounded-xl border border-gray-200">
                <table class="min-w-full text-sm">
                    <thead>
                        <tr style="background:#122B4F">
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Caso</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">EDS</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Estado</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Ejecución</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Ticket 2WD</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Categoría</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                        ${data.map(c => `
                            <tr class="hover:bg-blue-50 transition">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-2">${_cvBadgeTipo(c.tipo)}<span class="font-bold text-gray-800">${escapeHtml(c.numerochat)}</span></div>
                                    <div class="text-xs text-gray-600 mt-0.5">#${c.id} · ${formatearFechaCruda(c.fecha)}</div>
                                </td>
                                <td class="px-4 py-3 ${c.ticketEDS ? 'text-gray-700' : 'text-gray-400 italic'}">${escapeHtml(c.ticketEDS) || 'Sin ticket'}</td>
                                <td class="px-4 py-3 text-gray-700">${escapeHtml(c.nombre)}</td>
                                <td class="px-4 py-3">${_cvBadgeEstado(c.estado)}</td>
                                <td class="px-4 py-3 font-mono text-gray-800">${c.segEjec ? _cvFormatearDuracion(c.segEjec) : '—'}</td>
                                <td class="px-4 py-3 ${c.ticketReferencia2WD ? 'text-gray-700' : 'text-gray-400 italic'}">${escapeHtml(c.ticketReferencia2WD) || 'Sin ticket'}</td>
                                <td class="px-4 py-3 text-gray-600">${escapeHtml(c.categoria) || '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                <div class="px-4 py-2 text-xs text-gray-600 bg-gray-50 border-t border-gray-100">
                    ${data.length} resultado${data.length !== 1 ? 's' : ''}
                </div>
            </div>`;
    } catch {
        div.innerHTML = '<div class="text-center py-10 text-red-400 text-sm">Error al buscar</div>';
    }
}

// CASOS EN VIVO — se arma en el frontend con endpoints que ya existen: la lista de
// analistas y, por cada uno, /api/casos/mis/:id (el mismo que usa "Mis Casos" del
// analista), filtrando acá los que ya están FINALIZADO. No hay endpoint nuevo en el backend.

let _casosVivosData = [];
let _casosVivosCargadoEn = 0;
let _casosVivosTimer = null;
let _cvFiltroTipo = 'CHAT';
let _cvFiltroAnalista = '';
let _cvFiltroEstado = 'abiertos';
const CV_UMBRAL_ALERTA_SEG = 3600; // 1 hora

function _cvFormatearDuracion(seg) {
    seg = Math.max(0, Math.floor(seg));
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function _cvBadgeTipo(tipo) {
    return tipo === 'LLAMADA'
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#FFF7ED;color:#C2410C">📞 Llamada</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">💬 Chat</span>';
}

function _cvBadgeEstado(estado) {
    if (estado === 'ACTIVO') return '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">Responde</span>';
    if (estado === 'FINALIZADO') return '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">Cerrado</span>';
    return '<span class="px-2.5 py-1 rounded-full text-xs font-bold" style="background:#FEF2F2;color:#B91C1C">No responde</span>';
}

async function seccionCasosVivos(c) {
    cargando(c);
    try {
        const analistas = await fetch(`${API}/api/coordinador/analistas`).then(r => r.json());
        const porAnalista = await Promise.all(
            analistas.map(a => fetch(`${API}/api/casos/mis/${a.id}`).then(r => r.json())
                .then(filas => filas.map(caso => ({ ...caso, _consultadoPor: a.id })))
                .catch(() => []))
        );

        // Un caso traspasado sale en la lista de "mis casos" tanto de quien lo pasó como de
        // quien lo recibió (para que cada uno vea su historial) — acá se junta todo en una
        // sola tabla, así que hay que quedarse solo con una copia por caso: la pedida a
        // nombre de su dueño actual, porque esa es la que trae los tiempos completos
        // (la del ex-dueño solo suma los tramos que le pertenecen a él).
        const porId = new Map();
        for (const caso of porAnalista.flat()) {
            const previo = porId.get(caso.id);
            const esDelDuenoActual = Number(caso._consultadoPor) === Number(caso.idAnalista);
            if (!previo || esDelDuenoActual) porId.set(caso.id, caso);
        }
        _casosVivosData = [...porId.values()];
        _casosVivosCargadoEn = Date.now();

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Casos en Vivo', '#1565C0')}
                <div class="flex flex-wrap items-end gap-3 mb-5 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Tipo</label>
                        <select id="cv_tipo" onchange="_cvAplicarFiltros()"
                            class="border border-gray-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition">
                            <option value="CHAT" ${_cvFiltroTipo === 'CHAT' ? 'selected' : ''}>Solo chats</option>
                            <option value="LLAMADA" ${_cvFiltroTipo === 'LLAMADA' ? 'selected' : ''}>Solo llamadas</option>
                            <option value="" ${_cvFiltroTipo === '' ? 'selected' : ''}>Chats y llamadas</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Analista</label>
                        <select id="cv_analista" onchange="_cvAplicarFiltros()"
                            class="border border-gray-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition">
                            <option value="">Todos</option>
                            ${analistas.map(a => `<option value="${a.id}" ${String(_cvFiltroAnalista) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Estado</label>
                        <select id="cv_estado" onchange="_cvAplicarFiltros()"
                            class="border border-gray-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition">
                            <option value="abiertos" ${_cvFiltroEstado === 'abiertos' ? 'selected' : ''}>Solo abiertos</option>
                            <option value="cerrados" ${_cvFiltroEstado === 'cerrados' ? 'selected' : ''}>Solo cerrados</option>
                            <option value="" ${_cvFiltroEstado === '' ? 'selected' : ''}>Abiertos y cerrados</option>
                        </select>
                    </div>
                    <button onclick="activarTab('casos-vivos')"
                        class="text-xs font-semibold px-4 py-2 rounded-xl text-white hover:opacity-90 transition btn-navy">
                        ↻ Refrescar
                    </button>
                </div>
                <div id="cv_tabla"></div>
            </div>`;

        _cvRenderTabla();
        if (_casosVivosTimer) clearInterval(_casosVivosTimer);
        _casosVivosTimer = setInterval(_cvActualizarTiempos, 1000);
    } catch { errorHtml(c); }
}

function _cvAplicarFiltros() {
    _cvFiltroTipo = document.getElementById('cv_tipo')?.value ?? '';
    _cvFiltroAnalista = document.getElementById('cv_analista')?.value ?? '';
    _cvFiltroEstado = document.getElementById('cv_estado')?.value ?? '';
    _cvRenderTabla();
}

function _cvRenderTabla() {
    const cont = document.getElementById('cv_tabla');
    if (!cont) return;

    const filtrados = _casosVivosData.filter(caso =>
        (!_cvFiltroTipo || caso.tipo === _cvFiltroTipo) &&
        (!_cvFiltroAnalista || String(caso.idAnalista) === String(_cvFiltroAnalista)) &&
        (!_cvFiltroEstado
            || (_cvFiltroEstado === 'abiertos' && caso.estado !== 'FINALIZADO')
            || (_cvFiltroEstado === 'cerrados' && caso.estado === 'FINALIZADO'))
    );

    if (!filtrados.length) {
        cont.innerHTML = '<div class="text-center py-10 text-gray-600 text-sm">Sin casos con ese filtro</div>';
        return;
    }

    cont.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="min-w-full text-sm">
                <thead>
                    <tr style="background:#122B4F">
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Caso</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">EDS</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Estado</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Con respuesta</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Sin respuesta</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Ticket 2WD</th>
                        <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Categoría</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                    ${filtrados.map(caso => `
                        <tr class="hover:bg-blue-50 transition" id="cv_row-${caso.id}">
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2">${_cvBadgeTipo(caso.tipo)}<span class="font-bold text-gray-800">${escapeHtml(caso.numerochat)}</span></div>
                                <div class="text-xs text-gray-600 mt-0.5">#${caso.id}</div>
                            </td>
                            <td class="px-4 py-3 ${caso.ticketEDS ? 'text-gray-700' : 'text-gray-400 italic'}">${escapeHtml(caso.ticketEDS) || 'Sin ticket'}</td>
                            <td class="px-4 py-3 text-gray-700">${escapeHtml(caso.titular)}</td>
                            <td class="px-4 py-3">${_cvBadgeEstado(caso.estado)}</td>
                            <td class="px-4 py-3 font-mono" id="cv_act-${caso.id}"></td>
                            <td class="px-4 py-3 font-mono" id="cv_ina-${caso.id}"></td>
                            <td class="px-4 py-3 ${caso.ticketReferencia2WD ? 'text-gray-700' : 'text-gray-400 italic'}">${escapeHtml(caso.ticketReferencia2WD) || 'Sin ticket'}</td>
                            <td class="px-4 py-3 text-gray-600">${escapeHtml(caso.categoria) || '—'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
            <div class="px-4 py-2 text-xs text-gray-600 bg-gray-50 border-t border-gray-100">
                ${filtrados.length} caso${filtrados.length !== 1 ? 's' : ''}
            </div>
        </div>`;

    _cvActualizarTiempos();
}

// los tiempos vienen del servidor al cargar; el tramo abierto sigue corriendo acá igual que en "Mis Casos".
// Además, cada segundo revisa si un caso lleva más de 1h sin responder (alerta roja) o más de 1h
// respondiendo sin cerrarse (advertencia naranja), y resalta la fila.
function _cvActualizarTiempos() {
    const extra = (Date.now() - _casosVivosCargadoEn) / 1000;
    _casosVivosData.forEach(caso => {
        const act = Number(caso.segActivo) + (caso.estado === 'ACTIVO' ? extra : 0);
        const ina = Number(caso.segInactivo) + (caso.estado === 'INACTIVO' ? extra : 0);
        const elAct = document.getElementById(`cv_act-${caso.id}`);
        const elIna = document.getElementById(`cv_ina-${caso.id}`);
        const fila  = document.getElementById(`cv_row-${caso.id}`);
        if (elAct) elAct.textContent = _cvFormatearDuracion(act);
        if (elIna) elIna.textContent = _cvFormatearDuracion(ina);

        const alertaRoja = caso.estado === 'INACTIVO' && ina >= CV_UMBRAL_ALERTA_SEG;
        const alertaNaranja = caso.estado === 'ACTIVO' && act >= CV_UMBRAL_ALERTA_SEG;

        if (elIna) elIna.style.color = alertaRoja ? '#B91C1C' : '';
        if (elIna) elIna.style.fontWeight = alertaRoja ? '700' : '';
        if (elAct) elAct.style.color = alertaNaranja ? '#C2410C' : '';
        if (elAct) elAct.style.fontWeight = alertaNaranja ? '700' : '';
        if (fila) fila.style.background = alertaRoja ? '#FEF2F2' : alertaNaranja ? '#FFF7ED' : '';
    });
}

// IMPORTAR EXCEL

let _importPreview = null;

async function seccionImportar(c) {
    c.innerHTML = `
        <div class="fade-in">
            ${seccionHeader('Importar desde Excel', '#1B5E20')}

            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-5 max-w-xl">
                <p class="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Seleccionar archivo</p>
                <div class="flex gap-3 items-center flex-wrap">
                    <label class="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-semibold text-sm cursor-pointer hover:opacity-90 transition btn-navy">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Seleccionar archivo
                        <input type="file" id="imp_archivo" accept=".xlsx,.xls" class="hidden"
                            onchange="onArchivoSeleccionado(this)"/>
                    </label>
                    <span id="imp_nombre" class="text-sm text-gray-600 italic">Ningún archivo seleccionado</span>
                </div>
                <div class="mt-4">
                    <button id="imp_btn_preview" onclick="previsualizarExcel()" disabled
                        class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-navy disabled:opacity-40 disabled:cursor-not-allowed">
                        Previsualizar
                    </button>
                </div>
                <span id="imp_msg" class="block text-sm font-medium mt-2"></span>
            </div>

            <div id="imp_resultados"></div>
        </div>`;
    _importPreview = null;
}

function onArchivoSeleccionado(input) {
    const nombre = document.getElementById('imp_nombre');
    const btn    = document.getElementById('imp_btn_preview');
    const res    = document.getElementById('imp_resultados');
    if (input.files[0]) {
        nombre.textContent = input.files[0].name;
        nombre.className   = 'text-sm text-gray-700 font-medium';
        btn.disabled = false;
    } else {
        nombre.textContent = 'Ningún archivo seleccionado';
        nombre.className   = 'text-sm text-gray-600 italic';
        btn.disabled = true;
    }
    _importPreview = null;
    if (res) res.innerHTML = '';
}

async function previsualizarExcel() {
    const input   = document.getElementById('imp_archivo');
    const msg     = document.getElementById('imp_msg');
    const resDiv  = document.getElementById('imp_resultados');
    const btn     = document.getElementById('imp_btn_preview');
    if (!input?.files[0]) return;

    btn.textContent = 'Analizando...';
    btn.disabled    = true;
    msg.textContent = '';
    resDiv.innerHTML = '';

    const form = new FormData();
    form.append('archivo', input.files[0]);

    try {
        const res  = await fetch(`${API}/api/importar/preview`, { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en el servidor');

        _importPreview = data;
        renderPreviewImport(resDiv, data);
        msg.textContent = '';
    } catch (e) {
        msg.textContent = `✗ ${e.message}`;
        msg.className   = 'block text-sm font-medium mt-2 text-red-500';
    } finally {
        btn.textContent = 'Previsualizar';
        btn.disabled    = false;
    }
}

function renderPreviewImport(div, data) {
    const { total, insertar, actualizar, omitir, advertencias, erroresBloqueantes = 0, filas } = data;
    const acOK   = filas.filter(f => f.accion !== 'omitir' && f.estado === 'ok').length;
    const acTodo = filas.filter(f => f.accion !== 'omitir' && f.estado !== 'error').length;

    const errs  = filas.filter(f => f.estado === 'error');
    const warns = filas.filter(f => f.estado === 'advertencia' && f.accion !== 'omitir');

    const errHtml = errs.length ? `
        <div class="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 max-w-2xl">
            <p class="text-xs font-bold text-red-700 uppercase tracking-widest mb-2">
                ✗ Clientes no registrados — ${errs.length} ticket${errs.length !== 1 ? 's' : ''} no serán importados
            </p>
            <p class="text-xs text-red-600 mb-2">Importe los clientes desde la pestaña <strong>Importar Clientes</strong> primero.</p>
            <ul class="space-y-0.5">
                ${errs.map(f => f.errores.map(e =>
                    `<li class="text-xs text-red-600">• Fila ${f.fila}: ${e}</li>`
                ).join('')).join('')}
            </ul>
        </div>` : '';

    const warnHtml = warns.length ? `
        <div class="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 max-w-2xl">
            <p class="text-xs font-bold text-yellow-700 uppercase tracking-widest mb-2">
                Advertencias — ${warns.length} fila${warns.length !== 1 ? 's' : ''}
            </p>
            <ul class="space-y-0.5">
                ${warns.map(f => f.errores.map(e =>
                    `<li class="text-xs text-yellow-700">• Fila ${f.fila}: ${e}</li>`
                ).join('')).join('')}
            </ul>
        </div>` : '';

    const btnOK = acOK > 0 ? `
        <button onclick="confirmarImportacion(false)"
            class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-green">
            ✓ Importar OK (${acOK})
        </button>` : '';

    const btnTodo = advertencias > 0 ? `
        <button onclick="confirmarImportacion(true)"
            class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
            style="background:#92400E">
            ⚠ Importar todo, incluir advertencias (${acTodo})
        </button>` : '';

    const esc = s => (s || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

    div.innerHTML = `
        <div class="fade-in">
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5 max-w-3xl">
                <div class="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-gray-700">${total}</div>
                    <div class="text-xs text-gray-600 uppercase tracking-wide mt-0.5">Total</div>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-green-700">${insertar}</div>
                    <div class="text-xs text-green-600 uppercase tracking-wide mt-0.5">Nuevos</div>
                </div>
                <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-blue-700">${actualizar}</div>
                    <div class="text-xs text-blue-600 uppercase tracking-wide mt-0.5">Actualizar</div>
                </div>
                <div class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-gray-600">${omitir}</div>
                    <div class="text-xs text-gray-600 uppercase tracking-wide mt-0.5">Sin cambios</div>
                </div>
                <div class="bg-red-50 border border-red-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-red-600">${erroresBloqueantes}</div>
                    <div class="text-xs text-red-500 uppercase tracking-wide mt-0.5">Sin cliente</div>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-yellow-600">${advertencias}</div>
                    <div class="text-xs text-yellow-600 uppercase tracking-wide mt-0.5">Advertencias</div>
                </div>
            </div>

            ${acTodo === 0 && erroresBloqueantes === 0 ? `
                <div class="text-center py-8 text-gray-600 text-sm">No hay filas para importar o actualizar.</div>
            ` : acTodo > 0 ? `
                <div class="flex gap-3 mb-4 flex-wrap">
                    ${btnOK}
                    ${btnTodo}
                </div>
            ` : ''}
            <span id="imp_confirm_msg" class="block text-sm font-medium mb-4"></span>
            ${errHtml}
            ${warnHtml}

            <div class="overflow-x-auto rounded-xl border border-gray-200 mt-4">
                <table class="min-w-full text-xs">
                    <thead>
                        <tr style="background:#122B4F">
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Fila</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Acción</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Código</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Título</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Cliente</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Creador</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Escalado a</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Estatus</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Campos modificados</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                        ${filas.slice(0, 50).map(f => {
                            let badge;
                            if (f.estado === 'error') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-xs">✗ SIN CLIENTE</span>';
                            } else if (f.accion === 'omitir') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold text-xs">= IGUAL</span>';
                            } else if (f.accion === 'actualizar' && f.estado === 'ok') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">ACTUALIZAR</span>';
                            } else if (f.accion === 'insertar' && f.estado === 'ok') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold text-xs">NUEVO</span>';
                            } else {
                                const label = f.accion === 'actualizar' ? 'ACT ⚠' : 'NUEVO ⚠';
                                badge = `<span class="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold text-xs">${label}</span>`;
                            }
                            const cambios = f.camposModificados?.length
                                ? `<span class="text-blue-600">${f.camposModificados.join(', ')}</span>`
                                : '—';
                            return `
                            <tr class="hover:bg-gray-50 ${f.estado === 'error' ? 'bg-red-50' : f.accion === 'omitir' ? 'opacity-40' : ''}">
                                <td class="px-3 py-2 text-gray-600">${f.fila}</td>
                                <td class="px-3 py-2">${badge}</td>
                                <td class="px-3 py-2 font-mono text-gray-500">${esc(f.codigo2wd) || '—'}</td>
                                <td class="px-3 py-2 text-gray-800 max-w-[160px] truncate" title="${esc(f.casoAtendido)}">${esc(f.casoAtendido) || '—'}</td>
                                <td class="px-3 py-2">
                                    ${f.edsEncontrada
                                        ? `<span class="text-gray-700">${esc(f.eds)}</span>`
                                        : f.clienteNoRegistrado
                                            ? `<span class="text-red-500 font-semibold">${esc(f.eds) || '—'}</span>`
                                            : `<span class="text-gray-600">—</span>`
                                    }
                                </td>
                                <td class="px-3 py-2 ${f.idAnalista ? 'text-gray-700' : (f.creadoPorNom ? 'text-red-500' : 'text-gray-600')}">${esc(f.creadoPorNom) || '—'}</td>
                                <td class="px-3 py-2 ${f.escalado && f.escalado !== f.idAnalista ? 'text-purple-700 font-semibold' : 'text-gray-600'}">${esc(f.responsableNom) || '—'}</td>
                                <td class="px-3 py-2 ${f.idEstatus ? 'text-gray-700' : 'text-gray-600'}">${esc(f.estatusNom) || '—'}</td>
                                <td class="px-3 py-2">${cambios}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                ${filas.length > 50 ? `
                    <div class="px-4 py-2 text-xs text-gray-600 text-center bg-gray-50 border-t border-gray-100">
                        Mostrando 50 de ${filas.length} filas
                    </div>` : ''}
            </div>
        </div>`;
}

async function confirmarImportacion(incluirAdvertencias) {
    if (!_importPreview) return;
    const msg = document.getElementById('imp_confirm_msg');
    if (!msg) return;

    msg.textContent = 'Importando...';
    msg.className   = 'block text-sm font-medium mb-4 text-blue-600';

    try {
        const res  = await fetch(`${API}/api/importar/confirmar`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ filas: _importPreview.filas, incluirAdvertencias })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error desconocido');

        const partes = [];
        if (data.edsCreadas       > 0) partes.push(`${data.edsCreadas} EDS creada${data.edsCreadas !== 1 ? 's' : ''}`);
        if (data.analistasCreados > 0) partes.push(`${data.analistasCreados} analista${data.analistasCreados !== 1 ? 's' : ''} creado${data.analistasCreados !== 1 ? 's' : ''}`);
        if (data.estatusCreados   > 0) partes.push(`${data.estatusCreados} estatus creado${data.estatusCreados !== 1 ? 's' : ''}`);
        if (data.categoriasCreadas > 0) partes.push(`${data.categoriasCreadas} categoría${data.categoriasCreadas !== 1 ? 's' : ''} nueva${data.categoriasCreadas !== 1 ? 's' : ''}`);
        if (data.tiposCreados     > 0) partes.push(`${data.tiposCreados} tipo${data.tiposCreados !== 1 ? 's' : ''} de solicitud nuevo${data.tiposCreados !== 1 ? 's' : ''}`);
        if (data.gruposCreados    > 0) partes.push(`${data.gruposCreados} grupo${data.gruposCreados !== 1 ? 's' : ''} de colaboradores nuevo${data.gruposCreados !== 1 ? 's' : ''}`);
        if (data.insertados      > 0) partes.push(`${data.insertados} ticket${data.insertados !== 1 ? 's' : ''} insertado${data.insertados !== 1 ? 's' : ''}`);
        if (data.actualizados    > 0) partes.push(`${data.actualizados} actualizado${data.actualizados !== 1 ? 's' : ''}`);
        let texto = partes.length ? `✓ ${partes.join(', ')}.` : '✓ Sin cambios.';
        if (data.errores?.length) texto += ` ${data.errores.length} con error.`;

        msg.textContent = texto;
        msg.className   = partes.length
          ? 'block text-sm font-medium mb-2 text-green-600'
          : 'block text-sm font-medium mb-2 text-orange-600';

        // Mostrar detalle de errores
        if (data.errores?.length) {
          const detalle = document.createElement('div');
          detalle.className = 'bg-red-50 border border-red-200 rounded-xl p-3 mb-4 max-w-2xl';
          detalle.innerHTML = `<p class="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">Detalle de errores</p>
            <ul class="space-y-0.5">${data.errores.slice(0,10).map(e =>
              `<li class="text-xs text-red-600">• ${e.replace(/</g,'&lt;')}</li>`
            ).join('')}${data.errores.length > 10 ? `<li class="text-xs text-gray-600">… y ${data.errores.length - 10} más</li>` : ''}</ul>`;
          msg.insertAdjacentElement('afterend', detalle);
        }

        if (partes.length) _importPreview = null;
    } catch (e) {
        msg.textContent = `✗ ${e.message}`;
        msg.className   = 'block text-sm font-medium mb-4 text-red-500';
    }
}

// IMPORTAR CLIENTES

let _importClientesPreview = null;

async function seccionImportarClientes(c) {
    c.innerHTML = `
        <div class="fade-in">
            ${seccionHeader('Importar Clientes desde Excel', '#1565C0')}
            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-5 max-w-xl">
                <p class="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Seleccionar archivo</p>
                <div class="flex gap-3 items-center flex-wrap">
                    <label class="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-semibold text-sm cursor-pointer hover:opacity-90 transition btn-navy">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Seleccionar archivo
                        <input type="file" id="cli_archivo" accept=".xlsx,.xls" class="hidden"
                            onchange="onArchivoClienteSeleccionado(this)"/>
                    </label>
                    <span id="cli_nombre" class="text-sm text-gray-600 italic">Ningún archivo seleccionado</span>
                </div>
                <div class="mt-4">
                    <button id="cli_btn_preview" onclick="previsualizarClientes()" disabled
                        class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-navy disabled:opacity-40 disabled:cursor-not-allowed">
                        Previsualizar
                    </button>
                </div>
                <span id="cli_msg" class="block text-sm font-medium mt-2"></span>
            </div>
            <div id="cli_resultados"></div>
        </div>`;
    _importClientesPreview = null;
}

function onArchivoClienteSeleccionado(input) {
    const nombre = document.getElementById('cli_nombre');
    const btn    = document.getElementById('cli_btn_preview');
    const res    = document.getElementById('cli_resultados');
    if (input.files[0]) {
        nombre.textContent = input.files[0].name;
        nombre.className   = 'text-sm text-gray-700 font-medium';
        btn.disabled = false;
    } else {
        nombre.textContent = 'Ningún archivo seleccionado';
        nombre.className   = 'text-sm text-gray-600 italic';
        btn.disabled = true;
    }
    _importClientesPreview = null;
    if (res) res.innerHTML = '';
}

async function previsualizarClientes() {
    const input  = document.getElementById('cli_archivo');
    const msg    = document.getElementById('cli_msg');
    const resDiv = document.getElementById('cli_resultados');
    const btn    = document.getElementById('cli_btn_preview');
    if (!input?.files[0]) return;

    btn.textContent = 'Analizando...';
    btn.disabled    = true;
    msg.textContent = '';
    resDiv.innerHTML = '';

    const form = new FormData();
    form.append('archivo', input.files[0]);

    try {
        const res  = await fetch(`${API}/api/importar-estaciones/preview`, { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en el servidor');
        _importClientesPreview = data;
        renderPreviewClientes(resDiv, data);
    } catch (e) {
        msg.textContent = `✗ ${e.message}`;
        msg.className   = 'block text-sm font-medium mt-2 text-red-500';
    } finally {
        btn.textContent = 'Previsualizar';
        btn.disabled    = false;
    }
}

function renderPreviewClientes(div, data) {
    const { total, insertar, actualizar, omitir, advertencias, filas } = data;
    const acOK   = filas.filter(f => f.accion !== 'omitir' && f.estado === 'ok').length;
    const acTodo = filas.filter(f => f.accion !== 'omitir').length;

    const warns = filas.filter(f => f.estado === 'advertencia');
    const warnHtml = warns.length ? `
        <div class="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 max-w-2xl">
            <p class="text-xs font-bold text-yellow-700 uppercase tracking-widest mb-2">
                Advertencias — ${warns.length} fila${warns.length !== 1 ? 's' : ''}
            </p>
            <ul class="space-y-0.5">
                ${warns.map(f => f.errores.map(e =>
                    `<li class="text-xs text-yellow-700">• Fila ${f.fila}: ${e}</li>`
                ).join('')).join('')}
            </ul>
        </div>` : '';

    const btnOK = acOK > 0 ? `
        <button onclick="confirmarClientes(false)"
            class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-green">
            ✓ Importar OK (${acOK})
        </button>` : '';

    const btnTodo = advertencias > 0 ? `
        <button onclick="confirmarClientes(true)"
            class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
            style="background:#92400E">
            ⚠ Importar todo, incluir advertencias (${acTodo})
        </button>` : '';

    const esc = s => (s || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

    div.innerHTML = `
        <div class="fade-in">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 max-w-2xl">
                <div class="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-gray-700">${total}</div>
                    <div class="text-xs text-gray-600 uppercase tracking-wide mt-0.5">Total</div>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-green-700">${insertar}</div>
                    <div class="text-xs text-green-600 uppercase tracking-wide mt-0.5">Nuevos</div>
                </div>
                <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-blue-700">${actualizar}</div>
                    <div class="text-xs text-blue-600 uppercase tracking-wide mt-0.5">Actualizar</div>
                </div>
                <div class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-gray-600">${omitir}</div>
                    <div class="text-xs text-gray-600 uppercase tracking-wide mt-0.5">Sin cambios</div>
                </div>
            </div>

            ${acTodo === 0 ? `
                <div class="text-center py-8 text-gray-600 text-sm">No hay clientes para importar o actualizar.</div>
            ` : `
                <div class="flex gap-3 mb-4 flex-wrap">
                    ${btnOK}
                    ${btnTodo}
                </div>
            `}
            <span id="cli_confirm_msg" class="block text-sm font-medium mb-4"></span>
            ${warnHtml}

            <div class="overflow-x-auto rounded-xl border border-gray-200 mt-4">
                <table class="min-w-full text-xs">
                    <thead>
                        <tr style="background:#122B4F">
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Fila</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Acción</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Código</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Nombre</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">NIT</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Dirección</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Campos modificados</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                        ${filas.slice(0, 100).map(f => {
                            let badge;
                            if (f.accion === 'omitir') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold text-xs">= IGUAL</span>';
                            } else if (f.accion === 'actualizar' && f.estado === 'ok') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">ACTUALIZAR</span>';
                            } else if (f.accion === 'insertar' && f.estado === 'ok') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold text-xs">NUEVO</span>';
                            } else {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold text-xs">⚠</span>';
                            }
                            const cambios = f.camposModificados?.length
                                ? `<span class="text-blue-600">${f.camposModificados.join(', ')}</span>`
                                : '—';
                            return `
                            <tr class="hover:bg-gray-50 ${f.accion === 'omitir' ? 'opacity-40' : ''}">
                                <td class="px-3 py-2 text-gray-600">${f.fila}</td>
                                <td class="px-3 py-2">${badge}</td>
                                <td class="px-3 py-2 font-mono text-gray-600">${esc(f.codigo) || '—'}</td>
                                <td class="px-3 py-2 text-gray-800 max-w-[200px] truncate">${esc(f.nombre) || '—'}</td>
                                <td class="px-3 py-2 text-gray-500">${esc(f.nit) || '—'}</td>
                                <td class="px-3 py-2 text-gray-500 max-w-[180px] truncate">${esc(f.direccion) || '—'}</td>
                                <td class="px-3 py-2">${cambios}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                ${filas.length > 100 ? `
                    <div class="px-4 py-2 text-xs text-gray-600 text-center bg-gray-50 border-t border-gray-100">
                        Mostrando 100 de ${filas.length} filas
                    </div>` : ''}
            </div>
        </div>`;
}

async function confirmarClientes(incluirAdvertencias) {
    if (!_importClientesPreview) return;
    const msg = document.getElementById('cli_confirm_msg');
    if (!msg) return;

    msg.textContent = 'Importando...';
    msg.className   = 'block text-sm font-medium mb-4 text-blue-600';

    try {
        const res  = await fetch(`${API}/api/importar-estaciones/confirmar`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ filas: _importClientesPreview.filas, incluirAdvertencias })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error desconocido');

        const partes = [];
        if (data.insertados  > 0) partes.push(`${data.insertados} cliente${data.insertados !== 1 ? 's' : ''} nuevo${data.insertados !== 1 ? 's' : ''}`);
        if (data.actualizados > 0) partes.push(`${data.actualizados} actualizado${data.actualizados !== 1 ? 's' : ''}`);
        let texto = partes.length ? `✓ ${partes.join(', ')}.` : '✓ Sin cambios.';
        if (data.errores?.length) texto += ` ${data.errores.length} con error.`;

        msg.textContent = texto;
        msg.className   = partes.length
            ? 'block text-sm font-medium mb-2 text-green-600'
            : 'block text-sm font-medium mb-2 text-orange-600';

        if (data.errores?.length) {
            const detalle = document.createElement('div');
            detalle.className = 'bg-red-50 border border-red-200 rounded-xl p-3 mb-4 max-w-2xl';
            detalle.innerHTML = `<p class="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">Detalle de errores</p>
                <ul class="space-y-0.5">${data.errores.slice(0,10).map(e =>
                    `<li class="text-xs text-red-600">• ${e.replace(/</g,'&lt;')}</li>`
                ).join('')}</ul>`;
            msg.insertAdjacentElement('afterend', detalle);
        }

        if (partes.length) _importClientesPreview = null;
    } catch (e) {
        msg.textContent = `✗ ${e.message}`;
        msg.className   = 'block text-sm font-medium mb-4 text-red-500';
    }
}

async function guardarHorario(analistaId) {
    const sel = document.getElementById(`sel-hor-${analistaId}`);
    const msg = document.getElementById(`msg-hor-${analistaId}`);
    const idhorario = sel?.value ? parseInt(sel.value) : null;

    try {
        const res = await fetch(`${API}/api/coordinador/${analistaId}/horario`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idhorario })
        });
        if (!res.ok) throw new Error();
        if (msg) {
            msg.textContent = '✓ Guardado';
            msg.className = 'block text-xs font-medium mt-1 text-green-600';
            setTimeout(() => { msg.textContent = ''; }, 3000);
        }
    } catch {
        if (msg) {
            msg.textContent = '✗ Error';
            msg.className = 'block text-xs font-medium mt-1 text-red-500';
        }
    }
}
