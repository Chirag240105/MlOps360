import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {
  Activity,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
} from 'lucide-react';
import {
  Button,
  type ColumnDef,
  ConfirmationDialog,
  DataTable,
  Input,
  MetricCard,
  Modal,
  Select,
  StatusBadge,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {
  formatAlgorithmLabel,
  formatDateTime,
  formatDurationMs,
  formatNumber,
  jobStatusTone,
  stageTone,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  DeploymentRecord,
  ModelVersion,
  RegisteredModelDetails,
  ServingMetrics,
} from '../types/api';

export function DeploymentsPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {environment, health, refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [models, setModels] = useState<RegisteredModelDetails[]>([]);
  const [metrics, setMetrics] = useState<ServingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deploy modal
  const [deployOpen, setDeployOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [endpointName, setEndpointName] = useState('retail-demand-prod');
  const [targetEnv, setTargetEnv] = useState<string>(environment);
  const [deploying, setDeploying] = useState(false);

  // Rollback modal
  const [rollbackDep, setRollbackDep] = useState<DeploymentRecord | null>(null);
  const [rollbackTargetVerId, setRollbackTargetVerId] = useState('');
  const [rollbackReason, setRollbackReason] = useState('Deployment health rollback by operator');
  const [rollingBack, setRollingBack] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [depRes, modelsRes, metricsRes] = await Promise.all([
        api.deployments.list(),
        api.models.list(),
        api.predictions.metrics(),
      ]);
      setDeployments(depRes.deployments ?? []);
      setMetrics(metricsRes);

      const detailed = await Promise.all(
        (modelsRes.models ?? []).map((m) => api.models.get(m.id)),
      );
      setModels(detailed);
      if (detailed.length > 0 && !selectedModelId) {
        const first = detailed[0];
        setSelectedModelId(first.id);
        const preferred = first.productionVersionId ?? first.versions[0]?.id ?? '';
        setSelectedVersionId(preferred);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, [selectedModelId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  useEffect(() => {
    setTargetEnv(environment);
  }, [environment]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const handleModelSelectChange = (nextModelId: string) => {
    setSelectedModelId(nextModelId);
    const found = models.find((m) => m.id === nextModelId);
    setSelectedVersionId(found?.productionVersionId ?? found?.versions[0]?.id ?? '');
  };

  const latencyByModel = useMemo(() => {
    const map = new Map<string, {avgLatencyMs: number; requestCount: number}>();
    for (const m of metrics?.predictionsByModel ?? []) {
      map.set(m.modelId, {avgLatencyMs: m.avgLatencyMs, requestCount: m.requestCount});
    }
    return map;
  }, [metrics]);

  const rollbackCandidates = useMemo<ModelVersion[]>(() => {
    if (!rollbackDep) return [];
    const found = models.find((m) => m.id === rollbackDep.modelId);
    if (!found) return [];
    return found.versions.filter((v) => v.id !== rollbackDep.modelVersionId);
  }, [models, rollbackDep]);

  const openRollbackDialog = (dep: DeploymentRecord) => {
    const found = models.find((m) => m.id === dep.modelId);
    const candidates = found?.versions.filter((v) => v.id !== dep.modelVersionId) ?? [];
    setRollbackTargetVerId(candidates[0]?.id ?? '');
    setRollbackDep(dep);
  };

  const handleDeploy = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    if (!selectedModelId || !selectedVersionId) {
      pushToast({variant: 'warning', title: 'Select a model and version to deploy'});
      return;
    }
    setDeploying(true);
    try {
      const created = await api.deployments.deploy({
        modelId: selectedModelId,
        modelVersionId: selectedVersionId,
        endpointName: endpointName.trim() || undefined,
        environment: targetEnv,
      });
      pushToast({
        variant: 'success',
        title: `Deployed ${created.modelName} v${created.versionNumber}`,
        description: `Endpoint ${created.endpointName} active in ${created.environment}`,
      });
      setDeployOpen(false);
      triggerGlobalRefresh();
      await loadData();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Deployment failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeploying(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackDep) return;
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setRollingBack(true);
    try {
      const res = await api.models.rollback(rollbackDep.modelId, {
        targetVersionId: rollbackTargetVerId || undefined,
        demoteCurrentTo: 'Archived',
        reason: rollbackReason.trim() || undefined,
      });
      pushToast({
        variant: 'success',
        title: `Rolled back ${rollbackDep.modelName} to v${res.restoredVersion.versionNumber}`,
        description: `Deployment pointer synced to restored champion.`,
      });
      setRollbackDep(null);
      triggerGlobalRefresh();
      await loadData();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Rollback failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRollingBack(false);
    }
  };

  const activeCount = deployments.filter((d) => d.status === 'ACTIVE').length;
  const errorRatePct =
    metrics && metrics.totalPredictions > 0
      ? ((metrics.failedRequests / metrics.totalPredictions) * 100).toFixed(2)
      : '0.00';

  const columns: ColumnDef<DeploymentRecord>[] = [
    {
      key: 'endpoint',
      header: 'Endpoint',
      sortable: true,
      sortValue: (r) => r.endpointName,
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Rocket className="h-3.5 w-3.5 shrink-0 text-[#8B7CFF]" />
            <span className="font-medium text-[#F3F4F8]">{r.endpointName}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#646D82]">
            {r.modelName} · {formatAlgorithmLabel(r.algorithm)}
          </p>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      sortable: true,
      sortValue: (r) => r.versionNumber,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[#F3F4F8] tabular-nums">
            v{r.versionNumber}
          </span>
          <StatusBadge label={r.stage} tone={stageTone(r.stage)} />
        </div>
      ),
    },
    {
      key: 'environment',
      header: 'Environment',
      sortable: true,
      sortValue: (r) => r.environment,
      render: (r) => (
        <StatusBadge
          label={r.environment}
          tone={r.environment === 'Production' ? 'success' : 'info'}
        />
      ),
    },
    {
      key: 'status',
      header: 'Deployment Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge label={r.status} tone={jobStatusTone(r.status)} />,
    },
    {
      key: 'health',
      header: 'Health',
      render: (r) => {
        const isHealthy =
          r.status === 'ACTIVE' && (health?.status === 'healthy' || health?.status === 'ok');
        return (
          <StatusBadge
            label={r.status === 'ACTIVE' ? (isHealthy ? 'HEALTHY' : 'DEGRADED') : 'STANDBY'}
            tone={r.status === 'ACTIVE' ? (isHealthy ? 'success' : 'warning') : 'neutral'}
            icon={<Activity className="h-3 w-3" />}
          />
        );
      },
    },
    {
      key: 'latency',
      header: 'Avg Latency',
      align: 'right',
      render: (r) => {
        const m = latencyByModel.get(r.modelId);
        return (
          <span className="font-mono text-xs text-[#F3F4F8] tabular-nums">
            {m ? formatDurationMs(m.avgLatencyMs) : '—'}
          </span>
        );
      },
    },
    {
      key: 'updated',
      header: 'Updated',
      sortable: true,
      sortValue: (r) => new Date(r.updatedAt).getTime(),
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA]">{formatDateTime(r.updatedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate('models', r.modelId);
            }}
          >
            Model
          </Button>
          {r.status === 'ACTIVE' && (
            <Button
              variant="danger"
              size="sm"
              icon={<RotateCcw className="h-3 w-3" />}
              onClick={(e) => {
                e.stopPropagation();
                openRollbackDialog(r);
              }}
            >
              Rollback
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Deployments</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Active serving endpoints, traffic allocation, latency telemetry &amp; controlled rollbacks
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setDeployOpen(true)}
          >
            Deploy Model Version
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadData}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F16C78]/40 bg-[#F16C78]/10 px-4 py-3 text-xs text-[#F16C78]">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Endpoints"
          value={activeCount}
          subtext={`${deployments.length} total deployment records`}
          tone={activeCount > 0 ? 'success' : 'neutral'}
        />
        <MetricCard
          label="Total Served Calls"
          value={formatNumber(metrics?.totalPredictions ?? 0, 0)}
          subtext={`${metrics?.labeledPredictions ?? 0} labeled with ground truth`}
          tone="accent"
        />
        <MetricCard
          label="Avg / P95 Latency"
          value={formatDurationMs(metrics?.avgLatencyMs)}
          subtext={`P95: ${formatDurationMs(metrics?.p95LatencyMs)}`}
          tone="info"
        />
        <MetricCard
          label="Serving Error Rate"
          value={`${errorRatePct}%`}
          subtext={`${metrics?.failedRequests ?? 0} failed requests`}
          tone={Number(errorRatePct) > 1 ? 'error' : 'success'}
        />
      </div>

      <DataTable
        data={deployments}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Search endpoints, models or environments..."
        searchText={(r) => `${r.endpointName} ${r.modelName} ${r.environment} ${r.status}`}
        emptyTitle="No deployments created yet"
        emptyDescription="Deploy a registered Production or Staging model version to serve online demand forecasts."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setDeployOpen(true)}>
            Create Deployment
          </Button>
        }
      />

      {/* Deploy Modal */}
      <Modal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        title="Deploy Model Version"
        description="Routes serving traffic for an endpoint to a registered model version."
      >
        <form onSubmit={handleDeploy} className="space-y-4">
          <Select
            label="Registered Model"
            value={selectedModelId}
            onChange={(e) => handleModelSelectChange(e.target.value)}
            options={
              models.length > 0
                ? models.map((m) => ({value: m.id, label: m.name}))
                : [{value: '', label: 'No registered models found'}]
            }
          />
          <Select
            label="Model Version"
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            options={
              selectedModel && selectedModel.versions.length > 0
                ? selectedModel.versions.map((v) => ({
                    value: v.id,
                    label: `v${v.versionNumber} (${v.stage} · RMSE ${v.metrics.test.rmse.toFixed(4)})`,
                  }))
                : [{value: '', label: 'No versions available'}]
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Endpoint Name"
              value={endpointName}
              onChange={(e) => setEndpointName(e.target.value)}
              required
            />
            <Select
              label="Environment"
              value={targetEnv}
              onChange={(e) => setTargetEnv(e.target.value)}
              options={[
                {value: 'Production', label: 'Production'},
                {value: 'Staging', label: 'Staging'},
                {value: 'Development', label: 'Development'},
              ]}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeployOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={deploying}
              disabled={!selectedModelId || !selectedVersionId}
            >
              Deploy Endpoint
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rollback Confirmation Dialog */}
      <ConfirmationDialog
        open={Boolean(rollbackDep)}
        onClose={() => setRollbackDep(null)}
        onConfirm={handleRollback}
        title={`Rollback ${rollbackDep?.endpointName ?? ''}`}
        message="Reverts the active Production model version and updates serving deployment pointers immediately."
        confirmLabel="Confirm Rollback"
        variant="danger"
        loading={rollingBack}
      >
        <div className="space-y-3">
          {rollbackCandidates.length > 0 ? (
            <Select
              label="Restore Target Version"
              value={rollbackTargetVerId}
              onChange={(e) => setRollbackTargetVerId(e.target.value)}
              options={rollbackCandidates.map((v) => ({
                value: v.id,
                label: `v${v.versionNumber} (${v.stage} · RMSE ${v.metrics.test.rmse.toFixed(4)})`,
              }))}
            />
          ) : (
            <p className="rounded border border-[#F5B942]/30 bg-[#F5B942]/10 p-2.5 text-xs text-[#F5B942]">
              No prior historical version found for automatic target selection; backend will check eligible fallback versions.
            </p>
          )}
          <Input
            label="Rollback Reason"
            value={rollbackReason}
            onChange={(e) => setRollbackReason(e.target.value)}
          />
        </div>
      </ConfirmationDialog>
    </div>
  );
}
