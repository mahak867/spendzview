const router = require('express').Router();
const ctrl = require('../controllers/backupController');
const requireAuth = require('../middleware/auth');

router.get('/export/csv', requireAuth, ctrl.exportCSV);
router.get('/export/pdf', requireAuth, ctrl.exportPDF);
router.get('/export/json', requireAuth, ctrl.exportJSON);
router.post('/import', requireAuth, ctrl.importJSON);

module.exports = router;