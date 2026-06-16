const { Router } = require('express');
const multer = require('multer');
const { previewExcel, confirmarImport } = require('../controllers/import.controller');

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post('/preview',   upload.single('archivo'), previewExcel);
router.post('/confirmar', confirmarImport);

module.exports = router;
