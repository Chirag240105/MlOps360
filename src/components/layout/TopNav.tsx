import {useState} from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import {Breadcrumb, type BreadcrumbItem, Dropdown, StatusBadge} from '../ui';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {useWorkspace} from '../../context/WorkspaceContext';
import {api} from '../../lib/api';
import {formatRelativeTime} from '../../lib/format';
import {getNavItem, type NavPageId, type RouteState} from '../../lib/navigation';
import type {EnvironmentScope} from '../../types/api';

const ENVIRONMENTS: EnvironmentScope[] = ['Development', 'Staging', 'Production'];

export function TopNav({
  route,
  onNavigate,
  onOpenMobileMenu,
  onOpenSearch,
}: {
  route: RouteState;
  onNavigate: (page: NavPageId, detailId?: string) => void;
  onOpenMobileMenu: () => void;
  onOpenSearch: () => void;
}) {
  const {user, setAuthModalOpen, logout} = useAuth();
  const {environment, setEnvironment, unacknowledgedAlerts, triggerGlobalRefresh} = useWorkspace();
  const {pushToast} = useToast();
  const [ackingId, setAckingId] = useState<string | null>(null);

  const navItem = getNavItem(route.page);
  const breadcrumbItems: BreadcrumbItem[] = [
    {label: 'ModelOps360', onClick: () => onNavigate('overview')},
    {
      label: navItem.label,
      onClick: route.detailId ? () => onNavigate(route.page) : undefined,
    },
  ];
  if (route.detailId) {
    breadcrumbItems.push({label: route.detailId});
  }

  const handleAcknowledge = async (eventId: string) => {
    setAckingId(eventId);
    try {
      await api.monitoring.acknowledgeEvent(eventId);
      triggerGlobalRefresh();
      pushToast({variant: 'success', title: 'Drift alert acknowledged'});
    } catch (err: unknown) {
      pushToast({
        variant: 'error',
        title: 'Failed to acknowledge alert',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAckingId(null);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#232A3C] bg-[#0B0D12]/95 px-4 backdrop-blur-sm sm:px-6">
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="rounded-md border border-[#232A3C] bg-[#151923] p-1.5 text-[#9299AA] transition-colors hover:bg-[#1B2130] hover:text-[#F3F4F8] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* Right: global search, notifications, environment, profile */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-8 items-center gap-2 rounded-md border border-[#232A3C] bg-[#151923] px-2.5 text-xs text-[#9299AA] transition-colors hover:border-[#323C56] hover:bg-[#1B2130] hover:text-[#F3F4F8]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-[#2A3348] bg-[#0B0D12] px-1.5 py-0.5 font-mono text-[10px] text-[#646D82] md:inline">
            ⌘K
          </kbd>
        </button>

        {/* Notifications dropdown */}
        <Dropdown
          widthClass="w-80"
          trigger={
            <button
              type="button"
              aria-label="Drift & platform notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[#232A3C] bg-[#151923] text-[#9299AA] transition-colors hover:border-[#323C56] hover:bg-[#1B2130] hover:text-[#F3F4F8]"
            >
              <Bell className="h-3.5 w-3.5" />
              {unacknowledgedAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F16C78] px-1 font-mono text-[10px] font-semibold text-[#0B0D12] tabular-nums">
                  {unacknowledgedAlerts.length > 9 ? '9+' : unacknowledgedAlerts.length}
                </span>
              )}
            </button>
          }
        >
          {(close) => (
            <div className="space-y-2 p-1">
              <div className="flex items-center justify-between border-b border-[#232A3C] px-2 py-1.5">
                <span className="text-xs font-semibold text-[#F3F4F8]">Drift &amp; Alerts</span>
                <span className="font-mono text-[11px] text-[#9299AA] tabular-nums">
                  {unacknowledgedAlerts.length} open
                </span>
              </div>

              {unacknowledgedAlerts.length === 0 ? (
                <div className="px-2 py-5 text-center text-xs text-[#9299AA]">
                  No unacknowledged drift or performance alerts.
                </div>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {unacknowledgedAlerts.slice(0, 6).map((evt) => (
                    <div
                      key={evt.id}
                      className="flex items-start justify-between gap-2 rounded-md border border-[#232A3C] bg-[#151923] p-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 shrink-0 text-[#F5B942]" />
                          <span className="truncate text-xs font-medium text-[#F3F4F8]">
                            {evt.featureName ? `${evt.featureName} drift` : evt.driftType}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-[#9299AA] tabular-nums">
                          {evt.modelName} · {evt.metricName}={evt.metricValue.toFixed(3)} ·{' '}
                          {formatRelativeTime(evt.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={ackingId === evt.id}
                        onClick={() => handleAcknowledge(evt.id)}
                        title="Acknowledge alert"
                        className="shrink-0 rounded border border-[#2A3348] bg-[#1B2130] p-1 text-[#9299AA] transition-colors hover:text-[#32C98A] disabled:opacity-40"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  onNavigate('drift');
                  close();
                }}
                className="w-full rounded-md bg-[#151923] px-2.5 py-1.5 text-center text-xs font-medium text-[#8B7CFF] transition-colors hover:bg-[#151923]/70 hover:text-[#BDB5FF]"
              >
                Open Drift Detection
              </button>
            </div>
          )}
        </Dropdown>

        {/* Environment selector */}
        <Dropdown
          widthClass="w-44"
          trigger={
            <button
              type="button"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#232A3C] bg-[#151923] px-2.5 text-xs font-medium whitespace-nowrap text-[#F3F4F8] transition-colors hover:border-[#323C56] hover:bg-[#1B2130]"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  environment === 'Production'
                    ? 'bg-[#32C98A]'
                    : environment === 'Staging'
                      ? 'bg-[#6C9EFF]'
                      : 'bg-[#8B7CFF]'
                }`}
              />
              <span className="hidden sm:inline">{environment}</span>
              <span className="sm:hidden">{environment.slice(0, 4)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#9299AA]" />
            </button>
          }
        >
          {(close) => (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[#646D82] uppercase">
                Target Environment
              </div>
              {ENVIRONMENTS.map((env) => {
                const selected = env === environment;
                return (
                  <button
                    key={env}
                    type="button"
                    onClick={() => {
                      setEnvironment(env);
                      pushToast({variant: 'info', title: `Environment scope: ${env}`});
                      close();
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      selected
                        ? 'bg-[#8B7CFF]/15 font-medium text-[#F3F4F8]'
                        : 'text-[#9299AA] hover:bg-[#151923] hover:text-[#F3F4F8]'
                    }`}
                  >
                    <span>{env}</span>
                    {selected && <Check className="h-3.5 w-3.5 text-[#8B7CFF]" />}
                  </button>
                );
              })}
            </div>
          )}
        </Dropdown>

        {/* User profile & auth menu */}
        <Dropdown
          widthClass="w-60"
          trigger={
            <button
              type="button"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-[#232A3C] bg-[#151923] px-2.5 text-xs font-medium whitespace-nowrap text-[#F3F4F8] transition-colors hover:border-[#323C56] hover:bg-[#1B2130]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded bg-[#8B7CFF]/20 text-[#8B7CFF]">
                <User className="h-3 w-3" />
              </span>
              <span className="hidden max-w-28 truncate md:inline">
                {user ? user.fullName : 'Local Operator'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#9299AA]" />
            </button>
          }
        >
          {(close) => (
            <div className="space-y-1.5 p-1">
              <div className="rounded-md border border-[#232A3C] bg-[#151923] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[#F3F4F8]">
                    {user ? user.fullName : 'Local Dev Operator'}
                  </span>
                  <StatusBadge
                    label={user ? user.role : 'Operator'}
                    tone={user?.role === 'Viewer' ? 'neutral' : 'accent'}
                  />
                </div>
                <p className="mt-1 truncate text-[11px] text-[#9299AA]">
                  {user ? user.email : 'Unauthenticated local session'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onNavigate('settings');
                  close();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#9299AA] transition-colors hover:bg-[#151923] hover:text-[#F3F4F8]"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Settings &amp; RBAC</span>
              </button>

              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalOpen(true);
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#9299AA] transition-colors hover:bg-[#151923] hover:text-[#F3F4F8]"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Switch Account</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      pushToast({variant: 'info', title: 'Signed out'});
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#F16C78] transition-colors hover:bg-[#F16C78]/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalOpen(true);
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-md bg-[#8B7CFF]/15 px-2.5 py-1.5 text-xs font-medium text-[#BDB5FF] transition-colors hover:bg-[#8B7CFF]/25"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Sign In / Register</span>
                </button>
              )}
            </div>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
