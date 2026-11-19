import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import type {DatasetService} from '../../services/datasetService.ts';

export function createDatasetsRouter(datasetService: DatasetService): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json({datasets: datasetService.listDatasets()});
    } catch (err) {
      next(err);
    }
  });

  router.post('/generate', async (req, res, next) => {
    try {
      const {name, days, startDate, seed, scenario, description} = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Field "name" must be a non-empty string');
      }
      if (scenario !== undefined && !['reference', 'corrupted', 'drifted'].includes(String(scenario))) {
        throw new ValidationError('Field "scenario" must be one of reference, corrupted, drifted');
      }
      const result = await datasetService.generateDataset({
        name,
        days: days !== undefined ? Number(days) : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        seed: seed !== undefined ? Number(seed) : undefined,
        scenario,
        description: typeof description === 'string' ? description : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/ingest', async (req, res, next) => {
    try {
      const {name, csvContent, description} = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Field "name" must be a non-empty string');
      }
      if (typeof csvContent !== 'string' || !csvContent.trim()) {
        throw new ValidationError('Field "csvContent" must be a non-empty CSV string');
      }
      const result = await datasetService.ingestCsvDataset({name, csvContent, description});
      res.status(result.validationPassed ? 201 : 200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:datasetId/eda', (req, res, next) => {
    try {
      const eda = datasetService.getDatasetEda(req.params.datasetId);
      res.json(eda);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:datasetId/baseline', async (req, res, next) => {
    try {
      const results = await datasetService.runBaselines(req.params.datasetId);
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
