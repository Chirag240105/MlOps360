import {Router} from 'express';
import type {RetrainingService, RetrainingTriggerType} from '../../services/retrainingService.ts';
import type {TrainingAlgorithm} from '../../services/trainingService.ts';

export function createRetrainingRouter(retrainingService: RetrainingService): Router {
  const router = Router();

  router.post('/evaluate', (req, res, next) => {
    try {
      const body = req.body ?? {};
      if (typeof body.modelId !== 'string' || !body.modelId.trim()) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'modelId is required'}});
        return;
      }
      res.json(
        retrainingService.evaluatePolicy({
          modelId: body.modelId.trim(),
          bypassCooldown: body.bypassCooldown === true,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/trigger', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const result = await retrainingService.triggerRetraining({
        modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
        datasetId: typeof body.datasetId === 'string' ? body.datasetId : undefined,
        triggerType: body.triggerType as RetrainingTriggerType | undefined,
        algorithm: body.algorithm as TrainingAlgorithm | undefined,
        seed: body.seed !== undefined ? Number(body.seed) : undefined,
        experimentName: typeof body.experimentName === 'string' ? body.experimentName : undefined,
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
        bypassCooldown: body.bypassCooldown === true,
        promoteToStagingOnly: body.promoteToStagingOnly === true,
        minRmseImprovement:
          body.minRmseImprovement !== undefined ? Number(body.minRmseImprovement) : undefined,
        actor: req.principal?.email,
      });
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs', (req, res, next) => {
    try {
      const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : undefined;
      res.json({jobs: retrainingService.listJobs(modelId)});
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs/:jobId', (req, res, next) => {
    try {
      res.json(retrainingService.getJob(req.params.jobId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
