const router = require('express').Router();
const ctrl = require('../controllers/searchController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.search);

module.exports = router;
