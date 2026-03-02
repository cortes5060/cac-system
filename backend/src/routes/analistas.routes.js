const { Router } = require('express');
const { getAnalistas } = require('../controllers/analistas.controller');

const router = Router();

router.get('/', getAnalistas);

module.exports = router;