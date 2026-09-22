const { Router } = require('express');
const { previewEstaciones, confirmarEstaciones, upload } = require('../controllers/import-estaciones.controller');

const router = Router();

router.post('/preview',   upload.single('archivo'), previewEstaciones);
router.post('/confirmar', confirmarEstaciones);

module.exports = router;
