const router = require('express').Router();
const ctrl = require('../controllers/billsController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.list);
router.post('/', requireAuth, ctrl.add);
router.put('/:id', requireAuth, ctrl.update);
router.delete('/:id', requireAuth, ctrl.delete);
router.get('/upcoming', requireAuth, ctrl.upcoming);
router.get('/summary', requireAuth, ctrl.summary);

module.exports = router;