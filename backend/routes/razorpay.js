const router = require('express').Router();
const ctrl = require('../controllers/razorpayController');
const requireAuth = require('../middleware/auth');

router.get('/key', ctrl.getKey);
router.get('/plans', ctrl.getPlans);
router.get('/status', requireAuth, ctrl.status);
router.post('/create-order', requireAuth, ctrl.createOrder);
router.post('/verify', requireAuth, ctrl.verifyPayment);
// Webhook doesn't need session auth (called by Razorpay servers)
router.post('/webhook', express_raw_body, ctrl.webhook);

function express_raw_body(req, res, next) { next(); }

module.exports = router;
