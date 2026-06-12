
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

socket.on("nuevoCaso3CX", (caso) => {
    console.log("Nuevo caso:", caso);
    agregarFilaATabla(caso);
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
        alert("Error cargando información");
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
        alert("No se pudo cambiar el estado");
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

function agregarFilaATabla(c) {

    const tbody = document.querySelector("#tablaCasos table tbody");
    if (!tbody) return;

    const fecha = new Date(c.fecha).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    const fila = document.createElement("tr");

    fila.innerHTML = `
    <td class="px-4 py-3">${c.id}</td>
    <td class="px-4 py-3 font-semibold">${c.numerochat}</td>
    <td class="px-4 py-3">${fecha}</td>
    <td class="px-4 py-3">${c.nombre}</td>
  `;

    tbody.insertBefore(fila, tbody.firstChild);

    const filas = tbody.querySelectorAll("tr");

    if (filas.length > 5) {
        filas[filas.length - 1].remove();
    }
}

/* ============================= */
/* MÓDULOS                       */
/* ============================= */

async function mostrarModulo(tipo) {

    const contenedor = document.getElementById("moduloContenido");

    if (tipo === "cx3") {

        contenedor.innerHTML = `
            <div class="flex gap-8 fade-in">

            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-5">
                    <div class="w-1 h-5 rounded-full" style="background:#1565C0"></div>
                    <h2 class="text-base font-bold text-gray-700 tracking-wide uppercase">Últimos 5 Casos 3CX</h2>
                </div>
                <div id="tablaCasos" class="text-gray-400 text-sm">Cargando...</div>
            </div>

            <div class="w-68 flex-shrink-0" style="width:270px">
                <div class="flex items-center gap-2 mb-4">
                    <div class="w-1 h-5 rounded-full" style="background:#C41E3A"></div>
                    <h3 class="text-base font-bold text-gray-700 tracking-wide uppercase">Tomar Caso</h3>
                </div>
                <div class="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
                    <input
                        id="numeroChat"
                        type="text"
                        inputmode="numeric"
                        placeholder="Número de chat 3CX"
                        class="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"
                    />
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

                input.addEventListener("keypress", function (e) {
                    if (e.key === "Enter") {
                        tomarCaso();
                    }
                });

                input.focus();

        try {

            const response = await fetch(`${API}/api/casos/lista`);
            const casos = await response.json();

            if (!casos.length) {
                document.getElementById("tablaCasos").innerHTML =
                    "<p>No hay casos registrados.</p>";
                return;
            }

            let tabla = `
                <div class="overflow-x-auto rounded-xl border border-gray-200">
                <table class="min-w-full overflow-hidden">
                <thead>
                <tr style="background:#122B4F">
                <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">ID</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Número Chat</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Fecha</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-blue-200 tracking-widest uppercase">Analista</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                `;

            casos.forEach(c => {

                const fecha = new Date(c.fecha).toLocaleString("es-CO", {
                    timeZone: "America/Bogota",
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                });

                tabla += `
                    <tr class="hover:bg-blue-50 transition text-sm">
                    <td class="px-4 py-3 text-gray-400 font-mono text-xs">#${c.id}</td>
                    <td class="px-4 py-3 font-bold text-gray-800">${c.numerochat}</td>
                    <td class="px-4 py-3 text-gray-500">${fecha}</td>
                    <td class="px-4 py-3 text-gray-700">${c.nombre}</td>
                    </tr>
                    `;
            });

            tabla += `
                </tbody>
                </table>
                </div>
                `;

            document.getElementById("tablaCasos").innerHTML = tabla;
            actualizarEstadoBoton();
        } catch (error) {

            document.getElementById("tablaCasos").innerHTML =
                "<p class='text-red-500'>Error cargando casos.</p>";

        }

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
                            <button onclick="guardarTicket()"
                                class="flex-1 py-3 text-white rounded-xl font-semibold text-sm transition hover:opacity-90"
                                style="background: linear-gradient(135deg, #122B4F, #1565C0)">
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

    const input = document.getElementById("numeroChat");
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
                numerochat: numero
            })
        });

        if (!response.ok) throw new Error("Error tomando caso");

        input.value = "";
        input.focus();

    } catch (error) {
        console.error(error);
    }

}

function actualizarEstadoBoton() {

    const boton = document.getElementById("btnTomarCaso");

    if (!boton || !analistaActual) return;

    if (analistaActual.orden == 1) {

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

