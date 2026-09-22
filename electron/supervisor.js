const supervId     = localStorage.getItem('supervId');
const supervNombre = localStorage.getItem('supervNombre');
if (!supervId) window.location.href = 'index.html';

let mesActual, anioActual;
let filtroAnalista = '', filtroEDS = '', filtroCategoria = '', filtroGrupoCategoria = '';
let filtroGrupo = 0;  // 0 = General (todos los grupos)
let _grupos = [];
let buscEDS = null, buscCat = null;
let _generandoInforme = false; // evita que un refresco del dashboard interrumpa la captura del PDF
const charts = {};

const PALETTE = ['#122B4F','#1565C0','#C41E3A','#1B5E20','#E65100','#6A1B9A','#00695C','#F57F17','#AD1457','#37474F'];

function barColors(n, base = '#1565C0') {
  if (n <= 1) return [base];
  return Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    return lerpHex('#122B4F', '#42A5F5', t);
  });
}

function lerpHex(a, b, t) {
  const h = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const ca = h(a), cb = h(b);
  const r = ca.map((v,i) => Math.round(v + (cb[i]-v)*t));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('supervNombreNav').textContent = supervNombre || '';

  const now = new Date();
  mesActual  = now.getMonth() + 1;
  anioActual = now.getFullYear();

  buildPeriodoSelectors();
  cargarGrupos();
  cargarFiltros();
  cargarDashboard();

  if (typeof socket !== 'undefined') {
    socket.on('ticketsActualizados',  scheduleRefresh);
    socket.on('analistaActualizado',  scheduleRefresh);
    socket.on('nuevoCaso3CX',         scheduleRefresh);
  }
});

function buildPeriodoSelectors() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const selMes  = document.getElementById('sel-mes');
  const selAnio = document.getElementById('sel-anio');

  const todos = document.createElement('option');
  todos.value = 0; todos.textContent = 'Todos los meses';
  selMes.appendChild(todos);

  meses.forEach((m, i) => {
    const o = document.createElement('option');
    o.value = i + 1;
    o.textContent = m;
    if (i + 1 === mesActual) o.selected = true;
    selMes.appendChild(o);
  });

  const baseAnio = 2024;
  for (let y = baseAnio; y <= anioActual + 1; y++) {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    if (y === anioActual) o.selected = true;
    selAnio.appendChild(o);
  }

  selMes.addEventListener('change',  () => { mesActual  = parseInt(selMes.value);  cargarDashboard(); });
  selAnio.addEventListener('change', () => { anioActual = parseInt(selAnio.value); cargarDashboard(); });
}

function crearBuscable({ inputId, listId, clearId, opciones, onSelect }) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);
  const clearBtn = document.getElementById(clearId);

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function resaltar(texto, q) {
    if (!q) return texto;
    const idx = norm(texto).indexOf(norm(q));
    if (idx < 0) return texto;
    return texto.slice(0, idx) +
      `<mark>${texto.slice(idx, idx + q.length)}</mark>` +
      texto.slice(idx + q.length);
  }

  function renderOpts(q) {
    const filtradas = q
      ? opciones.filter(o => norm(o.label).includes(norm(q)))
      : opciones;

    list.innerHTML = filtradas.length
      ? filtradas.map(o =>
          `<div class="b-opt" data-v="${o.value}" data-l="${o.label.replace(/"/g,'&quot;')}">
            ${resaltar(o.label, q)}
          </div>`).join('')
      : `<div class="b-empty">Sin resultados</div>`;

    list.querySelectorAll('.b-opt').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = el.dataset.l;
        onSelect(el.dataset.v);
        list.classList.remove('open');
        if (clearBtn) clearBtn.style.display = 'inline';
      });
    });
  }

  input.addEventListener('focus', () => { renderOpts(input.value); list.classList.add('open'); });
  input.addEventListener('input', () => { onSelect(''); renderOpts(input.value); list.classList.add('open'); if (clearBtn) clearBtn.style.display = 'none'; });
  input.addEventListener('blur',  () => { setTimeout(() => list.classList.remove('open'), 150); });

  renderOpts('');

  return {
    clear() {
      input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      onSelect('');
      actualizarIndicadorFiltros();
      list.classList.remove('open');
    }
  };
}

async function cargarGrupos() {
  try {
    _grupos = await fetch(`${API}/api/catalogos/grupos`).then(r => r.json());
  } catch (e) {
    _grupos = [];
  }
  renderGrupoNav();
}

function renderGrupoNav() {
  const nav = document.getElementById('grupo-nav-tabs');
  if (!nav) return;
  const todos = [{ id: 0, nombre: 'General' }, ..._grupos];
  nav.innerHTML = todos.map(g => {
    const icon = g.id === 0
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    return `<button class="grupo-tab${filtroGrupo === g.id ? ' active' : ''}" onclick="seleccionarGrupo(${g.id})">${icon}${g.nombre}</button>`;
  }).join('');
}

function seleccionarGrupo(id) {
  filtroGrupo = id;
  renderGrupoNav();
  cargarDashboard();
}

async function cargarFiltros() {
  try {
    const [analistas, estaciones, categorias, gruposCategoria] = await Promise.all([
      fetch(`${API}/api/catalogos/analistas`).then(r => r.json()),
      fetch(`${API}/api/catalogos/estaciones`).then(r => r.json()),
      fetch(`${API}/api/catalogos/categorias`).then(r => r.json()),
      fetch(`${API}/api/catalogos/grupos-categoria`).then(r => r.json()),
    ]);

    const selAna = document.getElementById('fil-analista');
    analistas.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = a.nombre;
      selAna.appendChild(o);
    });
    selAna.addEventListener('change', () => { filtroAnalista = selAna.value; actualizarIndicadorFiltros(); cargarDashboard(); });

    const selGrupoCat = document.getElementById('fil-grupo-cat');
    gruposCategoria.forEach(g => {
      const o = document.createElement('option');
      o.value = g.nombre; o.textContent = g.nombre;
      selGrupoCat.appendChild(o);
    });
    selGrupoCat.addEventListener('change', () => { filtroGrupoCategoria = selGrupoCat.value; actualizarIndicadorFiltros(); cargarDashboard(); });

    buscEDS = crearBuscable({
      inputId: 'fil-eds-input', listId: 'fil-eds-list', clearId: 'fil-eds-clear',
      opciones: estaciones.map(e => ({ value: e.nombre, label: e.nombre })),
      onSelect(v) { filtroEDS = v; actualizarIndicadorFiltros(); cargarDashboard(); }
    });

    buscCat = crearBuscable({
      inputId: 'fil-cat-input', listId: 'fil-cat-list', clearId: 'fil-cat-clear',
      opciones: categorias.map(c => ({ value: String(c.id), label: c.nombre })),
      onSelect(v) { filtroCategoria = v; actualizarIndicadorFiltros(); cargarDashboard(); }
    });

  } catch (e) {
    console.error('Error cargando filtros:', e);
  }
}

function actualizarIndicadorFiltros() {
  const hayFiltros = filtroAnalista || filtroEDS || filtroCategoria || filtroGrupoCategoria;
  document.getElementById('filtros-activos')?.classList.toggle('hidden', !hayFiltros);
}

function limpiarFiltros() {
  filtroAnalista = ''; filtroEDS = ''; filtroCategoria = ''; filtroGrupoCategoria = '';
  document.getElementById('fil-analista').value = '';
  document.getElementById('fil-grupo-cat').value = '';
  if (buscEDS) buscEDS.clear();
  if (buscCat) buscCat.clear();
  actualizarIndicadorFiltros();
  cargarDashboard();
}

function toggleExportMenu() {
  const menu = document.getElementById('export-menu');
  menu.classList.toggle('open');
  document.addEventListener('click', function cerrar(e) {
    if (!document.getElementById('btn-exportar').contains(e.target)) {
      menu.classList.remove('open');
      document.removeEventListener('click', cerrar);
    }
  });
}

function nombreReporte() {
  const mesLabel = mesActual > 0
    ? ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mesActual-1]
    : 'Anual';
  return { nombre: `Reporte-CAC-${mesLabel}-${anioActual}`, periodo: `${mesLabel} ${anioActual}` };
}

/* ============================= */
/* INFORME PDF                   */
/* ============================= */

function filtrosTexto() {
  const partes = [];
  const selAna = document.getElementById('fil-analista');
  if (filtroAnalista && selAna) {
    const opt = [...selAna.options].find(o => o.value === filtroAnalista);
    if (opt) partes.push(`Responsable: ${opt.textContent}`);
  }
  if (filtroEDS)       partes.push(`EDS: ${filtroEDS}`);
  if (filtroGrupoCategoria) partes.push(`Grupo categoría: ${filtroGrupoCategoria}`);
  if (filtroCategoria) {
    const txt = document.getElementById('fil-cat-input')?.value;
    if (txt) partes.push(`Categoría: ${txt}`);
  }
  if (filtroGrupo > 0) {
    const g = _grupos.find(g => g.id === filtroGrupo);
    if (g) partes.push(`Grupo: ${g.nombre}`);
  }
  return partes.join('  ·  ');
}

async function esperarFrame(n = 1) {
  for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
}

// Las tablas largas viven dentro de un contenedor con scroll interno (max-height + overflow),
// que recorta lo que no se ve en pantalla. Para el informe hay que destaparlas mientras se
// captura, pero con un límite generoso: alguna tabla (p. ej. Ranking EDS) puede traer cientos
// de filas sin límite del servidor, y capturarla entera volvería la imagen gigante y muy lenta.
const ALTO_MAXIMO_TABLA_PDF = 1100; // ~30 filas, suficiente para casi cualquier tabla real
function destaparTablas(el) {
  const contenedores = el.querySelectorAll('.tabla-scroll');
  const originales = [];
  contenedores.forEach(c => {
    originales.push({ el: c, maxHeight: c.style.maxHeight, overflow: c.style.overflow });
    c.style.maxHeight = ALTO_MAXIMO_TABLA_PDF + 'px';
    c.style.overflow = 'hidden';
  });
  return () => originales.forEach(o => { o.el.style.maxHeight = o.maxHeight; o.el.style.overflow = o.overflow; });
}

// Captura un elemento del DOM tal como se ve (fondo blanco, para que quede limpio en el PDF)
async function capturarElemento(el) {
  const restaurar = destaparTablas(el);
  try {
    await esperarFrame(1);
    return await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#FFFFFF' });
  } finally {
    restaurar();
  }
}

// Recorre las vistas del sidebar y captura cada una por separado, ya que solo una
// está visible a la vez y los gráficos de las demás no tienen tamaño hasta mostrarlas.
async function capturarVistas() {
  const vistaOriginal = document.querySelector('.view.active')?.dataset.view;
  const bloques = [];

  // Mientras se genera el informe no debe llegar un refresco del dashboard a mitad de una
  // captura (cambiaría datos o destruiría un gráfico justo cuando se está fotografiando).
  _generandoInforme = true;

  try {

    const kpiRow = document.getElementById('kpi-row');
    if (kpiRow && kpiRow.children.length) {
      const canvas = await capturarElemento(kpiRow);
      if (canvas.width > 0 && canvas.height > 0) {
        bloques.push({ titulo: 'Indicadores del período', canvas });
      }
    }

    for (const v of VISTAS) {
      const el = document.querySelector(`.view[data-view="${v.id}"]`);
      if (!el) continue;

      mostrarVista(v.id);
      await esperarFrame(2);
      Object.values(charts).forEach(c => { try { c.resize(); } catch (e) {} });
      await esperarFrame(2);

      bloques.push({ titulo: v.label, canvas: await capturarElemento(el) });
    }

    if (vistaOriginal) {
      mostrarVista(vistaOriginal);
      await esperarFrame(1);
      Object.values(charts).forEach(c => { try { c.resize(); } catch (e) {} });
    }

  } finally {
    _generandoInforme = false;
  }

  return bloques;
}

// Arma el PDF: portada + un bloque por sección, con título de texto real (no parte de la
// imagen) y sin cortar una tarjeta o gráfico a la mitad entre dos páginas cuando se puede evitar.
async function generarPdfDashboard() {

  const bloques = await capturarVistas();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const margen = 12;
  const anchoUtil = pdfW - margen * 2;

  const { periodo } = nombreReporte();
  const ahora = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // ── Portada ──
  pdf.setFillColor(18, 43, 79); // #122B4F
  pdf.rect(0, 0, pdfW, 58, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('Informe CAC INSEPET', margen, 28);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`Panel de supervisor · Período: ${periodo}`, margen, 40);
  pdf.setFontSize(9);
  pdf.text(`Generado el ${ahora}${supervNombre ? ' · ' + supervNombre : ''}`, margen, 48);

  const filtros = filtrosTexto();
  let y = 70;
  if (filtros) {
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(9);
    pdf.text(`Filtros aplicados: ${filtros}`, margen, y);
    y += 10;
  }

  const nuevaPagina = () => {
    pdf.addPage();
    y = margen + 4;
  };

  const dibujarTitulo = (texto) => {
    if (y > pdfH - margen - 14) nuevaPagina();
    pdf.setFillColor(196, 30, 58); // #C41E3A, acento como en la app
    pdf.rect(margen, y - 3.5, 1.4, 5.5, 'F');
    pdf.setTextColor(31, 41, 55);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(texto, margen + 4, y);
    y += 7;
  };

  for (const b of bloques) {
    const imgH = (b.canvas.height * anchoUtil) / b.canvas.width;
    const imgData = b.canvas.toDataURL('image/jpeg', 0.94);
    const altoDisponible = pdfH - margen - y;

    // Si la sección completa no cabe en lo que queda de página, empieza una nueva
    // (evita cortar una tarjeta o un gráfico a la mitad). Solo si ni siquiera cabe
    // en una página entera se corta en varias, como último recurso.
    if (imgH > altoDisponible && imgH <= pdfH - margen * 2 - 10) {
      nuevaPagina();
    }

    dibujarTitulo(b.titulo);

    if (y + imgH <= pdfH - margen) {
      pdf.addImage(imgData, 'JPEG', margen, y, anchoUtil, imgH);
      y += imgH + 10;
    } else {
      // Sección más alta que una página: se reparte en varias, empezando cada una arriba
      let restante = imgH, offset = 0;
      while (restante > 0) {
        const disponible = pdfH - margen - y;
        pdf.addImage(imgData, 'JPEG', margen, y - offset, anchoUtil, imgH);
        restante -= disponible;
        offset += disponible;
        if (restante > 0) nuevaPagina();
      }
      y += 10;
    }
  }

  // Numeración de páginas
  const total = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text(`Página ${i} de ${total}`, pdfW - margen, pdfH - 6, { align: 'right' });
  }

  return { blob: pdf.output('blob') };
}

async function exportarReporte(formato) {
  document.getElementById('export-menu').classList.remove('open');
  const btn = document.getElementById('btn-exportar');
  btn.textContent = 'Generando...';
  btn.disabled = true;

  try {
    const { nombre } = nombreReporte();

    if (formato === 'jpg') {
      const vistaActiva = document.querySelector('.view.active');
      const canvas = await capturarElemento(vistaActiva || document.querySelector('main'));
      const link = document.createElement('a');
      link.download = `${nombre}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.click();
    } else {
      const { blob } = await generarPdfDashboard();
      const link = document.createElement('a');
      link.download = `${nombre}.pdf`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    }
  } catch (e) {
    console.error('Error exportando:', e);
    alert('Error al generar el reporte. Intenta de nuevo.');
  } finally {
    btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;
    btn.disabled = false;
  }
}

/* ============================= */
/* ENVIAR INFORME POR CORREO     */
/* ============================= */

function abrirModalCorreo() {

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50';
  modal.id = 'modal-correo';

  modal.innerHTML = `
    <div class="bg-white rounded-3xl shadow-2xl w-[420px] max-w-full mx-4 overflow-hidden">
      <div class="px-8 py-5" style="background:#122B4F">
        <h2 class="text-white text-lg font-bold">Enviar informe por correo</h2>
      </div>
      <div class="p-8 space-y-4">
        <p class="text-gray-500 text-sm">
          Se adjunta un PDF con todas las secciones del panel (con los filtros y el período aplicados ahora).
        </p>
        <div>
          <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Destinatarios</label>
          <input id="correo-destinatarios" type="text" placeholder="correo1@ejemplo.com, correo2@ejemplo.com"
            class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
          <p class="text-xs text-gray-400 mt-1">Separa varios correos con comas.</p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Mensaje (opcional)</label>
          <textarea id="correo-mensaje" rows="3" placeholder="Se agrega al cuerpo del correo"
            class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"></textarea>
        </div>
        <p id="correo-estado" class="text-xs" style="min-height:16px"></p>
        <div class="flex gap-3">
          <button onclick="document.getElementById('modal-correo').remove()"
            class="flex-1 py-3 rounded-xl font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition">Cancelar</button>
          <button id="btn-enviar-correo-confirmar" onclick="enviarInformePorCorreo()"
            class="flex-1 py-3 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition" style="background:#1565C0">Enviar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('correo-destinatarios').focus();
}

async function enviarInformePorCorreo() {

  const btn = document.getElementById('btn-enviar-correo-confirmar');
  const estado = document.getElementById('correo-estado');
  const destinatarios = document.getElementById('correo-destinatarios').value.trim();
  const mensaje = document.getElementById('correo-mensaje').value.trim();

  if (!destinatarios) {
    estado.textContent = 'Escribe al menos un correo';
    estado.style.color = '#C41E3A';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Generando PDF...';
  estado.textContent = '';

  try {

    const { blob } = await generarPdfDashboard();
    const { nombre, periodo } = nombreReporte();

    btn.textContent = 'Enviando...';

    const form = new FormData();
    form.append('informe', blob, `${nombre}.pdf`);
    form.append('destinatarios', destinatarios);
    form.append('periodo', periodo);
    if (mensaje) form.append('mensaje', mensaje);

    const response = await fetch(`${API}/api/supervisor/reporte/enviar`, { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || 'No se pudo enviar el correo');

    estado.textContent = `Enviado a ${data.enviados} destinatario${data.enviados === 1 ? '' : 's'}`;
    estado.style.color = '#1B5E20';
    setTimeout(() => document.getElementById('modal-correo')?.remove(), 1500);

  } catch (e) {
    console.error('Error enviando informe:', e);
    estado.textContent = e.message || 'Error al enviar el correo';
    estado.style.color = '#C41E3A';
    btn.disabled = false;
    btn.textContent = 'Enviar';
  }
}

let _refreshTimer = null;
function scheduleRefresh() {
  if (_generandoInforme) return; // no interrumpir una captura de informe en curso
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(cargarDashboard, 800);
}

async function cargarDashboard() {
  const spin = document.getElementById('cargando');
  spin.classList.remove('hidden');

  try {
    let qs = `mes=${mesActual}&anio=${anioActual}`;
    if (filtroAnalista)   qs += `&idAnalista=${filtroAnalista}`;
    if (filtroEDS)        qs += `&eds=${encodeURIComponent(filtroEDS)}`;
    if (filtroCategoria)  qs += `&idCategoria=${filtroCategoria}`;
    if (filtroGrupoCategoria) qs += `&grupoCategoria=${encodeURIComponent(filtroGrupoCategoria)}`;
    if (filtroGrupo > 0)  qs += `&idGrupo=${filtroGrupo}`;

    const [kpis, porAnalista, topCat, porDia, distTipo, distEstatus, distPrioridad,
           ultimos, eds, metEsc, altaPrio, escActivos, tiempos, antiguedad] =
      await Promise.all([
        fetch(`${API}/api/supervisor/kpis?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tickets-analista?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/top-categorias?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tickets-dia?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-tipo?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-estatus?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-prioridad?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/ultimos-tickets?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/ranking-eds?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/metricas-escalacion?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/top-alta-prioridad?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/escalados-activos?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tiempos-respuesta?${qs}`).then(r => r.json()).catch(() => null),
        fetch(`${API}/api/supervisor/antiguedad-abiertos?${qs}`).then(r => r.json()).catch(() => null),
      ]);

    renderKPIs(kpis);
    renderChartAnalistas(porAnalista);
    renderChartCategorias(topCat);
    renderChartDias(porDia);
    renderChartTipos(distTipo);
    renderChartEstatus(distEstatus);
    renderChartPrioridad(distPrioridad);
    renderTablaUltimos(ultimos);
    renderTablaEDS(eds);
    renderKPIsEscalacion(metEsc);
    renderChartEscalacion('chart-esc-reciben', metEsc.reciben, '#7C3AED');
    renderChartEscalacion('chart-esc-envian',  metEsc.envian,  '#E65100');
    renderTablaAltaPrioridad(altaPrio);
    renderTablaEscaladosActivos(escActivos);
    renderTiempos(tiempos);
    renderAntiguedad(antiguedad);
    renderResumen({ kpis, metEsc, antiguedad, porDia });

  } catch (e) {
    console.error('Error cargando dashboard:', e);
  } finally {
    spin.classList.add('hidden');
  }
}

const KPI_DEFS = [
  {
    id: 'kpi-total', color: '#1565C0', bg: '#EFF6FF',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    label: 'Total Tickets', sub: 'este período'
  },
  {
    id: 'kpi-activos', color: '#1B5E20', bg: '#F0FDF4',
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    label: 'Tickets Activos', sub: 'en proceso / pendientes'
  },
  {
    id: 'kpi-prioridad', color: '#C41E3A', bg: '#FFF5F5',
    icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    label: 'Alta Prioridad', sub: 'tickets críticos'
  },
  {
    id: 'kpi-escalados', color: '#E65100', bg: '#FFF7ED',
    icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    label: 'Escalados', sub: 'a cotizaciones / técnico'
  },
  {
    id: 'kpi-analista', color: '#6A1B9A', bg: '#FAF5FF',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    label: 'Analista Destacado', sub: 'más tickets del período'
  }
];

function renderKPIs(d) {
  const valores = [
    d.totalTickets         ?? 0,
    d.ticketsActivos       ?? 0,
    d.ticketsAltaPrioridad ?? 0,
    d.ticketsEscalados     ?? 0,
    d.analistaTop ? d.analistaTop.nombre : '—',
  ];
  const subs = [
    `${d.totalTickets ?? 0} tickets registrados`,
    `activos en el período`,
    `prioridad alta`,
    `escalados a cotizaciones / técnico`,
    d.analistaTop ? `${d.analistaTop.total} tickets` : '',
  ];

  const row = document.getElementById('kpi-row');
  row.innerHTML = KPI_DEFS.map((k, i) => `
    <div class="kpi-card p-5 fade-in">
      <div class="flex items-start justify-between mb-3">
        <p class="text-xs font-bold text-gray-400 uppercase tracking-widest leading-tight">${k.label}</p>
        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${k.bg}">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${k.color}" stroke-width="2">
            ${k.icon}
          </svg>
        </div>
      </div>
      <p class="font-black text-gray-800 leading-tight mb-1" style="font-size:${typeof valores[i]==='number' && valores[i]>999 ? '1.6rem' : '1.75rem'}">${valores[i]}</p>
      <p class="text-xs text-gray-400">${subs[i]}</p>
    </div>
  `).join('');
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  animation: { duration: 500 }
};

function noDataPlugin(msg = 'Sin datos para este período') {
  return {
    id: 'noData',
    afterDraw(chart) {
      if (chart.data.datasets.every(ds => ds.data.every(v => !v))) {
        const { ctx, width, height } = chart;
        chart.clear();
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#9CA3AF'; ctx.font = '13px sans-serif';
        ctx.fillText(msg, width / 2, height / 2);
        ctx.restore();
      }
    }
  };
}

function renderChartAnalistas(data) {
  destroyChart('chart-analistas');
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.tickets);
  charts['chart-analistas'] = new Chart(document.getElementById('chart-analistas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: barColors(labels.length), borderRadius: 5, borderSkipped: false }]
    },
    options: {
      ...BASE_OPTS,
      indexAxis: 'y',
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} tickets` } }
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin()]
  });
}

function renderChartCategorias(data) {
  destroyChart('chart-categorias');
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.total);
  charts['chart-categorias'] = new Chart(document.getElementById('chart-categorias'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: barColors(labels.length, '#6A1B9A').reverse(), borderRadius: 5, borderSkipped: false }]
    },
    options: {
      ...BASE_OPTS,
      indexAxis: 'y',
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} tickets` } }
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin()]
  });
}

function renderChartDias(resp) {
  destroyChart('chart-dias');
  const esModo = resp && resp.modo;
  const data   = esModo ? resp.datos : resp;
  const modo   = esModo ? resp.modo  : 'dia';

  const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  let labels, values;

  if (modo === 'mes') {
    labels = MESES_CORTOS;
    values = Array.from({ length: 12 }, (_, i) => (data.find(r => r.periodo === i+1) || { total: 0 }).total);
  } else {
    const diasEnMes = new Date(anioActual, mesActual, 0).getDate();
    labels  = Array.from({ length: diasEnMes }, (_, i) => i + 1);
    values  = labels.map(d => (data.find(r => r.dia === d) || { total: 0 }).total);
  }

  charts['chart-dias'] = new Chart(document.getElementById('chart-dias'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tickets', data: values,
        borderColor: '#C41E3A', borderWidth: 2.5,
        backgroundColor: 'rgba(196,30,58,0.08)',
        pointBackgroundColor: '#C41E3A', pointRadius: 3, pointHoverRadius: 5,
        fill: true, tension: 0.4
      }]
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} tickets` } }
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

function donutCenterPlugin(label = 'tickets') {
  return {
    id: 'donutCenter',
    afterDraw(chart) {
      const ds = chart.data.datasets[0];
      if (!ds || ds.data.every(v => !v)) return;
      const total = ds.data.reduce((s, v) => s + (v || 0), 0);
      const { ctx } = chart;
      const { left, right, top, bottom } = chart.chartArea;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.fillStyle = '#1F2937';
      ctx.fillText(total, cx, cy - 7);
      ctx.font = `400 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText(label, cx, cy + 11);
      ctx.restore();
    }
  };
}

function makeDonutOptions(legendPosition = 'bottom') {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 500 },
    cutout: '68%',
    layout: { padding: legendPosition === 'right' ? { left: 8 } : { bottom: 4 } },
    plugins: {
      legend: {
        display: true,
        position: legendPosition,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 11 },
          padding: legendPosition === 'bottom' ? 14 : 10,
          boxWidth: 8
        }
      },
      tooltip: {
        callbacks: {
          label(ctx) {
            const total = ctx.dataset.data.reduce((s, v) => s + (v || 0), 0) || 1;
            const pct   = Math.round(ctx.parsed / total * 100);
            return `  ${ctx.label}: ${ctx.parsed} (${pct}%)`;
          }
        }
      }
    }
  };
}

function renderChartTipos(data) {
  destroyChart('chart-tipos');
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.total);
  charts['chart-tipos'] = new Chart(document.getElementById('chart-tipos'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE.slice(0, labels.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
    options: makeDonutOptions('bottom'),
    plugins: [noDataPlugin(), donutCenterPlugin()]
  });
}

const ESTATUS_COLORS = {
  'En curso':                    '#1565C0',
  'Nuevo':                       '#6A1B9A',
  'Esperando cliente':           '#E65100',
  'En Pausa':                    '#F59E0B',
  'Servicio programado':         '#0891B2',
  'Servicio Técnico En Curso':   '#0D9488',
  'Escalado a cotizaciones':     '#7C3AED',
  'Escalado Servicio Técnico':   '#DB2777',
  'Pendiente facturación':       '#D97706',
  'Cerrado':                     '#1B5E20',
  'Cancelado':                   '#6B7280',
  'Sin estatus':                 '#D1D5DB',
};

function renderChartEstatus(data) {
  destroyChart('chart-estatus');
  if (!data?.length) return;
  const labels = data.map(d => d.estatus);
  const values = data.map(d => d.total);
  const colors = labels.map(l => ESTATUS_COLORS[l] || '#94A3B8');
  charts['chart-estatus'] = new Chart(document.getElementById('chart-estatus'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
    options: makeDonutOptions('bottom'),
    plugins: [noDataPlugin(), donutCenterPlugin()]
  });
}

function renderChartPrioridad(data) {
  destroyChart('chart-prioridad');
  if (!data?.length) return;
  const PRIO_COLORS = { 'Alta': '#C41E3A', 'Media': '#E65100', 'Baja': '#1B5E20', 'Sin prioridad': '#D1D5DB' };
  const labels = data.map(d => d.prioridad);
  const values = data.map(d => d.total);
  const colors = labels.map(l => PRIO_COLORS[l] || '#94A3B8');
  charts['chart-prioridad'] = new Chart(document.getElementById('chart-prioridad'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
    options: makeDonutOptions('bottom'),
    plugins: [noDataPlugin(), donutCenterPlugin()]
  });
}

function renderAntiguedad(d) {

  const chartEl = document.getElementById('chart-antiguedad');
  const tablaEl = document.getElementById('tabla-antiguedad');
  if (!chartEl || !tablaEl) return;

  if (!d || d.error) {
    destroyChart('chart-antiguedad');
    tablaEl.innerHTML = sinDatos();
    return;
  }

  const buckets = d.buckets || [];
  destroyChart('chart-antiguedad');

  charts['chart-antiguedad'] = new Chart(chartEl, {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.rango),
      datasets: [{
        data: buckets.map(b => b.total),
        backgroundColor: ['#1B5E20', '#F57F17', '#E65100', '#C41E3A'],
        borderRadius: 5, borderSkipped: false
      }]
    },
    options: {
      ...BASE_OPTS,
      plugins: { ...BASE_OPTS.plugins, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} tickets` } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, stepSize: 1 } }
      }
    },
    plugins: [noDataPlugin('Sin tickets abiertos en este período')]
  });

  const lista = d.masAntiguos || [];

  if (!lista.length) {
    tablaEl.innerHTML = sinDatos();
    return;
  }

  const diasColor = (dias) => dias > 7 ? 'text-red-600 font-bold' : dias > 3 ? 'text-orange-500 font-semibold' : 'text-gray-600';

  tablaEl.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'EDS', 'Responsable', 'Estatus', 'Días abierto'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${lista.map((t, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i + 1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold whitespace-nowrap">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 max-w-40 truncate" title="${t.casoAtendido || ''}">${t.casoAtendido || '—'}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-28 truncate" title="${t.EDS || ''}">${t.EDS || '—'}</td>
          <td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">${t.responsable || '—'}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">${t.estatus || '—'}</td>
          <td class="px-4 py-2.5 text-xs whitespace-nowrap ${diasColor(t.dias)}">${t.dias} día${t.dias === 1 ? '' : 's'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

const TIPO_COLORS = {
  'chat':      { bg: '#DBEAFE', text: '#1D4ED8' },
  'llamada':   { bg: '#D1FAE5', text: '#065F46' },
  'asignado':  { bg: '#FEF3C7', text: '#92400E' },
};

function tipoBadge(nombre) {
  const key = (nombre || '').toLowerCase();
  const c = Object.keys(TIPO_COLORS).find(k => key.includes(k));
  const { bg, text } = c ? TIPO_COLORS[c] : { bg: '#F3F4F6', text: '#4B5563' };
  return `<span class="badge-tipo" style="background:${bg};color:${text}">${nombre}</span>`;
}

function tableHeader(cols) {
  return `<tr style="background:#122B4F">${cols.map(c => `<th class="px-4 py-3 text-left text-blue-200">${c}</th>`).join('')}</tr>`;
}

function renderTablaUltimos(data) {
  const el = document.getElementById('tabla-ultimos');
  if (!data.length) { el.innerHTML = sinDatos(); return; }
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'Responsable', 'EDS', 'Categoría', 'Tipo', 'Estatus', 'Prioridad', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => {
          const pCol = { 'Alta': 'text-red-600 font-bold', 'Media': 'text-orange-500 font-semibold', 'Baja': 'text-green-600' };
          return `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold whitespace-nowrap">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 max-w-40 truncate" title="${t.casoAtendido||''}">${t.casoAtendido || '—'}</td>
          <td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">${t.analista}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-28 truncate" title="${t.EDS||''}">${t.EDS || '—'}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-28 truncate" title="${t.categoria}">${t.categoria}</td>
          <td class="px-4 py-2.5">${tipoBadge(t.tipoCaso)}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">${t.estatus || '—'}</td>
          <td class="px-4 py-2.5 text-xs whitespace-nowrap ${pCol[t.prioridad] || 'text-gray-400'}">${t.prioridad || '—'}</td>
          <td class="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">${t.fechaRegistro || '—'}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>`;
}

function renderTablaEDS(data) {
  const el = document.getElementById('tabla-eds');
  if (!data.length) { el.innerHTML = sinDatos(); return; }
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'EDS', 'Tickets', '% del total'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${(() => { const gran = data.reduce((s,r) => s+r.total,0)||1; return data.map((r, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 max-w-44 truncate" title="${r.EDS}">${r.EDS}</td>
          <td class="px-4 py-2.5">
            <div class="flex items-center gap-2">
              <div class="flex-1 bg-gray-100 rounded-full h-1.5 max-w-20">
                <div class="bg-orange-500 h-1.5 rounded-full" style="width:${Math.round(r.total/data[0].total*100)}%"></div>
              </div>
              <span class="font-bold text-gray-800">${r.total}</span>
            </div>
          </td>
          <td class="px-4 py-2.5 text-gray-500 text-xs">${Math.round(r.total/gran*100)}%</td>
        </tr>`).join(''); })()}
      </tbody>
    </table>`;
}


function renderKPIsEscalacion(d) {
  const el = document.getElementById('kpi-escalacion');
  if (!el) return;
  const defs = [
    { label: 'Total Escalados',   value: d.totalEscalados,   color: '#7C3AED', bg: '#F5F3FF', sub: 'en el período' },
    { label: 'Escalados Activos', value: d.escaladosActivos, color: '#C41E3A', bg: '#FFF5F5', sub: 'sin cerrar' },
    { label: 'Mayor receptor',    value: d.reciben?.[0]?.nombre || '—', color: '#1565C0', bg: '#EFF6FF', sub: d.reciben?.[0] ? `${d.reciben[0].total} escalaciones` : '' },
    { label: 'Mayor escalador',   value: d.envian?.[0]?.nombre  || '—', color: '#E65100', bg: '#FFF7ED', sub: d.envian?.[0]  ? `${d.envian[0].total} escalaciones`  : '' },
  ];
  el.innerHTML = defs.map(k => `
    <div class="card px-4 py-3 flex items-center gap-3" style="background:${k.bg};border-color:${k.color}20">
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold uppercase tracking-wide mb-0.5" style="color:${k.color}">${k.label}</div>
        <div class="text-xl font-black text-gray-800 truncate">${k.value}</div>
        <div class="text-xs text-gray-400 mt-0.5">${k.sub}</div>
      </div>
    </div>`).join('');
}

function renderChartEscalacion(canvasId, data, color) {
  destroyChart(canvasId);
  if (!data?.length) return;
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.total);
  const colors = Array.from({ length: labels.length }, (_, i) => {
    const t = labels.length > 1 ? i / (labels.length - 1) : 0;
    return lerpHex(color, color + '55', t);
  });
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 5, borderSkipped: false }] },
    options: {
      ...BASE_OPTS, indexAxis: 'y',
      plugins: { ...BASE_OPTS.plugins, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} tickets` } } },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin()]
  });
}

function renderTablaAltaPrioridad(data) {
  const el = document.getElementById('tabla-alta-prioridad');
  if (!data?.length) { el.innerHTML = sinDatos(); return; }
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'EDS', 'Creador', 'Responsable', 'Estatus', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => `
        <tr class="hover:bg-red-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold whitespace-nowrap">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 max-w-40 truncate" title="${t.casoAtendido||''}">${t.casoAtendido||'—'}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-28 truncate" title="${t.EDS||''}">${t.EDS||'—'}</td>
          <td class="px-4 py-2.5 text-gray-600 whitespace-nowrap">${t.creador}</td>
          <td class="px-4 py-2.5 whitespace-nowrap ${t.fueEscalado ? 'text-purple-700 font-semibold' : 'text-gray-600'}">${t.escaladoA}${t.fueEscalado ? ' ↑' : ''}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">${t.estatus}</td>
          <td class="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">${t.fechaRegistro}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderTablaEscaladosActivos(data) {
  const el = document.getElementById('tabla-escalados-activos');
  if (!data?.length) { el.innerHTML = sinDatos(); return; }
  const pCol = { 'Alta': 'text-red-600 font-bold', 'Media': 'text-orange-500 font-semibold', 'Baja': 'text-green-600' };
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'EDS', 'Creador', '→ Escalado a', 'Grupo', 'Estatus', 'Prioridad', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => `
        <tr class="hover:bg-purple-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold whitespace-nowrap">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 max-w-36 truncate" title="${t.casoAtendido||''}">${t.casoAtendido||'—'}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-24 truncate" title="${t.EDS||''}">${t.EDS||'—'}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">${t.creador}</td>
          <td class="px-4 py-2.5 text-purple-700 font-semibold whitespace-nowrap">${t.escaladoA}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">${t.grupo}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">${t.estatus}</td>
          <td class="px-4 py-2.5 text-xs whitespace-nowrap ${pCol[t.prioridad]||'text-gray-400'}">${t.prioridad}</td>
          <td class="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">${t.fechaRegistro}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ── TIEMPOS DE RESPUESTA ──────────────────────────────────── */

function fmtSeg(seg) {
  if (seg === null || seg === undefined || isNaN(seg)) return '—';
  seg = Math.round(seg);
  if (seg < 60) return `${seg} s`;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min ${String(s).padStart(2, '0')} s`;
}

function escT(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderTiempos(d) {
  const kpiEl = document.getElementById('kpi-tiempos');
  if (!kpiEl) return;

  if (!d || d.error) {
    kpiEl.innerHTML = `<p class="col-span-full text-center text-gray-400 text-sm py-6">
      No se pudieron cargar los tiempos de respuesta${d?.error ? ': ' + escT(d.error) : ''}.
      ¿Ya se ejecutó la migración de la base de datos?</p>`;
    ['chart-t-analista', 'chart-t-tipo', 'chart-t-categoria', 'chart-t-prioridad', 'chart-t-estatus', 'chart-t-cobertura']
      .forEach(destroyChart);
    document.getElementById('tabla-sin-ticket').innerHTML = '';
    return;
  }

  const k = d.kpis;
  const pct = (a, b) => (b > 0 && a !== null ? `${Math.round(a / b * 100)}%` : '—');

  const defs = [
    { label: 'Casos finalizados', value: k.finalizados ?? 0, color: '#122B4F', bg: '#EFF6FF',
      sub: `de ${k.total} casos · ${k.abiertos ?? 0} abiertos · ${k.autoFinalizados ?? 0} cerrados por tiempo · ${k.traspasados ?? 0} pasados` },
    { label: 'Ejecución promedio', value: fmtSeg(k.promEjec), color: '#00695C', bg: '#ECFDF5',
      sub: 'caso abierto → cerrado' },
    { label: 'Con respuesta (prom.)', value: fmtSeg(k.promResp), color: '#1B5E20', bg: '#F0FDF4',
      sub: `${pct(k.promResp, k.promEjec)} de la ejecución` },
    { label: 'Sin respuesta (prom.)', value: fmtSeg(k.promSinResp), color: '#C41E3A', bg: '#FFF5F5',
      sub: `${pct(k.promSinResp, k.promEjec)} espera del cliente` },
    { label: 'Casos con ticket 2WD', value: pct(k.conTicket, k.total), color: '#7C3AED', bg: '#F5F3FF',
      sub: `${k.conTicket ?? 0} de ${k.total} vinculados` },
  ];

  kpiEl.innerHTML = defs.map(x => `
    <div class="card px-4 py-3 flex items-center gap-3" style="background:${x.bg};border-color:${x.color}20">
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold uppercase tracking-wide mb-0.5" style="color:${x.color}">${x.label}</div>
        <div class="text-xl font-black text-gray-800 truncate">${x.value}</div>
        <div class="text-xs text-gray-400 mt-0.5">${x.sub}</div>
      </div>
    </div>`).join('');

  renderChartTiempos('chart-t-analista',  d.porAnalista);
  renderChartTiempos('chart-t-tipo',      d.porTipo.map(x => ({ ...x, nombre: x.nombre === 'LLAMADA' ? 'Llamada' : 'Chat' })));
  renderChartTiempos('chart-t-categoria', d.porCategoria);
  renderChartTiempos('chart-t-prioridad', d.porPrioridad);
  renderChartTiempos('chart-t-estatus',   d.porEstatus);
  renderChartCobertura(k);
  renderTablaSinTicket(d.sinTicket);
}

// Barras apiladas en minutos: con respuesta (verde) + sin respuesta (rojo) = ejecución promedio
function renderChartTiempos(id, data) {
  destroyChart(id);
  const el = document.getElementById(id);
  if (!el) return;

  const labels = data.map(x => x.nombre);
  const resp = data.map(x => +((x.promResp || 0) / 60).toFixed(2));
  const sin  = data.map(x => +((x.promSinResp || 0) / 60).toFixed(2));

  charts[id] = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Con respuesta', data: resp, backgroundColor: '#1B5E20', borderRadius: 4, borderSkipped: false },
        { label: 'Sin respuesta', data: sin,  backgroundColor: '#C41E3A', borderRadius: 4, borderSkipped: false },
      ]
    },
    options: {
      ...BASE_OPTS,
      indexAxis: 'y',
      plugins: {
        legend: { display: true, position: 'bottom',
                  labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11 }, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtSeg(ctx.parsed.x * 60)}`,
            afterBody: items => {
              const x = data[items[0].dataIndex];
              return [`Ejecución: ${fmtSeg(x.promEjec)}`, `Casos: ${x.casos}`];
            }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } },
             title: { display: true, text: 'minutos (promedio)', font: { size: 10 }, color: '#9CA3AF' } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin('Sin casos finalizados para este período')]
  });
}

function renderChartCobertura(k) {
  destroyChart('chart-t-cobertura');
  const el = document.getElementById('chart-t-cobertura');
  if (!el) return;

  const enWD    = k.conTicketEn2WD ?? 0;
  const soloRef = Math.max(0, (k.conTicket ?? 0) - enWD);
  const sin     = Math.max(0, (k.total ?? 0) - (k.conTicket ?? 0));

  charts['chart-t-cobertura'] = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['Vinculado (ticket en 2WD)', 'Vinculado (ticket aún no importado)', 'Sin ticket'],
      datasets: [{ data: [enWD, soloRef, sin], backgroundColor: ['#1B5E20', '#F57F17', '#9CA3AF'],
                   borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }]
    },
    options: makeDonutOptions('bottom'),
    plugins: [noDataPlugin(), donutCenterPlugin('casos')]
  });
}

function renderTablaSinTicket(data) {
  const el = document.getElementById('tabla-sin-ticket');
  if (!data?.length) {
    el.innerHTML = `<p class="text-center text-gray-400 text-sm py-8">Todos los casos del período tienen ticket vinculado</p>`;
    return;
  }

  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Fecha', 'Tipo', 'Chat / Teléfono', 'EDS', 'Analista', 'Estado', 'Ejecución'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map(c => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono text-xs">${c.id}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">${new Date(c.fecha).toLocaleString('es-CO',
            { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          <td class="px-4 py-2.5 text-xs whitespace-nowrap">${c.tipo === 'LLAMADA' ? '📞 Llamada' : '💬 Chat'}</td>
          <td class="px-4 py-2.5 font-bold text-gray-800">${escT(c.numerochat)}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-28 truncate" title="${escT(c.nombreEDS)}">${escT(c.nombreEDS) || '—'}</td>
          <td class="px-4 py-2.5 text-gray-700 whitespace-nowrap">${escT(c.analista)}</td>
          <td class="px-4 py-2.5 text-xs whitespace-nowrap ${c.finalizado ? 'text-gray-500' : 'text-green-700 font-semibold'}">${c.finalizado ? 'Finalizado' : 'Abierto'}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">${c.segEjec ? fmtSeg(c.segEjec) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function sinDatos() {
  return `<p class="text-center text-gray-400 text-sm py-8">Sin datos para este período</p>`;
}

function cerrarSesion() {
  localStorage.removeItem('supervId');
  localStorage.removeItem('supervNombre');
  window.location.href = 'index.html';
}

/* ── VISTA RESUMEN ──────────────────────────────────────────── */

function renderResumen({ kpis, metEsc, antiguedad, porDia }) {
  renderResumenAlertas({ kpis, metEsc, antiguedad });
  renderResumenTopLista('resumen-top-categorias', kpis?.topCategorias, 'nombre', '#6A1B9A');
  renderResumenTopLista('resumen-top-eds', kpis?.topEDS, 'EDS', '#E65100');
  renderResumenTendencia(porDia);
}

function renderResumenAlertas({ kpis, metEsc, antiguedad }) {
  const el = document.getElementById('resumen-alertas');
  if (!el) return;

  const alertas = [];

  const masAntiguos = antiguedad?.masAntiguos || [];
  const criticos = masAntiguos.filter(t => t.dias > 7).length;
  if (criticos > 0) {
    alertas.push({
      tipo: 'danger',
      texto: `${criticos} ticket${criticos === 1 ? '' : 's'} lleva${criticos === 1 ? '' : 'n'} más de 7 días abierto${criticos === 1 ? '' : 's'} sin cerrar.`,
      accion: () => mostrarVista('vista-antiguedad')
    });
  } else if (masAntiguos.length > 0) {
    alertas.push({
      tipo: 'warn',
      texto: `${masAntiguos.length} ticket${masAntiguos.length === 1 ? '' : 's'} sigue${masAntiguos.length === 1 ? '' : 'n'} abierto${masAntiguos.length === 1 ? '' : 's'}, ninguno supera los 7 días.`,
      accion: () => mostrarVista('vista-antiguedad')
    });
  }

  const escActivos = metEsc?.escaladosActivos ?? 0;
  if (escActivos > 0) {
    alertas.push({
      tipo: 'warn',
      texto: `${escActivos} ticket${escActivos === 1 ? '' : 's'} escalado${escActivos === 1 ? '' : 's'} sigue${escActivos === 1 ? '' : 'n'} sin resolver.`,
      accion: () => mostrarVista('vista-escalacion')
    });
  }

  const altaPrio = kpis?.ticketsAltaPrioridad ?? 0;
  if (altaPrio > 0) {
    alertas.push({
      tipo: 'danger',
      texto: `${altaPrio} ticket${altaPrio === 1 ? '' : 's'} de alta prioridad en el período.`,
      accion: () => mostrarVista('vista-escalacion')
    });
  }

  if (metEsc?.envian?.[0]) {
    alertas.push({
      tipo: 'warn',
      texto: `${metEsc.envian[0].nombre} es quien más escala tickets (${metEsc.envian[0].total}) — puede valer la pena revisar por qué.`,
      accion: () => mostrarVista('vista-escalacion')
    });
  }

  if (!alertas.length) {
    alertas.push({ tipo: 'ok', texto: 'Sin alertas relevantes en este período. Todo bajo control.' });
  }

  const iconos = {
    ok:     '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>',
    warn:   '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    danger: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  };

  el.innerHTML = alertas.map(a => `
    <div class="alerta-item alerta-${a.tipo}" ${a.accion ? 'style="cursor:pointer"' : ''} data-alerta>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="flex-shrink:0;margin-top:1px">
        ${iconos[a.tipo]}
      </svg>
      <span>${a.texto}</span>
    </div>`).join('');

  el.querySelectorAll('[data-alerta]').forEach((div, i) => {
    if (alertas[i].accion) div.addEventListener('click', alertas[i].accion);
  });
}

function renderResumenTopLista(elId, data, campoNombre, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!data?.length) { el.innerHTML = sinDatos(); return; }

  const max = Math.max(...data.map(d => d.total)) || 1;

  el.innerHTML = data.map((d, i) => `
    <div class="mini-rank-row">
      <div class="mini-rank-num">${i + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-gray-700 font-medium truncate" title="${d[campoNombre]}">${d[campoNombre]}</span>
          <span class="font-bold text-gray-800 flex-shrink-0">${d.total}</span>
        </div>
        <div class="bg-gray-100 rounded-full h-1.5">
          <div class="h-1.5 rounded-full" style="width:${Math.round(d.total / max * 100)}%;background:${color}"></div>
        </div>
      </div>
    </div>`).join('');
}

function renderResumenTendencia(resp) {
  destroyChart('chart-resumen-tendencia');
  const el = document.getElementById('chart-resumen-tendencia');
  if (!el) return;

  const esModo = resp && resp.modo;
  const data   = esModo ? resp.datos : resp;
  const modo   = esModo ? resp.modo  : 'dia';

  const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  let labels, values;

  if (modo === 'mes') {
    labels = MESES_CORTOS;
    values = Array.from({ length: 12 }, (_, i) => (data.find(r => r.periodo === i+1) || { total: 0 }).total);
  } else {
    const diasEnMes = new Date(anioActual, mesActual, 0).getDate();
    labels  = Array.from({ length: diasEnMes }, (_, i) => i + 1);
    values  = labels.map(d => (data.find(r => r.dia === d) || { total: 0 }).total);
  }

  charts['chart-resumen-tendencia'] = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#1565C0', borderWidth: 2,
        backgroundColor: 'rgba(21,101,192,0.08)',
        pointRadius: 0, pointHoverRadius: 4,
        fill: true, tension: 0.4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} tickets` } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxTicksLimit: 8 } },
        y: { display: false, beginAtZero: true }
      }
    },
    plugins: [noDataPlugin()]
  });
}
