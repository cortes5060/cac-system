const { Router } = require('express');
const { getAnalista, cambiarEstado } = require('../controllers/analista.controller');

const router = Router();

router.get('/:id', getAnalista);
router.put('/:id/estado', cambiarEstado);

module.exports = router;