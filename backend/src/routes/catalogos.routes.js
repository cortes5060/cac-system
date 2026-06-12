const { Router } = require('express');
const { getEstaciones, getCategorias, getTiposCaso } = require('../controllers/catalogos.controller');

const router = Router();

router.get('/estaciones', getEstaciones);
router.get('/categorias', getCategorias);
router.get('/tiposcaso', getTiposCaso);

module.exports = router;
