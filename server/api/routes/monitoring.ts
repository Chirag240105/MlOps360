import {Router} from 'express';
import type {MonitoringService} from '../../services/monitoringService.ts';

export function createMonitoringRouter(monitoringService: MonitoringService): Router {
  const router = Router();

  router.post('/run', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const report = await monitoringService.runMonitoring({
        modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
        windowLimit: body.windowLimit !== undefined ? Number(body.windowLimit) : undefined,
        psiThreshold: body.psiThreshold !== undefined ? Number(body.psiThreshold) : undefined,
        ksPvalueThreshold: body.ksPvalueThreshold !== undefined ? Number(body.ksPvalueThreshold) : undefined,
        rmseDegradationFactor:
          body.rmseDegradationFactor !== undefined ? Number(body.rmseDegradationFactor) : undefined,
      });
      res.status(201).json(report);
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports', (req, res, next) => {
    try {
      const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : undefined;
      res.json({reports: monitoringService.listReports(modelId)});
    } catch (err) {
      next(err);
    }
  });

  router.get('/drift-events', (req, res, next) => {
    try {
      const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : undefined;
      const ackRaw = req.query.acknowledged;
      const acknowledged = ackRaw === 'true' ? true : ackRaw === 'false' ? false : undefined;
      res.json({events: monitoringService.listDriftEvents({modelId, acknowledged})});
    } catch (err) {
      next(err);
    }
  });

  router.post('/drift-events/:eventId/acknowledge', (req, res, next) => {
    try {
      res.json(monitoringService.acknowledgeDriftEvent(req.params.eventId, req.principal?.email));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
