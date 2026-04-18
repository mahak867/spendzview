const router = require('express').Router();
const ctrl = require('../controllers/budgetsController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.list);
router.post('/', requireAuth, ctrl.set);
router.get('/status', requireAuth, ctrl.status);

module.exports = router;