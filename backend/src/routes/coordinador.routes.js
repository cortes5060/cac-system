const { Router } = require('express');
const {
  login,
  getAnalistas, getTodosLosAnalistas, cambiarEstadoAnalista, eliminarAnalista, actualizarOrden, asignarPasswordAnalista,
  getCategorias, crearCategoria, toggleCategoria,
  getEDS, crearEDS, toggleEDS,
  getHorarios, getAnalistasHorarios, asignarHorario, crearHorario, actualizarHorario, eliminarHorario,
  getGruposColaborador, crearGrupoColaborador, asignarGrupoAnalista,
  getAlertas, resolverAlerta,
  buscarCasos
} = require('../controllers/coordinador.controller');
const { listarDesconexiones, resolverDesconexion, finalizarDesconexionCoordinador } = require('../controllers/desconexion.controller');

const router = Router();

// Auth
router.post('/login', login);

// Analistas — specific routes before parameterized
router.get('/analistas', getAnalistas);
router.get('/analistas-todos', getTodosLosAnalistas);
router.put('/analistas/orden', actualizarOrden);
router.put('/analistas/:id/password', asignarPasswordAnalista);
router.put('/analistas/:id/grupo', asignarGrupoAnalista);

// Grupos de colaboradores
router.get('/grupos-colaborador', getGruposColaborador);
router.post('/grupos-colaborador', crearGrupoColaborador);

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
router.post('/horarios', crearHorario);
router.put('/horarios/:id', actualizarHorario);
router.delete('/horarios/:id', eliminarHorario);
router.get('/analistas-horarios', getAnalistasHorarios);

// Alertas
router.get('/alertas', getAlertas);
router.put('/alertas/:id/resolver', resolverAlerta);

// Buscar casos 3CX
router.get('/casos', buscarCasos);

// Desconexión supervisada
router.get('/desconexiones',                 listarDesconexiones);
router.post('/desconexiones/:idSolicitud/resolver', resolverDesconexion);
router.post('/desconexiones/:idSolicitud/finalizar', finalizarDesconexionCoordinador);

// Parameterized analista routes last
router.put('/:id/estado', cambiarEstadoAnalista);
router.put('/:id/horario', asignarHorario);
router.delete('/:id', eliminarAnalista);

module.exports = router;
