const { Router } = require('express');
const { getCasos, tomarCaso } = require('../controllers/casos.controller');

const router = Router();

router.post('/tomar', tomarCaso);
router.get('/lista', getCasos);

module.exports = router;