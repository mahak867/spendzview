const router = require('express').Router();
const ctrl = require('../controllers/cashFlowController');
const requireAuth = require('../middleware/auth');

router.get('/upcoming', requireAuth, ctrl.upcoming);

module.exports = router;
