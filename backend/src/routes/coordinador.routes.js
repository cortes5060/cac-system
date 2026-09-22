const { Router } = require('express');
const {
  login,
  getAnalistas, cambiarEstadoAnalista, eliminarAnalista, actualizarOrden,
  getCategorias, crearCategoria, toggleCategoria,
  getEDS, crearEDS, toggleEDS,
  getHorarios, getAnalistasHorarios, asignarHorario
} = require('../controllers/coordinador.controller');

const router = Router();

// Auth
router.post('/login', login);

// Analistas — specific routes before parameterized
router.get('/analistas', getAnalistas);
router.put('/analistas/orden', actualizarOrden);

// Categorías
router.get('/categorias', getCategorias);
router.post('/categorias', crearCategoria);
router.put('/categorias/:id/estado', toggleCategoria);

// EDS
router.get('/eds', getEDS);
router.post('/eds', crearEDS);
router.put('/eds/:id/estado', toggleEDS);

// Horarios
router.get('/horarios', getHorarios);
router.get('/analistas-horarios', getAnalistasHorarios);

// Parameterized analista routes last
router.put('/:id/estado', cambiarEstadoAnalista);
router.put('/:id/horario', asignarHorario);
router.delete('/:id', eliminarAnalista);

module.exports = router;
