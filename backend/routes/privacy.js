const router = require('express').Router();
const ctrl = require('../controllers/privacyController');
const requireAuth = require('../middleware/auth');

router.get('/policy', ctrl.privacyPolicy);
router.get('/export', requireAuth, ctrl.exportData);
router.delete('/account', requireAuth, ctrl.deleteAccount);

module.exports = router;
