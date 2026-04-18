const router = require('express').Router();
const ctrl = require('../controllers/notificationsController');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, ctrl.list);
router.put('/:id/read', requireAuth, ctrl.markRead);
router.put('/read-all', requireAuth, ctrl.markAllRead);
router.post('/check', requireAuth, ctrl.check);
router.delete('/:id', requireAuth, ctrl.delete);
router.get('/unread-count', requireAuth, ctrl.unreadCount);

module.exports = router;