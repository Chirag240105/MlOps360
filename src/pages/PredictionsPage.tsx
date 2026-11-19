import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {
  CheckCircle2,
  Eye,
  Play,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  type ColumnDef,
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
  formatFixed,
  formatNumber,
  truncateMiddle,
} from '../lib/format';
import type {
  PredictionRecord,
  RegisteredModelSummary,
  ServingMetrics,
} from '../types/api';

const CLEAN_BATCH = [
  {date: '2026-11-18', store_id: 'store_01', sku_id: 'sku_101', price: 24.5, discount_pct: 0.1, is_holiday: 0},
  {date: '2026-11-18', store_id: 'store_02', sku_id: 'sku_102', price: 19.0, discount_pct: 0.0, is_holiday: 0},
  {date: '2026-11-19', store_id: 'store_03', sku_id: 'sku_103', price: 36.0, discount_pct: 0.15, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_01', sku_id: 'sku_104', price: 14.0, discount_pct: 0.05, is_holiday: 0},
  {date: '2026-11-19', store_id: 'store_02', sku_id: 'sku_105', price: 29.0, discount_pct: 0.2, is_holiday: 1},
];

const DRIFTED_BATCH = [
  {date: '2026-11-19', store_id: 'store_01', sku_id: 'sku_101', price: 68.5, discount_pct: 0.45, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_02', sku_id: 'sku_102', price: 72.0, discount_pct: 0.5, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_03', sku_id: 'sku_103', price: 85.0, discount_pct: 0.4, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_01', sku_id: 'sku_104', price: 59.0, discount_pct: 0.48, is_holiday: 1},
  {date: '2026-11-19', store_id: 'store_02', sku_id: 'sku_105', price: 79.0, discount_pct: 0.55, is_holiday: 1},
];

export function PredictionsPage() {
  const {canMutate} = useAuth();
  const {pushToast} = useToast();
  const {refreshTrigger, triggerGlobalRefresh} = useWorkspace();

  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [models, setModels] = useState<RegisteredModelSummary[]>([]);
  const [metrics, setMetrics] = useState<ServingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Single inference form
  const [modelId, setModelId] = useState('');
  const [date, setDate] = useState('2026-11-19');
  const [storeId, setStoreId] = useState('store_01');
  const [skuId, setSkuId] = useState('sku_101');
  const [price, setPrice] = useState('24.5');
  const [discountPct, setDiscountPct] = useState('0.1');
  const [isHoliday, setIsHoliday] = useState('0');
  const [predicting, setPredicting] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [latestResult, setLatestResult] = useState<PredictionRecord | null>(null);

  // Inspector & ground truth
  const [inspected, setInspected] = useState<PredictionRecord | null>(null);
  const [labelTarget, setLabelTarget] = useState<PredictionRecord | null>(null);
  const [actualUnits, setActualUnits] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [predsRes, modelsRes, metricsRes] = await Promise.all([
        api.predictions.list(120),
        api.models.list(),
        api.predictions.metrics(),
      ]);
      setPredictions(predsRes.predictions ?? []);
      setModels(modelsRes.models ?? []);
      setMetrics(metricsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load prediction logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handlePredictSingle = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setPredicting(true);
    try {
      const res = await api.predictions.predictSingle({
        modelId: modelId || undefined,
        date,
        store_id: storeId.trim(),
        sku_id: skuId.trim(),
        price: Number(price),
        discount_pct: Number(discountPct),
        is_holiday: Number(isHoliday),
      });
      setLatestResult(res);
      pushToast({
        variant: 'success',
        title: `Predicted ${res.predictedUnits.toFixed(2)} units`,
        description: `${res.modelName} v${res.versionNumber} · ${formatDurationMs(res.latencyMs)}`,
      });
      triggerGlobalRefresh();
      await loadData();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Inference request failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPredicting(false);
    }
  };

  const handleBatchRun = async (records: typeof CLEAN_BATCH, label: string) => {
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setBatchBusy(true);
    try {
      const res = await api.predictions.predictBatch({
        modelId: modelId || undefined,
        records,
      });
      pushToast({
        variant: 'success',
        title: `${label}: ${res.count} forecasts served`,
        description: `${res.modelName} v${res.versionNumber} · ${formatDurationMs(res.latencyMs)}`,
      });
      triggerGlobalRefresh();
      await loadData();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Batch inference failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBatchBusy(false);
    }
  };

  const handleInspect = async (predictionId: string) => {
    try {
      const full = await api.predictions.get(predictionId);
      setInspected(full);
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Failed to load prediction payload',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleRecordGroundTruth = async (e: FormEvent) => {
    e.preventDefault();
    if (!labelTarget) return;
    if (!canMutate) {
      pushToast({variant: 'warning', title: 'Read-only role', description: 'Sign in as ML_Engineer or Admin.'});
      return;
    }
    setSavingLabel(true);
    try {
      await api.predictions.recordGroundTruth([
        {predictionId: labelTarget.predictionId, actualUnits: Number(actualUnits)},
      ]);
      pushToast({
        variant: 'success',
        title: 'Ground truth recorded',
        description: `Actual units (${actualUnits}) attached to ${truncateMiddle(labelTarget.predictionId, 6, 4)}.`,
      });
      setLabelTarget(null);
      setActualUnits('');
      await loadData();
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Failed to record ground truth',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingLabel(false);
    }
  };

  const columns: ColumnDef<PredictionRecord>[] = [
    {
      key: 'id',
      header: 'Prediction ID',
      render: (r) => (
        <span className="font-mono text-xs text-[#F3F4F8]">
          {truncateMiddle(r.predictionId, 8, 6)}
        </span>
      ),
    },
    {
      key: 'model',
      header: 'Model / Version',
      sortable: true,
      sortValue: (r) => `${r.modelName} v${r.versionNumber}`,
      render: (r) => (
        <div>
          <span className="font-medium text-[#F3F4F8]">{r.modelName}</span>{' '}
          <span className="font-mono text-xs text-[#8B7CFF]">v{r.versionNumber}</span>
          <p className="text-[11px] text-[#646D82]">{formatAlgorithmLabel(r.algorithm)}</p>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Store / SKU',
      render: (r) => (
        <span className="font-mono text-xs text-[#9299AA]">
          {r.storeId} · {r.skuId}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Forecast Date',
      sortable: true,
      sortValue: (r) => r.date,
      render: (r) => <span className="font-mono text-xs text-[#9299AA]">{r.date}</span>,
    },
    {
      key: 'predicted',
      header: 'Predicted Units',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.predictedUnits,
      render: (r) => (
        <span className="font-mono font-semibold text-[#F3F4F8] tabular-nums">
          {formatFixed(r.predictedUnits, 2)}
        </span>
      ),
    },
    {
      key: 'actual',
      header: 'Actual Units',
      align: 'right',
      render: (r) =>
        r.actualUnits !== null && r.actualUnits !== undefined ? (
          <StatusBadge label={formatFixed(r.actualUnits, 2)} tone="success" />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLabelTarget(r);
              setActualUnits(r.predictedUnits.toFixed(1));
            }}
            className="rounded border border-[#2A3348] bg-[#1B2130] px-2 py-0.5 text-[11px] text-[#9299AA] transition-colors hover:border-[#8B7CFF] hover:text-[#F3F4F8]"
          >
            + Label
          </button>
        ),
    },
    {
      key: 'latency',
      header: 'Latency',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.latencyMs,
      render: (r) => (
        <span className="font-mono text-xs text-[#9299AA] tabular-nums">
          {formatDurationMs(r.latencyMs)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
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
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={(e) => {
            e.stopPropagation();
            handleInspect(r.predictionId);
          }}
        >
          Payload
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Predictions</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Real-time Retail Demand inference tester, batch execution &amp; delayed ground-truth labeling
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={batchBusy}
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => handleBatchRun(CLEAN_BATCH, 'Clean sample batch')}
          >
            Run Clean Batch (5)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={batchBusy}
            icon={<Zap className="h-3.5 w-3.5" />}
            onClick={() => handleBatchRun(DRIFTED_BATCH, 'Drifted stress batch')}
          >
            Run Drifted Batch (5)
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
          label="Total Predictions"
          value={formatNumber(metrics?.totalPredictions ?? 0, 0)}
          subtext="Logged inference records"
          tone="accent"
        />
        <MetricCard
          label="Labeled Ground Truth"
          value={formatNumber(metrics?.labeledPredictions ?? 0, 0)}
          subtext="Used for live RMSE monitoring"
          tone="success"
        />
        <MetricCard
          label="Average Latency"
          value={formatDurationMs(metrics?.avgLatencyMs)}
          subtext="End-to-end model scoring"
          tone="info"
        />
        <MetricCard
          label="P95 Latency"
          value={formatDurationMs(metrics?.p95LatencyMs)}
          subtext={`${metrics?.failedRequests ?? 0} failed requests`}
        />
      </div>

      {/* Live Inference Form */}
      <Card>
        <CardHeader
          title="Online Demand Forecaster"
          subtitle="Score a single store/SKU record against the active Production champion or selected model"
          action={
            latestResult && (
              <StatusBadge
                label={`Latest: ${latestResult.predictedUnits.toFixed(2)} units (${formatDurationMs(latestResult.latencyMs)})`}
                tone="success"
                icon={<CheckCircle2 className="h-3 w-3" />}
              />
            )
          }
        />
        <CardContent>
          <form onSubmit={handlePredictSingle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <Select
              label="Target Model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              options={[
                {value: '', label: 'Active Production (Auto)'},
                ...models.map((m) => ({value: m.id, label: m.name})),
              ]}
            />
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Input
              label="Store ID"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              required
            />
            <Input
              label="SKU ID"
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
              required
            />
            <Input
              label="Price ($)"
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <Input
              label="Discount (0-1)"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              required
            />
            <div className="flex flex-col justify-between gap-1.5">
              <Select
                label="Holiday"
                value={isHoliday}
                onChange={(e) => setIsHoliday(e.target.value)}
                options={[
                  {value: '0', label: '0 — Regular'},
                  {value: '1', label: '1 — Holiday'},
                ]}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-7 flex justify-end pt-1">
              <Button
                type="submit"
                variant="primary"
                loading={predicting}
                icon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Run Single Forecast
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DataTable
        data={predictions}
        columns={columns}
        rowKey={(r) => r.predictionId}
        loading={loading}
        searchable
        searchPlaceholder="Filter predictions by ID, model, store or SKU..."
        searchText={(r) =>
          `${r.predictionId} ${r.modelName} ${r.storeId} ${r.skuId} ${r.date}`
        }
        emptyTitle="No predictions logged yet"
        emptyDescription="Submit an online forecast above or run a sample batch to populate live inference telemetry."
      />

      {/* Payload Inspector Modal */}
      <Modal
        open={Boolean(inspected)}
        onClose={() => setInspected(null)}
        title="Prediction Payload Inspector"
        description={
          inspected ? `Prediction ID: ${inspected.predictionId}` : undefined
        }
      >
        {inspected && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-[#232A3C] bg-[#10131B] p-3">
              <div>
                <span className="text-[#646D82]">Model Version</span>
                <p className="mt-0.5 font-mono text-[#F3F4F8]">
                  {inspected.modelName} v{inspected.versionNumber}
                </p>
              </div>
              <div>
                <span className="text-[#646D82]">Predicted / Actual</span>
                <p className="mt-0.5 font-mono text-[#F3F4F8] tabular-nums">
                  {formatFixed(inspected.predictedUnits, 2)} /{' '}
                  {inspected.actualUnits !== null ? formatFixed(inspected.actualUnits, 2) : 'Pending'}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 font-medium text-[#9299AA]">Input Feature Vector</p>
              <pre className="overflow-x-auto rounded-md border border-[#232A3C] bg-[#0B0D12] p-3 font-mono text-[11px] text-[#F3F4F8]">
                {JSON.stringify(inspected.features ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Ground Truth Reconciliation Modal */}
      <Modal
        open={Boolean(labelTarget)}
        onClose={() => setLabelTarget(null)}
        title="Record Ground-Truth Actuals"
        description={
          labelTarget
            ? `Attach observed units_sold for ${labelTarget.storeId} · ${labelTarget.skuId} (${labelTarget.date}).`
            : undefined
        }
        maxWidthClass="max-w-sm"
      >
        <form onSubmit={handleRecordGroundTruth} className="space-y-4">
          <Input
            label="Observed Actual Units Sold"
            type="number"
            step="0.01"
            min="0"
            value={actualUnits}
            onChange={(e) => setActualUnits(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setLabelTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingLabel}>
              Save Ground Truth
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
