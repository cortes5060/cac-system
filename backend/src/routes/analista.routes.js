const { Router } = require('express');
const { loginAnalista, getAnalista, cambiarEstado } = require('../controllers/analista.controller');

const router = Router();

router.post('/login', loginAnalista);
router.get('/:id', getAnalista);
router.put('/:id/estado', cambiarEstado);

module.exports = router;