import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  type ColumnDef,
  DataTable,
  MetricCard,
  StatusBadge,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {
  formatDateTime,
  formatFixed,
  jobStatusTone,
} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  DriftEvent,
  FeatureDriftMetric,
  MonitoringReport,
  RegisteredModelSummary,
} from '../types/api';

function recommendedActionForFeature(f: FeatureDriftMetric): string {
  if (!f.drifted) return 'No action required — distribution within reference bounds.';
  if (f.psi >= 0.35 || f.ksPvalue < 0.01) {
    return `Severe shift in ${f.feature}: audit upstream data pipeline & evaluate retraining.`;
  }
  return `Moderate shift in ${f.feature}: collect labeled actuals to verify concept stability.`;
}

export function DriftDetectionPage({
  onNavigate,
}: {
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {policyPrefs, refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [reports, setReports] = useState<MonitoringReport[]>([]);
  const [events, setEvents] = useState<DriftEvent[]>([]);
  const [models, setModels] = useState<RegisteredModelSummary[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [ackFilter, setAckFilter] = useState<'ALL' | 'OPEN' | 'ACK'>('ALL');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDrift = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const modelFilter = selectedModelId !== 'ALL' ? selectedModelId : undefined;
      const [repRes, evtRes, modRes] = await Promise.all([
        api.monitoring.listReports(modelFilter),
        api.monitoring.listDriftEvents({modelId: modelFilter}),
        api.models.list(),
      ]);
      setReports(repRes.reports ?? []);
      setEvents(evtRes.events ?? []);
      setModels(modRes.models ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load drift telemetry');
    } finally {
      setLoading(false);
    }
  }, [selectedModelId]);

  useEffect(() => {
    loadDrift();
  }, [loadDrift, refreshTrigger]);

  const latestReport = useMemo(() => {
    if (reports.length === 0) return null;
    return [...reports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }, [reports]);

  const featureDriftRows = useMemo<FeatureDriftMetric[]>(
    () => latestReport?.details?.featureDrift ?? [],
    [latestReport],
  );

  const distributionChartData = useMemo(
    () =>
      featureDriftRows.map((f) => ({
        feature: f.feature,
        referenceMean: Number((f.referenceMean ?? 0).toFixed(3)),
        productionMean: Number((f.productionMean ?? 0).toFixed(3)),
        psi: Number(f.psi.toFixed(4)),
      })),
    [featureDriftRows],
  );

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (severityFilter !== 'ALL' && evt.severity !== severityFilter) return false;
      if (ackFilter === 'OPEN' && evt.acknowledged) return false;
      if (ackFilter === 'ACK' && !evt.acknowledged) return false;
      return true;
    });
  }, [events, severityFilter, ackFilter]);

  const handleRunScan = async () => {
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setScanning(true);
    try {
      const res = await api.monitoring.run({
        modelId: selectedModelId !== 'ALL' ? selectedModelId : undefined,
        windowLimit: policyPrefs.windowLimit,
        psiThreshold: policyPrefs.psiThreshold,
        ksPvalueThreshold: policyPrefs.ksPvalueThreshold,
        rmseDegradationFactor: policyPrefs.rmseDegradationFactor,
      });
      pushToast({
        variant: res.dataDriftDetected ? 'warning' : 'success',
        title: res.dataDriftDetected ? 'Covariate drift detected' : 'Distributions stable',
        description: `Max PSI ${res.maxPsi.toFixed(4)} · Min KS p=${res.minKsPvalue.toFixed(4)}`,
      });
      triggerGlobalRefresh();
      await loadDrift();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Drift scan failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setScanning(false);
    }
  };

  const handleAcknowledge = async (eventId: string) => {
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setAckingId(eventId);
    try {
      await api.monitoring.acknowledgeEvent(eventId);
      pushToast({variant: 'success', title: 'Drift alert acknowledged'});
      triggerGlobalRefresh();
      await loadDrift();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Failed to acknowledge event',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAckingId(null);
    }
  };

  const openAlertsCount = events.filter((e) => !e.acknowledged).length;
  const driftedFeatureCount = featureDriftRows.filter((f) => f.drifted).length;

  const eventColumns: ColumnDef<DriftEvent>[] = [
    {
      key: 'feature',
      header: 'Feature / Scope',
      sortable: true,
      sortValue: (r) => r.featureName ?? r.driftType,
      render: (r) => (
        <div>
          <span className="font-mono font-medium text-[#F3F4F8]">
            {r.featureName ?? r.driftType}
          </span>
          <p className="text-[11px] text-[#646D82]">{r.driftType}</p>
        </div>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      sortable: true,
      sortValue: (r) => r.modelName,
      render: (r) => <span className="text-xs text-[#F3F4F8]">{r.modelName}</span>,
    },
    {
      key: 'severity',
      header: 'Severity',
      sortable: true,
      sortValue: (r) => r.severity,
      render: (r) => <StatusBadge label={r.severity} tone={jobStatusTone(r.severity)} />,
    },
    {
      key: 'metric',
      header: 'Observed vs Threshold',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.metricValue,
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          <span className="font-semibold text-[#F3F4F8]">
            {r.metricName}={formatFixed(r.metricValue, 4)}
          </span>{' '}
          <span className="text-[#646D82]">(thr {formatFixed(r.thresholdValue, 3)})</span>
        </span>
      ),
    },
    {
      key: 'detectedAt',
      header: 'Detected',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA]">{formatDateTime(r.createdAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <StatusBadge
          label={r.acknowledged ? 'ACKNOWLEDGED' : 'OPEN'}
          tone={r.acknowledged ? 'neutral' : 'warning'}
        />
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (r) =>
        !r.acknowledged ? (
          <Button
            variant="secondary"
            size="sm"
            loading={ackingId === r.id}
            icon={<Check className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation();
              handleAcknowledge(r.id);
            }}
          >
            Acknowledge
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Drift Detection</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Feature-level PSI, Kolmogorov-Smirnov p-values, reference vs production shifts &amp; alerts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter drift by model"
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

          <Button
            variant="primary"
            size="sm"
            loading={scanning}
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={handleRunScan}
          >
            Run Drift Scan
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('retraining')}
          >
            <span>Retraining Policy</span>
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadDrift}
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
          label="Drifted Features (Latest)"
          value={driftedFeatureCount}
          subtext={`${featureDriftRows.length} tracked features`}
          tone={driftedFeatureCount > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Max Feature PSI"
          value={latestReport ? formatFixed(latestReport.maxPsi, 4) : '—'}
          subtext={`Threshold ≥ ${policyPrefs.psiThreshold}`}
          tone={
            latestReport && latestReport.maxPsi >= policyPrefs.psiThreshold ? 'warning' : 'success'
          }
        />
        <MetricCard
          label="Min KS Test p-value"
          value={latestReport ? formatFixed(latestReport.minKsPvalue, 4) : '—'}
          subtext={`Significant if p < ${policyPrefs.ksPvalueThreshold}`}
          tone={
            latestReport && latestReport.minKsPvalue < policyPrefs.ksPvalueThreshold
              ? 'warning'
              : 'info'
          }
        />
        <MetricCard
          label="Unacknowledged Alerts"
          value={openAlertsCount}
          subtext={`${events.length} total recorded alerts`}
          tone={openAlertsCount > 0 ? 'error' : 'success'}
        />
      </div>

      {/* Reference vs Production Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartContainer
          title="Feature PSI Scores (Latest Scan)"
          subtitle={`Population Stability Index per input feature vs threshold ${policyPrefs.psiThreshold}`}
          loading={loading && reports.length === 0}
          empty={distributionChartData.length === 0}
          emptyMessage="Run a drift scan to inspect feature-level PSI scores."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionChartData} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="feature"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <ReferenceLine
                y={policyPrefs.psiThreshold}
                stroke="#F5B942"
                strokeDasharray="4 4"
              />
              <Bar dataKey="psi" name="Feature PSI" fill="#8B7CFF" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Reference vs Production Feature Means"
          subtitle="Comparing training baseline means against recent production scoring window"
          loading={loading && reports.length === 0}
          empty={distributionChartData.length === 0}
          emptyMessage="Run a drift scan to compare reference and production feature distributions."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distributionChartData} margin={{top: 8, right: 12, left: -12, bottom: 0}}>
              <CartesianGrid stroke="#232A3C" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="feature"
                tick={{fill: '#9299AA', fontSize: 11}}
                axisLine={{stroke: '#232A3C'}}
                tickLine={false}
              />
              <YAxis tick={{fill: '#9299AA', fontSize: 11}} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<DarkChartTooltip />} />
              <Legend wrapperStyle={{fontSize: 11, color: '#9299AA'}} />
              <Bar
                dataKey="referenceMean"
                name="Reference Mean"
                fill="#6C9EFF"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="productionMean"
                name="Production Mean"
                fill="#F5B942"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Feature-Level Breakdown Table */}
      <Card>
        <CardHeader
          title="Feature-Level Drift Breakdown & Recommended Actions"
          subtitle={
            latestReport
              ? `Latest scan: ${latestReport.modelName} v${latestReport.versionNumber} · ${latestReport.sampleCount} production samples (${formatDateTime(latestReport.createdAt)})`
              : 'No monitoring scan available yet'
          }
        />
        <CardContent className="p-0">
          {featureDriftRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#9299AA]">
              Run a drift scan to view PSI, KS statistics, mean shifts, and remediation recommendations per feature.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232A3C] bg-[#10131B]/70 text-[#9299AA]">
                    <th className="px-4 py-2.5 font-medium">Feature</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ref Mean</th>
                    <th className="px-4 py-2.5 text-right font-medium">Prod Mean</th>
                    <th className="px-4 py-2.5 text-right font-medium">PSI Score</th>
                    <th className="px-4 py-2.5 text-right font-medium">KS Stat / p-value</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Recommended Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232A3C]">
                  {featureDriftRows.map((row) => (
                    <tr key={row.feature} className="hover:bg-[#1B2130]/40">
                      <td className="px-4 py-2.5 font-mono font-medium text-[#F3F4F8]">
                        {row.feature}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#9299AA] tabular-nums">
                        {formatFixed(row.referenceMean, 3)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#F3F4F8] tabular-nums">
                        {formatFixed(row.productionMean, 3)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                        <span className={row.psi >= policyPrefs.psiThreshold ? 'text-[#F5B942]' : 'text-[#32C98A]'}>
                          {formatFixed(row.psi, 4)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#9299AA] tabular-nums">
                        {formatFixed(row.ksStat, 3)} · p={formatFixed(row.ksPvalue, 4)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={row.drifted ? 'DRIFTED' : 'STABLE'}
                          tone={row.drifted ? 'warning' : 'success'}
                          icon={
                            row.drifted ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <ShieldCheck className="h-3 w-3" />
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5 text-[#9299AA]">
                        {recommendedActionForFeature(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts DataTable */}
      <DataTable
        data={filteredEvents}
        columns={eventColumns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Filter drift alerts by feature, model or type..."
        searchText={(r) => `${r.featureName ?? ''} ${r.modelName} ${r.driftType} ${r.severity}`}
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-8 rounded-md border border-[#232A3C] bg-[#0B0D12] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
            <select
              aria-label="Filter by acknowledgement"
              value={ackFilter}
              onChange={(e) => setAckFilter(e.target.value as 'ALL' | 'OPEN' | 'ACK')}
              className="h-8 rounded-md border border-[#232A3C] bg-[#0B0D12] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
            >
              <option value="ALL">All Alert States</option>
              <option value="OPEN">Open Only</option>
              <option value="ACK">Acknowledged</option>
            </select>
          </div>
        }
        emptyTitle="No drift alerts recorded"
        emptyDescription="When feature PSI or live RMSE crosses configured policy thresholds, alerts appear here."
      />
    </div>
  );
}
