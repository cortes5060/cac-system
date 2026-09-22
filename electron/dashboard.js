
/* API se carga desde config.js */
const socket = io(API);

let analistaActual = null;
let idActual = null;
let ordenActual = null;

/* ============================= */
/* SOCKET                        */
/* ============================= */

socket.on("analistaActualizado", (data) => {

    console.log("Evento recibido:", data);

    if (data.id == idActual) {
        analistaActual.activo = data.activo;
        actualizarEstadoVisual(data.activo);
    }
    cargarAnalistasActivos();
    cargarAnalistaSeleccionado();
});

socket.on("casoPasado", (d) => {
    if (d.a == idActual) {
        mostrarToast(`${d.deNombre} te pasó ${d.tipo === "LLAMADA" ? "una llamada" : "un chat"}: ${d.numerochat}`);
    }
    if (d.a == idActual || d.de == idActual) {
        if (document.getElementById("tablaMisCasos")) cargarMisCasos();
        cargarAnalistaSeleccionado();
    }
});

socket.on("casosAutoFinalizados", () => {
    if (document.getElementById("tablaMisCasos")) cargarMisCasos();
});

socket.on("nuevoCaso3CX", (caso) => {
    console.log("Nuevo caso:", caso);
    refrescarTablasCasos(caso);
    cargarAnalistasActivos();
    cargarAnalistaSeleccionado();

    const input = document.getElementById("numeroChat");
    if (input) input.focus();
});

/* ============================= */
/* INICIALIZACIÓN                */
/* ============================= */

window.addEventListener("load", () => {
    cargarAnalistaSeleccionado();
});


/* ============================= */
/* CARGAR ANALISTA               */
/* ============================= */

async function cargarAnalistaSeleccionado() {
    try {

        idActual = localStorage.getItem("idAnalista");

        if (!idActual) {
            window.location.href = "index.html";
            return;
        }

        const response = await fetch(`${API}/api/analista/${idActual}`);

        if (!response.ok) throw new Error("Error obteniendo analista");

        analistaActual = await response.json();
        console.log("Analista cargado:", analistaActual);

        if (analistaActual.idRol !== 1) {
            window.location.href = "index.html";
            return;
        }

        document.getElementById("nombreAnalista").textContent = analistaActual.nombre;
        const mobNombre = document.getElementById("nombreAnalistaMobile");
        if (mobNombre) mobNombre.textContent = analistaActual.nombre;
        document.getElementById("contadorCasos").textContent = analistaActual.casosHoy ?? 0;

        actualizarEstadoVisual(analistaActual.activo);
        cargarAnalistasActivos();
        actualizarEstadoBoton();

    } catch (error) {
        console.error("Error:", error.message);
        mostrarAviso("Error cargando información");
    }
}

/* ============================= */
/* ACTUALIZAR ESTADO VISUAL      */
/* ============================= */

function actualizarEstadoVisual(activo) {

    const texto = document.getElementById("estadoTexto");
    const switchBtn = document.getElementById("switchEstado");
    const circulo = document.getElementById("circuloSwitch");

    if (activo == 1) {

        texto.textContent = "Activo";
        texto.className = "font-semibold text-sm text-green-400";

        switchBtn.classList.remove("bg-gray-600");
        switchBtn.classList.add("bg-green-500");

        circulo.classList.add("translate-x-7");

    } else {

        texto.textContent = "Inactivo";
        texto.className = "font-semibold text-sm text-red-400";

        switchBtn.classList.remove("bg-green-500");
        switchBtn.classList.add("bg-gray-600");

        circulo.classList.remove("translate-x-7");
    }
}

/* ============================= */
/* CAMBIAR ESTADO                */
/* ============================= */

async function cambiarEstado() {

    try {

        const nuevoEstado = analistaActual.activo == 1 ? 0 : 1;

        const response = await fetch(`${API}/api/analista/${idActual}/estado`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activo: nuevoEstado })
        });

        const data = await response.json();
        if (!response.ok) {
            if (data.bloquear) {
                mostrarModal(data.mensaje, data.imagen);
                return;
            }

            throw new Error("Error actualizando estado");
        }



    } catch (error) {
        console.error(error.message);
        mostrarAviso("No se pudo cambiar el estado");
    }
}



function mostrarModal(mensaje, imagen) {

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-96 mx-4 overflow-hidden fade-in">
            <div class="px-8 py-5" style="background:#C41E3A">
                <h2 class="text-white text-lg font-bold">Acción no permitida</h2>
            </div>
            <div class="p-8 text-center">
                <p class="text-gray-600 text-sm mb-6">
                    No puedes inactivarte en horario laboral.<br>
                    Contacta a tu coordinador si es necesario.
                </p>
                <img src="img/risa.png" class="mx-auto w-32 mb-6 rounded-xl">
                <button
                    class="w-full py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
                    style="background:#122B4F"
                    onclick="this.closest('.fixed').remove()">
                    Entendido
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

}

/* ============================= */
/* LISTA ACTIVOS                 */
/* ============================= */

async function cargarAnalistasActivos() {

    try {

        const response = await fetch(`${API}/api/analistas`);
        if (!response.ok) throw new Error("Error obteniendo activos");

        const analistas = await response.json();

        const contenedor = document.getElementById("listaActivos");
        contenedor.innerHTML = "";

        //
        const activosOrdenados = analistas
            .filter(a => a.activo == 1)
            .sort((a, b) => a.orden - b.orden);

        activosOrdenados.forEach((a, index) => {

            const div = document.createElement("div");
            const inicial = a.nombre.charAt(0).toUpperCase();

            if (index === 0) {

                div.className = "flex items-center justify-between px-4 py-3 rounded-xl shadow-md animate-pulse";
                div.style.background = "linear-gradient(135deg, #122B4F, #1565C0)";

                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-white text-sm font-black">${inicial}</div>
                        <span class="font-bold text-white">${a.nombre}</span>
                    </div>
                    <span class="text-xs font-bold px-3 py-1.5 rounded-full text-white" style="background:#C41E3A">▶ Próximo</span>
                `;

            } else {

                div.className = "flex items-center justify-between bg-white border border-gray-200 px-4 py-2.5 rounded-xl shadow-sm";

                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">${inicial}</div>
                        <span class="text-gray-700 font-medium text-sm">${a.nombre}</span>
                    </div>
                    <div class="w-6 h-6 rounded-full flex items-center justify-center" style="background:#1B5E20">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                `;
            }

            contenedor.appendChild(div);
        });

    } catch (error) {
        console.error(error.message);
    }
}

/* ============================= */
/* TABLAS DE CASOS               */
/* ============================= */

const TH = 'px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase';

let tipoCasoActual = "CHAT";
let misCasos = [];
let misCasosCargadoEn = 0;
let timerMisCasos = null;

function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}

function formatearFecha(f) {
    return new Date(f).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function formatearHora(f) {
    return new Date(f).toLocaleTimeString("es-CO", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatearDuracion(seg) {
    seg = Math.max(0, Math.floor(seg));
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function badgeTipo(tipo) {
    return tipo === "LLAMADA"
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">📞 Llamada</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">💬 Chat</span>';
}

// Refresca la tabla que esté visible cuando entra un caso nuevo
function refrescarTablasCasos(caso) {
    if (document.getElementById("tablaUlt10")) cargarUltimos10();
    if (document.getElementById("tablaMisCasos") && caso && caso.idAnalista == idActual) {
        cargarMisCasos();
    }
}

async function cargarUltimos10() {

    const cont = document.getElementById("tablaUlt10");
    if (!cont) return;

    try {

        const response = await fetch(`${API}/api/casos/lista`);
        if (!response.ok) throw new Error("Error obteniendo casos");
        const casos = await response.json();

        if (!casos.length) {
            cont.innerHTML = "<p>No hay casos registrados.</p>";
            return;
        }

        let filas = casos.map(c => `
            <tr class="hover:bg-blue-50 transition text-sm">
                <td class="px-4 py-3 text-gray-400 font-mono text-xs">#${c.id}</td>
                <td class="px-4 py-3">${badgeTipo(c.tipo)}</td>
                <td class="px-4 py-3 font-bold text-gray-800">${escapeHtml(c.numerochat)}</td>
                <td class="px-4 py-3 text-gray-600">${escapeHtml(c.nombreEDS) || '<span class="text-gray-300">—</span>'}</td>
                <td class="px-4 py-3 text-gray-500">${formatearFecha(c.fecha)}</td>
                <td class="px-4 py-3 text-gray-700">${escapeHtml(c.nombre)}</td>
            </tr>
        `).join("");

        cont.innerHTML = `
            <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="min-w-full overflow-hidden">
            <thead>
            <tr style="background:#122B4F">
                <th class="${TH}">ID</th>
                <th class="${TH}">Tipo</th>
                <th class="${TH}">Número / Teléfono</th>
                <th class="${TH}">EDS</th>
                <th class="${TH}">Fecha</th>
                <th class="${TH}">Analista</th>
            </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-100">${filas}</tbody>
            </table>
            </div>
        `;

    } catch (error) {
        console.error(error);
        cont.innerHTML = "<p class='text-red-500'>Error cargando casos.</p>";
    }
}

async function cargarMisCasos() {

    const cont = document.getElementById("tablaMisCasos");
    if (!cont) return;

    try {

        const response = await fetch(`${API}/api/casos/mis/${idActual}`);
        if (!response.ok) throw new Error("Error obteniendo mis casos");

        misCasos = await response.json();
        misCasosCargadoEn = Date.now();

        renderMisCasos();
        iniciarTimerMisCasos();

    } catch (error) {
        console.error(error);
        cont.innerHTML = "<p class='text-red-500'>Error cargando tus casos.</p>";
    }
}

function esMio(c) {
    return Number(c.idAnalista) === Number(idActual);
}

// Marca los casos que cambiaron de manos: recibidos de otro o pasados a otro
function etiquetaTraspaso(c) {

    if (esMio(c)) {
        return c.recibidoDe
            ? `<div class="text-xs mt-1" style="color:#1565C0">↪ Recibido de ${escapeHtml(c.recibidoDe)}</div>`
            : "";
    }

    return `<div class="text-xs mt-1" style="color:#B45309">↪ Pasado a ${escapeHtml(c.titular)}</div>`;
}

function renderMisCasos() {

    const cont = document.getElementById("tablaMisCasos");
    if (!cont) return;

    if (!misCasos.length) {
        cont.innerHTML = "<p>No has registrado casos hoy.</p>";
        return;
    }

    const filas = misCasos.map(c => {

        const cerrado = c.estado === "FINALIZADO";
        const titular = esMio(c);

        // Solo quien tiene el caso cambia sus estados; quien lo pasó solo puede seguir editando el ticket
        const bloqueado = cerrado || !titular;

        // Botón 1: ¿el cliente responde?
        const responde = c.estado === "ACTIVO";
        const noResponde = c.estado === "INACTIVO";

        const clienteBtns = `
            <div class="seg ${bloqueado ? "locked" : ""}">
                <button type="button" ${bloqueado ? "disabled" : ""} class="${responde ? "on on-green" : ""}"
                    onclick="cambiarEstadoCaso(${c.id}, 'ACTIVO')" title="El cliente está respondiendo">Responde</button>
                <button type="button" ${bloqueado ? "disabled" : ""} class="${noResponde ? "on on-red" : ""}"
                    onclick="cambiarEstadoCaso(${c.id}, 'INACTIVO')" title="El cliente no responde">No responde</button>
            </div>`;

        // Botón 2: estado del caso (abierto o cerrado) y, si es mío y sigue abierto, pasarlo
        const casoBtns = `
            <div class="seg ${!titular && !cerrado ? "locked" : ""}">
                <button type="button" ${bloqueado ? "disabled" : ""} class="${!cerrado ? "on on-green" : ""}"
                    title="Caso abierto: los tiempos están corriendo">Activo</button>
                <button type="button" ${bloqueado ? "disabled" : ""} class="${cerrado ? "on on-dark" : ""}"
                    onclick="cambiarEstadoCaso(${c.id}, 'FINALIZADO')" title="Cerrar el caso y detener los tiempos">${cerrado ? "✓ Cerrado" : "Cerrar"}</button>
            </div>
            ${titular && !cerrado
                ? `<button type="button" onclick="abrirDialogoPasar(${c.id})" class="text-xs font-semibold mt-1.5"
                        style="color:#1565C0" title="Asignarle este caso a otro analista">↪ Pasar a otro analista</button>`
                : ""}`;

        return `
            <tr class="hover:bg-blue-50 transition text-sm ${cerrado || !titular ? "opacity-70" : ""}">
                <td class="px-3 py-2.5 align-top">
                    <div class="flex items-center gap-2">${badgeTipo(c.tipo)}
                        <span class="font-bold text-gray-800">${escapeHtml(c.numerochat)}</span></div>
                    <div class="text-xs text-gray-400 mt-0.5">#${c.id} · ${formatearHora(c.fecha)}${c.nombreEDS ? " · " + escapeHtml(c.nombreEDS) : ""}</div>
                    ${etiquetaTraspaso(c)}
                </td>
                <td class="px-3 py-2.5 align-top space-y-1.5">${clienteBtns}${casoBtns}</td>
                <td class="px-3 py-2.5 align-top">
                    <dl class="tiempos">
                        <dt title="Con respuesta">Resp</dt><dd><span id="tAct-${c.id}"></span> <span class="text-gray-400 font-normal">(${c.vecesActivo}×)</span></dd>
                        <dt title="Sin respuesta">Sin</dt><dd><span id="tIna-${c.id}"></span> <span class="text-gray-400 font-normal">(${c.vecesInactivo}×)</span></dd>
                        <dt title="Ejecución total">Ejec</dt><dd id="tEje-${c.id}"></dd>
                    </dl>
                </td>
                <td class="px-3 py-2.5 align-top">${ticketCeldaHtml(c)}</td>
            </tr>
        `;
    }).join("");

    cont.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-gray-200">
        <table class="w-full overflow-hidden" style="table-layout:fixed">
        <colgroup>
            <col style="width:30%"><col style="width:22%"><col style="width:23%"><col style="width:25%">
        </colgroup>
        <thead>
        <tr style="background:#122B4F">
            <th class="${TH}">Caso</th>
            <th class="${TH}">Estado</th>
            <th class="${TH}">Tiempos</th>
            <th class="${TH}">Ticket 2WD</th>
        </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-100">${filas}</tbody>
        </table>
        </div>
    `;

    actualizarTiemposMisCasos();
}

// Los tiempos vienen del servidor al momento de cargar; el tramo en curso sigue corriendo aquí
// (solo si el caso lo tengo yo: si lo pasé, ese tiempo ya es de otro)
function actualizarTiemposMisCasos() {

    const extra = (Date.now() - misCasosCargadoEn) / 1000;

    misCasos.forEach(c => {

        const corre = esMio(c);
        const act = Number(c.segActivo) + (corre && c.estado === "ACTIVO" ? extra : 0);
        const ina = Number(c.segInactivo) + (corre && c.estado === "INACTIVO" ? extra : 0);

        const set = (id, seg) => {
            const el = document.getElementById(`${id}-${c.id}`);
            if (el) el.textContent = formatearDuracion(seg);
        };

        set("tAct", act);
        set("tIna", ina);
        set("tEje", act + ina);
    });
}

function iniciarTimerMisCasos() {
    detenerTimerMisCasos();
    timerMisCasos = setInterval(() => {
        if (!document.getElementById("tablaMisCasos")) return detenerTimerMisCasos();
        actualizarTiemposMisCasos();
    }, 1000);
}

function detenerTimerMisCasos() {
    if (timerMisCasos) clearInterval(timerMisCasos);
    timerMisCasos = null;
}

// Diálogos propios: alert()/confirm() nativos hacen que Electron pierda el foco del teclado en Windows
function mostrarDialogo({ titulo, mensaje, textoConfirmar, onConfirmar, onCancelar }) {

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-96 mx-4 overflow-hidden fade-in">
            <div class="px-8 py-5" style="background:#122B4F">
                <h2 class="text-white text-lg font-bold">${escapeHtml(titulo)}</h2>
            </div>
            <div class="p-8">
                <p class="text-gray-600 text-sm mb-6">${escapeHtml(mensaje)}</p>
                <div class="flex gap-3">
                    ${onConfirmar ? `<button data-accion="cancelar"
                        class="flex-1 py-3 rounded-xl font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition">Cancelar</button>` : ""}
                    <button data-accion="ok"
                        class="flex-1 py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
                        style="background:${onConfirmar ? "#C41E3A" : "#122B4F"}">${escapeHtml(textoConfirmar || "Entendido")}</button>
                </div>
            </div>
        </div>
    `;

    const cerrar = () => modal.remove();

    modal.querySelector('[data-accion="ok"]').addEventListener("click", () => {
        cerrar();
        if (onConfirmar) onConfirmar();
    });

    const cancelar = modal.querySelector('[data-accion="cancelar"]');
    if (cancelar) cancelar.addEventListener("click", () => {
        cerrar();
        if (onCancelar) onCancelar();
    });

    document.body.appendChild(modal);
}

function mostrarAviso(mensaje) {
    mostrarDialogo({ titulo: "Aviso", mensaje });
}

function cambiarEstadoCaso(idCaso, estado) {

    if (estado === "FINALIZADO") {
        mostrarDialogo({
            titulo: "Finalizar caso",
            mensaje: "Se detendrán todos los tiempos y ya no podrás cambiar el estado de este caso.",
            textoConfirmar: "Sí, finalizar",
            onConfirmar: () => enviarEstadoCaso(idCaso, estado)
        });
        return;
    }

    enviarEstadoCaso(idCaso, estado);
}

async function enviarEstadoCaso(idCaso, estado) {

    try {

        const response = await fetch(`${API}/api/casos/${idCaso}/estado`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado, idAnalista: Number(idActual) })
        });

        if (!response.ok) throw new Error("Error cambiando estado");

        await cargarMisCasos();

    } catch (error) {
        console.error(error);
        mostrarAviso("No se pudo cambiar el estado del caso");
        cargarMisCasos();
    }
}

/* ============================= */
/* TICKET 2WD DE CADA CASO       */
/* ============================= */

function soloDigitos(el) {
    el.value = el.value.replace(/\D/g, "");
}

const PILLS_ESTADO = {
    ACTIVO:     ["pill-green", "Activo"],
    INACTIVO:   ["pill-red", "Inactivo"],
    FINALIZADO: ["pill-dark", "Cerrado"]
};

function pillEstado(estado) {
    const [clase, texto] = PILLS_ESTADO[estado] || ["pill-gray", "Sin seguimiento"];
    return `<span class="pill ${clase}">${texto}</span>`;
}

function mensajeTicket({ ticket, existeEn2WD, estatus }) {

    if (!ticket) return "";

    let html = existeEn2WD
        ? `<span style="color:#1B5E20">✓ En 2WD${estatus ? " · " + escapeHtml(estatus) : ""}</span>`
        : `<span style="color:#6B7280">✓ Guardado</span>`;

    return html;
}

// Celda editable: se guarda al salir del campo o con Enter. Vacío = sin ticket todavía.
function ticketCeldaHtml(c) {

    const valor = escapeHtml(c.ticketReferencia2WD || "");

    const msg = mensajeTicket({
        ticket: c.ticketReferencia2WD,
        existeEn2WD: !!c.idTicket,
        estatus: c.estatusTicket
    });

    return `
        <div>
            <input id="tk-${c.id}" type="text" inputmode="numeric" maxlength="50"
                value="${valor}" data-original="${valor}" placeholder="Sin ticket"
                oninput="soloDigitos(this)" onblur="guardarTicketCaso(${c.id})"
                onkeydown="if (event.key === 'Enter') this.blur()"
                class="w-full border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
            <div id="tkMsg-${c.id}" class="text-xs mt-1" style="min-height:14px">${msg}</div>
        </div>`;
}

async function guardarTicketCaso(idCaso) {

    const input = document.getElementById(`tk-${idCaso}`);
    if (!input) return;

    const valor = input.value.trim();
    const original = input.dataset.original || "";

    if (valor === original) return;

    const msg = document.getElementById(`tkMsg-${idCaso}`);
    if (msg) msg.innerHTML = '<span style="color:#9CA3AF">Guardando...</span>';

    try {

        const response = await fetch(`${API}/api/casos/${idCaso}/ticket`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket: valor, idAnalista: Number(idActual) })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Error guardando ticket");

        input.value = data.ticket || "";
        input.dataset.original = data.ticket || "";

        const caso = misCasos.find(x => x.id === idCaso);
        if (caso) caso.ticketReferencia2WD = data.ticket;

        if (msg) msg.innerHTML = mensajeTicket(data);

    } catch (error) {
        console.error(error);
        input.value = original;
        if (msg) msg.innerHTML = "";
        mostrarAviso(error.message || "No se pudo guardar el ticket");
    }
}

/* ============================= */
/* BUSCAR CASOS                  */
/* ============================= */

let timerBusqueda = null;

function programarBusquedaCasos() {
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(ejecutarBusquedaCasos, 350);
}

async function ejecutarBusquedaCasos() {

    const cont = document.getElementById("tablaBuscar");
    if (!cont) return;

    const params = new URLSearchParams({ idAnalista: idActual });

    const q = document.getElementById("bus_q").value.trim();
    const desde = document.getElementById("bus_desde").value;
    const hasta = document.getElementById("bus_hasta").value;
    const tipo = document.getElementById("bus_tipo").value;

    if (q) params.set("q", q);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (tipo) params.set("tipo", tipo);
    if (document.getElementById("bus_sin").checked) params.set("sinTicket", "1");

    try {

        const response = await fetch(`${API}/api/casos/buscar?${params}`);
        if (!response.ok) throw new Error("Error buscando casos");

        const casos = await response.json();

        // Si el usuario cambió de pestaña mientras cargaba, no pintar en otra vista
        if (!document.getElementById("tablaBuscar")) return;

        const info = document.getElementById("bus_info");
        if (info) {
            info.textContent = casos.length === 200
                ? "Mostrando los 200 casos más recientes; afina la búsqueda para ver otros."
                : `${casos.length} caso${casos.length === 1 ? "" : "s"} encontrado${casos.length === 1 ? "" : "s"}`;
        }

        if (!casos.length) {
            cont.innerHTML = "<p>No se encontraron casos.</p>";
            return;
        }

        const filas = casos.map(c => `
            <tr class="hover:bg-blue-50 transition text-sm">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">${badgeTipo(c.tipo)}
                        <span class="font-bold text-gray-800">${escapeHtml(c.numerochat)}</span></div>
                    <div class="text-xs text-gray-400 mt-0.5">#${c.id} · ${formatearFecha(c.fecha)}${c.nombreEDS ? " · " + escapeHtml(c.nombreEDS) : ""}</div>
                    ${etiquetaTraspaso(c)}
                </td>
                <td class="px-4 py-3">${pillEstado(c.estado)}</td>
                <td class="px-4 py-3 font-mono text-xs text-gray-700">${c.estado ? formatearDuracion(Number(c.segActivo) + Number(c.segInactivo)) : "—"}</td>
                <td class="px-4 py-3">${ticketCeldaHtml(c)}</td>
            </tr>
        `).join("");

        cont.innerHTML = `
            <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="min-w-full overflow-hidden">
            <thead>
            <tr style="background:#122B4F">
                <th class="${TH}">Caso</th>
                <th class="${TH}">Estado</th>
                <th class="${TH}">Ejecución</th>
                <th class="${TH}">Ticket 2WD</th>
            </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-100">${filas}</tbody>
            </table>
            </div>
        `;

    } catch (error) {
        console.error(error);
        cont.innerHTML = "<p class='text-red-500'>Error buscando casos.</p>";
    }
}

/* ============================= */
/* PASAR CASO                    */
/* ============================= */

function mostrarToast(texto) {

    const el = document.createElement("div");
    el.textContent = texto;
    el.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:60;max-width:340px;padding:14px 18px;" +
        "border-radius:14px;background:#122B4F;color:#fff;font-size:14px;font-weight:600;" +
        "box-shadow:0 8px 24px rgba(0,0,0,0.25)";
    document.body.appendChild(el);

    setTimeout(() => el.remove(), 8000);
}

async function abrirDialogoPasar(idCaso) {

    const caso = misCasos.find(x => x.id === idCaso);
    if (!caso) return;

    let analistas = [];

    try {
        const response = await fetch(`${API}/api/analistas`);
        if (!response.ok) throw new Error("Error obteniendo analistas");
        analistas = (await response.json())
            .filter(a => a.idRol == 1 && a.id != idActual)
            .sort((a, b) => Number(b.activo) - Number(a.activo));
    } catch (error) {
        console.error(error);
        mostrarAviso("No se pudo cargar la lista de analistas");
        return;
    }

    if (!analistas.length) {
        mostrarAviso("No hay otros analistas a quienes pasarles el caso");
        return;
    }

    const opciones = analistas
        .map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}${a.activo == 1 ? "" : " (inactivo)"}</option>`)
        .join("");

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-96 mx-4 overflow-hidden fade-in">
            <div class="px-8 py-5" style="background:#122B4F">
                <h2 class="text-white text-lg font-bold">Pasar caso</h2>
            </div>
            <div class="p-8">
                <p class="text-gray-600 text-sm mb-4">
                    ${caso.tipo === "LLAMADA" ? "Llamada" : "Chat"} <b>${escapeHtml(caso.numerochat)}</b>:
                    se lo asignas a otro analista. Tu tiempo se detiene y sigue corriendo el suyo.
                    Los dos pueden poner el ticket 2WD.
                </p>
                <select id="pasarSelect" style="width:100%;padding:10px 12px;border:1px solid #E5E7EB;border-radius:12px;
                    font-size:14px;background:#fff;margin-bottom:20px">${opciones}</select>
                <div class="flex gap-3">
                    <button data-accion="cancelar"
                        class="flex-1 py-3 rounded-xl font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition">Cancelar</button>
                    <button data-accion="ok"
                        class="flex-1 py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
                        style="background:#1565C0">Pasar caso</button>
                </div>
            </div>
        </div>
    `;

    modal.querySelector('[data-accion="cancelar"]').addEventListener("click", () => modal.remove());

    modal.querySelector('[data-accion="ok"]').addEventListener("click", async () => {
        const aAnalista = Number(modal.querySelector("#pasarSelect").value);
        modal.remove();
        await enviarPasarCaso(idCaso, aAnalista);
    });

    document.body.appendChild(modal);
}

async function enviarPasarCaso(idCaso, aAnalista) {

    let mensaje = "No se pudo pasar el caso";

    try {

        const response = await fetch(`${API}/api/casos/${idCaso}/pasar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idAnalista: Number(idActual), aAnalista })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            mensaje = data.error || mensaje;
            throw new Error(mensaje);
        }

        mostrarToast(`Caso pasado a ${data.aNombre}`);
        await cargarMisCasos();

    } catch (error) {
        console.error(error);
        mostrarAviso(mensaje);
        cargarMisCasos();
    }
}

function seleccionarTipoCaso(tipo) {

    tipoCasoActual = tipo;

    const esLlamada = tipo === "LLAMADA";

    const btnChat = document.getElementById("tipoChat");
    const btnLlamada = document.getElementById("tipoLlamada");
    const activo = "bg-blue-600 text-white";
    const inactivo = "bg-white text-gray-500 hover:text-gray-800";

    if (btnChat) btnChat.className = `flex-1 py-2 rounded-lg text-xs font-bold transition ${esLlamada ? inactivo : activo}`;
    if (btnLlamada) btnLlamada.className = `flex-1 py-2 rounded-lg text-xs font-bold transition ${esLlamada ? activo : inactivo}`;

    const input = document.getElementById("numeroChat");
    if (input) {
        input.placeholder = esLlamada ? "Teléfono del cliente" : "Número de chat 3CX";
        input.focus();
    }

    const aviso = document.getElementById("avisoTipo");
    if (aviso) {
        aviso.textContent = esLlamada
            ? "La llamada queda a tu nombre y no mueve la cola."
            : "El chat se asigna al siguiente en la cola.";
    }

    actualizarEstadoBoton();
}

/* ============================= */
/* MÓDULOS                       */
/* ============================= */

async function mostrarModulo(tipo) {

    const contenedor = document.getElementById("moduloContenido");

    detenerTimerMisCasos();

    if (tipo === "cx3") {

        contenedor.innerHTML = `
            <div class="flex flex-col xl:flex-row gap-6 xl:gap-8 fade-in">

            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-5">
                    <div class="w-1 h-5 rounded-full" style="background:#1565C0"></div>
                    <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Mis casos de hoy</h2>
                </div>
                <div id="tablaMisCasos" class="text-gray-400 text-sm">Cargando...</div>
            </div>

            <div class="w-full max-w-sm xl:max-w-none xl:w-72 xl:flex-shrink-0">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-1 h-5 rounded-full" style="background:#C41E3A"></div>
                    <h3 class="text-base font-bold text-gray-700 tracking-wide uppercase">Tomar Caso</h3>
                </div>
                <div class="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
                    <div class="flex gap-1 p-1 bg-gray-200 rounded-xl">
                        <button id="tipoChat" onclick="seleccionarTipoCaso('CHAT')" type="button">💬 Chat</button>
                        <button id="tipoLlamada" onclick="seleccionarTipoCaso('LLAMADA')" type="button">📞 Llamada</button>
                    </div>
                    <input
                        id="numeroChat"
                        type="text"
                        inputmode="numeric"
                        maxlength="50"
                        placeholder="Número de chat 3CX"
                        class="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"
                    />
                    <input
                        id="nombreChat"
                        type="text"
                        maxlength="200"
                        placeholder="Nombre EDS"
                        class="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"
                    />
                    <input
                        id="ticketNuevo"
                        type="text"
                        inputmode="numeric"
                        maxlength="50"
                        oninput="soloDigitos(this)"
                        placeholder="Ticket 2WD (opcional)"
                        class="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"
                    />
                    <p id="avisoTipo" class="text-xs text-gray-400"></p>
                    <button
                        onclick="tomarCaso()"
                        id="btnTomarCaso"
                        class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition">
                        Registrar Caso
                    </button>
                </div>
            </div>

            </div>
            `;

        const input = document.getElementById("numeroChat");

        input.addEventListener("input", function () {
            this.value = this.value.replace(/\D/g, "");
        });

        [input, document.getElementById("nombreChat"), document.getElementById("ticketNuevo")].forEach(el => {
            el.addEventListener("keypress", function (e) {
                if (e.key === "Enter") {
                    tomarCaso();
                }
            });
        });

        seleccionarTipoCaso(tipoCasoActual);
        cargarMisCasos();

        return;
    } else if (tipo === "buscar") {

        const inputCls = "border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition";
        const labelCls = "block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide";

        contenedor.innerHTML = `
            <div class="fade-in">
                <div class="flex items-center gap-2 mb-5">
                    <div class="w-1 h-5 rounded-full" style="background:#1565C0"></div>
                    <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Buscar mis casos</h2>
                </div>

                <div class="flex flex-wrap items-end gap-4 mb-3 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div style="flex:1;min-width:220px">
                        <label class="${labelCls}">Buscar</label>
                        <input id="bus_q" type="text" maxlength="100" placeholder="Chat, teléfono, EDS o ticket"
                            class="w-full ${inputCls}" oninput="programarBusquedaCasos()"/>
                    </div>
                    <div>
                        <label class="${labelCls}">Desde</label>
                        <input id="bus_desde" type="date" class="${inputCls}" onchange="ejecutarBusquedaCasos()"/>
                    </div>
                    <div>
                        <label class="${labelCls}">Hasta</label>
                        <input id="bus_hasta" type="date" class="${inputCls}" onchange="ejecutarBusquedaCasos()"/>
                    </div>
                    <div>
                        <label class="${labelCls}">Tipo</label>
                        <select id="bus_tipo" class="${inputCls}" onchange="ejecutarBusquedaCasos()">
                            <option value="">Todos</option>
                            <option value="CHAT">Chat</option>
                            <option value="LLAMADA">Llamada</option>
                        </select>
                    </div>
                    <label class="flex items-center gap-2 text-sm text-gray-600 pb-3 cursor-pointer">
                        <input id="bus_sin" type="checkbox" onchange="ejecutarBusquedaCasos()"/> Solo sin ticket
                    </label>
                </div>

                <p id="bus_info" class="text-xs text-gray-400 mb-3">&nbsp;</p>
                <div id="tablaBuscar" class="text-gray-400 text-sm">Cargando...</div>
                <p class="text-xs text-gray-400 mt-2">
                    El ticket de 2WD se guarda al salir del campo o al pulsar Enter. Puedes dejarlo vacío y agregarlo después.
                    Los casos abiertos siguen sumando tiempo.
                </p>
            </div>
        `;

        ejecutarBusquedaCasos();

        return;
    } else if (tipo === "ult10") {

        contenedor.innerHTML = `
            <div class="fade-in">
                <div class="flex items-center gap-2 mb-5">
                    <div class="w-1 h-5 rounded-full" style="background:#1565C0"></div>
                    <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Últimos 10 casos 3CX</h2>
                </div>
                <div id="tablaUlt10" class="text-gray-400 text-sm">Cargando...</div>
            </div>
        `;

        cargarUltimos10();

        return;
    } else if (tipo === "aa") {
        const hoy   = new Date().toISOString().split('T')[0];
        const desde = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                        .toISOString().split('T')[0];

        contenedor.innerHTML = `
            <div class="fade-in">
                <div class="flex items-center gap-2 mb-5">
                    <div class="w-1 h-5 rounded-full" style="background:#1565C0"></div>
                    <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Métricas de Atención</h2>
                </div>

                <div class="flex flex-wrap items-end gap-4 mb-5 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Fecha inicio</label>
                        <input type="date" id="met_inicio" value="${desde}"
                            class="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"/>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Fecha fin</label>
                        <input type="date" id="met_fin" value="${hoy}"
                            class="border border-gray-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"/>
                    </div>
                    <button onclick="cargarMetricas()"
                        class="py-2.5 px-6 text-white rounded-xl font-semibold text-sm transition hover:opacity-90"
                        style="background: linear-gradient(135deg, #122B4F, #1565C0)">
                        Consultar
                    </button>
                    <div class="ml-auto text-right">
                        <div class="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Total período</div>
                        <div id="met_total" class="text-3xl font-black" style="color:#122B4F">—</div>
                    </div>
                </div>

                <div class="bg-white border border-gray-200 rounded-2xl p-5">
                    <div id="met_placeholder" class="text-center py-10 text-gray-400 text-sm">Cargando...</div>
                    <div id="met_canvas_wrap" class="hidden" style="position:relative">
                        <canvas id="met_canvas"></canvas>
                    </div>
                </div>
            </div>`;

        cargarMetricas();
    } else if (tipo === "ticket") {
        contenedor.innerHTML = `
            <div class="flex gap-6 fade-in">

                <!-- FORMULARIO TICKET -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-5">
                        <div class="w-1 h-5 rounded-full" style="background:#1565C0"></div>
                        <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Nuevo Ticket</h2>
                    </div>

                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Caso Atendido *</label>
                                <input id="tk_casoAtendido" type="text" placeholder="Ej. Caso 001"
                                    class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Fecha del Caso *</label>
                                <input id="tk_fechaCaso" type="date" value="${new Date().toISOString().split('T')[0]}"
                                    class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">EDS *</label>
                                <div class="relative">
                                    <input type="text" id="ds_EDS_text" placeholder="Buscar o seleccionar..." autocomplete="off"
                                        class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                                    <input type="hidden" id="ds_EDS_val"/>
                                    <svg class="absolute right-3 top-3 pointer-events-none text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                    <div id="ds_EDS_list" class="absolute z-30 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto hidden"></div>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Tipo de Caso *</label>
                                <div class="relative">
                                    <input type="text" id="ds_tipoCaso_text" placeholder="Buscar o seleccionar..." autocomplete="off"
                                        class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                                    <input type="hidden" id="ds_tipoCaso_val"/>
                                    <svg class="absolute right-3 top-3 pointer-events-none text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                    <div id="ds_tipoCaso_list" class="absolute z-30 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto hidden"></div>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Categoría *</label>
                                <div class="relative">
                                    <input type="text" id="ds_categoria_text" placeholder="Buscar o seleccionar..." autocomplete="off"
                                        class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                                    <input type="hidden" id="ds_categoria_val"/>
                                    <svg class="absolute right-3 top-3 pointer-events-none text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                    <div id="ds_categoria_list" class="absolute z-30 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto hidden"></div>
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Tiempo Atención (min)</label>
                                <input id="tk_tiempoAtencionMin" type="number" min="0" placeholder="Minutos"
                                    class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Versión</label>
                                <input id="tk_versiones" type="text" placeholder="Ej. v2.3.1"
                                    class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Origen de la Falla</label>
                            <textarea id="tk_origenFalla" rows="2" placeholder="Describe el origen del problema..."
                                class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition resize-none"></textarea>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Solución</label>
                            <textarea id="tk_solucion" rows="2" placeholder="Describe la solución aplicada..."
                                class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition resize-none"></textarea>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Observaciones</label>
                            <textarea id="tk_observaciones" rows="2" placeholder="Observaciones adicionales..."
                                class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition resize-none"></textarea>
                        </div>

                        <div class="flex items-center gap-4 pt-1">
                            <button disabled
                                class="flex-1 py-3 rounded-xl font-semibold text-sm cursor-not-allowed"
                                style="background:#E5E7EB;color:#9CA3AF" title="Registro de tickets deshabilitado temporalmente">
                                Guardar Ticket
                            </button>
                            <span id="tk_mensaje" class="text-sm font-medium"></span>
                        </div>
                    </div>
                </div>

                <!-- PANEL IA -->
                <div class="w-72 flex-shrink-0">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="w-1 h-5 rounded-full" style="background:#C41E3A"></div>
                        <h3 class="text-base font-bold text-gray-700 tracking-wide uppercase">Asistente IA</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full text-white font-bold" style="background:#1565C0">Claude</span>
                    </div>
                    <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                        <textarea id="ia_prompt" rows="5" placeholder="Describe el caso o escribe lo que necesitas y la IA te ayudará a redactar el ticket..."
                            class="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition resize-none"></textarea>
                        <button onclick="consultarIA()" id="ia_btn"
                            class="w-full py-2.5 text-white rounded-xl font-semibold text-sm transition hover:opacity-90"
                            style="background: linear-gradient(135deg, #C41E3A, #9a1228)">
                            ✨ Generar con IA
                        </button>
                        <div id="ia_loading" class="hidden text-center py-3">
                            <div class="inline-block w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-2"></div>
                            <p class="text-xs text-gray-400">Generando respuesta...</p>
                        </div>
                        <div id="ia_resultado" class="hidden space-y-2">
                            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Respuesta</div>
                            <div id="ia_texto" class="text-sm text-gray-700 bg-white rounded-xl border border-gray-200 p-3 max-h-52 overflow-y-auto leading-relaxed whitespace-pre-wrap"></div>
                            <button onclick="copiarIA()" class="w-full py-2 text-gray-600 border border-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-100 transition">
                                Copiar texto
                            </button>
                        </div>
                    </div>
                </div>

            </div>`;

        try {
            const [estaciones, categorias, tiposCaso] = await Promise.all([
                fetch(`${API}/api/catalogos/estaciones`).then(r => r.json()),
                fetch(`${API}/api/catalogos/categorias`).then(r => r.json()),
                fetch(`${API}/api/catalogos/tiposcaso`).then(r => r.json())
            ]);
            crearDropdown('EDS',       estaciones, 'nombre');
            crearDropdown('tipoCaso',  tiposCaso,  'id');
            crearDropdown('categoria', categorias, 'id');
        } catch (err) {
            console.error('Error cargando catálogos:', err);
        }
    }
}
async function tomarCaso() {

    if (!analistaActual) return;

    // Los chats solo los toma quien tiene el turno; las llamadas siempre se pueden registrar
    if (tipoCasoActual === "CHAT" && analistaActual.orden != 1) return;

    const input = document.getElementById("numeroChat");
    const inputEDS = document.getElementById("nombreChat");
    const inputTicket = document.getElementById("ticketNuevo");
    let mensaje = "No se pudo registrar el caso";
    const numero = input.value;

    if (!numero) {
        input.focus();
        return;
    }

    try {

        const response = await fetch(`${API}/api/casos/tomar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                numerochat: numero,
                nombreEDS: inputEDS ? inputEDS.value : "",
                tipo: tipoCasoActual,
                idAnalista: Number(idActual),
                ticketReferencia2WD: inputTicket ? inputTicket.value : ""
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            mensaje = data.error || mensaje;
            throw new Error(mensaje);
        }

        input.value = "";
        if (inputEDS) inputEDS.value = "";
        if (inputTicket) inputTicket.value = "";
        input.focus();

    } catch (error) {
        console.error(error);
        mostrarAviso(mensaje);
    }

}

function actualizarEstadoBoton() {

    const boton = document.getElementById("btnTomarCaso");

    if (!boton || !analistaActual) return;

    if (tipoCasoActual === "LLAMADA" || analistaActual.orden == 1) {

        boton.disabled = false;
        boton.classList.remove("bg-gray-400", "cursor-not-allowed");
        boton.classList.add("bg-blue-600", "hover:bg-blue-700");

    } else {

        boton.disabled = true;
        boton.classList.remove("bg-blue-600", "hover:bg-blue-700");
        boton.classList.add("bg-gray-400", "cursor-not-allowed");

    }
}

/* ============================= */
/* TICKET                        */
/* ============================= */

function crearDropdown(id, opciones, valueKey) {
    const textEl   = document.getElementById(`ds_${id}_text`);
    const listEl   = document.getElementById(`ds_${id}_list`);
    const hiddenEl = document.getElementById(`ds_${id}_val`);
    if (!textEl || !listEl || !hiddenEl) return;

    function render(filtro) {
        const q = (filtro || '').toLowerCase();
        const filtradas = opciones.filter(o => o.nombre.toLowerCase().includes(q));

        if (!filtradas.length) {
            listEl.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400 italic">Sin resultados</div>';
            return;
        }

        listEl.innerHTML = filtradas.map(o => `
            <div class="ds-opt px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition border-b border-gray-50 last:border-0"
                 data-val="${o[valueKey]}" data-label="${o.nombre}">
                ${o.nombre}
            </div>
        `).join('');

        listEl.querySelectorAll('.ds-opt').forEach(el => {
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                textEl.value   = el.dataset.label;
                hiddenEl.value = el.dataset.val;
                listEl.classList.add('hidden');
            });
        });
    }

    textEl.addEventListener('focus', () => {
        render(textEl.value);
        listEl.classList.remove('hidden');
    });

    textEl.addEventListener('input', () => {
        hiddenEl.value = '';
        render(textEl.value);
        listEl.classList.remove('hidden');
    });

    textEl.addEventListener('blur', () => {
        setTimeout(() => listEl.classList.add('hidden'), 160);
    });

    render('');
}

async function guardarTicket() {
    if (!document.getElementById('tk_casoAtendido')?.value) {
        _tkMensaje('⚠ El caso atendido es requerido', 'text-orange-500'); return;
    }
    if (!document.getElementById('tk_fechaCaso')?.value) {
        _tkMensaje('⚠ La fecha del caso es requerida', 'text-orange-500'); return;
    }
    if (!document.getElementById('ds_EDS_val')?.value) {
        _tkMensaje('⚠ Selecciona una EDS', 'text-orange-500'); return;
    }
    if (!document.getElementById('ds_tipoCaso_val')?.value) {
        _tkMensaje('⚠ Selecciona el tipo de caso', 'text-orange-500'); return;
    }
    if (!document.getElementById('ds_categoria_val')?.value) {
        _tkMensaje('⚠ Selecciona una categoría', 'text-orange-500'); return;
    }

    const payload = {
        casoAtendido:      document.getElementById('tk_casoAtendido').value,
        fechaCaso:         document.getElementById('tk_fechaCaso').value,
        EDS:               document.getElementById('ds_EDS_val').value,
        idTipoCaso:        parseInt(document.getElementById('ds_tipoCaso_val').value),
        idCategoria:       parseInt(document.getElementById('ds_categoria_val').value),
        origenFalla:       document.getElementById('tk_origenFalla').value || null,
        solucion:          document.getElementById('tk_solucion').value || null,
        idAnalista:        parseInt(idActual),
        tiempoAtencionMin: document.getElementById('tk_tiempoAtencionMin').value
                             ? parseInt(document.getElementById('tk_tiempoAtencionMin').value) : null,
        versiones:         document.getElementById('tk_versiones').value || null,
        observaciones:     document.getElementById('tk_observaciones').value || null
    };

    try {
        const res = await fetch(`${API}/api/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Error');

        _tkMensaje('✓ Ticket guardado exitosamente', 'text-green-600');

        ['EDS', 'tipoCaso', 'categoria'].forEach(id => {
            const t = document.getElementById(`ds_${id}_text`);
            const v = document.getElementById(`ds_${id}_val`);
            if (t) t.value = '';
            if (v) v.value = '';
        });
        ['casoAtendido', 'tiempoAtencionMin', 'versiones', 'origenFalla', 'solucion', 'observaciones']
            .forEach(f => { document.getElementById(`tk_${f}`).value = ''; });
        const fc = document.getElementById('tk_fechaCaso');
        if (fc) fc.value = new Date().toISOString().split('T')[0];

        setTimeout(() => _tkMensaje('', ''), 3000);

    } catch {
        _tkMensaje('✗ Error al guardar el ticket', 'text-red-500');
    }
}

function _tkMensaje(texto, clase) {
    const el = document.getElementById('tk_mensaje');
    if (!el) return;
    el.textContent = texto;
    el.className = `text-sm font-medium ${clase}`;
}

function cerrarSesion() {
    localStorage.removeItem('idAnalista');
    window.location.href = 'index.html';
}

/* ============================= */
/* MÉTRICAS                      */
/* ============================= */

let _metChart = null;

async function cargarMetricas() {
    const inicio = document.getElementById('met_inicio')?.value;
    const fin    = document.getElementById('met_fin')?.value;
    if (!inicio || !fin) return;

    const placeholder = document.getElementById('met_placeholder');
    const wrap        = document.getElementById('met_canvas_wrap');
    if (!placeholder || !wrap) return;

    placeholder.textContent = 'Cargando...';
    placeholder.classList.remove('hidden');
    wrap.classList.add('hidden');

    try {
        const res  = await fetch(`${API}/api/metricas?fechaInicio=${inicio}&fechaFin=${fin}`);
        const data = await res.json();

        const total = data.reduce((s, d) => s + d.casos, 0);
        const elTotal = document.getElementById('met_total');
        if (elTotal) elTotal.textContent = total;

        if (!data.length) {
            placeholder.textContent = 'Sin datos para el período seleccionado.';
            return;
        }

        placeholder.classList.add('hidden');
        wrap.classList.remove('hidden');

        const alturaBarras = Math.max(220, data.length * 52 + 60);
        wrap.style.height  = alturaBarras + 'px';

        if (_metChart) { _metChart.destroy(); _metChart = null; }

        const colores = ['#122B4F', '#1565C0', '#1976D2', '#1E88E5', '#42A5F5'];

        _metChart = new Chart(document.getElementById('met_canvas'), {
            type: 'bar',
            data: {
                labels: data.map(d => d.nombre),
                datasets: [{
                    label: 'Casos',
                    data:  data.map(d => d.casos),
                    backgroundColor: data.map((_, i) => colores[i % colores.length]),
                    borderRadius: 8,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `  ${ctx.raw} caso${ctx.raw !== 1 ? 's' : ''}`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, precision: 0, color: '#9CA3AF' },
                        grid:  { color: '#F3F4F6' }
                    },
                    y: {
                        grid:  { display: false },
                        ticks: { color: '#374151', font: { weight: '600', size: 13 } }
                    }
                }
            }
        });

    } catch (err) {
        placeholder.textContent = 'Error cargando métricas.';
        placeholder.classList.remove('hidden');
        wrap.classList.add('hidden');
    }
}

/* ============================= */
/* IA                            */
/* ============================= */

async function consultarIA() {
    const prompt = document.getElementById('ia_prompt')?.value?.trim();
    if (!prompt) return;

    const btn     = document.getElementById('ia_btn');
    const loading = document.getElementById('ia_loading');
    const result  = document.getElementById('ia_resultado');

    btn.disabled = true;
    btn.style.opacity = '0.6';
    loading.classList.remove('hidden');
    result.classList.add('hidden');

    try {
        const res = await fetch(`${API}/api/ia/generar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error');

        document.getElementById('ia_texto').textContent = data.resultado;
        result.classList.remove('hidden');

    } catch (err) {
        document.getElementById('ia_texto').textContent = `Error: ${err.message}`;
        result.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
        loading.classList.add('hidden');
    }
}

function copiarIA() {
    const texto = document.getElementById('ia_texto')?.textContent || '';
    navigator.clipboard.writeText(texto).catch(() => {});
}

