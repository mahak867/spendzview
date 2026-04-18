const router = require('express').Router();
const ctrl = require('../controllers/upiController');
const requireAuth = require('../middleware/auth');

router.post('/generate', requireAuth, ctrl.generate);
router.post('/payment', requireAuth, ctrl.savePayment);
router.get('/payments', requireAuth, ctrl.listPayments);
router.put('/payments/:id/status', requireAuth, ctrl.updateStatus);
router.get('/summary', requireAuth, ctrl.summary);

module.exports = router;