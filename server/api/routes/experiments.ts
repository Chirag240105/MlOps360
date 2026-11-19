import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import type {ExperimentService} from '../../services/experimentService.ts';

export function createExperimentsRouter(experimentService: ExperimentService): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json({experiments: experimentService.listExperiments()});
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const {name, description} = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Field "name" is required');
      }
      const exp = experimentService.getOrCreateExperiment(name, typeof description === 'string' ? description : '');
      res.status(201).json(exp);
    } catch (err) {
      next(err);
    }
  });

  router.get('/runs', (req, res, next) => {
    try {
      const experimentId = typeof req.query.experimentId === 'string' ? req.query.experimentId : undefined;
      const algorithm = typeof req.query.algorithm === 'string' ? req.query.algorithm : undefined;
      res.json({runs: experimentService.listRuns({experimentId, algorithm})});
    } catch (err) {
      next(err);
    }
  });

  router.get('/:experimentId/runs', (req, res, next) => {
    try {
      const exp = experimentService.getExperimentOrThrow(req.params.experimentId);
      const runs = experimentService.listRuns({experimentId: exp.id});
      res.json({experiment: exp, runs});
    } catch (err) {
      next(err);
    }
  });

  return router;
}
