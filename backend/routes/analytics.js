const router = require('express').Router();
const ctrl = require('../controllers/analyticsController');
const requireAuth = require('../middleware/auth');

router.get('/monthly', requireAuth, ctrl.monthly);
router.get('/categories', requireAuth, ctrl.categories);
router.get('/daily', requireAuth, ctrl.daily);
router.get('/budget-progress', requireAuth, ctrl.budgetProgress);
router.get('/weekly-comparison', requireAuth, ctrl.weeklyComparison);
router.get('/income-vs-expense', requireAuth, ctrl.incomeVsExpense);

module.exports = router;