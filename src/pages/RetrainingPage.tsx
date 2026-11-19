import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitCompare,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  type ColumnDef,
  DataTable,
  Input,
  Modal,
  Select,
  StatusBadge,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {
  formatDateTime,
  jobStatusTone,
  truncateMiddle,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  DatasetSummary,
  RegisteredModelSummary,
  RetrainingJob,
  RetrainingPolicyDecision,
} from '../types/api';

function WorkflowStrip({
  latestJob,
  policy,
}: {
  latestJob: RetrainingJob | null;
  policy: RetrainingPolicyDecision | null;
}) {
  const status = latestJob?.status ?? null;
  const rejected = status === 'REJECTED_BY_GATE' || status === 'FAILED';
  const succeeded = status === 'SUCCEEDED';
  const inFlight = status === 'QUEUED' || status === 'RUNNING';

  const steps = [
    {
      label: '1. Drift / Degradation Detected',
      sub: policy?.recommendedTrigger
        ? `Trigger: ${policy.recommendedTrigger}`
        : latestJob?.driftEventId
          ? `Event ${truncateMiddle(latestJob.driftEventId, 6, 4)}`
          : 'Monitoring telemetry signal',
      state: policy?.eligible || latestJob ? 'done' : 'idle',
    },
    {
      label: '2. Retraining Triggered',
      sub: latestJob ? `${latestJob.triggerType} (${truncateMiddle(latestJob.id, 6, 4)})` : 'Awaiting trigger',
      state: latestJob ? 'done' : 'idle',
    },
    {
      label: '3. Challenger Trained',
      sub: latestJob?.challengerVersionId
        ? `Version ${truncateMiddle(latestJob.challengerVersionId, 6, 4)}`
        : inFlight
          ? 'Training in progress'
          : 'MLflow training pipeline',
      state: latestJob?.challengerVersionId ? 'done' : inFlight ? 'active' : 'idle',
    },
    {
      label: '4. Champion Gate Evaluation',
      sub: latestJob?.decision ? latestJob.decision : 'RMSE improvement & validation check',
      state: succeeded || rejected ? 'done' : inFlight ? 'active' : 'idle',
    },
    {
      label: '5. Promotion or Rejection',
      sub: succeeded
        ? 'Promoted'
        : rejected
          ? status
          : 'Staging / Production decision',
      state: succeeded ? 'success' : rejected ? 'error' : 'idle',
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Automated Retraining Pipeline Workflow"
        subtitle={
          latestJob
            ? `Tracking latest job ${truncateMiddle(latestJob.id, 8, 6)} · Status ${latestJob.status}`
            : 'End-to-end closed-loop retraining lifecycle'
        }
      />
      <CardContent>
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((step) => {
            const borderClass =
              step.state === 'success'
                ? 'border-[#32C98A]/40 bg-[#32C98A]/10'
                : step.state === 'error'
                  ? 'border-[#F16C78]/40 bg-[#F16C78]/10'
                  : step.state === 'done'
                    ? 'border-[#8B7CFF]/40 bg-[#8B7CFF]/10'
                    : step.state === 'active'
                      ? 'border-[#6C9EFF]/40 bg-[#6C9EFF]/10'
                      : 'border-[#232A3C] bg-[#10131B]';

            return (
              <div
                key={step.label}
                className={`rounded-md border p-3 ${borderClass}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F3F4F8]">{step.label}</span>
                  {step.state === 'success' || step.state === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#32C98A]" />
                  ) : step.state === 'error' ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-[#F16C78]" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#646D82]" />
                  )}
                </div>
                <p className="mt-1.5 truncate font-mono text-[11px] text-[#9299AA]">{step.sub}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function RetrainingPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {policyPrefs, refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [jobs, setJobs] = useState<RetrainingJob[]>([]);
  const [models, setModels] = useState<RegisteredModelSummary[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [policy, setPolicy] = useState<RetrainingPolicyDecision | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [evalBusy, setEvalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trigger retraining modal
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [trigModelId, setTrigModelId] = useState('');
  const [trigDatasetId, setTrigDatasetId] = useState('');
  const [trigType, setTrigType] = useState<'MANUAL' | 'DRIFT_POLICY' | 'PERFORMANCE_POLICY' | 'SCHEDULED'>('MANUAL');
  const [trigAlgorithm, setTrigAlgorithm] = useState<'auto' | 'gradient_boosting' | 'random_forest' | 'ridge'>('auto');
  const [trigMinImprove, setTrigMinImprove] = useState(String(policyPrefs.minPromotionRmseImprovement));
  const [trigIdempotencyKey, setTrigIdempotencyKey] = useState('');
  const [trigBypassCooldown, setTrigBypassCooldown] = useState(false);
  const [trigStagingOnly, setTrigStagingOnly] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const loadRetraining = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, modelsRes, dsRes] = await Promise.all([
        api.retraining.listJobs(),
        api.models.list(),
        api.datasets.list(),
      ]);
      setJobs(jobsRes.jobs ?? []);
      const modelList = modelsRes.models ?? [];
      setModels(modelList);
      const dsList = dsRes.datasets ?? [];
      setDatasets(dsList);

      if (modelList.length > 0 && !selectedModelId) {
        setSelectedModelId(modelList[0].id);
        setTrigModelId(modelList[0].id);
      }
      if (dsList.length > 0 && !trigDatasetId) {
        const valid = dsList.find((d) => d.latestVersion?.validationPassed) ?? dsList[0];
        setTrigDatasetId(valid.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load retraining jobs');
    } finally {
      setLoading(false);
    }
  }, [selectedModelId, trigDatasetId]);

  useEffect(() => {
    loadRetraining();
  }, [loadRetraining, refreshTrigger]);

  useEffect(() => {
    setTrigMinImprove(String(policyPrefs.minPromotionRmseImprovement));
  }, [policyPrefs.minPromotionRmseImprovement]);

  const handleEvaluatePolicy = async (bypassCooldown = false) => {
    if (!selectedModelId) {
      pushToast({variant: 'warning', title: 'Select a registered model first'});
      return;
    }
    setEvalBusy(true);
    try {
      const res = await api.retraining.evaluate(selectedModelId, bypassCooldown);
      setPolicy(res);
      pushToast({
        variant: res.eligible ? 'success' : 'info',
        title: res.eligible ? 'Retraining policy eligible' : `Policy check: ${res.blockedBy ?? 'No trigger'}`,
        description: res.reasons[0],
      });
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Policy evaluation failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setEvalBusy(false);
    }
  };

  const handleTrigger = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setTriggering(true);
    try {
      const job = await api.retraining.trigger({
        modelId: trigModelId || undefined,
        datasetId: trigDatasetId || undefined,
        triggerType: trigType,
        algorithm: trigAlgorithm,
        idempotencyKey: trigIdempotencyKey.trim() || undefined,
        bypassCooldown: trigBypassCooldown,
        promoteToStagingOnly: trigStagingOnly,
        minRmseImprovement: Number(trigMinImprove) || undefined,
      });
      pushToast({
        variant: job.status === 'SUCCEEDED' ? 'success' : job.status === 'REJECTED_BY_GATE' ? 'warning' : 'info',
        title: `Retraining job ${job.status}`,
        description: job.decisionReason ?? `Job ID: ${truncateMiddle(job.id, 8, 6)}`,
      });
      setTriggerOpen(false);
      setTrigIdempotencyKey('');
      triggerGlobalRefresh();
      await loadRetraining();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Retraining trigger failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTriggering(false);
    }
  };

  const latestJob = jobs[0] ?? null;

  const columns: ColumnDef<RetrainingJob>[] = [
    {
      key: 'id',
      header: 'Job ID',
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-medium text-[#F3F4F8]">
            {truncateMiddle(r.id, 8, 6)}
          </span>
          <p className="font-mono text-[10px] text-[#646D82]">
            key: {truncateMiddle(r.idempotencyKey, 8, 4)}
          </p>
        </div>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      sortable: true,
      sortValue: (r) => r.modelName ?? r.modelId,
      render: (r) => (
        <span className="text-xs font-medium text-[#F3F4F8]">{r.modelName ?? r.modelId}</span>
      ),
    },
    {
      key: 'trigger',
      header: 'Trigger Reason',
      sortable: true,
      sortValue: (r) => r.triggerType,
      render: (r) => <StatusBadge label={r.triggerType} tone="accent" />,
    },
    {
      key: 'dataset',
      header: 'Dataset Ver',
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA]">
          {r.datasetVersionId ? truncateMiddle(r.datasetVersionId, 6, 4) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge label={r.status} tone={jobStatusTone(r.status)} />,
    },
    {
      key: 'attempts',
      header: 'Retries',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs text-[#9299AA] tabular-nums">{r.attemptCount}</span>
      ),
    },
    {
      key: 'timing',
      header: 'Started / Completed',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => (
        <div className="font-mono text-[11px] text-[#9299AA]">
          <div>{formatDateTime(r.startedAt ?? r.createdAt)}</div>
          <div className="text-[#646D82]">→ {formatDateTime(r.completedAt)}</div>
        </div>
      ),
    },
    {
      key: 'decision',
      header: 'Gate Decision',
      render: (r) => (
        <div className="max-w-xs">
          <p className="truncate text-xs font-medium text-[#F3F4F8]">{r.decision ?? '—'}</p>
          {r.decisionReason && (
            <p className="truncate text-[11px] text-[#646D82]">{r.decisionReason}</p>
          )}
        </div>
      ),
    },
    {
      key: 'compare',
      header: '',
      align: 'right',
      render: (r) =>
        r.challengerVersionId ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<GitCompare className="h-3.5 w-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate('comparison');
            }}
          >
            Compare
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Retraining Jobs</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Policy-gated retraining workflows, cooldown circuit breakers &amp; challenger gate evaluations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => setTriggerOpen(true)}
          >
            Trigger Retraining
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadRetraining}
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

      <WorkflowStrip latestJob={latestJob} policy={policy} />

      {/* Policy Evaluator Card */}
      <Card>
        <CardHeader
          title="Retraining Policy Gate Evaluator"
          subtitle="Verify cooldown timers, circuit breakers, and drift/performance triggers before dispatching jobs"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Select model to evaluate policy"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="h-8 rounded-md border border-[#232A3C] bg-[#0B0D12] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
              >
                {models.length === 0 && <option value="">No registered models</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                loading={evalBusy}
                disabled={!selectedModelId}
                onClick={() => handleEvaluatePolicy(false)}
              >
                Evaluate Policy
              </Button>
            </div>
          }
        />
        <CardContent>
          {!policy ? (
            <p className="text-xs text-[#9299AA]">
              Click <strong className="text-[#F3F4F8]">Evaluate Policy</strong> to inspect real-time
              cooldown, circuit-breaker, and drift eligibility for the selected model.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4 text-xs">
              <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <span className="text-[#9299AA]">Eligibility</span>
                <div className="mt-1.5">
                  <StatusBadge
                    label={policy.eligible ? 'ELIGIBLE' : policy.blockedBy ?? 'NOT_ELIGIBLE'}
                    tone={policy.eligible ? 'success' : 'warning'}
                    icon={
                      policy.eligible ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )
                    }
                  />
                </div>
              </div>
              <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <span className="text-[#9299AA]">Cooldown Guard</span>
                <p className="mt-1.5 font-mono font-medium text-[#F3F4F8]">
                  {policy.cooldownActive
                    ? `Active (${policy.cooldownRemainingHours ?? '?'}h left)`
                    : 'Clear'}
                </p>
              </div>
              <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <span className="text-[#9299AA]">Circuit Breaker</span>
                <p className="mt-1.5 font-mono font-medium text-[#F3F4F8]">
                  {policy.circuitBreakerOpen ? 'OPEN (Halted)' : 'Closed'}
                </p>
              </div>
              <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <span className="text-[#9299AA]">Policy Reasons</span>
                <p className="mt-1.5 text-[#F3F4F8]">
                  {policy.reasons.join(' · ') || 'No active drift triggers'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DataTable
        data={jobs}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Search jobs by ID, model, trigger or decision..."
        searchText={(r) =>
          `${r.id} ${r.modelName ?? ''} ${r.triggerType} ${r.status} ${r.decision ?? ''}`
        }
        emptyTitle="No retraining jobs executed yet"
        emptyDescription="Trigger an automated or manual challenger retraining job to benchmark and promote improved models."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setTriggerOpen(true)}>
            Trigger Retraining Job
          </Button>
        }
      />

      {/* Trigger Retraining Modal */}
      <Modal
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        title="Trigger Challenger Retraining Job"
        description="Trains a challenger model on the selected dataset, compares against Production RMSE, and promotes or rejects via the gate."
      >
        <form onSubmit={handleTrigger} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Target Model"
              value={trigModelId}
              onChange={(e) => setTrigModelId(e.target.value)}
              options={
                models.length > 0
                  ? models.map((m) => ({value: m.id, label: m.name}))
                  : [{value: '', label: 'Auto / Create new retail_demand_forecaster'}]
              }
            />
            <Select
              label="Training Dataset"
              value={trigDatasetId}
              onChange={(e) => setTrigDatasetId(e.target.value)}
              options={
                datasets.length > 0
                  ? datasets.map((d) => ({
                      value: d.id,
                      label: `${d.name} (v${d.latestVersion?.versionNumber ?? 1})`,
                    }))
                  : [{value: '', label: 'Latest valid dataset'}]
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Trigger Type"
              value={trigType}
              onChange={(e) =>
                setTrigType(
                  e.target.value as 'MANUAL' | 'DRIFT_POLICY' | 'PERFORMANCE_POLICY' | 'SCHEDULED',
                )
              }
              options={[
                {value: 'MANUAL', label: 'MANUAL'},
                {value: 'DRIFT_POLICY', label: 'DRIFT_POLICY'},
                {value: 'PERFORMANCE_POLICY', label: 'PERFORMANCE_POLICY'},
                {value: 'SCHEDULED', label: 'SCHEDULED'},
              ]}
            />
            <Select
              label="Algorithm"
              value={trigAlgorithm}
              onChange={(e) =>
                setTrigAlgorithm(
                  e.target.value as 'auto' | 'gradient_boosting' | 'random_forest' | 'ridge',
                )
              }
              options={[
                {value: 'auto', label: 'Auto'},
                {value: 'gradient_boosting', label: 'Gradient Boosting'},
                {value: 'random_forest', label: 'Random Forest'},
                {value: 'ridge', label: 'Ridge Regression'},
              ]}
            />
            <Input
              label="Min RMSE Improv."
              type="number"
              step="0.005"
              min="0"
              value={trigMinImprove}
              onChange={(e) => setTrigMinImprove(e.target.value)}
            />
          </div>

          <Input
            label="Idempotency Key (optional)"
            placeholder="e.g. retrain_2026_11_19_01"
            value={trigIdempotencyKey}
            onChange={(e) => setTrigIdempotencyKey(e.target.value)}
          />

          <div className="space-y-2 rounded-md border border-[#232A3C] bg-[#10131B] p-3 text-xs text-[#9299AA]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={trigBypassCooldown}
                onChange={(e) => setTrigBypassCooldown(e.target.checked)}
                className="rounded border-[#2A3348] bg-[#0B0D12]"
              />
              <span>Bypass retraining cooldown &amp; circuit breaker guard</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={trigStagingOnly}
                onChange={(e) => setTrigStagingOnly(e.target.checked)}
                className="rounded border-[#2A3348] bg-[#0B0D12]"
              />
              <span>Promote winning challenger to Staging only (require manual Production approval)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setTriggerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={triggering}>
              Execute Retraining Job
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
