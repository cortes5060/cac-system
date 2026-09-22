const { Router } = require('express');
const { generarTexto } = require('../controllers/ia.controller');

const router = Router();

router.post('/generar', generarTexto);

module.exports = router;
