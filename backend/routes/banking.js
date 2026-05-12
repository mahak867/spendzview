const router = require('express').Router();
const ctrl = require('../controllers/bankingController');
const requireAuth = require('../middleware/auth');
const { uploadStatement } = require('../middleware/upload');

router.get('/accounts', requireAuth, ctrl.listAccounts);
router.post('/accounts', requireAuth, ctrl.addAccount);
router.put('/accounts/:id', requireAuth, ctrl.updateAccount);
router.delete('/accounts/:id', requireAuth, ctrl.deleteAccount);
router.post('/link', requireAuth, ctrl.initiateLink);
router.get('/callback', requireAuth, ctrl.callback);
router.post('/sync', requireAuth, ctrl.sync);
router.post('/import', requireAuth, uploadStatement, ctrl.importCSV);
router.get('/transactions', requireAuth, ctrl.listTransactions);

module.exports = router;
