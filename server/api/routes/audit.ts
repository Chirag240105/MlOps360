import {Router} from 'express';
import type {AuditService} from '../../services/auditService.ts';

export function createAuditRouter(auditService: AuditService): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.floor(limitRaw)) : 100;
      const action = typeof req.query.action === 'string' && req.query.action.trim() ? req.query.action.trim() : undefined;
      res.json({logs: auditService.list(limit, action)});
    } catch (err) {
      next(err);
    }
  });

  return router;
}
