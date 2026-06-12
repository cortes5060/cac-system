const { Router } = require('express');
const { getMetricas } = require('../controllers/metricas.controller');

const router = Router();

router.get('/', getMetricas);

module.exports = router;
