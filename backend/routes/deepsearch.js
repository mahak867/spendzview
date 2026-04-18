const router = require('express').Router();
const ctrl = require('../controllers/deepsearchController');
const requireAuth = require('../middleware/auth');

router.post('/query', requireAuth, ctrl.query);

module.exports = router;