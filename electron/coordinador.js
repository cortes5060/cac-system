/* API se carga desde config.js */

// ─── Guard ────────────────────────────────────────────────
const coordId     = localStorage.getItem('coordId');
const coordNombre = localStorage.getItem('coordNombre');

if (!coordId) {
    window.location.href = 'index.html';
}

window.addEventListener('load', () => {
    document.getElementById('coordNombre').textContent = coordNombre || '';
    activarTab('analistas');
});

function cerrarSesion() {
    localStorage.removeItem('coordId');
    localStorage.removeItem('coordNombre');
    window.location.href = 'index.html';
}

// ─── Router ───────────────────────────────────────────────
async function mostrarSeccion(tipo) {
    const c = document.getElementById('tabContenido');
    if (tipo === 'analistas')  await seccionAnalistas(c);
    else if (tipo === 'orden') await seccionOrden(c);
    else if (tipo === 'categorias') await seccionCategorias(c);
    else if (tipo === 'eds')      await seccionEDS(c);
    else if (tipo === 'horarios') await seccionHorarios(c);
    else if (tipo === 'importar') await seccionImportar(c);
}

// ─── Helpers ──────────────────────────────────────────────
function seccionHeader(titulo, colorHex) {
    return `
        <div class="flex items-center gap-2 mb-5">
            <div class="w-1 h-5 rounded-full" style="background:${colorHex}"></div>
            <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">${titulo}</h2>
        </div>`;
}

function cargando(c) {
    c.innerHTML = '<div class="text-gray-400 text-sm text-center py-14">Cargando...</div>';
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

function notif(elId, texto, tipo) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = texto;
    el.className = `text-sm font-medium ${tipo === 'ok' ? 'text-green-600' : 'text-red-500'}`;
    setTimeout(() => { el.textContent = ''; }, 3000);
}

// ─── ANALISTAS ────────────────────────────────────────────
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
                                <td class="px-5 py-3.5 font-mono text-xs text-gray-400">
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
        alert('Error al cambiar el estado.');
    }
}

function pedirEliminar(id, nombre) {
    modalConfirm(
        `¿Eliminar a ${nombre}?`,
        'El analista quedará desactivado y no aparecerá en el sistema. Los datos históricos se conservan.',
        async () => {
            const res = await fetch(`${API}/api/coordinador/${id}`, { method: 'DELETE' });
            if (res.ok) await seccionAnalistas(document.getElementById('tabContenido'));
            else alert('Error al eliminar.');
        }
    );
}

// ─── ORDEN DE COLA ────────────────────────────────────────
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
                <div class="text-center py-12 text-gray-400 text-sm">No hay analistas activos en la cola.</div>
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
                            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-25">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                        </button>
                        <button onclick="moverAbajo(${i})" ${i === _ordenLocal.length - 1 ? 'disabled' : ''}
                            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-25">
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

// ─── CATEGORÍAS ───────────────────────────────────────────
async function seccionCategorias(c) {
    cargando(c);
    try {
        const data = await fetch(`${API}/api/coordinador/categorias`).then(r => r.json());

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Categorías de Tickets', '#1565C0')}

                <div class="flex gap-3 mb-6 max-w-md">
                    <input id="cat_nuevo" type="text" placeholder="Nombre de nueva categoría"
                        class="flex-1 border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
                        onkeypress="if(event.key==='Enter') agregarCategoria()"/>
                    <button onclick="agregarCategoria()"
                        class="px-5 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-navy">
                        Agregar
                    </button>
                </div>
                <span id="cat_msg" class="block text-sm font-medium mb-4"></span>

                <div class="overflow-x-auto rounded-xl border border-gray-200 max-w-lg">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Categoría</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Estado</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            ${data.map(cat => `
                            <tr class="hover:bg-gray-50 transition text-sm">
                                <td class="px-5 py-3 font-medium text-gray-800">${cat.nombre}</td>
                                <td class="px-5 py-3">
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold
                                        ${cat.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                                        <span class="w-1.5 h-1.5 rounded-full ${cat.activo ? 'bg-green-500' : 'bg-gray-400'}"></span>
                                        ${cat.activo ? 'Activa' : 'Inactiva'}
                                    </span>
                                </td>
                                <td class="px-5 py-3">
                                    <button onclick="toggleCat(${cat.id}, ${cat.activo ? 0 : 1})"
                                        class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition
                                        ${cat.activo
                                            ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200'
                                            : 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200'}">
                                        ${cat.activo ? 'Desactivar' : 'Activar'}
                                    </button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch { errorHtml(c); }
}

async function agregarCategoria() {
    const input = document.getElementById('cat_nuevo');
    const nombre = input?.value?.trim();
    if (!nombre) return;

    try {
        const res = await fetch(`${API}/api/coordinador/categorias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        if (!res.ok) throw new Error();
        input.value = '';
        await seccionCategorias(document.getElementById('tabContenido'));
    } catch {
        notif('cat_msg', '✗ Error al agregar', 'err');
    }
}

async function toggleCat(id, activo) {
    try {
        const res = await fetch(`${API}/api/coordinador/categorias/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo })
        });
        if (!res.ok) throw new Error();
        await seccionCategorias(document.getElementById('tabContenido'));
    } catch {
        alert('Error al cambiar estado.');
    }
}

// ─── EDS ──────────────────────────────────────────────────
async function seccionEDS(c) {
    cargando(c);
    try {
        const data = await fetch(`${API}/api/coordinador/eds`).then(r => r.json());

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Estaciones de Servicio (EDS)', '#1565C0')}

                <div class="p-4 mb-6 bg-gray-50 rounded-xl border border-gray-200 max-w-2xl">
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Nueva EDS</p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <input id="eds_nombre" type="text" placeholder="Nombre *"
                            class="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"/>
                        <input id="eds_nit" type="text" placeholder="NIT"
                            class="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"/>
                        <input id="eds_direccion" type="text" placeholder="Dirección"
                            class="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
                            onkeypress="if(event.key==='Enter') agregarEDS()"/>
                    </div>
                    <button onclick="agregarEDS()"
                        class="px-6 py-2.5 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition btn-navy">
                        Agregar
                    </button>
                </div>
                <span id="eds_msg" class="block text-sm font-medium mb-4"></span>

                <div class="overflow-x-auto rounded-xl border border-gray-200">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Estación</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">NIT</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Dirección</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Estado</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            ${data.map(eds => `
                            <tr class="hover:bg-gray-50 transition text-sm">
                                <td class="px-5 py-3 font-medium text-gray-800">${eds.nombre}</td>
                                <td class="px-5 py-3 text-gray-600">${eds.NIT || '—'}</td>
                                <td class="px-5 py-3 text-gray-600">${eds.direccion || '—'}</td>
                                <td class="px-5 py-3">
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold
                                        ${eds.existe ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                                        <span class="w-1.5 h-1.5 rounded-full ${eds.existe ? 'bg-green-500' : 'bg-gray-400'}"></span>
                                        ${eds.existe ? 'Activa' : 'Inactiva'}
                                    </span>
                                </td>
                                <td class="px-5 py-3">
                                    <button onclick="toggleEDS(${eds.id}, ${eds.existe ? 0 : 1})"
                                        class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition
                                        ${eds.existe
                                            ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200'
                                            : 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200'}">
                                        ${eds.existe ? 'Desactivar' : 'Activar'}
                                    </button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch { errorHtml(c); }
}

async function agregarEDS() {
    const nombre    = document.getElementById('eds_nombre')?.value?.trim();
    const NIT       = document.getElementById('eds_nit')?.value?.trim();
    const direccion = document.getElementById('eds_direccion')?.value?.trim();
    if (!nombre) { notif('eds_msg', '✗ El nombre es obligatorio', 'err'); return; }

    try {
        const res = await fetch(`${API}/api/coordinador/eds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, NIT, direccion })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            notif('eds_msg', `✗ ${data.error || 'Error al agregar'}`, 'err');
            return;
        }
        await seccionEDS(document.getElementById('tabContenido'));
    } catch {
        notif('eds_msg', '✗ Error al agregar', 'err');
    }
}

async function toggleEDS(id, existe) {
    try {
        const res = await fetch(`${API}/api/coordinador/eds/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ existe })
        });
        if (!res.ok) throw new Error();
        await seccionEDS(document.getElementById('tabContenido'));
    } catch {
        alert('Error al cambiar estado.');
    }
}

// ─── HORARIOS ─────────────────────────────────────────────

function fmt(val) {
    if (!val) return '--:--';
    return String(val).substring(0, 5);
}

function labelHorario(h) {
    return `${fmt(h.HoraEntrada)} – ${fmt(h.HoraSalida)}  |  Almuerzo ${fmt(h.HoraAlmuerzoInicio)} – ${fmt(h.HoraAlmuerzoFin)}`;
}

async function seccionHorarios(c) {
    cargando(c);
    try {
        const [analistas, horarios] = await Promise.all([
            fetch(`${API}/api/coordinador/analistas-horarios`).then(r => r.json()),
            fetch(`${API}/api/coordinador/horarios`).then(r => r.json())
        ]);

        const opcionesHorario = horarios.map(h =>
            `<option value="${h.id}">${labelHorario(h)}</option>`
        ).join('');

        c.innerHTML = `
            <div class="fade-in">
                ${seccionHeader('Horarios por Analista', '#1565C0')}

                <div class="overflow-x-auto rounded-xl border border-gray-200">
                    <table class="min-w-full">
                        <thead>
                            <tr style="background:#122B4F">
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Horario actual</th>
                                <th class="px-5 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase w-72">Cambiar a</th>
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
                                <td class="px-5 py-3.5">
                                    ${a.idhorario
                                        ? `<div class="text-xs text-gray-600 font-medium">
                                               <span class="font-bold text-gray-800">${fmt(a.HoraEntrada)} – ${fmt(a.HoraSalida)}</span>
                                               <br>
                                               <span class="text-gray-400">Almuerzo: ${fmt(a.HoraAlmuerzoInicio)} – ${fmt(a.HoraAlmuerzoFin)}</span>
                                           </div>`
                                        : '<span class="text-xs text-gray-400 italic">Sin horario</span>'}
                                </td>
                                <td class="px-5 py-3.5">
                                    <select id="sel-hor-${a.id}"
                                        class="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition">
                                        <option value="">— Seleccionar —</option>
                                        ${horarios.map(h =>
                                            `<option value="${h.id}" ${h.id === a.idhorario ? 'selected' : ''}>
                                                ${labelHorario(h)}
                                            </option>`
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

                <div class="mt-6 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Horarios disponibles</p>
                    <div class="space-y-1.5">
                        ${horarios.map((h, i) => `
                        <div class="flex items-center gap-3 text-sm text-gray-600">
                            <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style="background:#1565C0">${i + 1}</span>
                            <span><strong>${fmt(h.HoraEntrada)} – ${fmt(h.HoraSalida)}</strong>
                                <span class="text-gray-400 ml-2">Almuerzo: ${fmt(h.HoraAlmuerzoInicio)} – ${fmt(h.HoraAlmuerzoFin)}</span>
                            </span>
                        </div>`).join('')}
                    </div>
                </div>
            </div>`;
    } catch { errorHtml(c); }
}

// ─── IMPORTAR EXCEL ──────────────────────────────────────────

let _importPreview = null;

async function seccionImportar(c) {
    c.innerHTML = `
        <div class="fade-in">
            ${seccionHeader('Importar desde Excel', '#1B5E20')}

            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-5 max-w-xl">
                <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Seleccionar archivo</p>
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
                    <span id="imp_nombre" class="text-sm text-gray-400 italic">Ningún archivo seleccionado</span>
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
        nombre.className   = 'text-sm text-gray-400 italic';
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
    const { total, insertar, actualizar, omitir, advertencias, edsNuevas = 0, filas } = data;
    const acOK   = filas.filter(f => f.accion !== 'omitir' && f.estado === 'ok').length;
    const acTodo = filas.filter(f => f.accion !== 'omitir').length;

    const warns = filas.filter(f => f.estado === 'advertencia' && f.accion !== 'omitir');
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
            <div class="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5 max-w-4xl">
                <div class="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-gray-700">${total}</div>
                    <div class="text-xs text-gray-400 uppercase tracking-wide mt-0.5">Total</div>
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
                    <div class="text-2xl font-black text-gray-400">${omitir}</div>
                    <div class="text-xs text-gray-400 uppercase tracking-wide mt-0.5">Sin cambios</div>
                </div>
                <div class="bg-orange-50 border border-orange-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-orange-600">${edsNuevas}</div>
                    <div class="text-xs text-orange-600 uppercase tracking-wide mt-0.5">EDS nuevas</div>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-3 text-center">
                    <div class="text-2xl font-black text-yellow-600">${advertencias}</div>
                    <div class="text-xs text-yellow-600 uppercase tracking-wide mt-0.5">Advertencias</div>
                </div>
            </div>

            ${acTodo === 0 ? `
                <div class="text-center py-8 text-gray-400 text-sm">No hay filas para importar o actualizar.</div>
            ` : `
                <div class="flex gap-3 mb-4 flex-wrap">
                    ${btnOK}
                    ${btnTodo}
                </div>
            `}
            <span id="imp_confirm_msg" class="block text-sm font-medium mb-4"></span>
            ${warnHtml}

            <div class="overflow-x-auto rounded-xl border border-gray-200 mt-4">
                <table class="min-w-full text-xs">
                    <thead>
                        <tr style="background:#122B4F">
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Fila</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Acción</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Código</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Título</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">EDS</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Creador</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Escalado a</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Estatus</th>
                            <th class="px-3 py-2.5 text-left text-blue-200 font-bold uppercase tracking-wide">Campos modificados</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                        ${filas.slice(0, 50).map(f => {
                            let badge;
                            if (f.accion === 'omitir') {
                                badge = '<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-bold text-xs">= IGUAL</span>';
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
                            <tr class="hover:bg-gray-50 ${f.accion === 'omitir' ? 'opacity-40' : ''}">
                                <td class="px-3 py-2 text-gray-400">${f.fila}</td>
                                <td class="px-3 py-2">${badge}</td>
                                <td class="px-3 py-2 font-mono text-gray-500">${esc(f.codigo2wd) || '—'}</td>
                                <td class="px-3 py-2 text-gray-800 max-w-[160px] truncate" title="${esc(f.casoAtendido)}">${esc(f.casoAtendido) || '—'}</td>
                                <td class="px-3 py-2">
                                    ${f.edsEncontrada
                                        ? `<span class="text-gray-700">${esc(f.eds)}</span>`
                                        : f.edsNueva
                                            ? `<span class="text-gray-700">${esc(f.eds)}</span> <span class="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold text-xs ml-1">NUEVA</span>`
                                            : `<span class="text-gray-400">—</span>`
                                    }
                                </td>
                                <td class="px-3 py-2 ${f.idAnalista ? 'text-gray-700' : (f.creadoPorNom ? 'text-red-500' : 'text-gray-400')}">${esc(f.creadoPorNom) || '—'}</td>
                                <td class="px-3 py-2 ${f.escalado && f.escalado !== f.idAnalista ? 'text-purple-700 font-semibold' : 'text-gray-600'}">${esc(f.responsableNom) || '—'}</td>
                                <td class="px-3 py-2 ${f.idEstatus ? 'text-gray-700' : 'text-gray-400'}">${esc(f.estatusNom) || '—'}</td>
                                <td class="px-3 py-2">${cambios}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                ${filas.length > 50 ? `
                    <div class="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50 border-t border-gray-100">
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
        if (data.edsCreadas      > 0) partes.push(`${data.edsCreadas} EDS creada${data.edsCreadas !== 1 ? 's' : ''}`);
        if (data.analistasCreados > 0) partes.push(`${data.analistasCreados} analista${data.analistasCreados !== 1 ? 's' : ''} creado${data.analistasCreados !== 1 ? 's' : ''}`);
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
            ).join('')}${data.errores.length > 10 ? `<li class="text-xs text-gray-400">… y ${data.errores.length - 10} más</li>` : ''}</ul>`;
          msg.insertAdjacentElement('afterend', detalle);
        }

        if (partes.length) _importPreview = null;
    } catch (e) {
        msg.textContent = `✗ ${e.message}`;
        msg.className   = 'block text-sm font-medium mb-4 text-red-500';
    }
}

async function guardarHorario(analistaId) {
    const sel = document.getElementById(`sel-hor-${analistaId}`);
    const msg = document.getElementById(`msg-hor-${analistaId}`);
    const idhorario = sel?.value;

    if (!idhorario) {
        if (msg) { msg.textContent = '⚠ Selecciona un horario'; msg.className = 'block text-xs font-medium mt-1 text-orange-500'; }
        return;
    }

    try {
        const res = await fetch(`${API}/api/coordinador/${analistaId}/horario`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idhorario: parseInt(idhorario) })
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
