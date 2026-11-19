import {useEffect, useState, type FormEvent} from 'react';
import {
  KeyRound,
  LogIn,
  LogOut,
  RotateCcw,
  Save,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  type ColumnDef,
  DataTable,
  Input,
  Select,
  StatusBadge,
} from '../components/ui';
import {useAuth} from '../context/AuthContext';
import {useToast} from '../context/ToastContext';
import {useWorkspace} from '../context/WorkspaceContext';
import {api} from '../lib/api';
import {formatDateTime} from '../lib/format';
import type {AuthUser, EnvironmentScope} from '../types/api';

export function SettingsPage() {
  const {user, isAdmin, canMutate, setAuthModalOpen, logout} = useAuth();
  const {pushToast} = useToast();
  const {
    environment,
    setEnvironment,
    health,
    architecture,
    policyPrefs,
    updatePolicyPrefs,
  } = useWorkspace();

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Local editable policy form state
  const [psiThreshold, setPsiThreshold] = useState(String(policyPrefs.psiThreshold));
  const [ksPvalueThreshold, setKsPvalueThreshold] = useState(String(policyPrefs.ksPvalueThreshold));
  const [rmseDegradationFactor, setRmseDegradationFactor] = useState(
    String(policyPrefs.rmseDegradationFactor),
  );
  const [minPromotionRmseImprovement, setMinPromotionRmseImprovement] = useState(
    String(policyPrefs.minPromotionRmseImprovement),
  );
  const [windowLimit, setWindowLimit] = useState(String(policyPrefs.windowLimit));

  useEffect(() => {
    setPsiThreshold(String(policyPrefs.psiThreshold));
    setKsPvalueThreshold(String(policyPrefs.ksPvalueThreshold));
    setRmseDegradationFactor(String(policyPrefs.rmseDegradationFactor));
    setMinPromotionRmseImprovement(String(policyPrefs.minPromotionRmseImprovement));
    setWindowLimit(String(policyPrefs.windowLimit));
  }, [policyPrefs]);

  useEffect(() => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    let active = true;
    setUsersLoading(true);
    api.auth
      .listUsers()
      .then((res) => {
        if (active) setUsers(res.users ?? []);
      })
      .catch(() => {
        if (active) setUsers([]);
      })
      .finally(() => {
        if (active) setUsersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const handleSaveThresholds = (e: FormEvent) => {
    e.preventDefault();
    updatePolicyPrefs({
      psiThreshold: Math.max(0.01, Number(psiThreshold) || 0.2),
      ksPvalueThreshold: Math.min(0.5, Math.max(0.001, Number(ksPvalueThreshold) || 0.05)),
      rmseDegradationFactor: Math.max(1.01, Number(rmseDegradationFactor) || 1.25),
      minPromotionRmseImprovement: Math.max(0, Number(minPromotionRmseImprovement) || 0.02),
      windowLimit: Math.max(20, Math.round(Number(windowLimit) || 200)),
    });
    pushToast({
      variant: 'success',
      title: 'Workspace thresholds saved',
      description: 'Applied to Monitoring, Drift Detection, Retraining & Model Comparison.',
    });
  };

  const handleResetServerDefaults = () => {
    const defaults = {
      psiThreshold: architecture?.governanceDefaults.driftPsiThreshold ?? 0.2,
      ksPvalueThreshold: architecture?.governanceDefaults.driftKsPvalueThreshold ?? 0.05,
      rmseDegradationFactor: 1.25,
      minPromotionRmseImprovement:
        architecture?.governanceDefaults.minPromotionRmseImprovement ?? 0.02,
      windowLimit: 200,
    };
    updatePolicyPrefs(defaults);
    pushToast({variant: 'info', title: 'Restored server governance defaults'});
  };

  const userColumns: ColumnDef<AuthUser>[] = [
    {
      key: 'name',
      header: 'Operator',
      sortable: true,
      sortValue: (r) => r.fullName,
      render: (r) => (
        <div>
          <span className="font-medium text-[#F3F4F8]">{r.fullName}</span>
          <p className="text-[11px] text-[#646D82]">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'RBAC Role',
      sortable: true,
      sortValue: (r) => r.role,
      render: (r) => (
        <StatusBadge
          label={r.role}
          tone={r.role === 'Admin' ? 'accent' : r.role === 'ML_Engineer' ? 'info' : 'neutral'}
        />
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (r) => (
        <StatusBadge
          label={r.isActive === false ? 'INACTIVE' : 'ACTIVE'}
          tone={r.isActive === false ? 'error' : 'success'}
        />
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (r) => (
        <span className="font-mono text-[11px] text-[#9299AA]">{formatDateTime(r.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#F3F4F8]">Settings</h1>
        <p className="mt-1 text-sm text-[#9299AA]">
          Account session &amp; RBAC, project control plane configuration, monitoring thresholds &amp; environment scope
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account & RBAC Card */}
        <Card>
          <CardHeader
            title="Account & Access Control"
            subtitle="Operator identity and control-plane RBAC privileges"
            action={
              <StatusBadge
                label={canMutate ? 'Read / Write' : 'Read-Only'}
                tone={canMutate ? 'success' : 'warning'}
              />
            }
          />
          <CardContent className="space-y-4 text-xs">
            <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9299AA]">Active Principal</span>
                <span className="font-medium text-[#F3F4F8]">
                  {user ? user.fullName : 'Local Development Operator'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9299AA]">Email</span>
                <span className="font-mono text-[#F3F4F8]">
                  {user ? user.email : 'anonymous-local-session'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9299AA]">Assigned Role</span>
                <StatusBadge label={user ? user.role : 'Operator (Dev Mode)'} tone="accent" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={user ? <Shield className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
                onClick={() => setAuthModalOpen(true)}
              >
                {user ? 'Switch Account' : 'Sign In / Register'}
              </Button>
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<LogOut className="h-3.5 w-3.5" />}
                  onClick={() => {
                    logout();
                    pushToast({variant: 'info', title: 'Signed out of operator session'});
                  }}
                >
                  Sign Out
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Environment & API Configuration (Read-only, zero secrets) */}
        <Card>
          <CardHeader
            title="Project, API & Environment Configuration"
            subtitle="Runtime architecture and active target environment"
            action={<Server className="h-4 w-4 text-[#6C9EFF]" />}
          />
          <CardContent className="space-y-4 text-xs">
            <Select
              label="Active Workspace Environment Scope"
              value={environment}
              onChange={(e) => {
                const next = e.target.value as EnvironmentScope;
                setEnvironment(next);
                pushToast({variant: 'info', title: `Environment scope: ${next}`});
              }}
              options={[
                {value: 'Production', label: 'Production'},
                {value: 'Staging', label: 'Staging'},
                {value: 'Development', label: 'Development'},
              ]}
            />

            <div className="rounded-md border border-[#232A3C] bg-[#10131B] p-3.5 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">Platform / Use Case</span>
                <span className="font-mono text-[#F3F4F8]">
                  {architecture ? `${architecture.platform} · ${architecture.useCase}` : 'ModelOps360'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">API Base Route</span>
                <span className="font-mono text-[#F3F4F8]">/api/v1</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">Gateway / Server Env</span>
                <span className="font-mono text-[#F3F4F8]">
                  {health ? `${health.checks.nodeRuntime} (${health.environment})` : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#9299AA]">ML Worker Runtime</span>
                <span className="font-mono text-[#F3F4F8]">
                  {health?.checks.pythonWorkerRuntime ?? '—'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#646D82]">
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              <span>API tokens, signing keys, and secrets are never rendered in the client UI.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitoring Thresholds & Retraining Policies */}
      <Card>
        <CardHeader
          title="Monitoring Thresholds & Retraining Policies"
          subtitle="Configure evaluation thresholds sent on monitoring scans and retraining gate checks"
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={handleResetServerDefaults}
            >
              Reset Defaults
            </Button>
          }
        />
        <CardContent>
          <form onSubmit={handleSaveThresholds} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                label="Drift PSI Threshold"
                type="number"
                step="0.01"
                min="0.01"
                value={psiThreshold}
                onChange={(e) => setPsiThreshold(e.target.value)}
                helperText={`Server default: ${architecture?.governanceDefaults.driftPsiThreshold ?? 0.2}`}
              />
              <Input
                label="KS Test p-value Threshold"
                type="number"
                step="0.005"
                min="0.001"
                max="0.5"
                value={ksPvalueThreshold}
                onChange={(e) => setKsPvalueThreshold(e.target.value)}
                helperText={`Server default: ${architecture?.governanceDefaults.driftKsPvalueThreshold ?? 0.05}`}
              />
              <Input
                label="RMSE Degradation Factor"
                type="number"
                step="0.05"
                min="1.01"
                value={rmseDegradationFactor}
                onChange={(e) => setRmseDegradationFactor(e.target.value)}
                helperText="Live RMSE / Baseline RMSE"
              />
              <Input
                label="Min RMSE Improvement"
                type="number"
                step="0.005"
                min="0"
                value={minPromotionRmseImprovement}
                onChange={(e) => setMinPromotionRmseImprovement(e.target.value)}
                helperText={`Server default: ${architecture?.governanceDefaults.minPromotionRmseImprovement ?? 0.02}`}
              />
              <Input
                label="Monitoring Window Size"
                type="number"
                min="20"
                max="2000"
                value={windowLimit}
                onChange={(e) => setWindowLimit(e.target.value)}
                helperText="Recent predictions evaluated"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#232A3C] pt-4 text-xs">
              <span className="text-[#9299AA]">
                Server Retraining Cooldown Gate:{' '}
                <strong className="font-mono text-[#F3F4F8]">
                  {architecture?.governanceDefaults.retrainingCooldownHours ?? 24} hours
                </strong>{' '}
                (enforced server-side)
              </span>
              <Button type="submit" variant="primary" size="sm" icon={<Save className="h-3.5 w-3.5" />}>
                Save Workspace Thresholds
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Admin-Only User Directory */}
      {isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#8B7CFF]" />
            <h2 className="text-sm font-semibold text-[#F3F4F8]">Registered Platform Operators (Admin)</h2>
          </div>
          <DataTable
            data={users}
            columns={userColumns}
            rowKey={(r) => r.id}
            loading={usersLoading}
            emptyTitle="No registered user accounts"
            emptyDescription="Operators who register via the Sign In modal will appear here."
          />
        </div>
      )}
    </div>
  );
}
