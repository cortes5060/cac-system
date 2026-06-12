const { Router } = require('express');
const { crearTicket } = require('../controllers/ticket.controller');

const router = Router();

router.post('/', crearTicket);

module.exports = router;
