import express from 'express';
import {config} from './core/config.ts';
import {openDatabase} from './db/sqlite.ts';
import {createAuditRouter} from './api/routes/audit.ts';
import {createAuthRouter} from './api/routes/auth.ts';
import {createDatasetsRouter} from './api/routes/datasets.ts';
import {createDeploymentsRouter} from './api/routes/deployments.ts';
import {createExperimentsRouter} from './api/routes/experiments.ts';
import {createModelsRouter} from './api/routes/models.ts';
import {createMonitoringRouter} from './api/routes/monitoring.ts';
import {createPredictionsRouter} from './api/routes/predictions.ts';
import {createRetrainingRouter} from './api/routes/retraining.ts';
import {createTrainingRouter} from './api/routes/training.ts';
import {systemRouter} from './api/routes/system.ts';
import {createPrincipalMiddleware, requireRole} from './middleware/auth.ts';
import {createRateLimiter} from './middleware/rateLimiter.ts';
import {errorHandlerMiddleware, requestContextMiddleware} from './middleware/requestContext.ts';
import {AuditService} from './services/auditService.ts';
import {AuthService} from './services/authService.ts';
import {DatasetService} from './services/datasetService.ts';
import {DeploymentService} from './services/deploymentService.ts';
import {ExperimentService} from './services/experimentService.ts';
import {ModelRegistryService} from './services/modelRegistryService.ts';
import {MonitoringService} from './services/monitoringService.ts';
import {PredictionService} from './services/predictionService.ts';
import {RetrainingService} from './services/retrainingService.ts';
import {TrainingService} from './services/trainingService.ts';

export interface AppDependencies {
  dbPath?: string;
  artifactRoot?: string;
  enforceAuth?: boolean;
  rateLimitMaxRequests?: number;
}

// Extended Express app that exposes a close() to release the SQLite connection.
// Tests call app.close() in their finally block before fs.rmSync to avoid
// Windows EBUSY on WAL/SHM files that SQLite holds open.
export interface ApiApp extends express.Express {
  close(): void;
}

export function createApiApp(deps: AppDependencies = {}): ApiApp {
  const app = express() as ApiApp;
  const db = openDatabase(deps.dbPath ?? config.localSqlitePath);
  app.close = () => {
    try { db.close(); } catch { /* already closed */ }
  };
  const artifactRoot = deps.artifactRoot ?? config.artifactStoragePath;
  const enforceAuth = deps.enforceAuth ?? config.enforceAuth;
  const rateLimitMax = deps.rateLimitMaxRequests ?? config.rateLimitMaxRequests;

  const auditService = new AuditService(db);
  const authService = new AuthService(
    db,
    config.jwtSecret,
    config.accessTokenExpireMinutes,
    auditService,
  );
  const experimentService = new ExperimentService(db);
  const datasetService = new DatasetService(db, artifactRoot);
  const trainingService = new TrainingService(db, artifactRoot, experimentService);
  const registryService = new ModelRegistryService(db, auditService);
  const deploymentService = new DeploymentService(db, auditService);
  const predictionService = new PredictionService(db);
  const monitoringService = new MonitoringService(db, predictionService, auditService);
  const retrainingService = new RetrainingService(db, trainingService, registryService, auditService);

  app.disable('x-powered-by');
  app.use(express.json({limit: '10mb'}));
  app.use(requestContextMiddleware);
  app.use(createRateLimiter(rateLimitMax));
  app.use(createPrincipalMiddleware(config.jwtSecret));

  const mutateGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      if (enforceAuth) {
        return requireRole(['Admin', 'ML_Engineer', 'Viewer'], true)(req, res, next);
      }
      return next();
    }
    return requireRole(['Admin', 'ML_Engineer'], enforceAuth)(req, res, next);
  };

  app.use('/api/v1', systemRouter);
  app.use('/api/v1', createAuthRouter(authService));
  app.use('/api/v1/datasets', mutateGuard, createDatasetsRouter(datasetService));
  app.use('/api/v1/training', mutateGuard, createTrainingRouter(trainingService));
  app.use('/api/v1/experiments', mutateGuard, createExperimentsRouter(experimentService));
  app.use('/api/v1/models', mutateGuard, createModelsRouter(registryService));
  app.use('/api/v1/deployments', mutateGuard, createDeploymentsRouter(deploymentService));
  app.use('/api/v1/monitoring', mutateGuard, createMonitoringRouter(monitoringService));
  app.use('/api/v1/retraining', mutateGuard, createRetrainingRouter(retrainingService));
  app.use('/api/v1', createPredictionsRouter(predictionService));
  app.use('/api/v1/audit', createAuditRouter(auditService));

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Requested API route does not exist',
      },
    });
  });

  app.use(errorHandlerMiddleware);
  return app;
}
