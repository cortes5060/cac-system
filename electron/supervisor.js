const supervId     = localStorage.getItem('supervId');
const supervNombre = localStorage.getItem('supervNombre');
if (!supervId) window.location.href = 'index.html';

let mesActual, anioActual;
let filtroAnalista = '', filtroEDS = '', filtroCategoria = '', filtroSubcat = '';
let filtroGrupo = 0;
let _grupos = [];
let _todasCategorias = [];
let _todosTickets = [];
let _tablaEDS = [], _tablaReincidencia = [], _tablaAltaPrioridad = [], _tablaEscaladosActivos = [];
let buscEDS = null, buscCat = null, buscSubcat = null;
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

function crearBuscable({ inputId, listId, clearId, opciones, onSelect, onClear }) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);
  const clearBtn = document.getElementById(clearId);
  let _opts = opciones;

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
      ? _opts.filter(o => norm(o.label).includes(norm(q)))
      : _opts;

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
      if (onClear) onClear(); else onSelect('');
      actualizarIndicadorFiltros();
      list.classList.remove('open');
    },
    setOpciones(nuevas) {
      _opts = nuevas;
      input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
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
    const [analistas, estaciones, categorias] = await Promise.all([
      fetch(`${API}/api/catalogos/analistas`).then(r => r.json()),
      fetch(`${API}/api/catalogos/estaciones`).then(r => r.json()),
      fetch(`${API}/api/catalogos/categorias`).then(r => r.json()),
    ]);

    const selAna = document.getElementById('fil-analista');
    analistas.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = a.nombre;
      selAna.appendChild(o);
    });
    selAna.addEventListener('change', () => { filtroAnalista = selAna.value; actualizarIndicadorFiltros(); });

    buscEDS = crearBuscable({
      inputId: 'fil-eds-input', listId: 'fil-eds-list', clearId: 'fil-eds-clear',
      opciones: estaciones.map(e => ({ value: e.nombre, label: e.nombre })),
      onSelect(v) { filtroEDS = v; actualizarIndicadorFiltros(); }
    });

    _todasCategorias = categorias;

    const principalesUnicas = [...new Set(
      categorias.map(c => c.categoriaprincipal).filter(Boolean)
    )].sort().map(p => ({ value: p, label: p }));

    buscCat = crearBuscable({
      inputId: 'fil-cat-input', listId: 'fil-cat-list', clearId: 'fil-cat-clear',
      opciones: principalesUnicas,
      onSelect(v) {
        filtroCategoria = v;
        filtroSubcat = '';
        actualizarSubcatOpciones(v);
        actualizarIndicadorFiltros();
        cargarDashboard();
      },
      onClear() {
        filtroCategoria = '';
        filtroSubcat = '';
        actualizarSubcatOpciones('');
        actualizarIndicadorFiltros();
        cargarDashboard();
      }
    });

    buscSubcat = crearBuscable({
      inputId: 'fil-subcat-input', listId: 'fil-subcat-list', clearId: 'fil-subcat-clear',
      opciones: [],
      onSelect(v) { filtroSubcat = v; actualizarIndicadorFiltros(); cargarDashboard(); }
    });

  } catch (e) {
    console.error('Error cargando filtros:', e);
  }
}

function actualizarSubcatOpciones(principal) {
  const filtradas = principal
    ? _todasCategorias.filter(c => c.categoriaprincipal === principal)
    : _todasCategorias;
  if (buscSubcat) buscSubcat.setOpciones(filtradas.map(c => ({ value: String(c.id), label: c.nombre })));
}

function actualizarIndicadorFiltros() {
  const hayFiltros = filtroAnalista || filtroEDS || filtroCategoria || filtroSubcat;
  document.getElementById('filtros-activos')?.classList.toggle('hidden', !hayFiltros);
}

function limpiarFiltros() {
  filtroAnalista = ''; filtroEDS = ''; filtroCategoria = ''; filtroSubcat = '';
  document.getElementById('fil-analista').value = '';
  if (buscEDS)    buscEDS.clear();
  if (buscCat)    buscCat.clear();
  if (buscSubcat) { buscSubcat.clear(); actualizarSubcatOpciones(''); }
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

async function exportarReporte(formato) {
  document.getElementById('export-menu').classList.remove('open');
  const btn = document.getElementById('btn-exportar');
  btn.textContent = 'Generando...';
  btn.disabled = true;

  try {
    const main = document.querySelector('main');
    const canvas = await html2canvas(main, {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: '#EEF0F6'
    });

    const mesLabel = mesActual > 0
      ? ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mesActual-1]
      : 'Anual';
    const nombre = `Reporte-CAC-${mesLabel}-${anioActual}`;

    if (formato === 'jpg') {
      const link = document.createElement('a');
      link.download = `${nombre}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.click();
    } else {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pdfW) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      let yPos = 0, remaining = imgH;
      pdf.addImage(imgData, 'JPEG', 0, yPos, pdfW, imgH);
      remaining -= pdfH;

      while (remaining > 0) {
        yPos -= pdfH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, yPos, pdfW, imgH);
        remaining -= pdfH;
      }
      pdf.save(`${nombre}.pdf`);
    }
  } catch (e) {
    console.error('Error exportando:', e);
    alert('Error al generar el reporte. Intenta de nuevo.');
  } finally {
    btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;
    btn.disabled = false;
  }
}

/* ── DESCARGA INDIVIDUAL ─────────────────────────────────────── */

function _sufijoPeriodo() {
  const mes = mesActual > 0 ? '_' + String(mesActual).padStart(2, '0') : '';
  return `${anioActual}${mes}`;
}

function descargarChart(chartId, nombre) {
  const ch = charts[chartId];
  if (!ch) { alert('Sin datos para descargar.'); return; }
  const src = ch.canvas;
  const off = document.createElement('canvas');
  off.width = src.width; off.height = src.height;
  const ctx2 = off.getContext('2d');
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, off.width, off.height);
  ctx2.drawImage(src, 0, 0);
  const a = document.createElement('a');
  a.download = `${nombre}_${_sufijoPeriodo()}.png`;
  a.href = off.toDataURL('image/png');
  a.click();
}

async function descargarSeccionHTML(elementId, nombre) {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
    const a = document.createElement('a');
    a.download = `${nombre}_${_sufijoPeriodo()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  } catch (e) { console.error('Error capturando sección:', e); alert('Error al generar la imagen.'); }
}

function _exportarCSV(filas, columnas, nombre) {
  if (!filas?.length) { alert('Sin datos para exportar.'); return; }
  const bom = '﻿';
  const header = columnas.map(c => `"${c.header}"`).join(',');
  const rows = filas.map((f, i) => columnas.map(c => {
    if (c.key === '#') return i + 1;
    const val = (f[c.key] ?? '').toString().replace(/"/g, '""');
    return `"${val}"`;
  }).join(','));
  const csv = bom + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = `${nombre}_${_sufijoPeriodo()}.csv`;
  a.href = url; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarRankingEDS() {
  const gran = _tablaEDS.reduce((s, r) => s + r.total, 0) || 1;
  const filas = _tablaEDS.map(r => ({ ...r, pct: Math.round(r.total / gran * 100) + '%' }));
  _exportarCSV(filas, [
    { header: '#', key: '#' },
    { header: 'EDS', key: 'EDS' },
    { header: 'Tickets', key: 'total' },
    { header: '% del Total', key: 'pct' },
  ], 'Ranking_EDS');
}

function exportarReincidencia() {
  _exportarCSV(_tablaReincidencia, [
    { header: '#', key: '#' },
    { header: 'EDS', key: 'EDS' },
    { header: 'Categoría Repetida', key: 'categoria' },
    { header: 'Repeticiones', key: 'total' },
  ], 'Reincidencia_EDS');
}

function exportarAltaPrioridad() {
  _exportarCSV(_tablaAltaPrioridad, [
    { header: '#', key: '#' },
    { header: 'Antigüedad (días)', key: 'diasAbierto' },
    { header: 'Código 2WD', key: 'codigo2wd' },
    { header: 'Caso', key: 'casoAtendido' },
    { header: 'EDS', key: 'EDS' },
    { header: 'Creador', key: 'creador' },
    { header: 'Responsable', key: 'escaladoA' },
    { header: 'Estatus', key: 'estatus' },
    { header: 'Registro', key: 'fechaRegistro' },
  ], 'Alta_Prioridad_Activos');
}

function exportarEscaladosActivos() {
  _exportarCSV(_tablaEscaladosActivos, [
    { header: '#', key: '#' },
    { header: 'Antigüedad (días)', key: 'diasAbierto' },
    { header: 'Código 2WD', key: 'codigo2wd' },
    { header: 'Caso', key: 'casoAtendido' },
    { header: 'EDS', key: 'EDS' },
    { header: 'Creador', key: 'creador' },
    { header: 'Escalado a', key: 'escaladoA' },
    { header: 'Grupo', key: 'grupo' },
    { header: 'Estatus', key: 'estatus' },
    { header: 'Prioridad', key: 'prioridad' },
    { header: 'Registro', key: 'fechaRegistro' },
  ], 'Escalados_Activos');
}

function exportarTodosTickets() {
  const q = (document.getElementById('buscar-codigo')?.value || '').trim().toLowerCase();
  const datos = q
    ? _todosTickets.filter(t => (t.codigo2wd || '').toLowerCase().includes(q))
    : _todosTickets;
  _exportarCSV(datos, [
    { header: '#', key: '#' },
    { header: 'Código 2WD', key: 'codigo2wd' },
    { header: 'Caso', key: 'casoAtendido' },
    { header: 'Responsable', key: 'analista' },
    { header: 'EDS', key: 'EDS' },
    { header: 'Categoría', key: 'categoria' },
    { header: 'Tipo', key: 'tipoCaso' },
    { header: 'Estatus', key: 'estatus' },
    { header: 'Prioridad', key: 'prioridad' },
    { header: 'Registro', key: 'fechaRegistro' },
  ], 'Todos_los_Tickets');
}

let _refreshTimer = null;
function scheduleRefresh() {
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
    if (filtroCategoria)  qs += `&categoriaPrincipal=${encodeURIComponent(filtroCategoria)}`;
    if (filtroSubcat)     qs += `&idCategoria=${filtroSubcat}`;
    if (filtroGrupo > 0)  qs += `&idGrupo=${filtroGrupo}`;

    const [kpis, porAnalista, topCat, porDia, distTipo, distEstatus, distPrioridad,
           ultimos, eds, metEsc, altaPrio, escActivos,
           comparacion, diaSemana, tasaRes, cargaActual, reincidencia, catEscaladas] =
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
        fetch(`${API}/api/supervisor/comparacion?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/por-dia-semana?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tasa-resolucion?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/carga-actual?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/reincidencia-eds?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/categorias-escaladas?${qs}`).then(r => r.json()),
      ]);

    renderKPIs(kpis);
    renderComparacion(comparacion);
    renderTop5(kpis);
    renderChartAnalistas(porAnalista);
    renderChartCategorias(topCat);
    renderChartDias(porDia);
    renderChartDiaSemana(diaSemana);
    renderChartTasaResolucion(tasaRes);
    renderChartTipos(distTipo);
    renderChartEstatus(distEstatus);
    renderChartPrioridad(distPrioridad);
    renderCargaActual(cargaActual);
    renderTablaEDS(eds);
    renderReincidenciaEDS(reincidencia);
    renderChartCategoriasEscaladas(catEscaladas);
    renderKPIsEscalacion(metEsc);
    renderChartEscalacion('chart-esc-reciben', metEsc.reciben, '#7C3AED');
    renderChartEscalacion('chart-esc-envian',  metEsc.envian,  '#E65100');
    renderTablaAltaPrioridad(altaPrio);
    renderTablaEscaladosActivos(escActivos);
    renderTablaUltimos(ultimos);

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

function renderTop5(d) {
  const row = document.getElementById('top5-row');
  if (!row) return;

  const mkList = (items, valKey, labelKey, color) => {
    if (!items?.length) return `<p class="text-gray-400 text-sm text-center py-6">Sin datos</p>`;
    const max = items[0][valKey] || 1;
    return items.map((item, i) => {
      const pct = Math.round(item[valKey] / max * 100);
      const medals = ['🥇','🥈','🥉'];
      return `
        <div class="flex items-center gap-3 py-2 ${i < items.length - 1 ? 'border-b border-gray-100' : ''}">
          <span class="text-base w-6 text-center">${medals[i] || `<span class="text-xs font-bold text-gray-400">${i+1}</span>`}</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate" title="${item[labelKey]}">${item[labelKey]}</div>
            <div class="mt-1 bg-gray-100 rounded-full h-1.5">
              <div class="h-1.5 rounded-full" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>
          <span class="text-sm font-bold text-gray-700 shrink-0">${item[valKey]}</span>
        </div>`;
    }).join('');
  };

  row.innerHTML = `
    <div class="card p-6">
      <p class="section-title">Top 5 Categorías con Más Casos</p>
      ${mkList(d.topCategorias, 'total', 'nombre', '#6A1B9A')}
    </div>
    <div class="card p-6">
      <p class="section-title">Top 5 EDS con Más Casos</p>
      ${mkList(d.topEDS, 'total', 'EDS', '#E65100')}
    </div>`;
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

function donutCenterPlugin() {
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
      ctx.fillText('tickets', cx, cy + 11);
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

function renderHeatmapEDS(data) {
  const el = document.getElementById('heatmap-eds');
  if (!data.length) { el.innerHTML = sinDatos(); return; }

  const edsSet = [...new Set(data.map(d => d.EDS))];
  const catSet = [...new Set(data.map(d => d.categoria))];
  const maxVal = Math.max(...data.map(d => d.total), 1);

  const matrix = {};
  data.forEach(d => {
    if (!matrix[d.EDS]) matrix[d.EDS] = {};
    matrix[d.EDS][d.categoria] = d.total;
  });

  function cellStyle(val) {
    if (!val) return 'background:#F8FAFC;color:#CBD5E1';
    const t = val / maxVal;
    const alpha = 0.12 + t * 0.88;
    const textColor = t > 0.55 ? 'white' : '#7F1D1D';
    return `background:rgba(196,30,58,${alpha.toFixed(2)});color:${textColor}`;
  }

  function trunc(str, n) {
    return str.length > n ? str.substring(0, n) + '…' : str;
  }

  el.innerHTML = `
    <div class="overflow-auto" style="max-height:320px">
      <table class="min-w-full text-xs border-collapse">
        <thead class="sticky top-0 z-10">
          <tr>
            <th class="sticky left-0 z-20 px-3 py-2.5 text-left font-bold text-gray-500 border-b-2 border-r-2 border-gray-200 whitespace-nowrap"
                style="background:#F8FAFC;min-width:160px">
              EDS / Categoría
            </th>
            ${catSet.map(c => `
              <th class="px-2 py-2.5 text-center font-semibold text-gray-500 border-b-2 border-gray-200 whitespace-nowrap"
                  title="${c}" style="background:#F8FAFC;min-width:72px">
                ${trunc(c, 12)}
              </th>`).join('')}
            <th class="px-3 py-2.5 text-center font-bold text-gray-600 border-b-2 border-l-2 border-gray-200 whitespace-nowrap"
                style="background:#F1F5F9;min-width:60px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${edsSet.map((eds, i) => {
            const rowTotal = catSet.reduce((s, c) => s + (matrix[eds]?.[c] || 0), 0);
            const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
            return `
              <tr>
                <td class="sticky left-0 z-10 px-3 py-2 font-medium text-gray-700 border-r-2 border-gray-200 whitespace-nowrap"
                    style="background:${rowBg}" title="${eds}">
                  ${trunc(eds, 22)}
                </td>
                ${catSet.map(cat => {
                  const val = matrix[eds]?.[cat] || 0;
                  return `<td class="py-2 text-center font-bold border border-gray-100 cursor-default"
                    style="${cellStyle(val)}" title="${eds} · ${cat}: ${val} ticket${val !== 1 ? 's' : ''}">
                    ${val || '·'}
                  </td>`;
                }).join('')}
                <td class="px-3 py-2 text-center font-black text-gray-700 border-l-2 border-gray-200"
                    style="background:#F1F5F9">${rowTotal}</td>
              </tr>`;
          }).join('')}
          <!-- Fila totales por columna -->
          <tr class="border-t-2 border-gray-300">
            <td class="sticky left-0 z-10 px-3 py-2 font-black text-gray-700 border-r-2 border-gray-200"
                style="background:#F1F5F9">Total</td>
            ${catSet.map(cat => {
              const colTotal = edsSet.reduce((s, e) => s + (matrix[e]?.[cat] || 0), 0);
              return `<td class="py-2 text-center font-black text-gray-700 border border-gray-200"
                style="background:#F1F5F9">${colTotal}</td>`;
            }).join('')}
            <td class="px-3 py-2 text-center font-black border-l-2 border-gray-200"
                style="background:#E2E8F0;color:#122B4F">
              ${data.reduce((s, d) => s + d.total, 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;
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

function diasBadge(dias) {
  if (dias == null || dias === '') return '—';
  const n = parseInt(dias);
  if (n <= 2)  return `<span class="badge-tipo" style="background:#DCFCE7;color:#166534">${n}d</span>`;
  if (n <= 6)  return `<span class="badge-tipo" style="background:#FEF9C3;color:#92400E">${n}d</span>`;
  if (n <= 13) return `<span class="badge-tipo" style="background:#FFEDD5;color:#9A3412">${n}d</span>`;
  return `<span class="badge-tipo" style="background:#FEE2E2;color:#991B1B">${n}d</span>`;
}

function renderTablaUltimos(data) {
  _todosTickets = Array.isArray(data) ? data : [];
  const badge = document.getElementById('badge-todos-tickets');
  if (badge) badge.textContent = _todosTickets.length;
  filtrarTablaTickets();
}

function filtrarTablaTickets() {
  const q = (document.getElementById('buscar-codigo')?.value || '').trim().toLowerCase();
  const datos = q
    ? _todosTickets.filter(t => (t.codigo2wd || '').toLowerCase().includes(q))
    : _todosTickets;

  const cnt = document.getElementById('tickets-count');
  if (cnt) cnt.textContent = q
    ? `${datos.length} de ${_todosTickets.length} tickets`
    : `${_todosTickets.length} tickets en el período`;

  const el = document.getElementById('tabla-todos-tickets');
  if (!el) return;
  if (!datos.length) { el.innerHTML = sinDatos(); return; }

  const pCol = { 'Alta': '#C41E3A', 'Media': '#E65100', 'Baja': '#1B5E20' };
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Código 2WD', 'Caso', 'Responsable', 'EDS', 'Categoría', 'Tipo', 'Estatus', 'Prioridad', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${datos.map((t, i) => {
          const pC = pCol[t.prioridad];
          const prioStyle = pC ? `style="color:${pC};font-weight:700"` : 'class="text-gray-400"';
          const rowBg = i % 2 === 0 ? '' : 'style="background:#FAFAFA"';
          return `
        <tr class="hover:bg-blue-50 transition" ${rowBg}>
          <td class="px-4 py-3 text-gray-400 font-mono text-xs">${i+1}</td>
          <td class="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap" style="color:#1565C0">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-3 font-medium text-gray-800 max-w-xs truncate" title="${(t.casoAtendido||'').replace(/"/g,'&quot;')}">${t.casoAtendido || '—'}</td>
          <td class="px-4 py-3 text-gray-700 text-sm whitespace-nowrap">${t.analista}</td>
          <td class="px-4 py-3 text-gray-500 text-sm max-w-28 truncate" title="${t.EDS||''}">${t.EDS || '—'}</td>
          <td class="px-4 py-3 text-gray-500 text-sm max-w-32 truncate" title="${t.categoria}">${t.categoria}</td>
          <td class="px-4 py-3">${tipoBadge(t.tipoCaso)}</td>
          <td class="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">${t.estatus || '—'}</td>
          <td class="px-4 py-3 text-xs whitespace-nowrap" ${prioStyle}>${t.prioridad || '—'}</td>
          <td class="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">${t.fechaRegistro || '—'}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>`;
}

function renderTablaEDS(data) {
  _tablaEDS = Array.isArray(data) ? data : [];
  const el = document.getElementById('tabla-eds');
  if (!_tablaEDS.length) { el.innerHTML = sinDatos(); return; }
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
  _tablaAltaPrioridad = Array.isArray(data) ? data : [];
  const el = document.getElementById('tabla-alta-prioridad');
  const badge = document.getElementById('badge-alta-prio');
  if (!_tablaAltaPrioridad.length) {
    if (badge) badge.textContent = '0';
    el.innerHTML = sinDatos();
    return;
  }
  if (badge) badge.textContent = _tablaAltaPrioridad.length;
  data = _tablaAltaPrioridad;
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Antigüedad', 'Código 2WD', 'Caso', 'EDS', 'Creador', 'Responsable', 'Estatus', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => {
          const rowBg = i % 2 === 0 ? '' : 'style="background:#FFFBFB"';
          return `
        <tr class="hover:bg-red-50 transition" ${rowBg}>
          <td class="px-4 py-3 text-gray-400 font-mono text-xs">${i+1}</td>
          <td class="px-4 py-3 whitespace-nowrap">${diasBadge(t.diasAbierto)}</td>
          <td class="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap" style="color:#1565C0">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-3 font-medium text-gray-800 max-w-xs truncate" title="${(t.casoAtendido||'').replace(/"/g,'&quot;')}">${t.casoAtendido||'—'}</td>
          <td class="px-4 py-3 text-gray-500 text-sm max-w-28 truncate" title="${t.EDS||''}">${t.EDS||'—'}</td>
          <td class="px-4 py-3 text-gray-600 text-sm whitespace-nowrap">${t.creador}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap ${t.fueEscalado ? 'font-semibold' : 'text-gray-600'}" ${t.fueEscalado ? 'style="color:#7C3AED"' : ''}>${t.escaladoA}${t.fueEscalado ? ' ↑' : ''}</td>
          <td class="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">${t.estatus}</td>
          <td class="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">${t.fechaRegistro}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>`;
}

function renderTablaEscaladosActivos(data) {
  _tablaEscaladosActivos = Array.isArray(data) ? data : [];
  const el = document.getElementById('tabla-escalados-activos');
  const badge = document.getElementById('badge-escalados');
  if (!_tablaEscaladosActivos.length) {
    if (badge) badge.textContent = '0';
    el.innerHTML = sinDatos();
    return;
  }
  if (badge) badge.textContent = _tablaEscaladosActivos.length;
  data = _tablaEscaladosActivos;
  const pCol = { 'Alta': '#C41E3A', 'Media': '#E65100', 'Baja': '#1B5E20' };
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Antigüedad', 'Código 2WD', 'Caso', 'EDS', 'Creador', '→ Escalado a', 'Grupo', 'Estatus', 'Prioridad', 'Registro'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => {
          const pC = pCol[t.prioridad];
          const prioStyle = pC ? `style="color:${pC};font-weight:700"` : 'class="text-gray-400"';
          const rowBg = i % 2 === 0 ? '' : 'style="background:#FAFAFF"';
          return `
        <tr class="hover:bg-purple-50 transition" ${rowBg}>
          <td class="px-4 py-3 text-gray-400 font-mono text-xs">${i+1}</td>
          <td class="px-4 py-3 whitespace-nowrap">${diasBadge(t.diasAbierto)}</td>
          <td class="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap" style="color:#1565C0">${t.codigo2wd || '—'}</td>
          <td class="px-4 py-3 font-medium text-gray-800 max-w-xs truncate" title="${(t.casoAtendido||'').replace(/"/g,'&quot;')}">${t.casoAtendido||'—'}</td>
          <td class="px-4 py-3 text-gray-500 text-sm max-w-28 truncate" title="${t.EDS||''}">${t.EDS||'—'}</td>
          <td class="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">${t.creador}</td>
          <td class="px-4 py-3 text-sm font-semibold whitespace-nowrap" style="color:#7C3AED">${t.escaladoA}</td>
          <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">${t.grupo}</td>
          <td class="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">${t.estatus}</td>
          <td class="px-4 py-3 text-xs whitespace-nowrap" ${prioStyle}>${t.prioridad}</td>
          <td class="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">${t.fechaRegistro}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>`;
}

/* ── COMPARACIÓN ─────────────────────────────────────────────── */

function renderComparacion(data) {
  const el = document.getElementById('comparacion-cards');
  if (!el) return;

  const { actual, anterior, mesAnt, anioAnt } = data || {};
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const labelAnt = mesAnt > 0 ? `${MESES[mesAnt-1]} ${anioAnt}` : `${anioAnt}`;

  const mkCard = (label, keyAct, keyAnt, color, bg, icon) => {
    const act = actual?.[keyAct] ?? 0;
    const ant = anterior?.[keyAnt] ?? 0;
    const diff = ant === 0 ? null : ((act - ant) / ant * 100);
    const diffAbs = diff !== null ? Math.abs(Math.round(diff)) : null;

    let chip = '', chipStyle = '';
    if (diff !== null) {
      if (diff > 0) {
        chip = `↑ ${diffAbs}%`;
        chipStyle = `background:#FEE2E2;color:#991B1B`;
      } else if (diff < 0) {
        chip = `↓ ${diffAbs}%`;
        chipStyle = `background:#DCFCE7;color:#166534`;
      } else {
        chip = `= Sin cambio`;
        chipStyle = `background:#F3F4F6;color:#6B7280`;
      }
    }

    return `
      <div class="card p-5 flex flex-col gap-3 border-l-4" style="border-left-color:${color}">
        <div class="flex items-center justify-between">
          <p class="text-xs font-bold uppercase tracking-widest text-gray-400">${label}</p>
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:${bg}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">${icon}</svg>
          </div>
        </div>
        <div class="flex items-end justify-between gap-2">
          <span class="text-4xl font-black text-gray-800 leading-none">${act}</span>
          ${chip ? `<span class="text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap" style="${chipStyle}">${chip}</span>` : ''}
        </div>
        <p class="text-xs text-gray-400">vs <span class="font-semibold text-gray-600">${ant}</span> en ${labelAnt}</p>
      </div>`;
  };

  el.innerHTML = [
    mkCard('Total Tickets', 'total', 'total', '#1565C0', '#EFF6FF',
      '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
    mkCard('Alta Prioridad', 'altaPrio', 'altaPrio', '#C41E3A', '#FFF5F5',
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    mkCard('Escalados', 'escalados', 'escalados', '#E65100', '#FFF7ED',
      '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
  ].join('');
}

/* ── DÍA DE LA SEMANA ───────────────────────────────────────── */

function renderChartDiaSemana(data) {
  destroyChart('chart-dia-semana');
  const DIAS_LABEL = { 1:'Dom', 2:'Lun', 3:'Mar', 4:'Mié', 5:'Jue', 6:'Vie', 7:'Sáb' };
  const ORDEN = [2,3,4,5,6,7,1];

  const byDia = {};
  (data || []).forEach(d => { byDia[d.dia] = d.total; });

  const labels = ORDEN.map(n => DIAS_LABEL[n]);
  const values = ORDEN.map(n => byDia[n] || 0);
  const maxVal = Math.max(...values, 1);

  charts['chart-dia-semana'] = new Chart(document.getElementById('chart-dia-semana'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map(v => v === maxVal ? '#C41E3A' : '#BFDBFE'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} tickets` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, stepSize: 1 }, beginAtZero: true }
      }
    },
    plugins: [noDataPlugin()]
  });
}

/* ── TASA DE RESOLUCIÓN ─────────────────────────────────────── */

function renderChartTasaResolucion(data) {
  destroyChart('chart-tasa-resolucion');
  if (!data?.length) return;

  const sorted = [...data].sort((a, b) => {
    const ta = a.total > 0 ? a.cerrados / a.total : 0;
    const tb = b.total > 0 ? b.cerrados / b.total : 0;
    return ta - tb;
  });

  const labels = sorted.map(d => d.nombre);
  const values = sorted.map(d => d.total > 0 ? Math.round(d.cerrados / d.total * 100) : 0);
  const colors = values.map(v =>
    v >= 80 ? '#1B5E20' : v >= 60 ? '#4CAF50' : v >= 40 ? '#F59E0B' : '#C41E3A'
  );

  charts['chart-tasa-resolucion'] = new Chart(document.getElementById('chart-tasa-resolucion'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 5, borderSkipped: false }]
    },
    options: {
      ...BASE_OPTS,
      indexAxis: 'y',
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = sorted[ctx.dataIndex];
              return ` ${ctx.parsed.x}%  (${d.cerrados} cerrados / ${d.total} asignados)`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0, max: 100,
          grid: { color: '#F3F4F6' },
          ticks: { font: { size: 11 }, callback: v => v + '%' }
        },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin('Sin analistas con 3+ tickets en este período')]
  });
}

/* ── CARGA ACTUAL ───────────────────────────────────────────── */

function renderCargaActual(data) {
  const el = document.getElementById('carga-grid');
  if (!el) return;
  if (!data?.length) { el.innerHTML = sinDatos(); return; }

  const totalActivos = data.reduce((s, a) => s + a.activos, 0) || 1;

  el.innerHTML = data.map(a => {
    const pct = Math.round(a.activos / totalActivos * 100);
    const hasUrgente = a.altaPrio > 0;
    const borderColor = hasUrgente ? '#C41E3A' : a.escalados > 0 ? '#7C3AED' : '#1565C0';
    const numColor    = hasUrgente ? '#C41E3A' : a.escalados > 0 ? '#7C3AED' : '#1565C0';
    return `
      <div class="card p-4 flex flex-col gap-2 border-t-4" style="border-top-color:${borderColor}">
        <p class="text-sm font-bold text-gray-700 truncate leading-snug" title="${a.nombre}">${a.nombre}</p>
        <p class="text-4xl font-black leading-none" style="color:${numColor}">${a.activos}</p>
        <div class="bg-gray-100 rounded-full h-1.5">
          <div class="h-1.5 rounded-full transition-all" style="width:${pct}%;background:${borderColor}"></div>
        </div>
        <div class="flex flex-wrap gap-1.5 text-xs">
          ${a.altaPrio  ? `<span class="badge-tipo" style="background:#FEE2E2;color:#991B1B">⚠ ${a.altaPrio} alta prio</span>` : ''}
          ${a.escalados ? `<span class="badge-tipo" style="background:#F5F3FF;color:#6D28D9">↑ ${a.escalados} escalados</span>` : ''}
          ${!a.altaPrio && !a.escalados ? `<span class="text-green-600 font-medium">Sin urgentes</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

/* ── REINCIDENCIA EDS ───────────────────────────────────────── */

function renderReincidenciaEDS(data) {
  _tablaReincidencia = Array.isArray(data) ? data : [];
  const el    = document.getElementById('tabla-reincidencia');
  const badge = document.getElementById('badge-reincidencia');
  if (!_tablaReincidencia.length) {
    if (badge) badge.textContent = '0';
    el.innerHTML = `<p class="text-center text-gray-400 text-sm py-8">Sin EDS con incidencias repetidas en este período</p>`;
    return;
  }
  if (badge) badge.textContent = `${_tablaReincidencia.length} combinaciones`;

  const reincBadge = n => {
    if (n >= 10) return `<span class="badge-tipo" style="background:#FEE2E2;color:#991B1B">${n}×</span>`;
    if (n >= 6)  return `<span class="badge-tipo" style="background:#FFEDD5;color:#9A3412">${n}×</span>`;
    return         `<span class="badge-tipo" style="background:#FEF9C3;color:#92400E">${n}×</span>`;
  };

  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'EDS', 'Categoría Repetida', 'Repeticiones en el Período'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${_tablaReincidencia.map((r, i) => {
          const rowBg = i % 2 === 0 ? '' : 'style="background:#FFFDF0"';
          return `
        <tr class="hover:bg-amber-50 transition" ${rowBg}>
          <td class="px-4 py-3 text-gray-400 font-mono text-xs">${i+1}</td>
          <td class="px-4 py-3 font-semibold text-gray-800 max-w-48 truncate" title="${r.EDS}">${r.EDS}</td>
          <td class="px-4 py-3 text-gray-600 max-w-52 truncate" title="${r.categoria}">${r.categoria}</td>
          <td class="px-4 py-3">${reincBadge(r.total)}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

/* ── CATEGORÍAS ESCALADAS ───────────────────────────────────── */

function renderChartCategoriasEscaladas(data) {
  destroyChart('chart-cat-escaladas');
  if (!data?.length) return;
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.total);

  charts['chart-cat-escaladas'] = new Chart(document.getElementById('chart-cat-escaladas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: Array.from({ length: labels.length }, (_, i) => {
          const t = labels.length > 1 ? i / (labels.length - 1) : 0;
          return lerpHex('#4C1D95', '#A78BFA', t);
        }),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      ...BASE_OPTS,
      indexAxis: 'y',
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} tickets escalados` } }
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin('Sin escalaciones en este período')]
  });
}

function sinDatos() {
  return `<p class="text-center text-gray-400 text-sm py-8">Sin datos para este período</p>`;
}

function cerrarSesion() {
  localStorage.removeItem('supervId');
  localStorage.removeItem('supervNombre');
  window.location.href = 'index.html';
}
