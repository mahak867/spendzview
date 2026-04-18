const router = require('express').Router();
const ctrl = require('../controllers/netWorthController');
const requireAuth = require('../middleware/auth');

router.get('/summary', requireAuth, ctrl.summary);

module.exports = router;
