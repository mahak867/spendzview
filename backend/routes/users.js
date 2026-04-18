const router = require('express').Router();
const ctrl = require('../controllers/usersController');
const requireAuth = require('../middleware/auth');

router.get('/profile', requireAuth, ctrl.getProfile);
router.put('/profile', requireAuth, ctrl.updateProfile);

module.exports = router;