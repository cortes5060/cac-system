const { Router } = require('express');
const {
  getKPIs,
  getTicketsPorAnalista,
  getTopCategorias,
  getTicketsPorDia,
  getDistribucionTipo,
  getTiempoPromedioPorAnalista,
  getHeatmapEDS,
  getUltimosTickets,
  getRankingEDS,
  getCategoriasTiempo
} = require('../controllers/supervisor.controller');

const router = Router();

router.get('/kpis',               getKPIs);
router.get('/tickets-analista',   getTicketsPorAnalista);
router.get('/top-categorias',     getTopCategorias);
router.get('/tickets-dia',        getTicketsPorDia);
router.get('/distribucion-tipo',  getDistribucionTipo);
router.get('/tiempo-analista',    getTiempoPromedioPorAnalista);
router.get('/heatmap-eds',        getHeatmapEDS);
router.get('/ultimos-tickets',    getUltimosTickets);
router.get('/ranking-eds',        getRankingEDS);
router.get('/categorias-tiempo',  getCategoriasTiempo);

module.exports = router;
