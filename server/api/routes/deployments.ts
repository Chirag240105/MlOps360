import {Router} from 'express';
import {ValidationError} from '../../core/errors.ts';
import type {DeploymentService} from '../../services/deploymentService.ts';

export function createDeploymentsRouter(deploymentService: DeploymentService): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json({deployments: deploymentService.listDeployments()});
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const {modelId, modelVersionId, endpointName, environment, actor} = req.body ?? {};
      if (typeof modelId !== 'string' || typeof modelVersionId !== 'string') {
        throw new ValidationError('Fields "modelId" and "modelVersionId" are required');
      }
      const dep = deploymentService.deployVersion({
        modelId,
        modelVersionId,
        endpointName: typeof endpointName === 'string' ? endpointName : undefined,
        environment: typeof environment === 'string' ? environment : undefined,
        actor: typeof actor === 'string' ? actor : req.principal?.email,
      });
      res.status(201).json(dep);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
