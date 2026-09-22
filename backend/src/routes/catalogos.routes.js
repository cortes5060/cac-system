const { Router } = require('express');
const { getEstaciones, getCategorias, getTiposCaso, getAnalistas, getGrupos } = require('../controllers/catalogos.controller');

const router = Router();

router.get('/estaciones', getEstaciones);
router.get('/categorias', getCategorias);
router.get('/tiposcaso',  getTiposCaso);
router.get('/analistas',  getAnalistas);
router.get('/grupos',     getGrupos);

module.exports = router;
