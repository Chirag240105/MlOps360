import {execFileSync} from 'node:child_process';
import {Router} from 'express';
import {config} from '../../core/config.ts';

export const systemRouter = Router();

const startedAt = new Date().toISOString();

function detectPythonVersion(): string | null {
  try {
    return execFileSync(config.pythonExecutable, ['--version'], {encoding: 'utf8'}).trim();
  } catch {
    return null;
  }
}

systemRouter.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: config.appName,
    environment: config.appEnv,
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    requestId: req.requestId ?? null,
    checks: {
      apiGateway: 'ok',
      nodeRuntime: process.version,
      pythonWorkerRuntime: detectPythonVersion() ?? 'unavailable',
    },
  });
});

systemRouter.get('/system/architecture', (_req, res) => {
  res.json({
    platform: config.appName,
    phase: 'Phase 1 - Core Architecture & Scaffolding',
    useCase: 'Retail Demand Forecasting',
    planes: [
      {
        name: 'Control Plane API',
        responsibility: 'Dataset registration, experiment governance, registry state transitions, audit logs',
        runtime: 'Express + TypeScript (Workspace) / FastAPI (Production Target)',
      },
      {
        name: 'ML Training & Drift Engine',
        responsibility: 'Time-aware feature engineering, baseline/tree models, PSI/KS drift checks',
        runtime: 'Python 3.11 Worker / Scikit-learn + XGBoost + Evidently (Production Target)',
      },
      {
        name: 'Model Serving Plane',
        responsibility: 'Resolves active Production pointer, validates inputs, logs predictions & latency',
        runtime: 'Dynamic pointer-backed /predict endpoint',
      },
      {
        name: 'Metadata & Artifact Store',
        responsibility: 'Transactional governance in SQL + immutable artifacts & MLflow lineage',
        runtime: 'SQLite (Workspace Dev) / PostgreSQL + MLflow + S3 (Production Target)',
      },
    ],
    governanceDefaults: {
      driftPsiThreshold: config.driftPsiThreshold,
      driftKsPvalueThreshold: config.driftKsPvalueThreshold,
      retrainingCooldownHours: config.retrainingCooldownHours,
      minPromotionRmseImprovement: config.minPromotionRmseImprovement,
      lifecycleStates: ['Development', 'Candidate', 'Staging', 'Production', 'Archived', 'Rejected'],
    },
  });
});
