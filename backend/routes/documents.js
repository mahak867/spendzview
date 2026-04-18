const router = require('express').Router();
const ctrl = require('../controllers/documentsController');
const requireAuth = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

router.get('/', requireAuth, ctrl.list);
router.post('/upload', requireAuth, uploadSingle, ctrl.upload);
router.get('/:id', requireAuth, ctrl.getById);
router.delete('/:id', requireAuth, ctrl.delete);

module.exports = router;