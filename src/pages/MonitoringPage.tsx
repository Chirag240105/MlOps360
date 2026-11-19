import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Activity,
  AlertTriangle,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  ChartContainer,
  MetricCard,
  StatusBadge,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {
  formatDurationMs,
  formatFixed,
  formatNumber,
  formatRelativeTime,
  jobStatusTone,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  MonitoringReport,
  RegisteredModelSummary,
  ServingMetrics,
} from '../types/api';

export function MonitoringPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {policyPrefs, refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [reports, setReports] = useState<MonitoringReport[]>([]);
  const [models, setModels] = useState<RegisteredModelSummary[]>([]);
  const [metrics, setMetrics] = useState<ServingMetrics | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('ALL');
  const [rangeCount, setRangeCount] = useState<'5' | '15' | '30' | 'ALL'>('15');
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMonitoring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repRes, modelsRes, metricsRes] = await Promise.all([
        api.monitoring.listReports(selectedModelId !== 'ALL' ? selectedModelId : undefined),
        api.models.list(),
        api.predictions.metrics(),
      ]);
      setReports(repRes.reports ?? []);
      setModels(modelsRes.models ?? []);
      setMetrics(metricsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring reports');
    } finally {
      setLoading(false);
    }
  }, [selectedModelId]);

  useEffect(() => {
    loadMonitoring();
  }, [loadMonitoring, refreshTrigger]);

  const handleRunEvaluation = async () => {
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setEvaluating(true);
    try {
      const rep = await api.monitoring.run({
        modelId: selectedModelId !== 'ALL' ? selectedModelId : undefined,
        windowLimit: policyPrefs.windowLimit,
        psiThreshold: policyPrefs.psiThreshold,
        ksPvalueThreshold: policyPrefs.ksPvalueThreshold,
        rmseDegradationFactor: policyPrefs.rmseDegradationFactor,
      });
      pushToast({
        variant: rep.dataDriftDetected || rep.performanceDegraded ? 'warning' : 'success',
        title: `Monitoring status: ${rep.details?.overallStatus ?? 'COMPLETED'}`,
        description: `Max PSI ${rep.maxPsi.toFixed(4)} · ${rep.sampleCount} samples evaluated`,
      });
      triggerGlobalRefresh();
      await loadMonitoring();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Monitoring evaluation failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  };

  const orderedReports = useMemo(() => {
    const asc = [...reports].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    if (rangeCount === 'ALL') return asc;
    return asc.slice(-Number(rangeCount));
  }, [reports, rangeCount]);

  const latestReport = orderedReports[orderedReports.length - 1] ?? null;

  const driftSeries = useMemo(
    () =>
      orderedReports.map((rep, idx) => ({
        point: `#${idx + 1} v${rep.versionNumber}`,
        featureMaxPsi: Number(rep.maxPsi.toFixed(4)),
        predictionPsi: Number((rep.details?.predictionDrift?.psi ?? 0).toFixed(4)),
      })),
    [orderedReports],
  );

  const performanceSeries = useMemo(
    () =>
      orderedReports
        .filter((rep) => rep.liveRmse !== null || rep.details?.livePerformance)
        .map((rep, idx) => ({
          point: `#${idx + 1} v${rep.versionNumber}`,
          liveRmse: Number((rep.liveRmse ?? rep.details?.livePerformance?.rmse ?? 0).toFixed(4)),
          liveMae: Number((rep.liveMae ?? rep.details?.livePerformance?.mae ?? 0).toFixed(4)),
          baselineRmse: Number((rep.details?.livePerformance?.baselineRmse ?? 0).toFixed(4)),
        })),
    [orderedReports],
  );

  const latencySeries = useMemo(
    () =>
      (metrics?.predictionsByModel ?? []).map((item) => ({
        model: item.modelName,
        requests: item.requestCount,
        avgLatencyMs: Number(item.avgLatencyMs.toFixed(2)),
      })),
    [metrics],
  );

  const missingnessEntries = useMemo(() => {
    const rates = latestReport?.details?.missingnessRates ?? {};
    return Object.entries(rates).map(([feature, rate]) => ({
      feature,
      pct: Number((rate * 100).toFixed(2)),
    }));
  }, [latestReport]);

  const errorRatePct =
    metrics && metrics.totalPredictions > 0
      ? ((metrics.failedRequests / metrics.totalPredictions) * 100).toFixed(2)
      : '0.00';

  const latestBaselineThreshold = latestReport?.details?.livePerformance?.baselineRmse
    ? Number(
        (
          latestReport.details.livePerformance.baselineRmse * policyPrefs.rmseDegradationFactor
        ).toFixed(4),
      )
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Monitoring</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Feature drift, prediction drift, live RMSE degradation, serving latency &amp; data quality
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter reports by model"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="h-8 rounded-md border border-[#232A3C] bg-[#151923] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
          >
            <option value="ALL">All Models</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Report window range"
            value={rangeCount}
            onChange={(e) => setRangeCount(e.target.value as '5' | '15' | '30' | 'ALL')}
            className="h-8 rounded-md border border-[#232A3C] bg-[#151923] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
          >
            <option value="5">Last 5 checks</option>
            <option value="15">Last 15 checks</option>
            <option value="30">Last 30 checks</option>
            <option value="ALL">All checks</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            loading={evaluating}
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={handleRunEvaluation}
          >
            Run Monitoring Check
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadMonitoring}
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

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Latest Health Status"
          value={latestReport?.details?.overallStatus ?? 'NO REPORTS'}
          subtext={
            latestReport
              ? `${latestReport.sampleCount} samples · ${formatRelativeTime(latestReport.createdAt)}`
              : 'Run a monitoring check'
          }
          tone={
            latestReport ? jobStatusTone(latestReport.details?.overallStatus ?? 'HEALTHY') : 'neutral'
          }
        />
        <MetricCard
          label="Max Feature PSI"
          value={latestReport ? formatFixed(latestReport.maxPsi, 4) : '—'}
          subtext={`Alert threshold: ≥ ${policyPrefs.psiThreshold}`}
          tone={
            latestReport && latestReport.maxPsi >= policyPrefs.psiThreshold
              ? 'warning'
              : 'success'
          }
        />
        <MetricCard
          label="Live RMSE vs Baseline"
          value={
            latestReport?.liveRmse !== null && latestReport?.liveRmse !== undefined
              ? formatFixed(latestReport.liveRmse, 4)
              : 'No labels'
          }
          subtext={
            latestReport?.details?.livePerformance
              ? `Baseline ${formatFixed(latestReport.details.livePerformance.baselineRmse, 3)} (${formatFixed(latestReport.details.livePerformance.rmseDegradationRatio, 2)}x)`
              : 'Record ground truth in Predictions'
          }
          tone={latestReport?.performanceDegraded ? 'error' : 'info'}
        />
        <MetricCard
          label="API Latency & Errors"
          value={`${formatDurationMs(metrics?.avgLatencyMs)} / ${errorRatePct}%`}
          subtext={`P95 ${formatDurationMs(metrics?.p95LatencyMs)} · ${formatNumber(metrics?.totalPredictions ?? 0, 0)} calls`}
        />
      </div>

      {/* Time-series charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartContainer
          title="Feature & Prediction Drift Over Time (PSI)"
          subtitle={`Comparing covariate max PSI vs prediction output PSI (threshold ${policyPrefs.psiThreshold})`}
          loading={loading && reports.length === 0}
          empty={driftSeries.length === 0}
          emptyMessage="Trigger a monitoring check to track feature and prediction drift trajectories."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={driftSeries} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="point"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <Legend wrapperStyle={{fontSize: 11, color: '#9299AA'}} />
              <ReferenceLine
                y={policyPrefs.psiThreshold}
                stroke="#F5B942"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="featureMaxPsi"
                name="Max Feature PSI"
                stroke="#8B7CFF"
                strokeWidth={2}
                dot={{r: 3}}
              />
              <Line
                type="monotone"
                dataKey="predictionPsi"
                name="Prediction PSI"
                stroke="#6C9EFF"
                strokeWidth={2}
                dot={{r: 3}}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Live Model Performance vs Baseline"
          subtitle={`Monitoring RMSE & MAE when ground-truth labels exist (degradation trigger ${policyPrefs.rmseDegradationFactor}x)`}
          loading={loading && reports.length === 0}
          empty={performanceSeries.length === 0}
          emptyMessage="Label prediction records with ground truth in Predictions to evaluate live RMSE degradation."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={performanceSeries} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="point"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <Legend wrapperStyle={{fontSize: 11, color: '#9299AA'}} />
              {latestBaselineThreshold && (
                <ReferenceLine
                  y={latestBaselineThreshold}
                  stroke="#F16C78"
                  strokeDasharray="4 4"
                />
              )}
              <Line
                type="monotone"
                dataKey="liveRmse"
                name="Live RMSE"
                stroke="#F16C78"
                strokeWidth={2}
                dot={{r: 3}}
              />
              <Line
                type="monotone"
                dataKey="baselineRmse"
                name="Baseline RMSE"
                stroke="#32C98A"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Request Volume & Avg Latency by Model"
          subtitle="Live serving distribution from inference logs"
          loading={loading && !metrics}
          empty={latencySeries.length === 0}
          emptyMessage="Serve online or batch predictions to inspect model latency and request volume."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencySeries} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="model"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <Legend wrapperStyle={{fontSize: 11, color: '#9299AA'}} />
              <Bar dataKey="requests" name="Requests" fill="#6C9EFF" radius={[4, 4, 0, 0]} maxBarSize={44} />
              <Bar dataKey="avgLatencyMs" name="Avg Latency (ms)" fill="#8B7CFF" radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Data quality & Alert Explanations */}
        <Card>
          <CardHeader
            title="Threshold Policy & Data Quality Summary"
            subtitle="Alert guardrails separating covariate drift from performance degradation"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('drift')}>
                Inspect Drift Details
              </Button>
            }
          />
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F5B942]" />
                <div>
                  <p className="font-medium text-[#F3F4F8]">
                    Covariate / Feature Drift (PSI ≥ {policyPrefs.psiThreshold} or KS p &lt;{' '}
                    {policyPrefs.ksPvalueThreshold})
                  </p>
                  <p className="mt-0.5 text-[#9299AA]">
                    Indicates incoming production inputs shifted from reference training distributions. Triggers a warning alert and Drift Policy retraining evaluation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-md border border-[#232A3C] bg-[#10131B] p-3">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#F16C78]" />
                <div>
                  <p className="font-medium text-[#F3F4F8]">
                    Performance Degradation (Live RMSE ≥ {policyPrefs.rmseDegradationFactor}× Baseline)
                  </p>
                  <p className="mt-0.5 text-[#9299AA]">
                    Confirmed error degradation on labeled actuals. Recommends immediate Performance Policy retraining or rollback.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[#232A3C] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-[#9299AA]">Latest Feature Missingness Rates</span>
                {latestReport && (
                  <StatusBadge
                    label={
                      latestReport.details?.missingnessDriftDetected
                        ? 'MISSINGNESS ALERT'
                        : 'DATA QUALITY OK'
                    }
                    tone={latestReport.details?.missingnessDriftDetected ? 'warning' : 'success'}
                    icon={<ShieldCheck className="h-3 w-3" />}
                  />
                )}
              </div>
              {missingnessEntries.length === 0 ? (
                <p className="text-[#646D82]">No missingness breakdown reported yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {missingnessEntries.map((m) => (
                    <div
                      key={m.feature}
                      className="flex items-center justify-between rounded border border-[#232A3C] bg-[#10131B] px-2.5 py-1.5"
                    >
                      <span className="font-mono text-[11px] text-[#9299AA]">{m.feature}</span>
                      <span className="font-mono text-[11px] font-medium text-[#F3F4F8] tabular-nums">
                        {m.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
