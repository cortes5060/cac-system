const { Router } = require('express');
const {
  getCasos, tomarCaso, getMisCasos, cambiarEstadoCaso, buscarCasos, actualizarTicketCaso, pasarCaso
} = require('../controllers/casos.controller');

const router = Router();

router.post('/tomar', tomarCaso);
router.get('/lista', getCasos);
router.get('/buscar', buscarCasos);
router.get('/mis/:idAnalista', getMisCasos);
router.put('/:id/estado', cambiarEstadoCaso);
router.put('/:id/ticket', actualizarTicketCaso);
router.put('/:id/pasar', pasarCaso);

module.exports = router;
