const { Router } = require('express');
const { getCasos, tomarCaso, deshacerCaso } = require('../controllers/casos.controller');

const router = Router();

router.post('/tomar', tomarCaso);
router.post('/deshacer', deshacerCaso);
router.get('/lista', getCasos);

module.exports = router;