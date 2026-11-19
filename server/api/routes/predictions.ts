import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import type {PredictionService} from '../../services/predictionService.ts';

export function createPredictionsRouter(predictionService: PredictionService): Router {
  const router = Router();

  router.post('/predict', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const selector = {
        modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
        modelName: typeof body.modelName === 'string' ? body.modelName : undefined,
      };
      const payload = body.features && typeof body.features === 'object' ? body.features : body;
      const result = await predictionService.predictSingle(payload, req.requestId || 'req_unknown', selector);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/predict/batch', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const selector = {
        modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
        modelName: typeof body.modelName === 'string' ? body.modelName : undefined,
      };
      const result = await predictionService.predictBatch(
        body.records,
        req.requestId || 'req_unknown',
        selector,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/predictions', (req, res, next) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.floor(limitRaw)) : 50;
      const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : undefined;
      res.json({predictions: predictionService.listPredictions(limit, modelId)});
    } catch (err) {
      next(err);
    }
  });

  router.get('/predictions/:predictionId', (req, res, next) => {
    try {
      res.json(predictionService.getPrediction(req.params.predictionId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/predictions/ground-truth', (req, res, next) => {
    try {
      const {updates} = req.body ?? {};
      if (!Array.isArray(updates)) {
        throw new ValidationError('Field "updates" must be a non-empty array');
      }
      res.json(predictionService.recordGroundTruth(updates));
    } catch (err) {
      next(err);
    }
  });

  router.get('/metrics', (_req, res, next) => {
    try {
      res.json(predictionService.getServingMetrics());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
