import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {ArrowRight, Layers, Plus, RefreshCw} from 'lucide-react';
import {
  Button,
  type ColumnDef,
  DataTable,
  Input,
  Modal,
  Select,
  StatusBadge,
  Tabs,
  type TabItem,
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
import type {
  ModelStage,
  ModelVersion,
  RegisteredModelDetails,
  TrainingRunSummary,
} from '../types/api';

interface RegistryVersionRow extends ModelVersion {
  modelName: string;
  isCurrentProd: boolean;
}

const STAGE_TABS: ModelStage[] = [
  'Production',
  'Staging',
  'Candidate',
  'Development',
  'Archived',
  'Rejected',
];

export function ModelRegistryPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [details, setDetails] = useState<RegisteredModelDetails[]>([]);
  const [runs, setRuns] = useState<TrainingRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<'ALL' | ModelStage>('ALL');

  // Register modal
  const [regOpen, setRegOpen] = useState(false);
  const [regName, setRegName] = useState('retail_demand_forecaster');
  const [regRunId, setRegRunId] = useState('');
  const [regStage, setRegStage] = useState<'Candidate' | 'Development'>('Candidate');
  const [regNotes, setRegNotes] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, runsRes] = await Promise.all([
        api.models.list(),
        api.training.listRuns(),
      ]);
      const summaries = modelsRes.models ?? [];
      const allDetails = await Promise.all(
        summaries.map((m) => api.models.get(m.id)),
      );
      setDetails(allDetails);
      const runList = runsRes.runs ?? [];
      setRuns(runList);
      if (runList.length > 0 && !regRunId) {
        setRegRunId(runList[0].runId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load model registry');
    } finally {
      setLoading(false);
    }
  }, [regRunId]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry, refreshTrigger]);

  const allRows = useMemo<RegistryVersionRow[]>(() => {
    const rows: RegistryVersionRow[] = [];
    for (const model of details) {
      for (const ver of model.versions) {
        rows.push({
          ...ver,
          modelName: model.name,
          isCurrentProd: model.productionVersionId === ver.id,
        });
      }
    }
    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [details]);

  const filteredRows = useMemo(() => {
    if (stageFilter === 'ALL') return allRows;
    return allRows.filter((row) => row.stage === stageFilter);
  }, [allRows, stageFilter]);

  const tabItems = useMemo<TabItem[]>(() => {
    const counts = new Map<ModelStage, number>();
    for (const row of allRows) {
      counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
    }
    return [
      {id: 'ALL', label: 'All Stages', count: allRows.length},
      ...STAGE_TABS.map((stage) => ({
        id: stage,
        label: stage,
        count: counts.get(stage) ?? 0,
      })),
    ];
  }, [allRows]);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    if (!regRunId) {
      pushToast({variant: 'warning', title: 'Select a training run first'});
      return;
    }
    setRegSubmitting(true);
    try {
      const created = await api.models.register({
        modelName: regName.trim(),
        trainingRunId: regRunId,
        initialStage: regStage,
        notes: regNotes.trim() || undefined,
      });
      pushToast({
        variant: 'success',
        title: `Registered ${regName} v${created.versionNumber}`,
        description: `Stage: ${created.stage}`,
      });
      setRegOpen(false);
      setRegNotes('');
      triggerGlobalRefresh();
      onNavigate('models', created.modelId);
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Registration failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRegSubmitting(false);
    }
  };

  const columns: ColumnDef<RegistryVersionRow>[] = [
    {
      key: 'modelName',
      header: 'Model',
      sortable: true,
      sortValue: (r) => r.modelName,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-[#8B7CFF]" />
          <span className="font-medium text-[#F3F4F8]">{r.modelName}</span>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      sortable: true,
      sortValue: (r) => r.versionNumber,
      render: (r) => (
        <span className="font-mono font-semibold text-[#F3F4F8] tabular-nums">
          v{r.versionNumber}
        </span>
      ),
    },
    {
      key: 'algorithm',
      header: 'Algorithm',
      sortable: true,
      sortValue: (r) => r.algorithm,
      render: (r) => (
        <span className="text-xs text-[#9299AA]">{formatAlgorithmLabel(r.algorithm)}</span>
      ),
    },
    {
      key: 'rmse',
      header: 'Test RMSE',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.metrics.test.rmse,
      render: (r) => (
        <span className="font-mono font-semibold text-[#F3F4F8] tabular-nums">
          {formatFixed(r.metrics.test.rmse, 4)}
        </span>
      ),
    },
    {
      key: 'mae',
      header: 'Test MAE',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.metrics.test.mae,
      render: (r) => (
        <span className="font-mono text-[#9299AA] tabular-nums">
          {formatFixed(r.metrics.test.mae, 4)}
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      sortValue: (r) => r.stage,
      render: (r) => <StatusBadge label={r.stage} tone={stageTone(r.stage)} />,
    },
    {
      key: 'dataset',
      header: 'Dataset Source',
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA]">
          {truncateMiddle(r.datasetVersionId, 6, 4)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA]">{formatDateTime(r.createdAt)}</span>
      ),
    },
    {
      key: 'inspect',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate('models', r.modelId);
          }}
        >
          <span>Inspect</span>
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Model Registry</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Versioned model governance across Development, Candidate, Staging, Production &amp; Archived stages
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setRegOpen(true)}
          >
            Register Model Version
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadRegistry}
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

      <Tabs
        items={tabItems}
        activeId={stageFilter}
        onChange={(id) => setStageFilter(id as 'ALL' | ModelStage)}
        variant="segmented"
      />

      <DataTable
        data={filteredRows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Filter by model name, algorithm or run ID..."
        searchText={(r) => `${r.modelName} v${r.versionNumber} ${r.algorithm} ${r.mlflowRunId} ${r.stage}`}
        onRowClick={(r) => onNavigate('models', r.modelId)}
        emptyTitle="No registered model versions"
        emptyDescription="Train an experiment run and register it into the governance lifecycle."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setRegOpen(true)}>
            Register First Version
          </Button>
        }
      />

      <Modal
        open={regOpen}
        onClose={() => setRegOpen(false)}
        title="Register Model Version"
        description="Bind a completed training run and its SHA-256 artifact checksum to a versioned model entry."
      >
        <form onSubmit={handleRegister} className="space-y-4">
          <Input
            label="Model Name"
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
            required
          />
          <Select
            label="Source Training Run"
            value={regRunId}
            onChange={(e) => setRegRunId(e.target.value)}
            options={
              runs.length > 0
                ? runs.map((run) => ({
                    value: run.runId,
                    label: `${formatAlgorithmLabel(run.algorithm)} · RMSE ${run.testMetrics.rmse.toFixed(4)} (${truncateMiddle(run.runId, 6, 4)})`,
                  }))
                : [{value: '', label: 'No completed training runs found'}]
            }
          />
          <Select
            label="Initial Stage"
            value={regStage}
            onChange={(e) => setRegStage(e.target.value as 'Candidate' | 'Development')}
            options={[
              {value: 'Candidate', label: 'Candidate'},
              {value: 'Development', label: 'Development'},
            ]}
          />
          <Input
            label="Notes (optional)"
            placeholder="Release description or validation note"
            value={regNotes}
            onChange={(e) => setRegNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRegOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={regSubmitting} disabled={!regRunId}>
              Register Version
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
