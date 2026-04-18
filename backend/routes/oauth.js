const router = require('express').Router();
const oauthCtrl = require('../controllers/oauthController');

router.get('/config', oauthCtrl.getConfig);
router.get('/google', oauthCtrl.googleAuth);
router.get('/google/callback', oauthCtrl.googleCallback);

module.exports = router;
