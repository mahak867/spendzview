const router = require('express').Router();
const ctrl = require('../controllers/adminController');

router.get('/metrics', ctrl.requireAdmin, ctrl.metrics);

module.exports = router;
