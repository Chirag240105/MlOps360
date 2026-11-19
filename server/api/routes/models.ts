import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import type {ModelRegistryService, ModelStage} from '../../services/modelRegistryService.ts';

const VALID_STAGES: ReadonlySet<string> = new Set([
  'Development',
  'Candidate',
  'Staging',
  'Production',
  'Archived',
  'Rejected',
]);

export function createModelsRouter(registryService: ModelRegistryService): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json({models: registryService.listModels()});
    } catch (err) {
      next(err);
    }
  });

  router.get('/:modelId', (req, res, next) => {
    try {
      res.json(registryService.getModelDetails(req.params.modelId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/register', (req, res, next) => {
    try {
      const {modelName, trainingRunId, initialStage, notes, actor, description} = req.body ?? {};
      if (typeof modelName !== 'string' || !modelName.trim()) {
        throw new ValidationError('Field "modelName" is required');
      }
      if (typeof trainingRunId !== 'string' || !trainingRunId.trim()) {
        throw new ValidationError('Field "trainingRunId" is required');
      }
      const version = registryService.registerModelVersion({
        modelName,
        trainingRunId,
        initialStage,
        notes,
        actor,
        description,
      });
      res.status(201).json(version);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:modelId/versions/:versionId/transition', (req, res, next) => {
    try {
      const {targetStage, actor, reason} = req.body ?? {};
      if (typeof targetStage !== 'string' || !VALID_STAGES.has(targetStage)) {
        throw new ValidationError(
          `Invalid targetStage "${String(targetStage)}". Must be one of ${Array.from(VALID_STAGES).join(', ')}`,
        );
      }
      const updated = registryService.transitionStage({
        modelId: req.params.modelId,
        versionId: req.params.versionId,
        targetStage: targetStage as ModelStage,
        actor: typeof actor === 'string' ? actor : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:modelId/versions/:versionId/promote', (req, res, next) => {
    try {
      const {actor, reason, forceOverride} = req.body ?? {};
      const promoted = registryService.promoteVersion({
        modelId: req.params.modelId,
        versionId: req.params.versionId,
        actor: req.principal?.email ?? (typeof actor === 'string' ? actor : undefined),
        reason: typeof reason === 'string' ? reason : undefined,
        forceOverride: forceOverride === true,
      });
      res.json(promoted);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:modelId/rollback', (req, res, next) => {
    try {
      const {targetVersionId, demoteCurrentTo, reason, actor} = req.body ?? {};
      const result = registryService.rollbackModel({
        modelId: req.params.modelId,
        targetVersionId: typeof targetVersionId === 'string' ? targetVersionId : undefined,
        demoteCurrentTo,
        reason: typeof reason === 'string' ? reason : undefined,
        actor: req.principal?.email ?? (typeof actor === 'string' ? actor : undefined),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:modelId/compare', (req, res, next) => {
    try {
      const baseline = String(req.query.baseline || '');
      const challenger = String(req.query.challenger || '');
      if (!baseline || !challenger) {
        throw new ValidationError('Query parameters "baseline" and "challenger" version IDs are required');
      }
      res.json(registryService.compareVersions(req.params.modelId, baseline, challenger));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
