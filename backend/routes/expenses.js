const router = require('express').Router();
const ctrl = require('../controllers/expensesController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.list);
router.get('/stats', requireAuth, ctrl.stats);
router.post('/', requireAuth, ctrl.add);
router.put('/:id', requireAuth, ctrl.update);
router.delete('/:id', requireAuth, ctrl.delete);

module.exports = router;