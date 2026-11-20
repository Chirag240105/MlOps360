import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  GitCompare,
  RefreshCw,
  XCircle,
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
  EmptyState,
  Select,
  StatusBadge,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {
  formatAlgorithmLabel,
  formatDurationMs,
  formatFixed,
  formatPercent,
  stageTone,
  truncateMiddle,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  ModelComparisonResponse,
  RegisteredModelDetails,
  TrainingRunSummary,
} from '../types/api';

export function ComparisonPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {policyPrefs, refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [models, setModels] = useState<RegisteredModelDetails[]>([]);
  const [trainingRuns, setTrainingRuns] = useState<TrainingRunSummary[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [challengerId, setChallengerId] = useState('');
  const [comparison, setComparison] = useState<ModelComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, runsRes] = await Promise.all([
        api.models.list(),
        api.training.listRuns(),
      ]);
      setTrainingRuns(runsRes.runs ?? []);
      const detailed = await Promise.all(
        (modelsRes.models ?? []).map((m) => api.models.get(m.id)),
      );
      setModels(detailed);

      if (detailed.length > 0 && !selectedModelId) {
        const first = detailed.find((m) => m.versions.length >= 2) ?? detailed[0];
        setSelectedModelId(first.id);
        const prod = first.productionVersionId ?? first.versions[first.versions.length - 1]?.id ?? '';
        const chal =
          first.versions.find((v) => v.id !== prod)?.id ?? first.versions[0]?.id ?? '';
        setBaselineId(prod);
        setChallengerId(chal);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load model versions');
    } finally {
      setLoading(false);
    }
  }, [selectedModelId]);

  useEffect(() => {
    loadModels();
  }, [loadModels, refreshTrigger]);

  const currentModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const handleModelChange = (nextId: string) => {
    setSelectedModelId(nextId);
    const found = models.find((m) => m.id === nextId);
    if (found) {
      const prod = found.productionVersionId ?? found.versions[found.versions.length - 1]?.id ?? '';
      const chal =
        found.versions.find((v) => v.id !== prod)?.id ?? found.versions[0]?.id ?? '';
      setBaselineId(prod);
      setChallengerId(chal);
    }
  };

  const runComparison = useCallback(async () => {
    if (!selectedModelId || !baselineId || !challengerId) {
      setComparison(null);
      return;
    }
    setComparing(true);
    setError(null);
    try {
      const res = await api.models.compare(selectedModelId, baselineId, challengerId);
      setComparison(res);
    } catch (err: unknown) {
      setComparison(null);
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  }, [selectedModelId, baselineId, challengerId]);

  useEffect(() => {
    runComparison();
  }, [runComparison]);

  const durationByRunId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of trainingRuns) {
      map.set(r.runId, r.durationMs);
    }
    return map;
  }, [trainingRuns]);

  const meetsCriteria = useMemo(() => {
    if (!comparison) return false;
    const minReqPct = policyPrefs.minPromotionRmseImprovement * 100;
    return (
      comparison.comparison.challengerBeatsBaselineOnRmse &&
      comparison.comparison.rmseImprovementPct >= minReqPct
    );
  }, [comparison, policyPrefs.minPromotionRmseImprovement]);

  const chartData = useMemo(() => {
    if (!comparison) return [];
    return [
      {
        metric: 'Test RMSE',
        champion: Number((comparison.baseline.metrics?.test?.rmse ?? 0).toFixed(4)),
        challenger: Number((comparison.challenger.metrics?.test?.rmse ?? 0).toFixed(4)),
      },
      {
        metric: 'Val RMSE',
        champion: Number((comparison.baseline.metrics?.validation?.rmse ?? 0).toFixed(4)),
        challenger: Number((comparison.challenger.metrics?.validation?.rmse ?? 0).toFixed(4)),
      },
      {
        metric: 'Test MAE',
        champion: Number((comparison.baseline.metrics?.test?.mae ?? 0).toFixed(4)),
        challenger: Number((comparison.challenger.metrics?.test?.mae ?? 0).toFixed(4)),
      },
      {
        metric: 'Val MAE',
        champion: Number((comparison.baseline.metrics?.validation?.mae ?? 0).toFixed(4)),
        challenger: Number((comparison.challenger.metrics?.validation?.mae ?? 0).toFixed(4)),
      },
    ];
  }, [comparison]);

  const handlePromoteChallenger = async () => {
    if (!comparison) return;
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setPromoting(true);
    try {
      await api.models.promote(comparison.modelId, comparison.challenger.id, {
        reason: `Promoted challenger v${comparison.challenger.versionNumber} after Champion/Challenger comparison (${comparison.comparison.rmseImprovementPct.toFixed(2)}% RMSE improvement)`,
      });
      pushToast({
        variant: 'success',
        title: `Promoted v${comparison.challenger.versionNumber} to Production`,
      });
      triggerGlobalRefresh();
      await loadModels();
      await runComparison();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Promotion gate blocked',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">
            Model Comparison
          </h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Side-by-side Champion vs Challenger error benchmarks &amp; promotion gate evaluation
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          loading={loading || comparing}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => {
            loadModels();
            runComparison();
          }}
        >
          Refresh
        </Button>
      </div>

      {/* Selector bar */}
      <Card>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Registered Model"
              value={selectedModelId}
              onChange={(e) => handleModelChange(e.target.value)}
              options={
                models.length > 0
                  ? models.map((m) => ({value: m.id, label: `${m.name} (${m.versions.length} versions)`}))
                  : [{value: '', label: 'No registered models'}]
              }
            />
            <Select
              label="Baseline (Champion) Version"
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              options={
                currentModel && currentModel.versions.length > 0
                  ? currentModel.versions.map((v) => ({
                      value: v.id,
                      label: `v${v.versionNumber} · ${v.stage} (RMSE ${(v.metrics?.test?.rmse ?? 0).toFixed(4)})`,
                    }))
                  : [{value: '', label: 'No versions available'}]
              }
            />
            <Select
              label="Challenger Version"
              value={challengerId}
              onChange={(e) => setChallengerId(e.target.value)}
              options={
                currentModel && currentModel.versions.length > 0
                  ? currentModel.versions.map((v) => ({
                      value: v.id,
                      label: `v${v.versionNumber} · ${v.stage} (RMSE ${(v.metrics?.test?.rmse ?? 0).toFixed(4)})`,
                    }))
                  : [{value: '', label: 'No versions available'}]
              }
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-[#F16C78]/40 bg-[#F16C78]/10 px-4 py-3 text-xs text-[#F16C78]">
          {error}
        </div>
      )}

      {!comparison ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<GitCompare className="h-5 w-5 text-[#8B7CFF]" />}
              title="Select two model versions to compare"
              description="Train at least two versions of a registered model (or run a retraining job) to evaluate champion vs challenger metrics side-by-side."
              action={
                <Button variant="primary" size="sm" onClick={() => onNavigate('retraining')}>
                  Open Retraining Jobs
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Promotion Criteria Banner */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 rounded-md p-2 ${
                    meetsCriteria
                      ? 'bg-[#32C98A]/15 text-[#32C98A]'
                      : 'bg-[#F16C78]/15 text-[#F16C78]'
                  }`}
                >
                  {meetsCriteria ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-[#F3F4F8]">
                      {meetsCriteria
                        ? 'Challenger Meets Promotion Criteria'
                        : 'Challenger Does Not Meet Promotion Criteria'}
                    </h2>
                    <StatusBadge
                      label={`${(comparison.comparison.rmseImprovementPct ?? 0) >= 0 ? '+' : ''}${(comparison.comparison.rmseImprovementPct ?? 0).toFixed(2)}% RMSE`}
                      tone={meetsCriteria ? 'success' : 'warning'}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[#9299AA]">
                    Minimum required RMSE improvement:{' '}
                    <span className="font-mono text-[#F3F4F8]">
                      {(policyPrefs.minPromotionRmseImprovement * 100).toFixed(1)}%
                    </span>{' '}
                    · ΔRMSE{' '}
                    <span className="font-mono text-[#F3F4F8]">
                      {(comparison.comparison.deltaRmse ?? 0).toFixed(4)}
                    </span>{' '}
                    · ΔMAE{' '}
                    <span className="font-mono text-[#F3F4F8]">
                      {(comparison.comparison.deltaMae ?? 0).toFixed(4)}
                    </span>
                  </p>
                </div>
              </div>

              {meetsCriteria &&
                comparison.challenger.stage !== 'Production' &&
                (comparison.challenger.stage === 'Candidate' ||
                  comparison.challenger.stage === 'Staging') && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={promoting}
                    icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
                    onClick={handlePromoteChallenger}
                  >
                    Promote v{comparison.challenger.versionNumber} to Production
                  </Button>
                )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Side-by-side matrix */}
            <Card>
              <CardHeader
                title="Champion vs Challenger Metric Matrix"
                subtitle="Evaluated on identical test and validation splits"
              />
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#232A3C] bg-[#10131B]/70 text-[#9299AA]">
                        <th className="px-4 py-2.5 font-medium">Dimension</th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Baseline (v{comparison.baseline.versionNumber})
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Challenger (v{comparison.challenger.versionNumber})
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232A3C]">
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Lifecycle Stage</td>
                        <td className="px-4 py-2.5 text-right">
                          <StatusBadge
                            label={comparison.baseline.stage}
                            tone={stageTone(comparison.baseline.stage)}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <StatusBadge
                            label={comparison.challenger.stage}
                            tone={stageTone(comparison.challenger.stage)}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Algorithm</td>
                        <td className="px-4 py-2.5 text-right text-[#F3F4F8]">
                          {formatAlgorithmLabel(comparison.baseline.algorithm)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#F3F4F8]">
                          {formatAlgorithmLabel(comparison.challenger.algorithm)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Dataset Version</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[#9299AA]">
                          {truncateMiddle(comparison.baseline.datasetVersionId, 6, 4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[#9299AA]">
                          {truncateMiddle(comparison.challenger.datasetVersionId, 6, 4)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 font-medium text-[#F3F4F8]">Test RMSE</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(comparison.baseline.metrics.test.rmse, 4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#8B7CFF] tabular-nums">
                          {formatFixed(comparison.challenger.metrics.test.rmse, 4)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Test MAE</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(comparison.baseline.metrics.test.mae, 4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(comparison.challenger.metrics.test.mae, 4)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Test MAPE</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatPercent(comparison.baseline.metrics?.test?.mape ?? (comparison.baseline.metrics?.test as any)?.mapePct, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatPercent(comparison.challenger.metrics?.test?.mape ?? (comparison.challenger.metrics?.test as any)?.mapePct, 2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Test R²</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(comparison.baseline.metrics.test.r2, 4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(comparison.challenger.metrics.test.r2, 4)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-[#9299AA]">Training Duration</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatDurationMs(
                            durationByRunId.get(comparison.baseline.trainingRunId),
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatDurationMs(
                            durationByRunId.get(comparison.challenger.trainingRunId),
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Recharts visual delta */}
            <ChartContainer
              title="Prediction Error Comparison"
              subtitle={`Baseline v${comparison.baseline.versionNumber} vs Challenger v${comparison.challenger.versionNumber}`}
              heightClass="h-80"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
                  <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="metric"
                    tick={{fill: '#9299AA', fontSize: 11}}
                    axisLine={{stroke: '#232A3C'}}
                    tickLine={false}
                  />
                  <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
                  <RechartsTooltip content={<DarkChartTooltip />} />
                  <Legend wrapperStyle={{fontSize: 11, color: '#9299AA'}} />
                  <Bar
                    dataKey="champion"
                    name={`Baseline v${comparison.baseline.versionNumber}`}
                    fill="#6C9EFF"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="challenger"
                    name={`Challenger v${comparison.challenger.versionNumber}`}
                    fill="#8B7CFF"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </>
      )}
    </div>
  );
}
