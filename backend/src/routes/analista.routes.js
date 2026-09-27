const { Router } = require('express');
const { loginAnalista, getAnalista, cambiarEstado } = require('../controllers/analista.controller');
const { solicitarDesconexion, miDesconexion, finalizarDesconexion } = require('../controllers/desconexion.controller');

const router = Router();

router.post('/login', loginAnalista);
router.get('/:id', getAnalista);
router.put('/:id/estado', cambiarEstado);

router.post('/:id/desconexion/solicitar', solicitarDesconexion);
router.get('/:id/desconexion/mia', miDesconexion);
router.post('/:id/desconexion/:idSolicitud/finalizar', finalizarDesconexion);

module.exports = router;