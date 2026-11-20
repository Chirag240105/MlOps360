import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  FlaskConical,
  Layers,
  Play,
  RefreshCw,
  Rocket,
  Server,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
  CardGridSkeleton,
  ChartContainer,
  EmptyState,
  MetricCard,
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
  formatNumber,
  formatRelativeTime,
  jobStatusTone,
  stageTone,
  truncateMiddle,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  AuditLogEntry,
  DeploymentRecord,
  DriftEvent,
  ExperimentRun,
  MonitoringReport,
  PredictionRecord,
  RegisteredModelSummary,
  RetrainingJob,
  ServingMetrics,
} from '../types/api';

interface OverviewData {
  models: RegisteredModelSummary[];
  runs: ExperimentRun[];
  deployments: DeploymentRecord[];
  driftEvents: DriftEvent[];
  reports: MonitoringReport[];
  jobs: RetrainingJob[];
  predictions: PredictionRecord[];
  servingMetrics: ServingMetrics | null;
  auditLogs: AuditLogEntry[];
}

const SAMPLE_BATCH_RECORDS = [
  {date: '2026-11-18', store_id: 'store_01', sku_id: 'sku_101', price: 24.5, discount_pct: 0.1, is_holiday: 0},
  {date: '2026-11-18', store_id: 'store_01', sku_id: 'sku_102', price: 18.0, discount_pct: 0.0, is_holiday: 0},
  {date: '2026-11-18', store_id: 'store_02', sku_id: 'sku_101', price: 25.0, discount_pct: 0.15, is_holiday: 0},
  {date: '2026-11-19', store_id: 'store_02', sku_id: 'sku_103', price: 42.0, discount_pct: 0.05, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_03', sku_id: 'sku_104', price: 14.5, discount_pct: 0.2, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_03', sku_id: 'sku_105', price: 31.0, discount_pct: 0.0, is_holiday: 0},
];

export function OverviewPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {health, environment, policyPrefs, refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedingStep, setSeedingStep] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        modelsRes,
        runsRes,
        deploymentsRes,
        eventsRes,
        reportsRes,
        jobsRes,
        predsRes,
        metricsRes,
        auditRes,
      ] = await Promise.all([
        api.models.list(),
        api.experiments.listRuns(),
        api.deployments.list(),
        api.monitoring.listDriftEvents(),
        api.monitoring.listReports(),
        api.retraining.listJobs(),
        api.predictions.list(150),
        api.predictions.metrics(),
        api.audit.list(8),
      ]);

      setData({
        models: modelsRes.models ?? [],
        runs: runsRes.runs ?? [],
        deployments: deploymentsRes.deployments ?? [],
        driftEvents: eventsRes.events ?? [],
        reports: reportsRes.reports ?? [],
        jobs: jobsRes.jobs ?? [],
        predictions: predsRes.predictions ?? [],
        servingMetrics: metricsRes,
        auditLogs: auditRes.logs ?? [],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load platform overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview, refreshTrigger]);

  const handleSeedLifecycle = async () => {
    if (!canMutate) {
      pushToast({
        variant: 'warning',
        title: 'Read-only role',
        description: 'Sign in as ML_Engineer or Admin to bootstrap the ML lifecycle.',
      });
      return;
    }

    try {
      setSeedingStep('Generating reference retail dataset...');
      const ds = await api.datasets.generate({
        name: `retail_demand_${Date.now().toString().slice(-4)}`,
        days: 180,
        scenario: 'reference',
        description: 'Reference retail demand dataset generated from Overview quickstart',
      });

      setSeedingStep('Training candidate model (auto selection)...');
      const run = await api.training.run({
        datasetId: ds.datasetId,
        algorithm: 'auto',
        experimentName: 'retail-demand-quickstart',
      });

      setSeedingStep('Registering & promoting champion model...');
      const ver = await api.models.register({
        modelName: 'retail_demand_forecaster',
        trainingRunId: run.runId,
        initialStage: 'Candidate',
        notes: 'Initial baseline champion registered from Overview',
      });

      await api.models.transition(ver.modelId, ver.id, {
        targetStage: 'Staging',
        reason: 'Automated quickstart validation',
      });
      await api.models.promote(ver.modelId, ver.id, {
        reason: 'Initial production deployment',
        forceOverride: true,
      });

      setSeedingStep('Deploying production endpoint & running sample inference...');
      await api.deployments.deploy({
        modelId: ver.modelId,
        modelVersionId: ver.id,
        endpointName: 'retail-demand-prod',
        environment,
      });

      await api.predictions.predictBatch({
        modelId: ver.modelId,
        records: SAMPLE_BATCH_RECORDS,
      });

      setSeedingStep('Evaluating drift & health telemetry...');
      await api.monitoring.run({
        modelId: ver.modelId,
        windowLimit: policyPrefs.windowLimit,
        psiThreshold: policyPrefs.psiThreshold,
        ksPvalueThreshold: policyPrefs.ksPvalueThreshold,
        rmseDegradationFactor: policyPrefs.rmseDegradationFactor,
      });

      pushToast({
        variant: 'success',
        title: 'Retail Demand Lifecycle ready',
        description: `Trained ${formatAlgorithmLabel(run.algorithm)} (Test RMSE ${formatFixed(run.testMetrics?.rmse, 3)}) and deployed to ${environment}.`,
      });
      triggerGlobalRefresh();
      await loadOverview();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Lifecycle bootstrap failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSeedingStep(null);
    }
  };

  const kpis = useMemo(() => {
    if (!data) return null;
    const prodModels = data.models.filter(
      (m) => m.productionVersionId !== null || m.productionVersion?.stage === 'Production',
    ).length;
    const activeDeployments = data.deployments.filter((d) => d.status === 'ACTIVE').length;
    const openDriftAlerts = data.driftEvents.filter((e) => !e.acknowledged).length;
    const pendingJobs = data.jobs.filter((j) => j.status === 'QUEUED' || j.status === 'RUNNING').length;

    return {
      totalModels: data.models.length,
      prodModels,
      experimentsCompleted: data.runs.length,
      activeDeployments,
      totalDeployments: data.deployments.length,
      openDriftAlerts,
      totalDriftEvents: data.driftEvents.length,
      pendingJobs,
      totalJobs: data.jobs.length,
    };
  }, [data]);

  // Chart 1: Model performance over time (chronological runs)
  const performanceSeries = useMemo(() => {
    if (!data) return [];
    return [...data.runs]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-16)
      .map((run, idx) => ({
        label: `#${idx + 1} ${truncateMiddle(run.mlflowRunId || run.trainingRunId, 5, 4)}`,
        rmse: Number((run.metrics?.test?.rmse ?? 0).toFixed(4)),
        mae: Number((run.metrics?.test?.mae ?? 0).toFixed(4)),
        algorithm: formatAlgorithmLabel(run.algorithm),
      }));
  }, [data]);

  // Chart 2: Prediction volume by forecast date
  const predictionVolumeSeries = useMemo(() => {
    if (!data || data.predictions.length === 0) return [];
    const byDate = new Map<string, {date: string; requests: number; totalUnits: number}>();
    for (const p of data.predictions) {
      const bucket = p.date || p.createdAt.slice(0, 10);
      const curr = byDate.get(bucket) ?? {date: bucket, requests: 0, totalUnits: 0};
      curr.requests += 1;
      curr.totalUnits += p.predictedUnits;
      byDate.set(bucket, curr);
    }
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((item) => ({
        date: item.date,
        requests: item.requests,
        avgPredictedUnits: Number((item.totalUnits / item.requests).toFixed(2)),
      }));
  }, [data]);

  // Chart 3: Drift score trends (maxPsi over monitoring reports)
  const driftTrendSeries = useMemo(() => {
    if (!data) return [];
    return [...data.reports]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-16)
      .map((rep, idx) => ({
        label: `R${idx + 1} (v${rep.versionNumber})`,
        maxPsi: Number(rep.maxPsi.toFixed(4)),
        minKs: Number(rep.minKsPvalue.toFixed(4)),
      }));
  }, [data]);

  // Chart 4: Training activity grouped by algorithm
  const trainingByAlgorithm = useMemo(() => {
    if (!data || data.runs.length === 0) return [];
    const grouped = new Map<string, {algorithm: string; runs: number; rmseSum: number}>();
    for (const r of data.runs) {
      const label = formatAlgorithmLabel(r.algorithm);
      const curr = grouped.get(label) ?? {algorithm: label, runs: 0, rmseSum: 0};
      curr.runs += 1;
      curr.rmseSum += r.metrics.test.rmse;
      grouped.set(label, curr);
    }
    return [...grouped.values()].map((item) => ({
      algorithm: item.algorithm,
      runs: item.runs,
      avgRmse: Number((item.rmseSum / item.runs).toFixed(3)),
    }));
  }, [data]);

  const isFreshWorkspace =
    !loading &&
    data !== null &&
    data.models.length === 0 &&
    data.runs.length === 0 &&
    data.deployments.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Overview</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            End-to-end Retail Demand Forecasting control plane · {environment} scope
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFreshWorkspace && (
            <Button
              variant="primary"
              size="sm"
              loading={Boolean(seedingStep)}
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={handleSeedLifecycle}
            >
              {seedingStep ?? 'Seed Retail Demand Lifecycle'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {
              triggerGlobalRefresh();
              loadOverview();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F16C78]/40 bg-[#F16C78]/10 px-4 py-3 text-xs text-[#F16C78]">
          Unable to load complete overview telemetry: {error}
        </div>
      )}

      {/* KPI Grid */}
      {loading && !data ? (
        <CardGridSkeleton count={6} />
      ) : kpis ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Registered Models"
            value={kpis.totalModels}
            subtext="Model families in registry"
            tone="accent"
            icon={<Layers className="h-4 w-4" />}
            onClick={() => onNavigate('models')}
          />
          <MetricCard
            label="Active Production"
            value={kpis.prodModels}
            subtext="Models with live champion"
            tone={kpis.prodModels > 0 ? 'success' : 'neutral'}
            icon={<Cpu className="h-4 w-4" />}
            onClick={() => onNavigate('models')}
          />
          <MetricCard
            label="Experiments Done"
            value={kpis.experimentsCompleted}
            subtext="Tracked MLflow training runs"
            tone="info"
            icon={<FlaskConical className="h-4 w-4" />}
            onClick={() => onNavigate('experiments')}
          />
          <MetricCard
            label="Active Deployments"
            value={kpis.activeDeployments}
            subtext={`${kpis.totalDeployments} total endpoint records`}
            tone={kpis.activeDeployments > 0 ? 'success' : 'neutral'}
            icon={<Rocket className="h-4 w-4" />}
            onClick={() => onNavigate('deployments')}
          />
          <MetricCard
            label="Drift Alerts"
            value={kpis.openDriftAlerts}
            subtext={`${kpis.totalDriftEvents} historical drift events`}
            tone={kpis.openDriftAlerts > 0 ? 'error' : 'success'}
            icon={<AlertTriangle className="h-4 w-4" />}
            onClick={() => onNavigate('drift')}
          />
          <MetricCard
            label="Pending Retraining"
            value={kpis.pendingJobs}
            subtext={`${kpis.totalJobs} total retraining jobs`}
            tone={kpis.pendingJobs > 0 ? 'warning' : 'neutral'}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => onNavigate('retraining')}
          />
        </section>
      ) : null}

      {/* Fresh Workspace Banner */}
      {isFreshWorkspace && (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Layers className="h-5 w-5 text-[#8B7CFF]" />}
              title="No ML lifecycle telemetry recorded yet"
              description="Generate a reference Retail Demand dataset, train a challenger via Ridge/RandomForest/GradientBoosting, register & promote the champion, deploy it, and run initial monitoring in one automated sequence."
              action={
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    variant="primary"
                    loading={Boolean(seedingStep)}
                    icon={<Play className="h-3.5 w-3.5" />}
                    onClick={handleSeedLifecycle}
                  >
                    {seedingStep ?? 'Seed Retail Demand Lifecycle'}
                  </Button>
                  <Button variant="secondary" onClick={() => onNavigate('datasets')}>
                    Manage Datasets Manually
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* 4 Telemetry Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartContainer
          title="Model Performance Over Time"
          subtitle="Test RMSE and MAE across chronological experiment runs"
          loading={loading && !data}
          empty={performanceSeries.length === 0}
          emptyMessage="Run a training job in Experiments to track Test RMSE and MAE trends."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={performanceSeries} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <Line
                type="monotone"
                dataKey="rmse"
                name="Test RMSE"
                stroke="#8B7CFF"
                strokeWidth={2}
                dot={{r: 3, fill: '#8B7CFF'}}
                activeDot={{r: 5}}
              />
              <Line
                type="monotone"
                dataKey="mae"
                name="Test MAE"
                stroke="#6C9EFF"
                strokeWidth={2}
                dot={{r: 3, fill: '#6C9EFF'}}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Prediction Volume"
          subtitle="Inference requests grouped by forecast date"
          loading={loading && !data}
          empty={predictionVolumeSeries.length === 0}
          emptyMessage="Run single or batch predictions to inspect request volume by forecast date."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={predictionVolumeSeries}
              margin={{top: 8, right: 12, left: -12, bottom: 0}}
            >
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <RechartsTooltip
                content={
                  <DarkChartTooltip
                    valueFormatter={(v, name) =>
                      name === 'Requests' ? `${v} calls` : `${Number(v).toFixed(2)} units`
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="requests"
                name="Requests"
                stroke="#6C9EFF"
                fill="#6C9EFF"
                fillOpacity={0.18}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Drift Score Trends"
          subtitle={`Maximum feature PSI across monitoring checks (threshold ${policyPrefs.psiThreshold})`}
          loading={loading && !data}
          empty={driftTrendSeries.length === 0}
          emptyMessage="Execute a monitoring check to track PSI drift scores over time."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={driftTrendSeries} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <ReferenceLine
                y={policyPrefs.psiThreshold}
                stroke="#F5B942"
                strokeDasharray="4 4"
                label={{
                  value: `PSI ${policyPrefs.psiThreshold}`,
                  fill: '#F5B942',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
              <Line
                type="monotone"
                dataKey="maxPsi"
                name="Max PSI"
                stroke="#F5B942"
                strokeWidth={2}
                dot={{r: 3, fill: '#F5B942'}}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Training Activity by Algorithm"
          subtitle="Completed runs per candidate model family"
          loading={loading && !data}
          empty={trainingByAlgorithm.length === 0}
          emptyMessage="Completed training runs will appear grouped by algorithm here."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trainingByAlgorithm} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="algorithm"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <RechartsTooltip
                content={
                  <DarkChartTooltip
                    valueFormatter={(v, name) =>
                      name === 'Runs' ? `${v} runs` : Number(v).toFixed(4)
                    }
                  />
                }
              />
              <Bar dataKey="runs" name="Runs" fill="#8B7CFF" radius={[4, 4, 0, 0]} maxBarSize={54} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </section>

      {/* Operational Panels */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Recent Experiments */}
        <Card>
          <CardHeader
            title="Recent Experiments"
            subtitle="Latest MLflow-tracked candidate evaluations"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('experiments')}
              >
                <span>View all</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            }
          />
          <CardContent className="p-0">
            {!data || data.runs.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#9299AA]">
                No experiment runs recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-[#232A3C]">
                {data.runs.slice(0, 5).map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-xs transition-colors hover:bg-[#1B2130]/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-[#F3F4F8]">
                          {truncateMiddle(run.mlflowRunId || run.trainingRunId, 10, 6)}
                        </span>
                        <StatusBadge label={formatAlgorithmLabel(run.algorithm)} tone="accent" />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[#9299AA]">
                        {run.experimentName} · {formatRelativeTime(run.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div className="font-medium text-[#F3F4F8]">
                        RMSE {formatFixed(run.metrics.test.rmse, 3)}
                      </div>
                      <div className="text-[11px] text-[#9299AA]">
                        MAE {formatFixed(run.metrics.test.mae, 3)} · {formatDurationMs(run.durationMs)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Deployment Status */}
        <Card>
          <CardHeader
            title="Model Deployment Status"
            subtitle="Active serving endpoints & traffic routing"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('deployments')}
              >
                <span>Manage</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            }
          />
          <CardContent className="p-0">
            {!data || data.deployments.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#9299AA]">
                No endpoints deployed yet.
              </div>
            ) : (
              <div className="divide-y divide-[#232A3C]">
                {data.deployments.slice(0, 5).map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-xs transition-colors hover:bg-[#1B2130]/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-[#F3F4F8]">{dep.endpointName}</span>
                        <StatusBadge label={dep.stage} tone={stageTone(dep.stage)} />
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[#9299AA]">
                        {dep.modelName} v{dep.versionNumber} · {dep.environment}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="font-mono text-[11px] text-[#9299AA] tabular-nums">
                        {dep.trafficPct}% traffic
                      </span>
                      <StatusBadge label={dep.status} tone={jobStatusTone(dep.status)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity (Audit Logs) */}
        <Card>
          <CardHeader
            title="Recent Activity"
            subtitle="Immutable governance & lifecycle events"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('audit')}>
                <span>Audit trail</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            }
          />
          <CardContent className="p-0">
            {!data || data.auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#9299AA]">
                No audit events logged yet.
              </div>
            ) : (
              <div className="divide-y divide-[#232A3C]">
                {data.auditLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-medium text-[#F3F4F8]">
                          {log.action}
                        </span>
                        <span className="truncate text-[11px] text-[#9299AA]">
                          {log.resourceType}:{truncateMiddle(log.resourceId, 8, 4)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[#646D82]">
                        Actor: {log.actor}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-[#9299AA] tabular-nums">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader
            title="System Health & Serving Telemetry"
            subtitle="Control plane runtime & live inference SLA"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('monitoring')}>
                <span>Monitoring</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            }
          />
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#9299AA]">API Gateway</span>
                  <StatusBadge
                    label={
                      health?.status === 'healthy' || health?.status === 'ok' ? 'HEALTHY' : 'UNKNOWN'
                    }
                    tone={
                      health?.status === 'healthy' || health?.status === 'ok' ? 'success' : 'warning'
                    }
                    icon={<Activity className="h-3 w-3" />}
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-[#F3F4F8] tabular-nums">
                  {health?.checks.nodeRuntime ?? '—'} · uptime{' '}
                  {health ? `${Math.round(health.uptimeSeconds)}s` : '—'}
                </p>
              </div>

              <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#9299AA]">Python ML Worker</span>
                  <Server className="h-3.5 w-3.5 text-[#6C9EFF]" />
                </div>
                <p className="mt-2 truncate font-mono text-xs text-[#F3F4F8]">
                  {health?.checks.pythonWorkerRuntime ?? '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-[#232A3C] pt-4 text-xs">
              <div>
                <p className="text-[#9299AA]">Total Predictions</p>
                <p className="mt-1 font-mono text-base font-semibold text-[#F3F4F8] tabular-nums">
                  {formatNumber(data?.servingMetrics?.totalPredictions ?? 0, 0)}
                </p>
              </div>
              <div>
                <p className="text-[#9299AA]">Avg / P95 Latency</p>
                <p className="mt-1 font-mono text-base font-semibold text-[#F3F4F8] tabular-nums">
                  {formatDurationMs(data?.servingMetrics?.avgLatencyMs)} /{' '}
                  {formatDurationMs(data?.servingMetrics?.p95LatencyMs)}
                </p>
              </div>
              <div>
                <p className="text-[#9299AA]">Failed Requests</p>
                <p className="mt-1 font-mono text-base font-semibold text-[#F3F4F8] tabular-nums">
                  {formatNumber(data?.servingMetrics?.failedRequests ?? 0, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
