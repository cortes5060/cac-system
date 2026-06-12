/* API se carga desde config.js */

/* ── GUARD ─────────────────────────────────────────────────── */

const supervId     = localStorage.getItem('supervId');
const supervNombre = localStorage.getItem('supervNombre');
if (!supervId) window.location.href = 'index.html';

/* ── STATE ─────────────────────────────────────────────────── */

let mesActual, anioActual;
const charts = {};

/* ── PALETTE ───────────────────────────────────────────────── */

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

/* ── INIT ──────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('supervNombreNav').textContent = supervNombre || '';

  const now = new Date();
  mesActual  = now.getMonth() + 1;
  anioActual = now.getFullYear();

  buildPeriodoSelectors();
  cargarDashboard();
});

function buildPeriodoSelectors() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const selMes  = document.getElementById('sel-mes');
  const selAnio = document.getElementById('sel-anio');

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

  selMes.addEventListener('change',  () => { mesActual  = parseInt(selMes.value); });
  selAnio.addEventListener('change', () => { anioActual = parseInt(selAnio.value); });
}

/* ── LOAD ──────────────────────────────────────────────────── */

async function cargarDashboard() {
  const btn = document.getElementById('btn-actualizar');
  const spin = document.getElementById('cargando');
  btn.disabled = true;
  spin.classList.remove('hidden');

  try {
    const qs = `mes=${mesActual}&anio=${anioActual}`;

    const [kpis, porAnalista, topCat, porDia, distTipo, tiempoAna, ultimos, eds, catTiempo, heatmap] =
      await Promise.all([
        fetch(`${API}/api/supervisor/kpis?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tickets-analista?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/top-categorias?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tickets-dia?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/distribucion-tipo?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/tiempo-analista?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/ultimos-tickets`).then(r => r.json()),
        fetch(`${API}/api/supervisor/ranking-eds?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/categorias-tiempo?${qs}`).then(r => r.json()),
        fetch(`${API}/api/supervisor/heatmap-eds?${qs}`).then(r => r.json()),
      ]);

    renderKPIs(kpis);
    renderChartAnalistas(porAnalista);
    renderChartCategorias(topCat);
    renderChartDias(porDia);
    renderChartTipos(distTipo);
    renderChartTiempoAnalista(tiempoAna);
    renderHeatmapEDS(heatmap);
    renderTablaUltimos(ultimos);
    renderTablaEDS(eds);
    renderTablaCatTiempo(catTiempo);

  } catch (e) {
    console.error('Error cargando dashboard:', e);
  } finally {
    btn.disabled = false;
    spin.classList.add('hidden');
  }
}

/* ── KPIs ──────────────────────────────────────────────────── */

const KPI_DEFS = [
  {
    id: 'kpi-total', color: '#1565C0', bg: '#EFF6FF',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    label: 'Total Tickets', sub: 'este mes'
  },
  {
    id: 'kpi-tiempo', color: '#1B5E20', bg: '#F0FDF4',
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    label: 'Tiempo Promedio', sub: 'minutos · promedio'
  },
  {
    id: 'kpi-cat', color: '#6A1B9A', bg: '#FAF5FF',
    icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    label: 'Categoría Top', sub: 'más frecuente'
  },
  {
    id: 'kpi-eds', color: '#E65100', bg: '#FFF7ED',
    icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    label: 'EDS con Más Casos', sub: 'mayor incidencia'
  },
  {
    id: 'kpi-analista', color: '#C41E3A', bg: '#FFF5F5',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    label: 'Analista Destacado', sub: 'más tickets del mes'
  }
];

function renderKPIs(d) {
  const valores = [
    d.totalTickets ?? 0,
    d.tiempoPromedio != null ? `${d.tiempoPromedio} min` : '—',
    d.categoriaTop  ? d.categoriaTop.nombre  : '—',
    d.edsTop        ? d.edsTop.EDS           : '—',
    d.analistaTop   ? d.analistaTop.nombre   : '—',
  ];
  const subs = [
    `${d.totalTickets} tickets registrados`,
    d.sinTiempo > 0 ? `${d.sinTiempo} sin registrar` : 'todos documentados',
    d.categoriaTop  ? `${d.categoriaTop.total} tickets`  : '',
    d.edsTop        ? `${d.edsTop.total} tickets`        : '',
    d.analistaTop   ? `${d.analistaTop.total} tickets`   : '',
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

/* ── CHART HELPERS ─────────────────────────────────────────── */

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

/* ── CHARTS ────────────────────────────────────────────────── */

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

function renderChartDias(data) {
  destroyChart('chart-dias');
  const diasEnMes = new Date(anioActual, mesActual, 0).getDate();
  const labels    = Array.from({ length: diasEnMes }, (_, i) => i + 1);
  const values    = labels.map(d => (data.find(r => r.dia === d) || { total: 0 }).total);

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

function renderChartTipos(data) {
  destroyChart('chart-tipos');
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.total);
  charts['chart-tipos'] = new Chart(document.getElementById('chart-tipos'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 3, borderColor: '#fff', hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 500 },
      cutout: '62%',
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 12 }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} tickets` } }
      }
    },
    plugins: [noDataPlugin()]
  });
}

function renderChartTiempoAnalista(data) {
  destroyChart('chart-tiempo-analista');
  const labels = data.map(d => d.nombre);
  const values = data.map(d => d.promedio);
  const colors = Array.from({ length: labels.length }, (_, i) => {
    const t = labels.length > 1 ? i / (labels.length - 1) : 0;
    return lerpHex('#1B5E20', '#A5D6A7', t);
  });
  charts['chart-tiempo-analista'] = new Chart(document.getElementById('chart-tiempo-analista'), {
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
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} min promedio` } }
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [noDataPlugin()]
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

/* ── TABLAS ────────────────────────────────────────────────── */

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
      <thead>${tableHeader(['#', 'Caso', 'Analista', 'EDS', 'Categoría', 'Tipo', 'Tiempo', 'Fecha Caso'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((t, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800">${t.casoAtendido || '—'}</td>
          <td class="px-4 py-2.5 text-gray-700">${t.analista}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-28 truncate" title="${t.EDS || ''}">${t.EDS || '—'}</td>
          <td class="px-4 py-2.5 text-gray-600 max-w-32 truncate" title="${t.categoria}">${t.categoria}</td>
          <td class="px-4 py-2.5">${tipoBadge(t.tipoCaso)}</td>
          <td class="px-4 py-2.5 text-gray-600">${t.tiempoAtencionMin ? t.tiempoAtencionMin + ' min' : '—'}</td>
          <td class="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">${t.fechaCaso || '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderTablaEDS(data) {
  const el = document.getElementById('tabla-eds');
  if (!data.length) { el.innerHTML = sinDatos(); return; }
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'EDS', 'Tickets', 'T. Promedio'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((r, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800">${r.EDS}</td>
          <td class="px-4 py-2.5">
            <div class="flex items-center gap-2">
              <div class="flex-1 bg-gray-100 rounded-full h-1.5 max-w-20">
                <div class="bg-orange-500 h-1.5 rounded-full" style="width:${Math.round(r.total / data[0].total * 100)}%"></div>
              </div>
              <span class="font-bold text-gray-800">${r.total}</span>
            </div>
          </td>
          <td class="px-4 py-2.5 text-gray-600">${r.promedio != null ? r.promedio + ' min' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderTablaCatTiempo(data) {
  const el = document.getElementById('tabla-cat-tiempo');
  if (!data.length) { el.innerHTML = sinDatos(); return; }
  const maxProm = data[0]?.promedio || 1;
  el.innerHTML = `
    <table class="min-w-full rounded-xl overflow-hidden border border-gray-100">
      <thead>${tableHeader(['#', 'Categoría', 'Tickets', 'T. Promedio'])}</thead>
      <tbody class="bg-white divide-y divide-gray-100">
        ${data.map((r, i) => `
        <tr class="hover:bg-gray-50 transition">
          <td class="px-4 py-2.5 text-gray-400 font-mono">${i+1}</td>
          <td class="px-4 py-2.5 font-medium text-gray-800 max-w-36 truncate" title="${r.nombre}">${r.nombre}</td>
          <td class="px-4 py-2.5 text-gray-600">${r.total}</td>
          <td class="px-4 py-2.5">
            <div class="flex items-center gap-2">
              <div class="flex-1 bg-gray-100 rounded-full h-1.5 max-w-20">
                <div class="bg-purple-600 h-1.5 rounded-full" style="width:${Math.round(r.promedio / maxProm * 100)}%"></div>
              </div>
              <span class="font-bold text-gray-800">${r.promedio} min</span>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function sinDatos() {
  return `<p class="text-center text-gray-400 text-sm py-8">Sin datos para este período</p>`;
}

/* ── SESSION ───────────────────────────────────────────────── */

function cerrarSesion() {
  localStorage.removeItem('supervId');
  localStorage.removeItem('supervNombre');
  window.location.href = 'index.html';
}
