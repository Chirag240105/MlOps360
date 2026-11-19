import {useCallback, useEffect, useState, type ChangeEvent, type FormEvent} from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Play,
  Plus,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  type ColumnDef,
  DataTable,
  EmptyState,
  Input,
  MetricCard,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {formatDateTime, formatFixed, formatNumber, truncateMiddle} from '../lib/format';
import type {NavPageId} from '../lib/navigation';
import type {
  BaselineBenchmarkResponse,
  DatasetEdaResponse,
  DatasetSummary,
} from '../types/api';

const CANONICAL_SCHEMA = [
  {column: 'date', type: 'DATE (YYYY-MM-DD)', role: 'Timestamp', constraint: 'Valid calendar date'},
  {column: 'store_id', type: 'STRING', role: 'Entity Key', constraint: 'Non-empty store ID'},
  {column: 'sku_id', type: 'STRING', role: 'Entity Key', constraint: 'Non-empty SKU ID'},
  {column: 'category', type: 'STRING', role: 'Categorical Feature', constraint: 'Product category'},
  {column: 'price', type: 'FLOAT', role: 'Numeric Feature', constraint: 'Strictly > 0'},
  {column: 'discount_pct', type: 'FLOAT', role: 'Numeric Feature', constraint: '0.0 to 1.0'},
  {column: 'is_holiday', type: 'INTEGER (0|1)', role: 'Binary Feature', constraint: '0 or 1 flag'},
  {column: 'units_sold', type: 'FLOAT', role: 'Forecast Target', constraint: '>= 0'},
];

const SAMPLE_CSV = [
  'date,store_id,sku_id,category,price,discount_pct,is_holiday,units_sold',
  '2026-10-01,store_01,sku_101,Beverages,24.5,0.1,0,42',
  '2026-10-02,store_01,sku_101,Beverages,24.5,0.0,0,38',
  '2026-10-03,store_01,sku_101,Beverages,22.0,0.15,1,61',
  '2026-10-04,store_02,sku_102,Snacks,14.0,0.0,0,29',
].join('\n');

export function DatasetsPage({
  detailId,
  onNavigate,
}: {
  detailId?: string;
  onNavigate: (page: NavPageId, detailId?: string) => void;
}) {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {refreshTrigger} = useWorkspace();

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view state
  const [eda, setEda] = useState<DatasetEdaResponse | null>(null);
  const [edaLoading, setEdaLoading] = useState(false);
  const [baseline, setBaseline] = useState<BaselineBenchmarkResponse | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);

  // Modals
  const [genOpen, setGenOpen] = useState(false);
  const [genName, setGenName] = useState('retail_demand_ref');
  const [genDays, setGenDays] = useState('180');
  const [genScenario, setGenScenario] = useState<'reference' | 'corrupted' | 'drifted'>('reference');
  const [genSeed, setGenSeed] = useState('42');
  const [genDesc, setGenDesc] = useState('');
  const [genSubmitting, setGenSubmitting] = useState(false);

  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestName, setIngestName] = useState('retail_demand_upload');
  const [ingestDesc, setIngestDesc] = useState('');
  const [ingestCsv, setIngestCsv] = useState('');
  const [ingestSubmitting, setIngestSubmitting] = useState(false);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.datasets.list();
      setDatasets(res.datasets ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets, refreshTrigger]);

  useEffect(() => {
    if (!detailId) {
      setEda(null);
      setBaseline(null);
      return;
    }
    let active = true;
    setEdaLoading(true);
    setBaseline(null);
    api.datasets
      .eda(detailId)
      .then((res) => {
        if (active) setEda(res);
      })
      .catch((err: unknown) => {
        if (active) {
          pushToast({
            variant: 'error',
            title: 'Failed to load dataset EDA',
            description: err instanceof Error ? err.message : undefined,
          });
        }
      })
      .finally(() => {
        if (active) setEdaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [detailId, pushToast]);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setGenSubmitting(true);
    try {
      const res = await api.datasets.generate({
        name: genName.trim(),
        days: Number(genDays) || 180,
        seed: Number(genSeed) || 42,
        scenario: genScenario,
        description: genDesc.trim() || undefined,
      });
      pushToast({
        variant: res.validationPassed ? 'success' : 'warning',
        title: `Dataset ${res.name} v${res.versionNumber} generated`,
        description: `${res.rowCount.toLocaleString()} rows · Validation ${res.validationPassed ? 'PASSED' : 'FAILED'}`,
      });
      setGenOpen(false);
      await loadDatasets();
      onNavigate('datasets', res.datasetId);
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Dataset generation failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setGenSubmitting(false);
    }
  };

  const handleCsvFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setIngestCsv(reader.result);
        if (!ingestName || ingestName === 'retail_demand_upload') {
          setIngestName(file.name.replace(/\.csv$/i, ''));
        }
      }
    };
    reader.readAsText(file);
  };

  const handleIngest = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setIngestSubmitting(true);
    try {
      const res = await api.datasets.ingest({
        name: ingestName.trim(),
        csvContent: ingestCsv,
        description: ingestDesc.trim() || undefined,
      });
      pushToast({
        variant: res.validationPassed ? 'success' : 'warning',
        title: `Ingested ${res.name} v${res.versionNumber}`,
        description: `${res.rowCount.toLocaleString()} rows · Validation ${res.validationPassed ? 'PASSED' : 'FAILED'}`,
      });
      setIngestOpen(false);
      setIngestCsv('');
      await loadDatasets();
      onNavigate('datasets', res.datasetId);
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'CSV ingestion failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIngestSubmitting(false);
    }
  };

  const handleRunBaseline = async (datasetId: string) => {
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setBaselineRunning(true);
    try {
      const res = await api.datasets.runBaseline(datasetId);
      setBaseline(res);
      pushToast({
        variant: 'success',
        title: 'Baseline benchmark completed',
        description: `Evaluated ${Object.keys(res.baselines).length} baseline estimators on v${res.versionNumber}.`,
      });
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Baseline benchmark failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBaselineRunning(false);
    }
  };

  // Detail View
  if (detailId) {
    const summary = datasets.find((d) => d.id === detailId);
    const totalRows = summary?.latestVersion?.rowCount ?? 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('datasets')}
            >
              All Datasets
            </Button>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">
                {eda?.name ?? summary?.name ?? 'Dataset Details'}
              </h1>
              {eda && (
                <>
                  <StatusBadge label={`v${eda.versionNumber}`} tone="accent" />
                  <StatusBadge
                    label={eda.validationPassed ? 'Validation Passed' : 'Validation Failed'}
                    tone={eda.validationPassed ? 'success' : 'error'}
                  />
                </>
              )}
            </div>
            <p className="font-mono text-xs text-[#9299AA]">
              Dataset ID: {detailId}
              {eda ? ` · Hash: ${truncateMiddle(eda.versionHash, 10, 8)}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={baselineRunning}
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={() => handleRunBaseline(detailId)}
            >
              Run Baseline Benchmark
            </Button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Record Count"
            value={summary?.latestVersion ? formatNumber(summary.latestVersion.rowCount, 0) : '—'}
            subtext={summary?.latestVersion?.scenario ? `Scenario: ${summary.latestVersion.scenario}` : undefined}
            tone="accent"
          />
          <MetricCard
            label="Feature Columns"
            value={CANONICAL_SCHEMA.length}
            subtext="7 inputs + units_sold target"
            tone="info"
          />
          <MetricCard
            label="Date Span"
            value={eda?.eda ? `${eda.eda.dateRange.distinctDays} days` : '—'}
            subtext={
              eda?.eda?.dateRange.start
                ? `${eda.eda.dateRange.start} → ${eda.eda.dateRange.end}`
                : 'No date span available'
            }
          />
          <MetricCard
            label="Entity Cardinality"
            value={
              eda?.eda
                ? `${eda.eda.cardinality.stores.length} stores · ${eda.eda.cardinality.skus.length} SKUs`
                : '—'
            }
            subtext={eda?.eda ? `${eda.eda.zeroDemandRows} zero-demand rows` : undefined}
          />
        </div>

        {/* Validation Checks & Data Quality */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Data Quality & Validation Report"
              subtitle="Schema, bounds, freshness & referential integrity rules"
            />
            <CardContent className="p-0">
              {edaLoading ? (
                <div className="p-6 text-xs text-[#9299AA]">Running EDA inspection...</div>
              ) : !eda || eda.checks.length === 0 ? (
                <div className="p-6 text-xs text-[#9299AA]">No validation checks returned.</div>
              ) : (
                <div className="divide-y divide-[#232A3C]">
                  {eda.checks.map((chk) => (
                    <div key={chk.rule} className="flex items-start justify-between gap-3 px-5 py-3 text-xs">
                      <div className="flex items-start gap-2.5">
                        {chk.passed ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#32C98A]" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F16C78]" />
                        )}
                        <div>
                          <p className="font-mono font-medium text-[#F3F4F8]">{chk.rule}</p>
                          <p className="mt-0.5 text-[#9299AA]">{chk.message}</p>
                        </div>
                      </div>
                      <StatusBadge
                        label={chk.passed ? 'PASS' : chk.severity.toUpperCase()}
                        tone={chk.passed ? 'success' : chk.severity === 'warning' ? 'warning' : 'error'}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Schema Preview & Missing-Value Summary"
              subtitle="Expected forecasting columns and observed null/empty counts"
            />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#232A3C] bg-[#10131B]/70 text-[#9299AA]">
                      <th className="px-4 py-2.5 font-medium">Column</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Role</th>
                      <th className="px-4 py-2.5 text-right font-medium">Missing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232A3C]">
                    {CANONICAL_SCHEMA.map((col) => {
                      const missing = eda?.eda?.missingCounts?.[col.column] ?? 0;
                      const pct = totalRows > 0 ? (missing / totalRows) * 100 : 0;
                      return (
                        <tr key={col.column} className="hover:bg-[#1B2130]/40">
                          <td className="px-4 py-2.5 font-mono font-medium text-[#F3F4F8]">
                            {col.column}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-[#9299AA]">
                            {col.type}
                          </td>
                          <td className="px-4 py-2.5 text-[#9299AA]">{col.role}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            <span className={missing > 0 ? 'text-[#F5B942]' : 'text-[#32C98A]'}>
                              {missing} ({pct.toFixed(1)}%)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Numeric Summary & Version Metadata */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Numeric Distribution Summary"
              subtitle="Observed quantiles across active dataset version"
            />
            <CardContent className="p-0">
              {!eda?.eda || Object.keys(eda.eda.numericSummary).length === 0 ? (
                <div className="p-6 text-xs text-[#9299AA]">
                  Numeric distribution statistics unavailable for this dataset version.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#232A3C] bg-[#10131B]/70 text-[#9299AA]">
                        <th className="px-4 py-2.5 font-medium">Feature</th>
                        <th className="px-4 py-2.5 text-right font-medium">Min</th>
                        <th className="px-4 py-2.5 text-right font-medium">Median</th>
                        <th className="px-4 py-2.5 text-right font-medium">Mean</th>
                        <th className="px-4 py-2.5 text-right font-medium">Std</th>
                        <th className="px-4 py-2.5 text-right font-medium">Max</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232A3C]">
                      {Object.entries(eda.eda.numericSummary).map(([feature, stats]) => (
                        <tr key={feature} className="hover:bg-[#1B2130]/40">
                          <td className="px-4 py-2.5 font-mono font-medium text-[#F3F4F8]">
                            {feature}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#9299AA] tabular-nums">
                            {formatFixed(stats.min, 2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#9299AA] tabular-nums">
                            {formatFixed(stats.median, 2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#F3F4F8] tabular-nums">
                            {formatFixed(stats.mean, 2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#9299AA] tabular-nums">
                            {formatFixed(stats.std, 2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#9299AA] tabular-nums">
                            {formatFixed(stats.max, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Latest Version Record"
              subtitle="Content-addressed dataset snapshot"
            />
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">Version</span>
                <span className="font-mono text-[#F3F4F8]">
                  v{eda?.versionNumber ?? summary?.latestVersion?.versionNumber ?? 1}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">SHA-256 Hash</span>
                <span className="font-mono text-[#F3F4F8]">
                  {truncateMiddle(eda?.versionHash ?? summary?.latestVersion?.versionHash, 8, 6)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">Scenario</span>
                <span className="font-mono text-[#F3F4F8]">
                  {summary?.latestVersion?.scenario ?? '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">Registered</span>
                <span className="font-mono text-[#F3F4F8]">
                  {formatDateTime(summary?.latestVersion?.createdAt)}
                </span>
              </div>
              <p className="border-t border-[#232A3C] pt-3 text-[11px] leading-relaxed text-[#646D82]">
                Only the latest immutable snapshot per dataset family is exposed by the current registry endpoint.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Baseline benchmark card */}
        {baseline && (
          <Card>
            <CardHeader
              title="Baseline Forecasting Benchmarks"
              subtitle={`Temporal split: ${baseline.split.trainRows} train / ${baseline.split.valRows} val / ${baseline.split.testRows} test`}
            />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#232A3C] bg-[#10131B]/70 text-[#9299AA]">
                      <th className="px-4 py-2.5 font-medium">Baseline Estimator</th>
                      <th className="px-4 py-2.5 text-right font-medium">Val RMSE</th>
                      <th className="px-4 py-2.5 text-right font-medium">Val MAE</th>
                      <th className="px-4 py-2.5 text-right font-medium">Test RMSE</th>
                      <th className="px-4 py-2.5 text-right font-medium">Test MAE</th>
                      <th className="px-4 py-2.5 text-right font-medium">Test R²</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232A3C]">
                    {Object.entries(baseline.baselines).map(([key, item]) => (
                      <tr key={key} className="hover:bg-[#1B2130]/40">
                        <td className="px-4 py-2.5 font-medium text-[#F3F4F8]">{item.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(item.validationMetrics.rmse, 3)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(item.validationMetrics.mae, 3)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#8B7CFF] tabular-nums">
                          {formatFixed(item.testMetrics.rmse, 3)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(item.testMetrics.mae, 3)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatFixed(item.testMetrics.r2, 3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // List View Columns
  const columns: ColumnDef<DatasetSummary>[] = [
    {
      key: 'name',
      header: 'Dataset Name',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 shrink-0 text-[#6C9EFF]" />
            <span className="truncate font-medium text-[#F3F4F8]">{row.name}</span>
          </div>
          {row.description && (
            <p className="mt-0.5 max-w-xs truncate text-[11px] text-[#646D82]">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      sortable: true,
      sortValue: (row) => row.latestVersion?.versionNumber ?? 0,
      render: (row) =>
        row.latestVersion ? (
          <div className="font-mono text-xs">
            <span className="font-medium text-[#F3F4F8]">v{row.latestVersion.versionNumber}</span>{' '}
            <span className="text-[#646D82]">{truncateMiddle(row.latestVersion.versionHash, 6, 4)}</span>
          </div>
        ) : (
          <span className="text-[#646D82]">—</span>
        ),
    },
    {
      key: 'scenario',
      header: 'Scenario',
      render: (row) => (
        <StatusBadge
          label={row.latestVersion?.scenario ?? 'unknown'}
          tone={
            row.latestVersion?.scenario === 'corrupted'
              ? 'error'
              : row.latestVersion?.scenario === 'drifted'
                ? 'warning'
                : 'info'
          }
        />
      ),
    },
    {
      key: 'rows',
      header: 'Records',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.latestVersion?.rowCount ?? 0,
      render: (row) => (
        <span className="font-mono tabular-nums">
          {row.latestVersion ? formatNumber(row.latestVersion.rowCount, 0) : '—'}
        </span>
      ),
    },
    {
      key: 'features',
      header: 'Features',
      align: 'right',
      render: () => <span className="font-mono text-[#9299AA] tabular-nums">{CANONICAL_SCHEMA.length}</span>,
    },
    {
      key: 'validation',
      header: 'Validation',
      render: (row) =>
        row.latestVersion ? (
          <StatusBadge
            label={row.latestVersion.validationPassed ? 'PASSED' : 'FAILED'}
            tone={row.latestVersion.validationPassed ? 'success' : 'error'}
          />
        ) : (
          <StatusBadge label="NONE" tone="neutral" />
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortValue: (row) => new Date(row.latestVersion?.createdAt ?? row.createdAt).getTime(),
      render: (row) => (
        <span className="font-mono text-[11px] text-[#9299AA]">
          {formatDateTime(row.latestVersion?.createdAt ?? row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Datasets</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Versioned Retail Demand datasets, schema validation checks &amp; EDA profiles
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload className="h-3.5 w-3.5" />}
            onClick={() => setIngestOpen(true)}
          >
            Import CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setGenOpen(true)}
          >
            Generate Dataset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={loadDatasets}
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

      <DataTable
        data={datasets}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Search datasets by name or scenario..."
        searchText={(r) => `${r.name} ${r.description} ${r.latestVersion?.scenario ?? ''}`}
        onRowClick={(r) => onNavigate('datasets', r.id)}
        emptyTitle="No datasets registered yet"
        emptyDescription="Generate a deterministic synthetic Retail Demand dataset or ingest a CSV file to run schema validation and training."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setGenOpen(true)}>
            Generate Synthetic Dataset
          </Button>
        }
      />

      {/* Generate Dataset Modal */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate Synthetic Retail Dataset"
        description="Creates an immutable dataset version via the Python ML generator and runs schema/quality checks."
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <Input
            label="Dataset Name"
            value={genName}
            onChange={(e) => setGenName(e.target.value)}
            required
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Days"
              type="number"
              min={30}
              max={730}
              value={genDays}
              onChange={(e) => setGenDays(e.target.value)}
            />
            <Select
              label="Scenario"
              value={genScenario}
              onChange={(e) => setGenScenario(e.target.value as 'reference' | 'corrupted' | 'drifted')}
              options={[
                {value: 'reference', label: 'Reference (Clean)'},
                {value: 'drifted', label: 'Drifted (Covariate shift)'},
                {value: 'corrupted', label: 'Corrupted (Validation fail)'},
              ]}
            />
            <Input
              label="Seed"
              type="number"
              value={genSeed}
              onChange={(e) => setGenSeed(e.target.value)}
            />
          </div>
          <Input
            label="Description (optional)"
            placeholder="e.g. 180-day baseline demand snapshot"
            value={genDesc}
            onChange={(e) => setGenDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={genSubmitting}>
              Generate &amp; Validate
            </Button>
          </div>
        </form>
      </Modal>

      {/* CSV Upload / Ingest Modal */}
      <Modal
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        title="Import CSV Dataset"
        description="Upload or paste CSV rows conforming to the 8-column retail demand forecasting schema."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleIngest} className="space-y-4">
          <Input
            label="Dataset Name"
            value={ingestName}
            onChange={(e) => setIngestName(e.target.value)}
            required
          />
          <Input
            label="Description (optional)"
            value={ingestDesc}
            onChange={(e) => setIngestDesc(e.target.value)}
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#9299AA]">CSV File or Content</label>
              <button
                type="button"
                onClick={() => setIngestCsv(SAMPLE_CSV)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#8B7CFF] hover:text-[#BDB5FF]"
              >
                <FileSpreadsheet className="h-3 w-3" />
                <span>Insert valid sample CSV</span>
              </button>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileChange}
              className="block w-full rounded-md border border-[#232A3C] bg-[#0B0D12] px-3 py-2 text-xs text-[#9299AA] file:mr-3 file:rounded file:border-0 file:bg-[#1B2130] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[#F3F4F8]"
            />
          </div>
          <Textarea
            label="CSV Payload"
            rows={7}
            className="font-mono text-xs"
            placeholder={SAMPLE_CSV}
            value={ingestCsv}
            onChange={(e) => setIngestCsv(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIngestOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={ingestSubmitting}>
              Ingest &amp; Validate
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
