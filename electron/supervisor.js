const supervId     = localStorage.getItem('supervId');
const supervNombre = localStorage.getItem('supervNombre');
if (!supervId) window.location.href = 'index.html';

// el backend manda hora local con "Z" como si fuera UTC, así que no se puede
// dejar que Date la reconvierta (restaría el offset dos veces) — se parsea el texto tal cual
function formatearFechaCruda(f) {
  const m = String(f).match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '—';
  const [, y, mo, d, h, mi] = m;
  const h12 = (+h % 12) || 12;
  const ampm = +h < 12 ? 'a. m.' : 'p. m.';
  return `${d}/${mo}/${y}, ${String(h12).padStart(2, '0')}:${mi} ${ampm}`;
}

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
    // no recarga el dashboard aquí para no dispararlo varias veces seguidas (parpadeo de KPIs) —
    // eso lo decide quien llama a clear()
    clear() {
      input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      onSelect('', true);
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
    const [analistas, estaciones, categorias, gruposCategoria, tiposCaso] = await Promise.all([
      fetch(`${API}/api/catalogos/analistas`).then(r => r.json()),
      fetch(`${API}/api/catalogos/estaciones`).then(r => r.json()),
      fetch(`${API}/api/catalogos/categorias`).then(r => r.json()),
      fetch(`${API}/api/catalogos/grupos-categoria`).then(r => r.json()),
      fetch(`${API}/api/catalogos/tiposcaso`).then(r => r.json()).catch(() => []),
    ]);

    const selHistEstatus = document.getElementById('hist-estatus');
    if (selHistEstatus) {
      Object.keys(ESTATUS_COLORS).filter(n => n !== 'Sin estatus').forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n;
        selHistEstatus.appendChild(o);
      });
    }

    const selHistTipo = document.getElementById('hist-tipo');
    if (selHistTipo) {
      tiposCaso.forEach(t => {
        const o = document.createElement('option');
        o.value = t.id; o.textContent = t.nombre;
        selHistTipo.appendChild(o);
      });
    }

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
      onSelect(v, silencioso) { filtroEDS = v; actualizarIndicadorFiltros(); if (!silencioso) cargarDashboard(); }
    });

    buscCat = crearBuscable({
      inputId: 'fil-cat-input', listId: 'fil-cat-list', clearId: 'fil-cat-clear',
      opciones: categorias.map(c => ({ value: String(c.id), label: c.nombre })),
      onSelect(v, silencioso) { filtroCategoria = v; actualizarIndicadorFiltros(); if (!silencioso) cargarDashboard(); }
    });

  } catch (e) {
    console.error('Error cargando filtros:', e);
  }
}

async function buscarHistorial() {
  const q       = document.getElementById('hist-q').value.trim();
  const desde   = document.getElementById('hist-desde').value;
  const hasta   = document.getElementById('hist-hasta').value;
  const estatus = document.getElementById('hist-estatus').value;
  const idTipoCaso = document.getElementById('hist-tipo').value;

  let qs = `mes=${mesActual}&anio=${anioActual}`;
  if (filtroAnalista)   qs += `&idAnalista=${filtroAnalista}`;
  if (filtroEDS)        qs += `&eds=${encodeURIComponent(filtroEDS)}`;
  if (filtroCategoria)  qs += `&idCategoria=${filtroCategoria}`;
  if (filtroGrupoCategoria) qs += `&grupoCategoria=${encodeURIComponent(filtroGrupoCategoria)}`;
  if (filtroGrupo > 0)  qs += `&idGrupo=${filtroGrupo}`;
  if (q)          qs += `&q=${encodeURIComponent(q)}`;
  if (desde)      qs += `&desde=${desde}`;
  if (hasta)      qs += `&hasta=${hasta}`;
  if (estatus)    qs += `&estatus=${encodeURIComponent(estatus)}`;
  if (idTipoCaso) qs += `&idTipoCaso=${idTipoCaso}`;

  try {
    const r = await fetch(`${API}/api/supervisor/ultimos-tickets?${qs}`).then(r => r.json());
    renderTablaUltimos(r.tickets || [], r.filtrado);
  } catch (e) {
    console.error('Error buscando historial:', e);
  }
}

function limpiarHistorial() {
  document.getElementById('hist-q').value = '';
  document.getElementById('hist-desde').value = '';
  document.getElementById('hist-hasta').value = '';
  document.getElementById('hist-estatus').value = '';
  document.getElementById('hist-tipo').value = '';
  buscarHistorial();
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

async function esperarMs(ms) {
  await new Promise(r => setTimeout(r, ms));
}

// las tablas tienen scroll interno (max-height) que recorta lo que no se ve — hay que
// destaparlas para la captura, con un tope para que una tabla de cientos de filas no
// vuelva la imagen gigante
const ALTO_MAXIMO_TABLA_PDF = 1100; // ~30 filas
function destaparTablas(el) {
  const contenedores = el.querySelectorAll('.tabla-scroll, .altura-igualada'); // altura-igualada = lista de "Analistas más activos" en Resumen
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
    await esperarFrame(2);
    await esperarMs(350);
    return await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#FFFFFF' });
  } finally {
    restaurar();
  }
}

// la fuente de jsPDF no tiene flechas/símbolos especiales, salen vacíos o rotos
function limpiarTextoParaPdf(s) {
  return String(s ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/[▲▼►◄→←↑↓]/g, '')
    .replace(/[^\x20-\x7EÀ-ÿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// tablas como texto real en vez de screenshot: no salen borrosas y jsPDF-AutoTable
// las pagina solo repitiendo el encabezado
function extraerTablaDOM(scrollEl) {
  const table = scrollEl.querySelector('table');
  if (!table) return null;
  const columnas = [...table.querySelectorAll('thead th')].map(th => limpiarTextoParaPdf(th.textContent));
  const filas = [...table.querySelectorAll('tbody tr')].map(tr =>
    [...tr.children].map(td => limpiarTextoParaPdf(td.textContent))
  );
  if (!filas.length) return null;
  return { columnas, filas };
}

// las listas "Top 10" no son <table>, extraerTablaDOM no las agarra
function extraerListaDOM(el) {
  const filas = [...el.querySelectorAll('.mini-rank-row')].map(row => {
    const num = row.querySelector('.mini-rank-num')?.textContent.trim() || '';
    const spans = row.querySelectorAll(':scope > div span');
    const nombre = spans[0]?.getAttribute('title') || spans[0]?.textContent || '';
    const valor = spans[1]?.textContent || '';
    return [num, limpiarTextoParaPdf(nombre), limpiarTextoParaPdf(valor)];
  });
  if (!filas.length) return null;
  return { columnas: ['#', 'Nombre', 'Total'], filas };
}

// Resumen tiene varias tarjetas en fila (no una sola con secciones) por eso va aparte
async function capturarResumen(viewEl) {
  const bloques = [];
  const cardsDirectos = [...viewEl.querySelectorAll(':scope > .sec-card')];
  const filaListas = viewEl.querySelector(':scope > .grid');
  const cardsListas = filaListas ? [...filaListas.querySelectorAll(':scope > .sec-card')] : [];

  if (cardsDirectos[0]) bloques.push({ tipo: 'imagen', canvas: await capturarElemento(cardsDirectos[0]) });

  for (const card of cardsListas) {
    const header = card.querySelector('.sec-header');
    const cuerpo = card.querySelector('.sec-body');
    const datos = cuerpo ? extraerListaDOM(cuerpo) : null;
    const tituloTexto = header?.querySelector('.sec-title-text')?.textContent.trim();

    if (datos && tituloTexto) {
      // título como texto nativo, no imagen: un header angosto (1 de 3 columnas) estirado
      // al ancho de la página salía con el texto gigante
      bloques.push({ tipo: 'tabla', titulo: tituloTexto, columnas: datos.columnas, filas: datos.filas });
    } else {
      bloques.push({ tipo: 'imagen', canvas: await capturarElemento(card) });
    }
  }

  if (cardsDirectos[1]) bloques.push({ tipo: 'imagen', canvas: await capturarElemento(cardsDirectos[1]) });

  return bloques;
}

// vistas de una tarjeta con secciones: cada sección va como imagen, excepto las
// tablas largas (van como texto, ver extraerTablaDOM)
async function capturarBloquesDeVista(viewEl) {
  const cards = viewEl.querySelectorAll(':scope > .sec-card');
  const card = cards[0];
  const body = card?.querySelector(':scope > .sec-body.tablas-separadas');

  // no tiene esa estructura (Resumen, Distribución, etc.) → una sola captura
  if (cards.length !== 1 || !body) {
    return [{ tipo: 'imagen', canvas: await capturarElemento(viewEl) }];
  }

  const hijos = [...body.children];
  const bloques = [];
  let grupoActual = [];
  let headerCapturado = false;

  const capturar = async (visibles, ocultarAdemas = []) => {
    const ocultar = hijos.filter(h => !visibles.includes(h)).concat(ocultarAdemas);
    ocultar.forEach(h => h.style.display = 'none');
    const canvas = await capturarElemento(headerCapturado ? body : card);
    ocultar.forEach(h => h.style.display = '');
    headerCapturado = true;
    return canvas;
  };

  const flushGrupo = async () => {
    if (!grupoActual.length) return;
    bloques.push({ tipo: 'imagen', canvas: await capturar(grupoActual) });
    grupoActual = [];
  };

  for (const hijo of hijos) {
    // Tablas marcadas para no salir en el informe (p. ej. rankings muy largos que
    // no aportan de un vistazo y se ven mal paginados en varias hojas)
    if (hijo.hasAttribute('data-pdf-excluir')) continue;

    const scrollEl = hijo.querySelector('.tabla-scroll');
    if (scrollEl) {
      await flushGrupo();
      // título/píldoras como imagen, la tabla se oculta y va aparte como texto
      const canvasHeader = await capturar([hijo], [scrollEl]);
      if (canvasHeader.height > 8) bloques.push({ tipo: 'imagen', canvas: canvasHeader });

      const datos = extraerTablaDOM(scrollEl);
      if (datos) bloques.push({ tipo: 'tabla', columnas: datos.columnas, filas: datos.filas });
    } else {
      grupoActual.push(hijo);
    }
  }
  await flushGrupo();

  return bloques;
}

// solo una vista está visible a la vez y los gráficos de las demás no tienen tamaño
// hasta mostrarlas, así que hay que recorrerlas una por una
async function capturarVistas() {
  const vistaOriginal = document.querySelector('.view.active')?.dataset.view;
  const bloques = [];

  // evita que un refresco del dashboard llegue a mitad de una captura
  _generandoInforme = true;

  // filtros/buscadores no tienen sentido en un PDF estático
  document.body.classList.add('generando-informe');

  // ancho fijo mientras se genera el informe: si la ventana está maximizada, la captura
  // sale "ancha y delgada" y al comprimirla al ancho del PDF el texto queda chiquito/cortado
  const appMain = document.querySelector('.app-main');
  const anchoOriginal = appMain?.style.maxWidth;
  if (appMain) {
    appMain.style.maxWidth = '1120px';
    appMain.style.margin = '0 auto';
  }
  // el reflow de ese cambio de ancho es grande, un par de frames no siempre alcanza
  // para que el texto termine de pintarse antes de capturar
  await esperarFrame(2);
  await esperarMs(500);
  Object.values(charts).forEach(c => { try { c.resize(); } catch (e) {} });
  await esperarFrame(2);
  await esperarMs(300);

  try {

    const kpiRow = document.getElementById('kpi-row');
    if (kpiRow && kpiRow.children.length) {
      const canvas = await capturarElemento(kpiRow);
      if (canvas.width > 0 && canvas.height > 0) {
        bloques.push({
          titulo: 'Indicadores del período',
          desc: 'Resumen general: total de tickets, activos, alta prioridad, escalados, analista destacado y tiempo promedio de resolución en 2WD.',
          tipo: 'imagen', canvas, nuevaHoja: false,
        });
      }
    }

    for (const v of VISTAS) {
      const el = document.querySelector(`.view[data-view="${v.id}"]`);
      if (!el) continue;

      mostrarVista(v.id);
      await esperarFrame(2);
      await esperarMs(300);
      // update() fuerza que Chart.js redibuje — un gráfico creado con display:none queda casi vacío si solo se hace resize()
      Object.values(charts).forEach(c => { try { c.resize(); c.update('none'); } catch (e) {} });
      await esperarFrame(3);
      await esperarMs(300);

      const subBloques = v.id === 'vista-resumen'
        ? await capturarResumen(el)
        : await capturarBloquesDeVista(el);
      subBloques.forEach((sb, i) => {
        bloques.push({
          titulo: i === 0 ? v.label : null,
          desc: i === 0 ? v.desc : null,
          nuevaHoja: i === 0,
          ...sb,
        });
      });
    }

    if (vistaOriginal) {
      mostrarVista(vistaOriginal);
      await esperarFrame(1);
      Object.values(charts).forEach(c => { try { c.resize(); } catch (e) {} });
    }

  } finally {
    document.body.classList.remove('generando-informe');
    if (appMain) {
      appMain.style.maxWidth = anchoOriginal || '';
      appMain.style.margin = '';
      await esperarFrame(2);
      Object.values(charts).forEach(c => { try { c.resize(); } catch (e) {} });
    }
    _generandoInforme = false;
  }

  return bloques;
}

// arma el PDF: portada + un bloque por sección, evitando cortar tarjetas/gráficos entre páginas
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

  // Explica en texto, debajo del título, qué métricas/gráficos/tablas trae esa sección
  const dibujarDescripcion = (texto) => {
    if (!texto) return;
    pdf.setTextColor(107, 114, 128);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    const lineas = pdf.splitTextToSize(texto, anchoUtil - 4);
    lineas.forEach(linea => {
      if (y > pdfH - margen - 8) nuevaPagina();
      pdf.text(linea, margen + 4, y);
      y += 4.2;
    });
    y += 3;
  };

  for (const b of bloques) {
    // cada vista arranca en su propia página, excepto el primer bloque (junto a la portada)
    if (b.nuevaHoja) {
      nuevaPagina();
    } else if (b.tipo === 'imagen') {
      const imgH = (b.canvas.height * anchoUtil) / b.canvas.width;
      const altoDisponible = pdfH - margen - y;
      // si no cabe entera en lo que queda de página, salta a la siguiente (evita cortarla)
      if (imgH > altoDisponible && imgH <= pdfH - margen * 2 - 10) {
        nuevaPagina();
      }
    }
    // las tablas no fuerzan salto aquí, autoTable pagina solo

    if (b.titulo) dibujarTitulo(b.titulo);
    dibujarDescripcion(b.desc);

    if (b.tipo === 'tabla') {
      pdf.autoTable({
        head: [b.columnas],
        body: b.filas,
        startY: y,
        margin: { left: margen, right: margen, bottom: margen },
        styles: { fontSize: 7.5, cellPadding: 2.2, overflow: 'linebreak', textColor: [55, 65, 81] },
        headStyles: { fillColor: [18, 43, 79], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        theme: 'striped',
      });
      y = pdf.lastAutoTable.finalY + 10;
      continue;
    }

    const imgH = (b.canvas.height * anchoUtil) / b.canvas.width;
    const imgData = b.canvas.toDataURL('image/jpeg', 0.94);

    if (y + imgH <= pdfH - margen) {
      pdf.addImage(imgData, 'JPEG', margen, y, anchoUtil, imgH);
      y += imgH + 10;
    } else {
      // más alta que una página: se reparte en varias
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
          <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Destinatarios</label>
          <input id="correo-destinatarios" type="text" placeholder="correo1@ejemplo.com, correo2@ejemplo.com"
            class="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition"/>
          <p class="text-xs text-gray-600 mt-1">Separa varios correos con comas.</p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Mensaje (opcional)</label>
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
           ultimos, eds, metEsc, escActivos, antiguedad] =
      await Promise.all([
        fetch(`${API}/api/supervisor/kpis?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tickets-analista?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/top-categorias?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tickets-dia?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-tipo?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-estatus?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-prioridad?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/ultimos-tickets?${qs}`).then(r => r.json()).catch(() => ({ tickets: [], filtrado: false })),
        fetch(`${API}/api/supervisor/ranking-eds?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/metricas-escalacion?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/escalados-activos?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/antiguedad-abiertos?${qs}`).then(r => r.json()).catch(() => null),
      ]);

    renderKPIs(kpis);
    renderChartAnalistas(porAnalista);
    renderChartCategorias(topCat);
    renderChartDias(porDia);
    renderChartTipos(distTipo);
    renderChartEstatus(distEstatus);
    renderChartPrioridad(distPrioridad);
    renderTablaUltimos(ultimos.tickets || [], ultimos.filtrado);
    renderTablaEDS(eds);
    renderKPIsEscalacion(metEsc);
    renderChartEscalacionTendencia(metEsc.porDia);
    renderChartEscalacion('chart-esc-reciben', metEsc.reciben, '#6A1B9A');
    renderChartEscalacion('chart-esc-envian',  metEsc.envian,  '#E65100');
    renderTablaEscaladosActivos(escActivos);
    renderAntiguedad(antiguedad);
    renderResumen({ kpis, metEsc, antiguedad, porDia, porAnalista });
    cargarAuditoriaDiaria();

  } catch (e) {
    console.error('Error cargando dashboard:', e);
  } finally {
    spin.classList.add('hidden');
  }
}

async function cargarAuditoriaDiaria() {
  const desde = document.getElementById('audit-desde')?.value || '';
  const hasta = document.getElementById('audit-hasta')?.value || '';
  let qs = `mes=${mesActual}&anio=${anioActual}`;
  if (filtroAnalista)  qs += `&idAnalista=${filtroAnalista}`;
  if (filtroGrupo > 0) qs += `&idGrupo=${filtroGrupo}`;
  if (desde) qs += `&desde=${desde}`;
  if (hasta) qs += `&hasta=${hasta}`;

  try {
    const d = await fetch(`${API}/api/supervisor/tiempos-diario?${qs}`).then(r => r.json());
    renderAuditoriaDiaria(d);
  } catch (e) {
    console.error('Error cargando auditoría diaria:', e);
  }

  try {
    const t = await fetch(`${API}/api/supervisor/tiempos-respuesta?${qs}`).then(r => r.json());
    renderTiempos(t);
  } catch (e) {
    console.error('Error cargando tiempos de respuesta:', e);
  }
}

function limpiarAuditoriaDiaria() {
  const desdeEl = document.getElementById('audit-desde');
  const hastaEl = document.getElementById('audit-hasta');
  if (desdeEl) desdeEl.value = '';
  if (hastaEl) hastaEl.value = '';
  cargarAuditoriaDiaria();
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
    label: 'Escalados', sub: 'tickets escalados'
  },
  {
    id: 'kpi-analista', color: '#6A1B9A', bg: '#FAF5FF',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    label: 'Analista Destacado', sub: 'más tickets del período'
  },
  {
    id: 'kpi-tiempo-2wd', color: '#00695C', bg: '#ECFDF5',
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    label: 'Tiempo Promedio 2WD', sub: 'ciclo de vida del ticket'
  }
];

function fmtDeltaMes(actual, anterior) {
  if (anterior === null || anterior === undefined) return '';
  if (anterior === 0) return actual > 0 ? ' · nuevo vs mes ant.' : '';
  const pct = ((actual - anterior) / anterior) * 100;
  const arrow = pct >= 0 ? '▲' : '▼';
  const sign  = pct >= 0 ? '+' : '';
  return ` · ${arrow} ${sign}${pct.toFixed(0)}% vs mes ant.`;
}

function renderKPIs(d, tiempos) {
  const cmp = d.comparativoMesAnterior;
  const valores = [
    d.totalTickets         ?? 0,
    d.ticketsActivos       ?? 0,
    d.ticketsAltaPrioridad ?? 0,
    d.ticketsEscalados     ?? 0,
    d.analistaTop ? d.analistaTop.nombre : '—',
    fmtMin(d.promResolucion2WD),
  ];
  const subs = [
    `${d.totalTickets ?? 0} tickets registrados${cmp ? fmtDeltaMes(d.totalTickets, cmp.totalTickets) : ''}`,
    `activos en el período${cmp ? fmtDeltaMes(d.ticketsActivos, cmp.ticketsActivos) : ''}`,
    `prioridad alta${cmp ? fmtDeltaMes(d.ticketsAltaPrioridad, cmp.ticketsAltaPrioridad) : ''}`,
    `tickets escalados${cmp ? fmtDeltaMes(d.ticketsEscalados, cmp.ticketsEscalados) : ''}`,
    d.analistaTop ? `${d.analistaTop.total} tickets` : '',
    'de creación a cierre en 2WD',
  ];

  const row = document.getElementById('kpi-row');
  row.innerHTML = KPI_DEFS.map((k, i) => `
    <div class="kpi-card p-5 fade-in">
      <div class="flex items-start justify-between mb-3">
        <p class="text-xs font-bold text-gray-600 uppercase tracking-widest leading-tight">${k.label}</p>
        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${k.bg}">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${k.color}" stroke-width="2">
            ${k.icon}
          </svg>
        </div>
      </div>
      <p class="font-black text-gray-800 leading-tight mb-1" style="font-size:${typeof valores[i]==='number' && valores[i]>999 ? '1.6rem' : '1.75rem'}">${valores[i]}</p>
      <p class="text-xs text-gray-600">${subs[i]}</p>
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

  renderResumenPorResponsable(lista);

  if (!lista.length) {
    tablaEl.innerHTML = sinDatos();
    return;
  }

  const diasColor = (dias) => dias > 7 ? 'text-red-600 font-bold' : dias > 3 ? 'text-orange-500 font-semibold' : 'text-gray-600';

  tablaEl.innerHTML = `
    <table class="w-full rounded-xl overflow-hidden border border-gray-100" style="table-layout:fixed">
      <colgroup>
        <col style="width:4%"><col style="width:14%"><col style="width:18%"><col style="width:20%">
        <col style="width:20%"><col style="width:14%"><col style="width:10%">
      </colgroup>
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'EDS', 'Responsable', 'Estatus', 'Días abierto'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${lista.map((t, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-600 font-mono">${i + 1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold truncate">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 truncate" title="${t.casoAtendido || ''}">${t.casoAtendido || '—'}</td>
          <td class="px-4 py-2.5 text-gray-600 truncate" title="${t.EDS || ''}">${t.EDS || '—'}</td>
          <td class="px-4 py-2.5 text-gray-700 truncate">${t.responsable || '—'}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 truncate">${t.estatus || '—'}</td>
          <td class="px-4 py-2.5 text-xs truncate ${diasColor(t.dias)}">${t.dias} día${t.dias === 1 ? '' : 's'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// cuenta los tickets más antiguos por responsable, de mayor a menor
function renderResumenPorResponsable(lista) {
  const el = document.getElementById('antiguedad-por-responsable');
  if (!el) return;

  if (!lista.length) { el.innerHTML = ''; return; }

  const conteo = new Map();
  lista.forEach(t => {
    const nombre = t.responsable || 'Sin responsable';
    conteo.set(nombre, (conteo.get(nombre) || 0) + 1);
  });

  const ordenado = [...conteo.entries()].sort((a, b) => b[1] - a[1]);

  el.innerHTML = ordenado.map(([nombre, total]) => `
    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style="background:#FFF7ED;color:#9A3412">
      ${escT(nombre)}: ${total}
    </span>`).join('');
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

function renderTablaUltimos(data, filtrado) {
  const titEl = document.getElementById('hist-titulo');
  if (titEl) titEl.textContent = filtrado
    ? `${data.length} ticket${data.length === 1 ? '' : 's'} encontrado${data.length === 1 ? '' : 's'}`
    : 'Últimos 10 Tickets Registrados';
  const el = document.getElementById('tabla-ultimos');
  if (!data.length) { el.innerHTML = sinDatos(); return; }
  el.innerHTML = `
    <table class="w-full rounded-xl overflow-hidden border border-gray-100" style="table-layout:fixed">
      <colgroup>
        <col style="width:3%"><col style="width:9%"><col style="width:13%"><col style="width:11%">
        <col style="width:12%"><col style="width:12%"><col style="width:10%"><col style="width:9%">
        <col style="width:7%"><col style="width:14%">
      </colgroup>
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'Responsable', 'EDS', 'Categoría', 'Tipo', 'Estatus', 'Prioridad', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => {
          const pCol = { 'Alta': 'text-red-600 font-bold', 'Media': 'text-orange-500 font-semibold', 'Baja': 'text-green-600' };
          return `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-600 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold truncate">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 truncate" title="${t.casoAtendido||''}">${t.casoAtendido || '—'}</td>
          <td class="px-4 py-2.5 text-gray-700 truncate">${t.analista}</td>
          <td class="px-4 py-2.5 text-gray-600 truncate" title="${t.EDS||''}">${t.EDS || '—'}</td>
          <td class="px-4 py-2.5 text-gray-600 truncate" title="${t.categoria}">${t.categoria}</td>
          <td class="px-4 py-2.5 truncate">${tipoBadge(t.tipoCaso)}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 truncate">${t.estatus || '—'}</td>
          <td class="px-4 py-2.5 text-xs truncate ${pCol[t.prioridad] || 'text-gray-600'}">${t.prioridad || '—'}</td>
          <td class="px-4 py-2.5 text-gray-600 text-xs truncate">${t.fechaRegistro || '—'}</td>
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
          <td class="px-4 py-2.5 text-gray-600 font-mono">${i+1}</td>
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
    { label: 'Total Escalados',   value: d.totalEscalados,   color: '#6A1B9A', bg: '#FAF5FF', sub: 'en el período' },
    { label: '% Escalados',       value: `${(d.porcentajeEscalados ?? 0).toFixed(1)}%`, color: '#C41E3A', bg: '#FFF5F5', sub: 'del total de tickets' },
    { label: 'Escalados Activos', value: d.escaladosActivos, color: '#991B1B', bg: '#FEF2F2', sub: 'sin cerrar' },
    { label: 'Mayor receptor',    value: d.reciben?.[0]?.nombre || '—', color: '#1565C0', bg: '#EFF6FF', sub: d.reciben?.[0] ? `${d.reciben[0].total} escalaciones` : '' },
    { label: 'Mayor escalador',   value: d.envian?.[0]?.nombre  || '—', color: '#E65100', bg: '#FFF7ED', sub: d.envian?.[0]  ? `${d.envian[0].total} escalaciones`  : '' },
  ];
  el.innerHTML = defs.map(k => `
    <div class="card px-4 py-3 flex items-center gap-3" style="background:${k.bg};border-color:${k.color}20">
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold uppercase tracking-wide mb-0.5" style="color:${k.color}">${k.label}</div>
        <div class="text-xl font-black text-gray-800 truncate">${k.value}</div>
        <div class="text-xs text-gray-600 mt-0.5">${k.sub}</div>
      </div>
    </div>`).join('');
}

function renderChartEscalacionTendencia(data) {
  destroyChart('chart-esc-tendencia');
  const el = document.getElementById('chart-esc-tendencia');
  if (!el) return;

  const labels = (data || []).map(r => {
    const m = String(r.fecha).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}` : r.fecha;
  });
  const values = (data || []).map(r => Math.round(r.porcentaje * 10) / 10);

  charts['chart-esc-tendencia'] = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#C41E3A', borderWidth: 2,
        backgroundColor: 'rgba(196,30,58,0.08)',
        pointRadius: 0, pointHoverRadius: 4,
        fill: true, tension: 0.4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}% escalados` } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxTicksLimit: 10 } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, callback: v => v + '%' }, beginAtZero: true }
      }
    },
    plugins: [noDataPlugin()]
  });
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

function renderTablaEscaladosActivos(data) {
  const el = document.getElementById('tabla-escalados-activos');
  if (!data?.length) { el.innerHTML = sinDatos(); return; }
  const pCol = { 'Alta': 'text-red-600 font-bold', 'Media': 'text-orange-500 font-semibold', 'Baja': 'text-green-600' };
  el.innerHTML = `
    <table class="w-full rounded-xl overflow-hidden border border-gray-100" style="table-layout:fixed">
      <colgroup>
        <col style="width:3%"><col style="width:10%"><col style="width:15%"><col style="width:14%">
        <col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%">
        <col style="width:7%"><col style="width:7%">
      </colgroup>
      <thead>${tableHeader(['#', 'Código Ticket 2WD', 'Caso', 'EDS', 'Creador', '→ Escalado a', 'Grupo', 'Estatus', 'Prioridad', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => `
        <tr class="hover:bg-purple-50 transition">
          <td class="px-4 py-2.5 text-gray-600 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-blue-700 font-semibold truncate">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 truncate" title="${t.casoAtendido||''}">${t.casoAtendido||'—'}</td>
          <td class="px-4 py-2.5 text-gray-600 truncate" title="${t.EDS||''}">${t.EDS||'—'}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs truncate">${t.creador}</td>
          <td class="px-4 py-2.5 text-purple-700 font-semibold truncate">${t.escaladoA}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs truncate">${t.grupo}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 truncate">${t.estatus}</td>
          <td class="px-4 py-2.5 text-xs truncate ${pCol[t.prioridad]||'text-gray-600'}">${t.prioridad}</td>
          <td class="px-4 py-2.5 text-xs text-gray-600 truncate">${t.fechaRegistro}</td>
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

function fmtMin(min) {
  if (min === null || min === undefined || isNaN(min)) return '—';
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60), restMin = min % 60;
  if (horas < 24) return `${horas} h ${String(restMin).padStart(2, '0')} min`;
  const dias = Math.floor(horas / 24), restHoras = horas % 24;
  return `${dias} d ${restHoras} h`;
}

function escT(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderTiempos(d) {
  const kpiEl = document.getElementById('kpi-tiempos');
  if (!kpiEl) return;

  if (!d || d.error) {
    kpiEl.innerHTML = `<p class="col-span-full text-center text-gray-600 text-sm py-6">
      No se pudieron cargar los tiempos de respuesta${d?.error ? ': ' + escT(d.error) : ''}.
      ¿Ya se ejecutó la migración de la base de datos?</p>`;
    ['chart-t-analista', 'chart-t-scatter', 'chart-t-categoria']
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
    { label: 'Casos con ticket 2WD', value: pct(k.conTicket, k.total), color: '#6A1B9A', bg: '#FAF5FF',
      sub: `${k.conTicket ?? 0} de ${k.total} vinculados` },
  ];

  const porTipoMap = Object.fromEntries((d.porTipo || []).map(x => [x.nombre, x]));
  const chat = porTipoMap['CHAT'], llamada = porTipoMap['LLAMADA'];
  defs.push({
    label: 'Chat vs Llamada', color: '#1565C0', bg: '#EFF6FF',
    value: `${chat?.casos ?? 0} / ${llamada?.casos ?? 0}`,
    sub: `prom. ${fmtSeg(chat?.promEjec)} chat · ${fmtSeg(llamada?.promEjec)} llamada`,
  });

  kpiEl.innerHTML = defs.map(x => `
    <div class="card px-4 py-3 flex items-center gap-3" style="background:${x.bg};border-color:${x.color}20">
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold uppercase tracking-wide mb-0.5" style="color:${x.color}">${x.label}</div>
        <div class="text-xl font-black text-gray-800 truncate">${x.value}</div>
        <div class="text-xs text-gray-600 mt-0.5">${x.sub}</div>
      </div>
    </div>`).join('');

  renderChartTiempos('chart-t-analista',  d.porAnalista);
  renderChartTiemposScatter(d.porAnalista);
  renderChartTiempos('chart-t-categoria', d.porCategoria);
  renderTablaSinTicket(d.sinTicket);
}

function renderAuditoriaDiaria(d) {
  const el = document.getElementById('tabla-audit-diario');
  const lista = d?.analistas || [];
  const turnoSeg = (d?.turnoHoras || 6) * 3600;
  const esUnSoloDia = !!d?.esUnSoloDia;

  if (!lista.length) {
    if (el) el.innerHTML = sinDatos();
    renderChartAuditCobertura([], turnoSeg);
    return;
  }

  const colTrabajando = esUnSoloDia ? 'Trabajando' : 'Trabajando (prom./día)';
  const colEsperando  = esUnSoloDia ? 'Esperando cliente' : 'Esperando (prom./día)';

  el.innerHTML = `
    <table class="w-full rounded-xl overflow-hidden border border-gray-100" style="table-layout:fixed">
      <colgroup>
        <col style="width:4%"><col style="width:19%"><col style="width:9%"><col style="width:15%">
        <col style="width:9%"><col style="width:16%"><col style="width:13%"><col style="width:9%"><col style="width:6%">
      </colgroup>
      <thead>${tableHeader(['#', 'Analista', 'Casos', colTrabajando, '% turno', colEsperando, 'Prom. por caso', 'Sin cerrar', 'Días'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${lista.map((a, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-600 font-mono">${i + 1}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 truncate">${escT(a.nombre)}</td>
          <td class="px-4 py-2.5 text-gray-700">${a.casosAtendidos}</td>
          <td class="px-4 py-2.5 font-semibold text-teal-700">${fmtSeg(a.trabajandoSeg)}</td>
          <td class="px-4 py-2.5 font-semibold ${a.porcentajeTurno > 100 ? 'text-red-600' : a.porcentajeTurno < 40 ? 'text-orange-500' : 'text-gray-700'}">${Math.round(a.porcentajeTurno)}%</td>
          <td class="px-4 py-2.5 text-gray-600">${fmtSeg(a.esperandoSeg)}</td>
          <td class="px-4 py-2.5 text-gray-600">${fmtSeg(a.promEjecCaso)}</td>
          <td class="px-4 py-2.5 ${a.casosAbiertos > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}">${a.casosAbiertos}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs">${a.diasConActividad}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  renderChartAuditCobertura(lista, turnoSeg);
}

function renderChartAuditCobertura(lista, turnoSeg = 6 * 3600) {
  destroyChart('chart-audit-cobertura');
  const el = document.getElementById('chart-audit-cobertura');
  if (!el) return;
  if (!lista.length) return;

  const labels = lista.map(a => a.nombre);
  const trabajandoMin = lista.map(a => Math.round(a.trabajandoSeg / 60));
  const turnoMin = turnoSeg / 60;

  charts['chart-audit-cobertura'] = new Chart(el, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Trabajando', data: trabajandoMin, backgroundColor: '#00695C', borderRadius: 5, order: 2 },
        { type: 'line', label: `Turno (${turnoSeg / 3600}h)`, data: labels.map(() => turnoMin),
          borderColor: '#C41E3A', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, order: 1 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtSeg(ctx.parsed.y * 60)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, callback: v => `${(v / 60).toFixed(1)}h` }, beginAtZero: true }
      }
    },
    plugins: [noDataPlugin()]
  });
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

function renderChartTiemposScatter(data) {
  destroyChart('chart-t-scatter');
  const el = document.getElementById('chart-t-scatter');
  if (!el) return;
  if (!data?.length) return;

  const datasets = data.map((a, i) => ({
    label: a.nombre,
    data: [{ x: a.casos, y: Math.round((a.promEjec ?? 0) / 60), nombre: a.nombre }],
    backgroundColor: PALETTE[i % PALETTE.length],
    pointRadius: 6, pointHoverRadius: 8,
  }));

  charts['chart-t-scatter'] = new Chart(el, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw.nombre}: ${ctx.raw.x} casos, ${ctx.raw.y} min prom.` } },
      },
      scales: {
        x: { title: { display: true, text: 'Casos resueltos', font: { size: 10 } }, grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 } }, beginAtZero: true },
        y: { title: { display: true, text: 'Tiempo promedio (min)', font: { size: 10 } }, grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 } }, beginAtZero: true },
      }
    },
    plugins: [noDataPlugin()]
  });
}

function renderTablaSinTicket(data) {
  const el = document.getElementById('tabla-sin-ticket');

  const tituloEl = document.getElementById('titulo-sin-ticket');
  if (tituloEl) {
    const desde = document.getElementById('audit-desde')?.value;
    const hasta = document.getElementById('audit-hasta')?.value;
    tituloEl.textContent = (desde || hasta)
      ? 'Casos sin ticket vinculado (rango elegido)'
      : 'Casos sin ticket vinculado (hoy)';
  }

  if (!data?.length) {
    el.innerHTML = `<p class="text-center text-gray-600 text-sm py-8">Todos los casos del período tienen ticket vinculado</p>`;
    return;
  }

  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Fecha', 'Tipo', 'Chat / Teléfono', 'EDS', 'Analista', 'Estado', 'Ejecución'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map(c => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-600 font-mono text-xs">${c.id}</td>
          <td class="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">${formatearFechaCruda(c.fecha)}</td>
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
  return `<p class="text-center text-gray-600 text-sm py-8">Sin datos para este período</p>`;
}

function cerrarSesion() {
  localStorage.removeItem('supervId');
  localStorage.removeItem('supervNombre');
  window.location.href = 'index.html';
}

/* ── VISTA RESUMEN ──────────────────────────────────────────── */

function renderResumen({ kpis, metEsc, antiguedad, porDia, porAnalista }) {
  renderResumenTopLista('resumen-top-categorias', kpis?.topCategorias, 'nombre', '#6A1B9A');
  renderResumenTopLista('resumen-top-eds', kpis?.topEDS, 'EDS', '#E65100');
  const topAnalistas = (porAnalista || [])
    .map(a => ({ nombre: a.nombre, total: a.tickets }))
    .sort((a, b) => b.total - a.total);
  renderResumenTopLista('resumen-top-analistas', topAnalistas, 'nombre', '#1B5E20');
  renderResumenTendencia(porDia);
  renderResumenMasAntiguo(antiguedad);

  // en la primera carga el layout aún no asienta, así que se mide más de una vez
  const igualarAlturaAnalistas = () => {
    const ref = document.getElementById('resumen-top-categorias');
    const analistasEl = document.getElementById('resumen-top-analistas');
    if (!ref || !analistasEl) return;
    const alto = ref.getBoundingClientRect().height;
    if (alto < 40) return; // la referencia todavía no tiene contenido real, reintentar luego
    analistasEl.style.maxHeight = alto + 'px';
    analistasEl.style.overflowY = 'auto';
    analistasEl.classList.add('altura-igualada');
  };
  requestAnimationFrame(igualarAlturaAnalistas);
  setTimeout(igualarAlturaAnalistas, 250);
  setTimeout(igualarAlturaAnalistas, 800);
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

function renderResumenMasAntiguo(antiguedad) {
  const el = document.getElementById('resumen-mas-antiguo');
  if (!el) return;

  const t = antiguedad?.masAntiguos?.[0];
  if (!t) { el.innerHTML = sinDatos(); return; }

  const b = antiguedad?.buckets || [];
  const totalAbiertos = b.reduce((s, x) => s + (x.total || 0), 0);
  const contexto = totalAbiertos > 1
    ? `El más antiguo de ${totalAbiertos} tickets abiertos`
    : 'Único ticket abierto en el período';

  el.innerHTML = `
    <div class="flex items-center gap-5 cursor-pointer" onclick="mostrarVista('vista-antiguedad')" title="Ver todos en Antigüedad">
      <div class="flex-shrink-0 text-center px-5 py-3 rounded-2xl" style="background:#FFF7ED">
        <div class="font-black" style="font-size:2rem;color:#E65100">${t.dias}</div>
        <div class="text-xs font-bold text-gray-600 uppercase tracking-wide">día${t.dias === 1 ? '' : 's'}</div>
      </div>
      <div class="min-w-0">
        <div class="text-xs font-bold uppercase tracking-wide mb-0.5" style="color:#E65100">${contexto}</div>
        <div class="font-semibold text-gray-800 truncate" title="${t.casoAtendido || ''}">${t.casoAtendido || '—'}</div>
        <div class="text-sm text-gray-600 mt-0.5">
          ${t.codigo2wd ? `Ticket ${t.codigo2wd} · ` : ''}${t.EDS ? `${t.EDS} · ` : ''}${t.responsable || '—'}
        </div>
        <div class="text-xs text-gray-600 mt-0.5">Estatus: ${t.estatus || '—'} · ver todos en Antigüedad →</div>
      </div>
    </div>`;
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
