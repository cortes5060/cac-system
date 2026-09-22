const { Router } = require('express');
const multer = require('multer');
const {
  getKPIs,
  getTicketsPorAnalista,
  getTopCategorias,
  getTicketsPorDia,
  getDistribucionTipo,
  getDistribucionEstatus,
  getDistribucionPrioridad,
  getAntiguedadAbiertos,
  getUltimosTickets,
  getRankingEDS,
  getTopAltaPrioridad,
  getMetricasEscalacion,
  getTablaEscaladosActivos,
  getMetricasTiempos,
  enviarReporte,
} = require('../controllers/supervisor.controller');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.get('/kpis',                 getKPIs);
router.get('/tickets-analista',     getTicketsPorAnalista);
router.get('/top-categorias',       getTopCategorias);
router.get('/tickets-dia',          getTicketsPorDia);
router.get('/distribucion-tipo',    getDistribucionTipo);
router.get('/distribucion-estatus', getDistribucionEstatus);
router.get('/distribucion-prioridad', getDistribucionPrioridad);
router.get('/antiguedad-abiertos',  getAntiguedadAbiertos);
router.get('/ultimos-tickets',      getUltimosTickets);
router.get('/ranking-eds',            getRankingEDS);
router.get('/top-alta-prioridad',     getTopAltaPrioridad);
router.get('/metricas-escalacion',    getMetricasEscalacion);
router.get('/escalados-activos',      getTablaEscaladosActivos);
router.get('/tiempos-respuesta',      getMetricasTiempos);
router.post('/reporte/enviar',        upload.single('informe'), enviarReporte);

module.exports = router;
