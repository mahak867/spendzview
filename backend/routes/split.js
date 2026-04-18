const router = require('express').Router();
const ctrl = require('../controllers/splitController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.list);
router.post('/', requireAuth, ctrl.add);
router.post('/participant/:participantId/paid', requireAuth, ctrl.markPaid);
router.delete('/:id', requireAuth, ctrl.delete);

module.exports = router;
