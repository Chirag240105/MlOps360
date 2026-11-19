import type {
  ArchitecturePayload,
  AuditLogEntry,
  AuthUser,
  BaselineBenchmarkResponse,
  DatasetEdaResponse,
  DatasetSummary,
  DeploymentRecord,
  DriftEvent,
  ExperimentRun,
  ExperimentSummary,
  HealthPayload,
  ModelComparisonResponse,
  ModelStage,
  ModelVersion,
  MonitoringReport,
  PredictionRecord,
  RegisteredModelDetails,
  RegisteredModelSummary,
  RetrainingJob,
  RetrainingPolicyDecision,
  ServingMetrics,
  TrainingRunSummary,
  UserRole,
} from '../types/api';

const TOKEN_STORAGE_KEY = 'modelops360_token';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'ApiRequestError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId ?? null;
    this.details = params.details;
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / restricted iframe errors
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const errObj =
      json && typeof json === 'object' && 'error' in json
        ? (json as {error: {code?: string; message?: string; requestId?: string; details?: unknown}})
            .error
        : null;
    throw new ApiRequestError({
      status: res.status,
      code: errObj?.code ?? `HTTP_${res.status}`,
      message: errObj?.message ?? res.statusText ?? 'Request failed',
      requestId: errObj?.requestId ?? res.headers.get('X-Request-ID'),
      details: errObj?.details,
    });
  }

  return json as T;
}

export const api = {
  system: {
    health: () => request<HealthPayload>('/health'),
    architecture: () => request<ArchitecturePayload>('/system/architecture'),
  },

  auth: {
    login: (email: string, password: string) =>
      request<{accessToken: string; tokenType: string; expiresInMinutes: number; user: AuthUser}>(
        '/auth/login',
        {method: 'POST', body: JSON.stringify({email, password})},
      ),
    register: (payload: {email: string; fullName: string; password: string; role?: UserRole}) =>
      request<AuthUser>('/auth/register', {method: 'POST', body: JSON.stringify(payload)}),
    me: () =>
      request<{principal: {sub: string; email: string; role: UserRole; exp: number}}>('/auth/me'),
    listUsers: () => request<{users: AuthUser[]}>('/users'),
  },

  datasets: {
    list: () => request<{datasets: DatasetSummary[]}>('/datasets'),
    generate: (payload: {
      name: string;
      days?: number;
      startDate?: string;
      seed?: number;
      scenario?: 'reference' | 'corrupted' | 'drifted';
      description?: string;
    }) =>
      request<{
        datasetId: string;
        name: string;
        versionId: string;
        versionNumber: number;
        versionHash: string;
        scenario: string;
        rowCount: number;
        validationPassed: boolean;
      }>('/datasets/generate', {method: 'POST', body: JSON.stringify(payload)}),
    ingest: (payload: {name: string; csvContent: string; description?: string}) =>
      request<{
        datasetId: string;
        name: string;
        versionId: string;
        versionNumber: number;
        versionHash: string;
        rowCount: number;
        validationPassed: boolean;
      }>('/datasets/ingest', {method: 'POST', body: JSON.stringify(payload)}),
    eda: (datasetId: string) => request<DatasetEdaResponse>(`/datasets/${datasetId}/eda`),
    runBaseline: (datasetId: string) =>
      request<BaselineBenchmarkResponse>(`/datasets/${datasetId}/baseline`, {method: 'POST'}),
  },

  training: {
    listRuns: () => request<{runs: TrainingRunSummary[]}>('/training/runs'),
    getRun: (runId: string) => request<TrainingRunSummary>(`/training/runs/${runId}`),
    run: (payload: {
      datasetId: string;
      algorithm?: 'auto' | 'ridge' | 'random_forest' | 'gradient_boosting';
      seed?: number;
      experimentName?: string;
    }) => request<TrainingRunSummary>('/training/run', {method: 'POST', body: JSON.stringify(payload)}),
  },

  experiments: {
    list: () => request<{experiments: ExperimentSummary[]}>('/experiments'),
    listRuns: (params?: {experimentId?: string; algorithm?: string}) => {
      const qs = new URLSearchParams();
      if (params?.experimentId) qs.set('experimentId', params.experimentId);
      if (params?.algorithm) qs.set('algorithm', params.algorithm);
      const q = qs.toString();
      return request<{runs: ExperimentRun[]}>(`/experiments/runs${q ? `?${q}` : ''}`);
    },
  },

  models: {
    list: () => request<{models: RegisteredModelSummary[]}>('/models'),
    get: (modelId: string) => request<RegisteredModelDetails>(`/models/${modelId}`),
    register: (payload: {
      modelName: string;
      trainingRunId: string;
      initialStage?: 'Development' | 'Candidate';
      notes?: string;
      description?: string;
    }) => request<ModelVersion>('/models/register', {method: 'POST', body: JSON.stringify(payload)}),
    transition: (
      modelId: string,
      versionId: string,
      payload: {targetStage: ModelStage; reason?: string},
    ) =>
      request<ModelVersion>(`/models/${modelId}/versions/${versionId}/transition`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    promote: (
      modelId: string,
      versionId: string,
      payload: {reason?: string; forceOverride?: boolean} = {},
    ) =>
      request<ModelVersion>(`/models/${modelId}/versions/${versionId}/promote`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    rollback: (
      modelId: string,
      payload: {
        targetVersionId?: string;
        demoteCurrentTo?: 'Archived' | 'Rejected' | 'Staging';
        reason?: string;
      } = {},
    ) =>
      request<{
        modelId: string;
        rolledBackFromVersionId: string | null;
        demotedToStage: string | null;
        restoredVersion: ModelVersion;
        reason: string;
        executedAt: string;
      }>(`/models/${modelId}/rollback`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    compare: (modelId: string, baseline: string, challenger: string) =>
      request<ModelComparisonResponse>(
        `/models/${modelId}/compare?baseline=${encodeURIComponent(baseline)}&challenger=${encodeURIComponent(challenger)}`,
      ),
  },

  deployments: {
    list: () => request<{deployments: DeploymentRecord[]}>('/deployments'),
    deploy: (payload: {
      modelId: string;
      modelVersionId: string;
      endpointName?: string;
      environment?: string;
    }) => request<DeploymentRecord>('/deployments', {method: 'POST', body: JSON.stringify(payload)}),
  },

  predictions: {
    predictSingle: (payload: {
      modelId?: string;
      date: string;
      store_id: string;
      sku_id: string;
      price: number;
      discount_pct: number;
      is_holiday: number;
    }) => request<PredictionRecord>('/predict', {method: 'POST', body: JSON.stringify(payload)}),
    predictBatch: (payload: {
      modelId?: string;
      records: Array<{
        date: string;
        store_id: string;
        sku_id: string;
        price: number;
        discount_pct: number;
        is_holiday: number;
      }>;
    }) =>
      request<{
        requestId: string;
        modelId: string;
        modelName: string;
        versionNumber: number;
        algorithm: string;
        count: number;
        latencyMs: number;
        predictions: Array<{
          predictionId: string;
          storeId: string;
          skuId: string;
          date: string;
          predictedUnits: number;
        }>;
      }>('/predict/batch', {method: 'POST', body: JSON.stringify(payload)}),
    list: (limit = 100, modelId?: string) => {
      const qs = new URLSearchParams({limit: String(limit)});
      if (modelId) qs.set('modelId', modelId);
      return request<{predictions: PredictionRecord[]}>(`/predictions?${qs.toString()}`);
    },
    get: (predictionId: string) => request<PredictionRecord>(`/predictions/${predictionId}`),
    recordGroundTruth: (
      updates: Array<{predictionId: string; actualUnits: number}>,
    ) =>
      request<{updatedCount: number}>('/predictions/ground-truth', {
        method: 'POST',
        body: JSON.stringify({updates}),
      }),
    metrics: () => request<ServingMetrics>('/metrics'),
  },

  monitoring: {
    run: (
      payload: {
        modelId?: string;
        windowLimit?: number;
        psiThreshold?: number;
        ksPvalueThreshold?: number;
        rmseDegradationFactor?: number;
      } = {},
    ) =>
      request<MonitoringReport & Record<string, unknown>>('/monitoring/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listReports: (modelId?: string) =>
      request<{reports: MonitoringReport[]}>(
        `/monitoring/reports${modelId ? `?modelId=${encodeURIComponent(modelId)}` : ''}`,
      ),
    listDriftEvents: (params?: {modelId?: string; acknowledged?: boolean}) => {
      const qs = new URLSearchParams();
      if (params?.modelId) qs.set('modelId', params.modelId);
      if (params?.acknowledged !== undefined) {
        qs.set('acknowledged', String(params.acknowledged));
      }
      const q = qs.toString();
      return request<{events: DriftEvent[]}>(`/monitoring/drift-events${q ? `?${q}` : ''}`);
    },
    acknowledgeEvent: (eventId: string) =>
      request<{id: string; acknowledged: boolean}>(`/monitoring/drift-events/${eventId}/acknowledge`, {
        method: 'POST',
      }),
  },

  retraining: {
    evaluate: (modelId: string, bypassCooldown = false) =>
      request<RetrainingPolicyDecision>('/retraining/evaluate', {
        method: 'POST',
        body: JSON.stringify({modelId, bypassCooldown}),
      }),
    trigger: (payload: {
      modelId?: string;
      datasetId?: string;
      triggerType?: 'DRIFT_POLICY' | 'PERFORMANCE_POLICY' | 'MANUAL' | 'SCHEDULED';
      algorithm?: 'auto' | 'ridge' | 'random_forest' | 'gradient_boosting';
      idempotencyKey?: string;
      bypassCooldown?: boolean;
      promoteToStagingOnly?: boolean;
      minRmseImprovement?: number;
    }) =>
      request<RetrainingJob>('/retraining/trigger', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listJobs: (modelId?: string) =>
      request<{jobs: RetrainingJob[]}>(
        `/retraining/jobs${modelId ? `?modelId=${encodeURIComponent(modelId)}` : ''}`,
      ),
    getJob: (jobId: string) => request<RetrainingJob>(`/retraining/jobs/${jobId}`),
  },

  audit: {
    list: (limit = 150, action?: string) => {
      const qs = new URLSearchParams({limit: String(limit)});
      if (action) qs.set('action', action);
      return request<{logs: AuditLogEntry[]}>(`/audit?${qs.toString()}`);
    },
  },
};
