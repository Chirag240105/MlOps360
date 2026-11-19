import {useCallback, useEffect, useState} from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpCircle,
  GitCompare,
  Layers,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmationDialog,
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
  formatFixed,
  stageTone,
  truncateMiddle,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {ModelStage, ModelVersion, RegisteredModelDetails} from '../types/api';

export function ModelDetailsPage({
  modelId,
  onNavigate,
}: {
  modelId: string;
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [model, setModel] = useState<RegisteredModelDetails | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Promote / Transition dialogs
  const [promoteTarget, setPromoteTarget] = useState<ModelVersion | null>(null);
  const [promoteReason, setPromoteReason] = useState('Meets validation criteria for production serving');
  const [forceOverride, setForceOverride] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [transitionDialog, setTransitionDialog] = useState<{
    version: ModelVersion;
    targetStage: ModelStage;
  } | null>(null);
  const [transitionReason, setTransitionReason] = useState('');

  // Rollback dialog
  const [rollbackTarget, setRollbackTarget] = useState<ModelVersion | null>(null);
  const [demoteCurrentTo, setDemoteCurrentTo] = useState<'Archived' | 'Staging' | 'Rejected'>('Archived');
  const [rollbackReason, setRollbackReason] = useState('Operator rollback from Model Registry');

  const loadModel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.models.get(modelId);
      setModel(res);
      setSelectedVersionId((prev) => {
        if (prev && res.versions.some((v) => v.id === prev)) return prev;
        return res.productionVersionId ?? res.versions[0]?.id ?? null;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load model details');
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    loadModel();
  }, [loadModel, refreshTrigger]);

  const activeVersion =
    model?.versions.find((v) => v.id === selectedVersionId) ?? model?.versions[0] ?? null;

  const ensureOperator = () => {
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return false;
    }
    return true;
  };

  const handlePromote = async () => {
    if (!promoteTarget || !model || !ensureOperator()) return;
    setActionBusy(true);
    try {
      await api.models.promote(model.id, promoteTarget.id, {
        reason: promoteReason.trim() || undefined,
        forceOverride,
      });
      pushToast({
        variant: 'success',
        title: `Promoted v${promoteTarget.versionNumber} to Production`,
        description: `${model.name} production pointer updated.`,
      });
      setPromoteTarget(null);
      setForceOverride(false);
      triggerGlobalRefresh();
      await loadModel();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Promotion gate blocked',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleTransition = async () => {
    if (!transitionDialog || !model || !ensureOperator()) return;
    setActionBusy(true);
    try {
      await api.models.transition(model.id, transitionDialog.version.id, {
        targetStage: transitionDialog.targetStage,
        reason: transitionReason.trim() || undefined,
      });
      pushToast({
        variant: 'success',
        title: `v${transitionDialog.version.versionNumber} → ${transitionDialog.targetStage}`,
      });
      setTransitionDialog(null);
      setTransitionReason('');
      triggerGlobalRefresh();
      await loadModel();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Stage transition failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget || !model || !ensureOperator()) return;
    setActionBusy(true);
    try {
      const res = await api.models.rollback(model.id, {
        targetVersionId: rollbackTarget.id,
        demoteCurrentTo,
        reason: rollbackReason.trim() || undefined,
      });
      pushToast({
        variant: 'success',
        title: `Rolled back to v${res.restoredVersion.versionNumber}`,
        description: `Previous champion moved to ${res.demotedToStage ?? 'Archived'}.`,
      });
      setRollbackTarget(null);
      triggerGlobalRefresh();
      await loadModel();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Rollback failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && !model) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
          onClick={() => onNavigate('models')}
        >
          Back to Model Registry
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-xs text-[#9299AA]">
            Loading registered model metadata...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
          onClick={() => onNavigate('models')}
        >
          Back to Model Registry
        </Button>
        <div className="rounded-lg border border-[#F16C78]/40 bg-[#F16C78]/10 px-4 py-3 text-xs text-[#F16C78]">
          {error ?? 'Registered model not found.'}
        </div>
      </div>
    );
  }

  const prodVersion = model.versions.find((v) => v.id === model.productionVersionId) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={() => onNavigate('models')}
          >
            All Registered Models
          </Button>
          <div className="flex flex-wrap items-center gap-2.5">
            <Layers className="h-5 w-5 text-[#8B7CFF]" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">{model.name}</h1>
            <StatusBadge
              label={prodVersion ? `Production: v${prodVersion.versionNumber}` : 'No Production Version'}
              tone={prodVersion ? 'success' : 'neutral'}
            />
          </div>
          <p className="text-xs text-[#9299AA]">
            {model.description || `Use case: ${model.useCase}`} · {model.versions.length} registered version(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {model.versions.length >= 2 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<GitCompare className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('comparison')}
            >
              Compare Versions
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadModel}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Selected Version KPIs */}
      {activeVersion && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label={`v${activeVersion.versionNumber} Lifecycle Stage`}
            value={activeVersion.stage}
            subtext={formatAlgorithmLabel(activeVersion.algorithm)}
            tone={stageTone(activeVersion.stage)}
          />
          <MetricCard
            label="Test RMSE"
            value={formatFixed(activeVersion.metrics.test.rmse, 4)}
            subtext={`Val RMSE ${formatFixed(activeVersion.metrics.validation.rmse, 4)}`}
            tone="accent"
          />
          <MetricCard
            label="Test MAE"
            value={formatFixed(activeVersion.metrics.test.mae, 4)}
            subtext={`Val MAE ${formatFixed(activeVersion.metrics.validation.mae, 4)}`}
            tone="info"
          />
          <MetricCard
            label="Test R² / MAPE"
            value={formatFixed(activeVersion.metrics.test.r2, 4)}
            subtext={
              activeVersion.metrics.test.mape !== null
                ? `MAPE ${activeVersion.metrics.test.mape.toFixed(2)}%`
                : 'MAPE N/A (zero actuals)'
            }
          />
        </div>
      )}

      {/* Selected Version Details & Governance Actions */}
      {activeVersion && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={`Version v${activeVersion.versionNumber} Metadata & Artifact`}
              subtitle={`MLflow Run: ${activeVersion.mlflowRunId || activeVersion.trainingRunId}`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {activeVersion.stage === 'Development' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setTransitionDialog({version: activeVersion, targetStage: 'Candidate'})
                      }
                    >
                      Promote to Candidate
                    </Button>
                  )}
                  {activeVersion.stage === 'Candidate' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setTransitionDialog({version: activeVersion, targetStage: 'Staging'})
                      }
                    >
                      Move to Staging
                    </Button>
                  )}
                  {(activeVersion.stage === 'Candidate' || activeVersion.stage === 'Staging') && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
                      onClick={() => setPromoteTarget(activeVersion)}
                    >
                      Promote to Production
                    </Button>
                  )}
                  {activeVersion.stage !== 'Production' && prodVersion && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                      onClick={() => setRollbackTarget(activeVersion)}
                    >
                      Rollback to v{activeVersion.versionNumber}
                    </Button>
                  )}
                  {activeVersion.stage !== 'Archived' && activeVersion.stage !== 'Production' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Archive className="h-3.5 w-3.5" />}
                      onClick={() =>
                        setTransitionDialog({version: activeVersion, targetStage: 'Archived'})
                      }
                    >
                      Archive
                    </Button>
                  )}
                </div>
              }
            />
            <CardContent className="space-y-5 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-[#9299AA]">Lineage &amp; Governance</p>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#646D82]">Dataset Version</span>
                    <span className="font-mono text-[#F3F4F8]">
                      {truncateMiddle(activeVersion.datasetVersionId, 8, 6)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#646D82]">Promoted By</span>
                    <span className="font-mono text-[#F3F4F8]">
                      {activeVersion.promotedBy ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#646D82]">Promoted At</span>
                    <span className="font-mono text-[#F3F4F8]">
                      {formatDateTime(activeVersion.promotedAt)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#646D82]">Created At</span>
                    <span className="font-mono text-[#F3F4F8]">
                      {formatDateTime(activeVersion.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-[#9299AA]">Artifact Integrity</p>
                  <div>
                    <span className="text-[#646D82]">Artifact Path</span>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-[#F3F4F8]">
                      {activeVersion.artifactPath}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#646D82]">SHA-256 Digest</span>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-[#9299AA]">
                      {activeVersion.artifactSha256}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium text-[#9299AA]">Training Hyperparameters</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(activeVersion.hyperparameters ?? {}).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between rounded border border-[#232A3C] bg-[#10131B] px-3 py-2"
                    >
                      <span className="font-mono text-[11px] text-[#9299AA]">{k}</span>
                      <span className="font-mono text-[11px] font-medium text-[#F3F4F8]">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                  {Object.keys(activeVersion.hyperparameters ?? {}).length === 0 && (
                    <span className="text-[#646D82]">Default estimator parameters</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Version History" subtitle="Click any version to inspect" />
            <CardContent className="p-0">
              <div className="divide-y divide-[#232A3C]">
                {model.versions.map((ver) => {
                  const selected = ver.id === activeVersion.id;
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => setSelectedVersionId(ver.id)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs transition-colors ${
                        selected ? 'bg-[#8B7CFF]/12' : 'hover:bg-[#1B2130]/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[#F3F4F8]">
                            v{ver.versionNumber}
                          </span>
                          <StatusBadge label={ver.stage} tone={stageTone(ver.stage)} />
                        </div>
                        <p className="mt-1 truncate text-[11px] text-[#9299AA]">
                          {formatAlgorithmLabel(ver.algorithm)} · {formatDateTime(ver.createdAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-[#F3F4F8] tabular-nums">
                        RMSE {formatFixed(ver.metrics.test.rmse, 3)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Promote to Production Modal */}
      <Modal
        open={Boolean(promoteTarget)}
        onClose={() => setPromoteTarget(null)}
        title={`Promote v${promoteTarget?.versionNumber ?? ''} to Production`}
        description="Checks champion RMSE gate against any active Production model and updates the model's production pointer."
      >
        <div className="space-y-4">
          <Input
            label="Promotion Reason"
            value={promoteReason}
            onChange={(e) => setPromoteReason(e.target.value)}
          />
          <label className="flex items-start gap-2.5 rounded-md border border-[#232A3C] bg-[#10131B] p-3 text-xs text-[#9299AA]">
            <input
              type="checkbox"
              checked={forceOverride}
              onChange={(e) => setForceOverride(e.target.checked)}
              className="mt-0.5 rounded border-[#2A3348] bg-[#0B0D12]"
            />
            <span>
              <strong className="text-[#F3F4F8]">Force override champion RMSE gate</strong> — bypasses
              the minimum RMSE improvement requirement when explicitly approved by an operator.
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPromoteTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={actionBusy} onClick={handlePromote}>
              Confirm Promotion
            </Button>
          </div>
        </div>
      </Modal>

      {/* Generic Stage Transition Confirmation */}
      <ConfirmationDialog
        open={Boolean(transitionDialog)}
        onClose={() => setTransitionDialog(null)}
        onConfirm={handleTransition}
        title={`Transition v${transitionDialog?.version.versionNumber ?? ''} to ${transitionDialog?.targetStage ?? ''}`}
        message="This records an immutable stage transition in the audit log."
        confirmLabel={`Move to ${transitionDialog?.targetStage ?? ''}`}
        variant={transitionDialog?.targetStage === 'Rejected' ? 'danger' : 'primary'}
        loading={actionBusy}
      >
        <Input
          label="Transition Reason (optional)"
          placeholder="e.g. Promoted for staging soak test"
          value={transitionReason}
          onChange={(e) => setTransitionReason(e.target.value)}
        />
      </ConfirmationDialog>

      {/* Rollback Confirmation */}
      <ConfirmationDialog
        open={Boolean(rollbackTarget)}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollback}
        title={`Rollback Production to v${rollbackTarget?.versionNumber ?? ''}`}
        message="Restores the selected historical version as active Production and demotes the current Production champion."
        confirmLabel="Execute Rollback"
        variant="danger"
        loading={actionBusy}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded border border-[#F5B942]/30 bg-[#F5B942]/10 p-2.5 text-[11px] text-[#F5B942]">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Also updates active deployment pointers referencing this model.</span>
          </div>
          <Select
            label="Demote Current Champion To"
            value={demoteCurrentTo}
            onChange={(e) =>
              setDemoteCurrentTo(e.target.value as 'Archived' | 'Staging' | 'Rejected')
            }
            options={[
              {value: 'Archived', label: 'Archived (Recommended)'},
              {value: 'Staging', label: 'Staging'},
              {value: 'Rejected', label: 'Rejected'},
            ]}
          />
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
