import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type AppEnv = 'development' | 'test' | 'staging' | 'production';

export interface PlatformConfig {
  appName: string;
  appEnv: AppEnv;
  port: number;
  logLevel: LogLevel;
  allowedOrigins: string[];
  jwtSecret: string;
  accessTokenExpireMinutes: number;
  enforceAuth: boolean;
  rateLimitMaxRequests: number;
  localSqlitePath: string;
  artifactStoragePath: string;
  mlflowTrackingUri: string;
  mlflowExperimentName: string;
  driftPsiThreshold: number;
  driftKsPvalueThreshold: number;
  retrainingCooldownHours: number;
  minPromotionRmseImprovement: number;
  pythonExecutable: string;
}

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);
const VALID_ENVS: ReadonlySet<string> = new Set(['development', 'test', 'staging', 'production']);

function parsePositiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid environment configuration for ${name}: expected non-negative number, got "${raw}"`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  const rawEnv = (env.APP_ENV || env.NODE_ENV || 'development').toLowerCase();
  const appEnv: AppEnv = VALID_ENVS.has(rawEnv) ? (rawEnv as AppEnv) : 'development';

  const rawLogLevel = (env.LOG_LEVEL || 'INFO').toUpperCase();
  if (!VALID_LOG_LEVELS.has(rawLogLevel)) {
    throw new Error(`Invalid LOG_LEVEL "${rawLogLevel}". Expected one of DEBUG, INFO, WARN, ERROR.`);
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    appName: env.APP_NAME?.trim() || 'ModelOps360',
    appEnv,
    port: parsePositiveNumber(env.PORT, 3000, 'PORT'),
    logLevel: rawLogLevel as LogLevel,
    allowedOrigins,
    jwtSecret: env.JWT_SECRET?.trim() || 'CHANGE_ME_LOCAL_DEV_ONLY_MIN_32_CHARS',
    accessTokenExpireMinutes: parsePositiveNumber(
      env.ACCESS_TOKEN_EXPIRE_MINUTES,
      60,
      'ACCESS_TOKEN_EXPIRE_MINUTES',
    ),
    enforceAuth: env.ENFORCE_AUTH === 'true',
    rateLimitMaxRequests: parsePositiveNumber(env.RATE_LIMIT_MAX_REQUESTS, 300, 'RATE_LIMIT_MAX_REQUESTS'),
    localSqlitePath: path.resolve(env.LOCAL_SQLITE_PATH || './data/modelops360.db'),
    artifactStoragePath: path.resolve(env.ARTIFACT_STORAGE_PATH || './artifacts'),
    mlflowTrackingUri: env.MLFLOW_TRACKING_URI || 'http://localhost:5000',
    mlflowExperimentName: env.MLFLOW_EXPERIMENT_NAME || 'retail-demand-forecasting',
    driftPsiThreshold: parsePositiveNumber(env.DRIFT_PSI_THRESHOLD, 0.2, 'DRIFT_PSI_THRESHOLD'),
    driftKsPvalueThreshold: parsePositiveNumber(env.DRIFT_KS_PVALUE_THRESHOLD, 0.05, 'DRIFT_KS_PVALUE_THRESHOLD'),
    retrainingCooldownHours: parsePositiveNumber(env.RETRAINING_COOLDOWN_HOURS, 24, 'RETRAINING_COOLDOWN_HOURS'),
    minPromotionRmseImprovement: parsePositiveNumber(
      env.MIN_PROMOTION_RMSE_IMPROVEMENT,
      0.02,
      'MIN_PROMOTION_RMSE_IMPROVEMENT',
    ),
    pythonExecutable: env.PYTHON_EXECUTABLE || 'python3',
  };
}

export const config = loadConfig();
