const { Router } = require('express');
const {
  getKPIs,
  getTicketsPorAnalista,
  getTopCategorias,
  getTicketsPorDia,
  getDistribucionTipo,
  getDistribucionEstatus,
  getDistribucionPrioridad,
  getHeatmapEDS,
  getUltimosTickets,
  getRankingEDS,
  getTopAltaPrioridad,
  getMetricasEscalacion,
  getTablaEscaladosActivos,
  getComparacion,
  getPorDiaSemana,
  getTasaResolucion,
  getCargaActual,
  getReincidenciaEDS,
  getCategoriasEscaladas,
} = require('../controllers/supervisor.controller');

const router = Router();

router.get('/kpis',                   getKPIs);
router.get('/tickets-analista',       getTicketsPorAnalista);
router.get('/top-categorias',         getTopCategorias);
router.get('/tickets-dia',            getTicketsPorDia);
router.get('/distribucion-tipo',      getDistribucionTipo);
router.get('/distribucion-estatus',   getDistribucionEstatus);
router.get('/distribucion-prioridad', getDistribucionPrioridad);
router.get('/heatmap-eds',            getHeatmapEDS);
router.get('/ultimos-tickets',        getUltimosTickets);
router.get('/ranking-eds',            getRankingEDS);
router.get('/top-alta-prioridad',     getTopAltaPrioridad);
router.get('/metricas-escalacion',    getMetricasEscalacion);
router.get('/escalados-activos',      getTablaEscaladosActivos);
router.get('/comparacion',            getComparacion);
router.get('/por-dia-semana',         getPorDiaSemana);
router.get('/tasa-resolucion',        getTasaResolucion);
router.get('/carga-actual',           getCargaActual);
router.get('/reincidencia-eds',       getReincidenciaEDS);
router.get('/categorias-escaladas',   getCategoriasEscaladas);

module.exports = router;
