
const API = "http://localhost:3000";
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

        document.getElementById("nombreAnalista").textContent = analistaActual.nombre;

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
        texto.className = "text-green-600 font-semibold text-lg";

        switchBtn.classList.remove("bg-gray-300");
        switchBtn.classList.add("bg-green-500");

        circulo.classList.add("translate-x-7");

    } else {

        texto.textContent = "Inactivo";
        texto.className = "text-red-600 font-semibold text-lg";

        switchBtn.classList.remove("bg-green-500");
        switchBtn.classList.add("bg-gray-300");

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

    modal.className = `
        fixed inset-0 bg-black bg-opacity-50
        flex items-center justify-center z-50
    `;

    modal.innerHTML = `
        <div class="bg-white rounded-xl p-8 shadow-xl text-center w-96">

            <h2 class="text-xl font-bold mb-4 text-red-600">
                Acción no permitida
            </h2>

            <p class="mb-4 text-gray-700">
                No puedes inactivarte en horario laboral.
                En dado caso, contacta a tu coordinador favorito.
            </p>

            <img 
                src="img/risa.png"
                class="mx-auto mb-5 w-40"
            >

            <button
                class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                onclick="this.closest('.fixed').remove()"
            >
                Entendido
            </button>

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

            if (index === 0) {

                div.className =
                    "flex items-center justify-between bg-emerald-500 border-2 border-emerald-400 text-emerald-800 px-4 py-3 rounded-xl shadow-md animate-pulse";

                div.innerHTML = `
          <span class="font-bold">${a.nombre}</span>
          <span class="font-bold">Próximo turno</span>
        `;

            } else {

                div.className =
                    "flex items-center justify-between bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-xl shadow-sm";

                div.innerHTML = `
          <span>${a.nombre}</span>
          <span class="text-green-600 font-bold text-lg">✔</span>
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
            <div class="flex gap-10">

            <div class="flex-1">

            <h2 class="text-xl font-bold mb-6">Últimos 5 Casos 3CX</h2>

            <div id="tablaCasos" class="text-gray-500">
            Cargando...
            </div>

            </div>

            <div class="w-72">

            <h3 class="text-lg font-bold mb-4">
            Tomar Caso
            </h3>

            <div class="bg-gray-50 p-5 rounded-xl shadow space-y-4">

            <input
            id="numeroChat"
            type="text"
            inputmode="numeric"
            placeholder="Número Chat"
            class="w-full border border-gray-300 rounded-lg px-3 py-2"
            />

            <button
            onclick="tomarCaso()"
            id="btnTomarCaso"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg">
            Tomar Caso
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
                <div class="overflow-x-auto">
                <table class="min-w-full border border-gray-200 rounded-xl overflow-hidden">
                <thead class="bg-blue-600 text-white">
                <tr>
                <th class="px-4 py-3 text-left">ID</th>
                <th class="px-4 py-3 text-left">Número Chat 3CX</th>
                <th class="px-4 py-3 text-left">Fecha</th>
                <th class="px-4 py-3 text-left">Analista</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
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
                    <tr class="hover:bg-gray-50 transition">
                    <td class="px-4 py-3">${c.id}</td>
                    <td class="px-4 py-3 font-semibold">${c.numerochat}</td>
                    <td class="px-4 py-3">${fecha}</td>
                    <td class="px-4 py-3">${c.nombre}</td>
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
        contenedor.innerHTML = `
            <div class="p-5 bg-yellow-50 rounded-xl shadow">
            <h2 class="text-xl font-bold mb-4">Módulo en construcción</h2>`
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

