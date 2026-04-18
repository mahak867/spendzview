const db = require('../models/db');

/**
 * Audit trail middleware — logs create/update/delete actions automatically.
 * Usage: router.post('/', requireAuth, auditLog('expense', 'create'), ctrl.add)
 */
module.exports = function auditLog(entity, action) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      if (res.statusCode < 400 && req.session?.userId) {
        try {
          const entityId = data?.expense?.id || data?.income?.id || data?.investment?.id ||
            data?.loan?.id || data?.bill?.id || data?.goal?.id || data?.card?.id || null;
          db.prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, new_value, ip_address) VALUES (?,?,?,?,?,?)`)
            .run(req.session.userId, action, entity, entityId || null,
              JSON.stringify(data).substring(0, 1000),
              req.ip || req.headers['x-forwarded-for'] || null);
        } catch (_) {}
      }
      return originalJson(data);
    };
    next();
  };
};
