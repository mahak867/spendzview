const router = require('express').Router();
const ctrl = require('../controllers/incomeController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.list);
router.get('/summary', requireAuth, ctrl.summary);
router.post('/', requireAuth, ctrl.add);
router.put('/:id', requireAuth, ctrl.update);
router.delete('/:id', requireAuth, ctrl.delete);

module.exports = router;
