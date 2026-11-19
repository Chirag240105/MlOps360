import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {
  CheckSquare,
  FlaskConical,
  Layers,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {DarkChartTooltip} from '../components/charts/RechartsTooltip';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  ChartContainer,
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
  formatAlgorithmLabel,
  formatDateTime,
  formatDurationMs,
  formatFixed,
  jobStatusTone,
  truncateMiddle,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {DatasetSummary, ExperimentRun, ExperimentSummary} from '../types/api';

export function ExperimentsPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & multi-run comparison selection
  const [selectedExperiment, setSelectedExperiment] = useState<string>('ALL');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('ALL');
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Train modal
  const [trainOpen, setTrainOpen] = useState(false);
  const [trainDatasetId, setTrainDatasetId] = useState('');
  const [trainAlgorithm, setTrainAlgorithm] = useState<'auto' | 'gradient_boosting' | 'random_forest' | 'ridge'>('auto');
  const [trainExpName, setTrainExpName] = useState('retail-demand-experiments');
  const [trainSeed, setTrainSeed] = useState('42');
  const [trainSubmitting, setTrainSubmitting] = useState(false);

  // Register modal
  const [regRun, setRegRun] = useState<ExperimentRun | null>(null);
  const [regModelName, setRegModelName] = useState('retail_demand_forecaster');
  const [regStage, setRegStage] = useState<'Candidate' | 'Development'>('Candidate');
  const [regNotes, setRegNotes] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expRes, runsRes, dsRes] = await Promise.all([
        api.experiments.list(),
        api.experiments.listRuns({
          experimentId: selectedExperiment !== 'ALL' ? selectedExperiment : undefined,
          algorithm: selectedAlgorithm !== 'ALL' ? selectedAlgorithm : undefined,
        }),
        api.datasets.list(),
      ]);
      setExperiments(expRes.experiments ?? []);
      setRuns(runsRes.runs ?? []);
      const dsList = dsRes.datasets ?? [];
      setDatasets(dsList);
      if (dsList.length > 0 && !trainDatasetId) {
        const firstValid = dsList.find((d) => d.latestVersion?.validationPassed) ?? dsList[0];
        setTrainDatasetId(firstValid.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }, [selectedExperiment, selectedAlgorithm, trainDatasetId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const toggleCompare = (runId: string) => {
    setCompareIds((prev) =>
      prev.includes(runId)
        ? prev.filter((id) => id !== runId)
        : prev.length >= 5
          ? [...prev.slice(1), runId]
          : [...prev, runId],
    );
  };

  const comparedRuns = useMemo(() => {
    if (compareIds.length >= 2) {
      return runs.filter((r) => compareIds.includes(r.id));
    }
    return runs.slice(0, 4);
  }, [runs, compareIds]);

  const comparisonChartData = useMemo(
    () =>
      comparedRuns.map((r) => ({
        run: truncateMiddle(r.mlflowRunId || r.trainingRunId, 6, 4),
        testRmse: Number(r.metrics.test.rmse.toFixed(4)),
        testMae: Number(r.metrics.test.mae.toFixed(4)),
        valRmse: Number(r.metrics.validation.rmse.toFixed(4)),
      })),
    [comparedRuns],
  );

  const handleLaunchTrain = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    if (!trainDatasetId) {
      pushToast({variant: 'warning', title: 'Select a dataset first'});
      return;
    }
    setTrainSubmitting(true);
    try {
      const res = await api.training.run({
        datasetId: trainDatasetId,
        algorithm: trainAlgorithm,
        seed: Number(trainSeed) || 42,
        experimentName: trainExpName.trim() || undefined,
      });
      pushToast({
        variant: 'success',
        title: `Training finished (${formatAlgorithmLabel(res.algorithm)})`,
        description: `Test RMSE: ${res.testMetrics.rmse.toFixed(4)} · MAE: ${res.testMetrics.mae.toFixed(4)}`,
      });
      setTrainOpen(false);
      triggerGlobalRefresh();
      await loadData();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Training run failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTrainSubmitting(false);
    }
  };

  const handleRegisterModel = async (e: FormEvent) => {
    e.preventDefault();
    if (!regRun) return;
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setRegSubmitting(true);
    try {
      const created = await api.models.register({
        modelName: regModelName.trim(),
        trainingRunId: regRun.trainingRunId,
        initialStage: regStage,
        notes: regNotes.trim() || undefined,
      });
      pushToast({
        variant: 'success',
        title: `Registered ${regModelName} v${created.versionNumber}`,
        description: `Initial stage: ${created.stage}`,
      });
      setRegRun(null);
      setRegNotes('');
      triggerGlobalRefresh();
      onNavigate('models', created.modelId);
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Model registration failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRegSubmitting(false);
    }
  };

  const columns: ColumnDef<ExperimentRun>[] = [
    {
      key: 'select',
      header: 'Cmp',
      render: (row) => {
        const checked = compareIds.includes(row.id);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCompare(row.id);
            }}
            aria-label={`Select run ${row.mlflowRunId} for comparison`}
            className={`flex items-center justify-center rounded p-1 transition-colors ${
              checked ? 'text-[#8B7CFF]' : 'text-[#646D82] hover:text-[#F3F4F8]'
            }`}
          >
            {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        );
      },
    },
    {
      key: 'runId',
      header: 'Run ID',
      render: (row) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-medium text-[#F3F4F8]">
            {truncateMiddle(row.mlflowRunId || row.trainingRunId, 10, 6)}
          </div>
          <div className="truncate text-[11px] text-[#646D82]">{row.experimentName}</div>
        </div>
      ),
    },
    {
      key: 'algorithm',
      header: 'Model Type',
      sortable: true,
      sortValue: (row) => row.algorithm,
      render: (row) => (
        <StatusBadge label={formatAlgorithmLabel(row.algorithm)} tone="accent" />
      ),
    },
    {
      key: 'params',
      header: 'Parameters',
      render: (row) => {
        const entries = Object.entries(row.parameters ?? {}).slice(0, 2);
        return entries.length > 0 ? (
          <span className="font-mono text-[11px] text-[#9299AA]">
            {entries.map(([k, v]) => `${k}=${String(v)}`).join(', ')}
          </span>
        ) : (
          <span className="text-[#646D82]">default</span>
        );
      },
    },
    {
      key: 'rmse',
      header: 'Test RMSE',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics.test.rmse,
      render: (row) => (
        <span className="font-mono font-semibold text-[#F3F4F8] tabular-nums">
          {formatFixed(row.metrics.test.rmse, 4)}
        </span>
      ),
    },
    {
      key: 'mae',
      header: 'Test MAE',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics.test.mae,
      render: (row) => (
        <span className="font-mono text-[#9299AA] tabular-nums">
          {formatFixed(row.metrics.test.mae, 4)}
        </span>
      ),
    },
    {
      key: 'mape',
      header: 'MAPE / R²',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics.test.r2,
      render: (row) => (
        <span className="font-mono text-[11px] text-[#9299AA] tabular-nums">
          {row.metrics.test.mape !== null ? `${row.metrics.test.mape.toFixed(2)}%` : 'N/A'} · R²{' '}
          {formatFixed(row.metrics.test.r2, 3)}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Exec Time',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.durationMs,
      render: (row) => (
        <span className="font-mono text-xs text-[#9299AA] tabular-nums">
          {formatDurationMs(row.durationMs)}
        </span>
      ),
    },
    {
      key: 'dataset',
      header: 'Dataset Ver',
      render: (row) => (
        <span className="font-mono text-[11px] text-[#646D82]">
          {truncateMiddle(row.datasetVersionId, 6, 4)}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Completed',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <span className="font-mono text-[11px] text-[#9299AA]">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          icon={<Layers className="h-3 w-3" />}
          onClick={(e) => {
            e.stopPropagation();
            setRegRun(row);
          }}
        >
          Register
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Experiments</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            MLflow-tracked candidate training runs, parameter diffs &amp; evaluation metrics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => setTrainOpen(true)}
          >
            Run Training
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

      {/* Run comparison chart */}
      <ChartContainer
        title={
          compareIds.length >= 2
            ? `Selected Run Comparison (${compareIds.length} runs)`
            : 'Recent Experiment Run Comparison'
        }
        subtitle="Select checkboxes in the table below to compare up to 5 specific runs side-by-side"
        loading={loading && runs.length === 0}
        empty={comparisonChartData.length === 0}
        emptyMessage="Launch a training run to compare candidate RMSE and MAE across model families."
        action={
          compareIds.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setCompareIds([])}>
              Clear selection ({compareIds.length})
            </Button>
          ) : undefined
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparisonChartData} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
            <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="run"
              tick={{fill: '#9299AA', fontSize: 11}}
              axisLine={{stroke: '#232A3C'}}
              tickLine={false}
            />
            <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
            <RechartsTooltip content={<DarkChartTooltip />} />
            <Legend wrapperStyle={{fontSize: 11, color: '#9299AA'}} />
            <Bar dataKey="valRmse" name="Val RMSE" fill="#6C9EFF" radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="testRmse" name="Test RMSE" fill="#8B7CFF" radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="testMae" name="Test MAE" fill="#32C98A" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Runs DataTable */}
      <DataTable
        data={runs}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Filter runs by ID, algorithm or experiment..."
        searchText={(r) => `${r.mlflowRunId} ${r.trainingRunId} ${r.algorithm} ${r.experimentName}`}
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by experiment"
              value={selectedExperiment}
              onChange={(e) => setSelectedExperiment(e.target.value)}
              className="h-8 rounded-md border border-[#232A3C] bg-[#0B0D12] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
            >
              <option value="ALL">All Experiments ({experiments.length})</option>
              {experiments.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.name} ({exp.runCount})
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by algorithm"
              value={selectedAlgorithm}
              onChange={(e) => setSelectedAlgorithm(e.target.value)}
              className="h-8 rounded-md border border-[#232A3C] bg-[#0B0D12] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
            >
              <option value="ALL">All Algorithms</option>
              <option value="gradient_boosting">Gradient Boosting</option>
              <option value="random_forest">Random Forest</option>
              <option value="ridge">Ridge Regression</option>
            </select>
          </div>
        }
        emptyTitle="No experiment runs yet"
        emptyDescription="Select a validated dataset and trigger a training job to compare Ridge, Random Forest, and Gradient Boosting candidates."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setTrainOpen(true)}>
            Launch Training Run
          </Button>
        }
      />

      {/* Launch Training Modal */}
      <Modal
        open={trainOpen}
        onClose={() => setTrainOpen(false)}
        title="Launch Training Run"
        description="Trains forecasting model(s) on temporal splits and logs metrics + artifact checksums to MLflow."
      >
        <form onSubmit={handleLaunchTrain} className="space-y-4">
          <Select
            label="Target Dataset"
            value={trainDatasetId}
            onChange={(e) => setTrainDatasetId(e.target.value)}
            options={
              datasets.length > 0
                ? datasets.map((d) => ({
                    value: d.id,
                    label: `${d.name} (v${d.latestVersion?.versionNumber ?? 1} · ${d.latestVersion?.validationPassed ? 'Valid' : 'Failed'})`,
                  }))
                : [{value: '', label: 'No datasets available — create one first'}]
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Algorithm"
              value={trainAlgorithm}
              onChange={(e) =>
                setTrainAlgorithm(
                  e.target.value as 'auto' | 'gradient_boosting' | 'random_forest' | 'ridge',
                )
              }
              options={[
                {value: 'auto', label: 'Auto (Evaluate all 3 & pick best)'},
                {value: 'gradient_boosting', label: 'Gradient Boosting'},
                {value: 'random_forest', label: 'Random Forest'},
                {value: 'ridge', label: 'Ridge Regression'},
              ]}
            />
            <Input
              label="Random Seed"
              type="number"
              value={trainSeed}
              onChange={(e) => setTrainSeed(e.target.value)}
            />
          </div>
          <Input
            label="Experiment Name"
            value={trainExpName}
            onChange={(e) => setTrainExpName(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setTrainOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={trainSubmitting}
              disabled={!trainDatasetId}
            >
              Start Training
            </Button>
          </div>
        </form>
      </Modal>

      {/* Register Model Modal */}
      <Modal
        open={Boolean(regRun)}
        onClose={() => setRegRun(null)}
        title="Register Model Version"
        description={
          regRun
            ? `Register ${formatAlgorithmLabel(regRun.algorithm)} (Test RMSE ${regRun.metrics.test.rmse.toFixed(4)}) into the Model Registry.`
            : undefined
        }
      >
        <form onSubmit={handleRegisterModel} className="space-y-4">
          <Input
            label="Model Family Name"
            value={regModelName}
            onChange={(e) => setRegModelName(e.target.value)}
            required
          />
          <Select
            label="Initial Lifecycle Stage"
            value={regStage}
            onChange={(e) => setRegStage(e.target.value as 'Candidate' | 'Development')}
            options={[
              {value: 'Candidate', label: 'Candidate (Ready for staging validation)'},
              {value: 'Development', label: 'Development (Experimental sandbox)'},
            ]}
          />
          <Input
            label="Release Notes (optional)"
            placeholder="e.g. Auto-selected best RMSE on reference snapshot"
            value={regNotes}
            onChange={(e) => setRegNotes(e.target.value)}
          />
          {regRun && (
            <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#9299AA]">Run Status</span>
                <StatusBadge label={regRun.status} tone={jobStatusTone(regRun.status)} />
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-[#646D82]">
                Training Run: {regRun.trainingRunId}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRegRun(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={regSubmitting}>
              Register Version
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
