import type {ModelStage} from '../types/api';

export type StatusTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'error';

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatFixed(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(decimals);
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(decimals)}%`;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(diffSec)) return '—';
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function truncateMiddle(str: string | null | undefined, left = 8, right = 6): string {
  if (!str) return '—';
  if (str.length <= left + right + 3) return str;
  return `${str.slice(0, left)}…${str.slice(-right)}`;
}

export function stageTone(stage: ModelStage | string): StatusTone {
  switch (stage) {
    case 'Production':
      return 'success';
    case 'Staging':
      return 'info';
    case 'Candidate':
      return 'accent';
    case 'Development':
      return 'neutral';
    case 'Archived':
      return 'warning';
    case 'Rejected':
      return 'error';
    default:
      return 'neutral';
  }
}

export function jobStatusTone(status: string): StatusTone {
  switch (status) {
    case 'SUCCEEDED':
    case 'ACTIVE':
    case 'HEALTHY':
    case 'COMPLETED':
    case 'FINISHED':
      return 'success';
    case 'RUNNING':
    case 'QUEUED':
    case 'DRAINING':
      return 'info';
    case 'REJECTED_BY_GATE':
    case 'COOLDOWN_ACTIVE':
    case 'COVARIATE_DRIFT_WARNING':
    case 'HIGH':
    case 'MEDIUM':
      return 'warning';
    case 'FAILED':
    case 'ROLLED_BACK':
    case 'CRITICAL':
    case 'PERFORMANCE_DEGRADED':
      return 'error';
    default:
      return 'neutral';
  }
}

export function formatAlgorithmLabel(alg: string): string {
  switch (alg) {
    case 'gradient_boosting':
      return 'Gradient Boosting';
    case 'random_forest':
      return 'Random Forest';
    case 'ridge':
      return 'Ridge Regression';
    default:
      return alg;
  }
}
