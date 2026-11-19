import {useCallback, useEffect, useMemo, useState} from 'react';
import {ArrowRight, Eye, RefreshCw, ScrollText} from 'lucide-react';
import {
  Button,
  type ColumnDef,
  DataTable,
  Modal,
  StatusBadge,
} from '../components/ui';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {formatDateTime, truncateMiddle} from '../lib/format';
import type {StatusTone} from '../lib/format';
import type {AuditLogEntry} from '../types/api';

function toneForAction(action: string): StatusTone {
  if (action.includes('PROMOTED') || action.includes('SUCCEEDED') || action.includes('CREATED')) {
    return 'success';
  }
  if (action.includes('ROLLED_BACK') || action.includes('FAILED') || action.includes('REJECTED')) {
    return 'error';
  }
  if (action.includes('DRIFT') || action.includes('ALERT')) {
    return 'warning';
  }
  if (action.includes('TRANSITION') || action.includes('TRIGGER')) {
    return 'accent';
  }
  return 'info';
}

function summarizeTransition(details: Record<string, unknown>): string {
  const fromStage = details.fromStage ?? details.previousStage;
  const toStage = details.toStage ?? details.targetStage ?? details.stage;
  if (fromStage && toStage) {
    return `${String(fromStage)} → ${String(toStage)}`;
  }
  if (details.reason) return String(details.reason);
  if (details.endpointName) return `Endpoint: ${String(details.endpointName)}`;
  if (details.modelName) return `Model: ${String(details.modelName)}`;
  const keys = Object.keys(details);
  if (keys.length === 0) return '—';
  return keys
    .slice(0, 2)
    .map((k) => `${k}: ${String(details[k])}`)
    .join(' · ');
}

export function AuditLogsPage() {
  const {refreshTrigger} = useWorkspace();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [allKnownActions, setAllKnownActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState<AuditLogEntry | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.audit.list(200, actionFilter || undefined);
      const list = res.logs ?? [];
      setLogs(list);
      if (!actionFilter) {
        const distinct = Array.from(new Set(list.map((l) => l.action))).sort();
        setAllKnownActions(distinct);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs, refreshTrigger]);

  const actionOptions = useMemo(() => {
    const defaults = [
      'MODEL_PROMOTED',
      'MODEL_STAGE_TRANSITIONED',
      'MODEL_ROLLED_BACK',
      'MODEL_VERSION_REGISTERED',
      'DEPLOYMENT_CREATED',
      'RETRAINING_JOB_TRIGGERED',
      'DRIFT_ALERT_ACKNOWLEDGED',
    ];
    return Array.from(new Set([...allKnownActions, ...defaults])).sort();
  }, [allKnownActions]);

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA] whitespace-nowrap">
          {formatDateTime(r.createdAt)}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      sortable: true,
      sortValue: (r) => r.actor,
      render: (r) => (
        <span className="font-mono text-xs font-medium text-[#F3F4F8]">{r.actor}</span>
      ),
    },
    {
      key: 'action',
      header: 'Event Type',
      sortable: true,
      sortValue: (r) => r.action,
      render: (r) => <StatusBadge label={r.action} tone={toneForAction(r.action)} />,
    },
    {
      key: 'resource',
      header: 'Resource',
      sortable: true,
      sortValue: (r) => `${r.resourceType}:${r.resourceId}`,
      render: (r) => (
        <div className="font-mono text-xs">
          <span className="text-[#9299AA]">{r.resourceType}</span>{' '}
          <span className="text-[#F3F4F8]">{truncateMiddle(r.resourceId, 8, 6)}</span>
        </div>
      ),
    },
    {
      key: 'transition',
      header: 'State Change / Summary',
      render: (r) => (
        <span className="block max-w-sm truncate text-xs text-[#9299AA]">
          {summarizeTransition(r.details ?? {})}
        </span>
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
            setInspected(r);
          }}
        >
          Details
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Audit Logs</h1>
          <p className="mt-1 text-sm text-[#9299AA]">
            Immutable governance record of model promotions, rollbacks, deployments &amp; operator actions
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={loadLogs}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F16C78]/40 bg-[#F16C78]/10 px-4 py-3 text-xs text-[#F16C78]">
          {error}
        </div>
      )}

      <DataTable
        data={logs}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchable
        searchPlaceholder="Search by actor, resource ID or state payload..."
        searchText={(r) =>
          `${r.actor} ${r.action} ${r.resourceType} ${r.resourceId} ${JSON.stringify(r.details)}`
        }
        onRowClick={(r) => setInspected(r)}
        toolbarRight={
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter audit logs by event type"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="h-8 rounded-md border border-[#232A3C] bg-[#0B0D12] px-2.5 text-xs text-[#F3F4F8] focus:border-[#8B7CFF] focus:outline-none"
            >
              <option value="">All Event Types</option>
              {actionOptions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        }
        emptyTitle="No audit events match this filter"
        emptyDescription="Model promotions, rollbacks, retraining jobs, and dataset operations are logged automatically."
      />

      <Modal
        open={Boolean(inspected)}
        onClose={() => setInspected(null)}
        title="Audit Event Inspector"
        description={inspected ? `Event ID: ${inspected.id}` : undefined}
        maxWidthClass="max-w-lg"
      >
        {inspected && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-[#232A3C] bg-[#10131B] p-3">
              <div>
                <span className="text-[#646D82]">Actor</span>
                <p className="mt-0.5 font-mono text-[#F3F4F8]">{inspected.actor}</p>
              </div>
              <div>
                <span className="text-[#646D82]">Event Type</span>
                <div className="mt-1">
                  <StatusBadge label={inspected.action} tone={toneForAction(inspected.action)} />
                </div>
              </div>
              <div>
                <span className="text-[#646D82]">Resource</span>
                <p className="mt-0.5 font-mono text-[#F3F4F8]">
                  {inspected.resourceType}:{inspected.resourceId}
                </p>
              </div>
              <div>
                <span className="text-[#646D82]">Timestamp</span>
                <p className="mt-0.5 font-mono text-[#F3F4F8]">
                  {formatDateTime(inspected.createdAt)}
                </p>
              </div>
            </div>

            {Boolean(inspected.details?.fromStage || inspected.details?.toStage) && (
              <div className="flex items-center gap-2 rounded-md border border-[#232A3C] bg-[#10131B] px-3 py-2">
                <ScrollText className="h-3.5 w-3.5 text-[#8B7CFF]" />
                <span className="text-[#9299AA]">State Transition:</span>
                <span className="font-mono text-[#F3F4F8]">
                  {String(inspected.details.fromStage ?? '—')}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[#646D82]" />
                <span className="font-mono font-semibold text-[#32C98A]">
                  {String(inspected.details.toStage ?? '—')}
                </span>
              </div>
            )}

            <div>
              <p className="mb-1.5 font-medium text-[#9299AA]">Structured Event Details</p>
              <pre className="overflow-x-auto rounded-md border border-[#232A3C] bg-[#0B0D12] p-3 font-mono text-[11px] text-[#F3F4F8]">
                {JSON.stringify(inspected.details ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
