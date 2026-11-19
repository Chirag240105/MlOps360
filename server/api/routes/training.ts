import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import type {TrainingAlgorithm, TrainingService} from '../../services/trainingService.ts';

export function createTrainingRouter(trainingService: TrainingService): Router {
  const router = Router();

  router.get('/runs', (_req, res, next) => {
    try {
      res.json({runs: trainingService.listRuns()});
    } catch (err) {
      next(err);
    }
  });

  router.get('/runs/:runId', (req, res, next) => {
    try {
      res.json(trainingService.getRun(req.params.runId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/run', async (req, res, next) => {
    try {
      const {datasetId, algorithm, seed, experimentName} = req.body ?? {};
      if (typeof datasetId !== 'string' || !datasetId.trim()) {
        throw new ValidationError('Field "datasetId" is required');
      }
      const result = await trainingService.runTraining({
        datasetId: datasetId.trim(),
        algorithm: algorithm as TrainingAlgorithm | undefined,
        seed: seed !== undefined ? Number(seed) : undefined,
        experimentName: typeof experimentName === 'string' ? experimentName : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
