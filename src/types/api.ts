export type ModelStage =
  | 'Development'
  | 'Candidate'
  | 'Staging'
  | 'Production'
  | 'Archived'
  | 'Rejected';

export type UserRole = 'Admin' | 'ML_Engineer' | 'Viewer';

export type EnvironmentScope = 'Development' | 'Staging' | 'Production';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive?: boolean;
  createdAt?: string;
}

export interface HealthPayload {
  status: string;
  service: string;
  environment: string;
  startedAt: string;
  uptimeSeconds: number;
  requestId: string | null;
  checks: {
    apiGateway: string;
    nodeRuntime: string;
    pythonWorkerRuntime: string;
  };
}

export interface ArchitecturePayload {
  platform: string;
  phase: string;
  useCase: string;
  planes: Array<{
    name: string;
    responsibility: string;
    runtime: string;
  }>;
  governanceDefaults: {
    driftPsiThreshold: number;
    driftKsPvalueThreshold: number;
    retrainingCooldownHours: number;
    minPromotionRmseImprovement: number;
    lifecycleStates: ModelStage[];
  };
}

export interface DatasetSummary {
  id: string;
  name: string;
  domain: string;
  description: string;
  createdAt: string;
  latestVersion: {
    id: string;
    versionNumber: number;
    versionHash: string;
    scenario: string;
    rowCount: number;
    validationPassed: boolean;
    createdAt: string;
  } | null;
}

export interface ValidationCheck {
  rule: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
  details: Record<string, unknown>;
}

export interface NumericSummaryStats {
  count: number;
  min?: number;
  p25?: number;
  median?: number;
  p75?: number;
  max?: number;
  mean?: number;
  std?: number;
}

export interface DatasetEdaResponse {
  datasetId: string;
  name: string;
  versionId: string;
  versionNumber: number;
  versionHash: string;
  validationPassed: boolean;
  checks: ValidationCheck[];
  eda: {
    dateRange: {start: string | null; end: string | null; distinctDays: number};
    cardinality: {stores: string[]; skus: string[]; categories: string[]};
    zeroDemandRows: number;
    missingCounts: Record<string, number>;
    numericSummary: Record<string, NumericSummaryStats>;
  } | null;
}

export interface MetricBundle {
  mae: number;
  rmse: number;
  mape: number | null;
  mapeValid?: boolean;
  smape?: number;
  r2: number;
  sampleCount?: number;
  zeroActualCount?: number;
}

export interface BaselineBenchmarkResponse {
  datasetId: string;
  versionId: string;
  versionNumber: number;
  versionHash: string;
  split: {
    trainRows: number;
    valRows: number;
    testRows: number;
    trainDateRange: {start: string; end: string};
    valDateRange: {start: string; end: string};
    testDateRange: {start: string; end: string};
  };
  baselines: Record<
    string,
    {
      name: string;
      validationMetrics: MetricBundle;
      testMetrics: MetricBundle;
    }
  >;
}

export interface TrainingRunSummary {
  runId: string;
  datasetId: string;
  datasetName?: string;
  datasetVersionId: string;
  datasetVersionNumber?: number;
  algorithm: string;
  hyperparameters: Record<string, unknown>;
  validationMetrics: MetricBundle;
  testMetrics: MetricBundle;
  artifactSha256: string;
  gitCommit: string;
  durationMs: number;
  status: string;
  createdAt: string;
  experimentId?: string | null;
  experimentName?: string | null;
  mlflowRunId?: string | null;
  candidatesEvaluated?: Array<{
    algorithm: string;
    hyperparameters: Record<string, unknown>;
    validationMetrics: MetricBundle;
    durationMs?: number;
  }>;
  splitSummary?: Record<string, unknown>;
  artifactPath?: string;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  description: string;
  runCount: number;
  createdAt: string;
}

export interface ExperimentRun {
  id: string;
  experimentId: string;
  experimentName: string;
  mlflowRunId: string;
  trainingRunId: string;
  datasetVersionId: string;
  algorithm: string;
  parameters: Record<string, unknown>;
  metrics: {
    validation: MetricBundle;
    test: MetricBundle;
  };
  tags: Record<string, unknown>;
  artifactUri: string;
  artifactSha256: string;
  gitCommit: string;
  durationMs: number;
  status: string;
  createdAt: string;
}

export interface ModelVersion {
  id: string;
  modelId: string;
  versionNumber: number;
  trainingRunId: string;
  mlflowRunId: string;
  datasetVersionId: string;
  algorithm: string;
  stage: ModelStage;
  artifactPath: string;
  artifactSha256: string;
  metrics: {
    validation: MetricBundle;
    test: MetricBundle;
  };
  hyperparameters: Record<string, unknown>;
  notes: string;
  promotedBy: string | null;
  promotedAt: string | null;
  createdAt: string;
}

export interface RegisteredModelSummary {
  id: string;
  name: string;
  useCase: string;
  description: string;
  productionVersionId: string | null;
  productionVersion: ModelVersion | null;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredModelDetails {
  id: string;
  name: string;
  useCase: string;
  description: string;
  productionVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: ModelVersion[];
}

export interface ModelComparisonResponse {
  modelId: string;
  baseline: ModelVersion;
  challenger: ModelVersion;
  comparison: {
    deltaRmse: number;
    deltaMae: number;
    deltaR2: number;
    rmseImprovementPct: number;
    challengerBeatsBaselineOnRmse: boolean;
  };
}

export interface DeploymentRecord {
  id: string;
  modelId: string;
  modelName: string;
  modelVersionId: string;
  versionNumber: number;
  algorithm: string;
  stage: ModelStage;
  endpointName: string;
  environment: string;
  status: 'ACTIVE' | 'DRAINING' | 'INACTIVE' | 'ROLLED_BACK';
  trafficPct: number;
  metrics: {
    validation: MetricBundle;
    test: MetricBundle;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionRecord {
  predictionId: string;
  requestId: string;
  modelId: string;
  modelName: string;
  modelVersionId: string;
  versionNumber: number;
  algorithm: string;
  storeId: string;
  skuId: string;
  date: string;
  features?: Record<string, unknown>;
  predictedUnits: number;
  actualUnits: number | null;
  latencyMs: number;
  status?: string;
  createdAt: string;
}

export interface ServingMetrics {
  totalPredictions: number;
  labeledPredictions: number;
  failedRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  predictionsByModel: Array<{
    modelId: string;
    modelName: string;
    requestCount: number;
    avgLatencyMs: number;
  }>;
}

export interface FeatureDriftMetric {
  feature: string;
  referenceMean?: number;
  productionMean?: number;
  psi: number;
  ksStat?: number;
  ksPvalue: number;
  drifted: boolean;
}

export interface MonitoringReportDetails {
  overallStatus: 'HEALTHY' | 'COVARIATE_DRIFT_WARNING' | 'PERFORMANCE_DEGRADED';
  sampleCount: number;
  labeledCount: number;
  dataDriftDetected: boolean;
  missingnessDriftDetected: boolean;
  predictionDriftDetected: boolean;
  performanceDegraded: boolean;
  maxPsi: number;
  minKsPvalue: number;
  driftedFeatures: string[];
  featureDrift: FeatureDriftMetric[];
  missingnessRates?: Record<string, number>;
  predictionDrift: {
    referenceMean?: number;
    productionMean?: number;
    psi: number;
    ksStat?: number;
    ksPvalue?: number;
    drifted: boolean;
  };
  livePerformance: {
    rmse: number;
    mae: number;
    baselineRmse: number;
    baselineMae?: number;
    rmseDegradationRatio?: number;
    degraded: boolean;
  } | null;
}

export interface MonitoringReport {
  reportId: string;
  modelId: string;
  modelName: string;
  modelVersionId: string;
  versionNumber: number;
  windowStart: string;
  windowEnd: string;
  sampleCount: number;
  dataDriftDetected: boolean;
  predictionDriftDetected: boolean;
  performanceDegraded: boolean;
  maxPsi: number;
  minKsPvalue: number;
  liveRmse: number | null;
  liveMae: number | null;
  details: MonitoringReportDetails;
  createdAt: string;
}

export interface DriftEvent {
  id: string;
  monitoringReportId: string;
  modelId: string;
  modelName: string;
  driftType: 'DATA_DRIFT' | 'MISSINGNESS_DRIFT' | 'PREDICTION_DRIFT' | 'PERFORMANCE_DEGRADATION';
  featureName: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metricName: string;
  metricValue: number;
  thresholdValue: number;
  acknowledged: boolean;
  createdAt: string;
}

export interface RetrainingPolicyDecision {
  modelId: string;
  modelName: string;
  eligible: boolean;
  recommendedTrigger: 'DRIFT_POLICY' | 'PERFORMANCE_POLICY' | 'MANUAL' | 'SCHEDULED' | null;
  blockedBy: string | null;
  cooldownActive: boolean;
  cooldownRemainingHours?: number;
  circuitBreakerOpen: boolean;
  latestMonitoringReportId: string | null;
  latestDriftEventId: string | null;
  reasons: string[];
}

export interface RetrainingJob {
  id: string;
  idempotencyKey: string;
  modelId: string;
  modelName?: string;
  triggerType: 'DRIFT_POLICY' | 'PERFORMANCE_POLICY' | 'MANUAL' | 'SCHEDULED';
  driftEventId: string | null;
  datasetVersionId: string | null;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'REJECTED_BY_GATE' | 'FAILED';
  challengerVersionId: string | null;
  championVersionId: string | null;
  decision: string | null;
  decisionReason: string | null;
  attemptCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  idempotentReplay?: boolean;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: string;
}
