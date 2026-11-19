import type {LucideIcon} from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Database,
  FlaskConical,
  GitCompare,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  ScrollText,
  Settings,
  Sparkles,
} from 'lucide-react';

export type NavPageId =
  | 'overview'
  | 'datasets'
  | 'experiments'
  | 'models'
  | 'deployments'
  | 'predictions'
  | 'monitoring'
  | 'drift'
  | 'retraining'
  | 'comparison'
  | 'audit'
  | 'settings';

export interface NavItem {
  id: NavPageId;
  label: string;
  description: string;
  group: 'Lifecycle' | 'Observability' | 'Governance';
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Platform KPIs, lifecycle health & telemetry',
    group: 'Lifecycle',
    icon: LayoutDashboard,
  },
  {
    id: 'datasets',
    label: 'Datasets',
    description: 'Dataset versions, validation & EDA',
    group: 'Lifecycle',
    icon: Database,
  },
  {
    id: 'experiments',
    label: 'Experiments',
    description: 'Training runs, metrics & hyperparameters',
    group: 'Lifecycle',
    icon: FlaskConical,
  },
  {
    id: 'models',
    label: 'Model Registry',
    description: 'Model versions, stages, promotion & rollback',
    group: 'Lifecycle',
    icon: Layers,
  },
  {
    id: 'deployments',
    label: 'Deployments',
    description: 'Serving endpoints, environments & rollbacks',
    group: 'Lifecycle',
    icon: Rocket,
  },
  {
    id: 'predictions',
    label: 'Predictions',
    description: 'Online forecasting, batch inference & labels',
    group: 'Lifecycle',
    icon: Sparkles,
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    description: 'Live RMSE, latency & drift time-series',
    group: 'Observability',
    icon: Activity,
  },
  {
    id: 'drift',
    label: 'Drift Detection',
    description: 'Feature PSI, KS tests & drift alerts',
    group: 'Observability',
    icon: AlertTriangle,
  },
  {
    id: 'retraining',
    label: 'Retraining Jobs',
    description: 'Automated & policy-gated challenger retraining',
    group: 'Observability',
    icon: RefreshCw,
  },
  {
    id: 'comparison',
    label: 'Model Comparison',
    description: 'Champion vs challenger promotion gate analysis',
    group: 'Observability',
    icon: GitCompare,
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    description: 'Immutable lifecycle transitions & actor history',
    group: 'Governance',
    icon: ScrollText,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Workspace thresholds, policies & RBAC',
    group: 'Governance',
    icon: Settings,
  },
];

export interface RouteState {
  page: NavPageId;
  detailId?: string;
}

const VALID_PAGES = new Set<string>(NAV_ITEMS.map((item) => item.id));

export function parseHashRoute(hash: string): RouteState {
  const cleaned = hash.replace(/^#\/?/, '').trim();
  if (!cleaned) return {page: 'overview'};
  const [segment, ...rest] = cleaned.split('/');
  const page: NavPageId = VALID_PAGES.has(segment) ? (segment as NavPageId) : 'overview';
  const detailId = rest.length > 0 && rest[0] ? decodeURIComponent(rest[0]) : undefined;
  return {page, detailId};
}

export function buildHashRoute(page: NavPageId, detailId?: string): string {
  return detailId ? `#/${page}/${encodeURIComponent(detailId)}` : `#/${page}`;
}

export function getNavItem(page: NavPageId): NavItem {
  return NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0];
}
