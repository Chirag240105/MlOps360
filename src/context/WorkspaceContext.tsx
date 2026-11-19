import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {api} from '../lib/api';
import type {
  ArchitecturePayload,
  DriftEvent,
  EnvironmentScope,
  HealthPayload,
} from '../types/api';

const PREFS_STORAGE_KEY = 'modelops360_workspace_prefs';

export interface PolicyRunPreferences {
  psiThreshold: number;
  ksPvalueThreshold: number;
  rmseDegradationFactor: number;
  minPromotionRmseImprovement: number;
  windowLimit: number;
}

const DEFAULT_PREFS: PolicyRunPreferences = {
  psiThreshold: 0.2,
  ksPvalueThreshold: 0.05,
  rmseDegradationFactor: 1.25,
  minPromotionRmseImprovement: 0.02,
  windowLimit: 200,
};

interface WorkspaceContextValue {
  environment: EnvironmentScope;
  setEnvironment: (env: EnvironmentScope) => void;
  health: HealthPayload | null;
  architecture: ArchitecturePayload | null;
  unacknowledgedAlerts: DriftEvent[];
  policyPrefs: PolicyRunPreferences;
  updatePolicyPrefs: (next: PolicyRunPreferences) => void;
  refreshTrigger: number;
  triggerGlobalRefresh: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function loadStoredPrefs(): PolicyRunPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return {...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<PolicyRunPreferences>)};
  } catch {
    return DEFAULT_PREFS;
  }
}

export function WorkspaceProvider({children}: {children: ReactNode}) {
  const [environment, setEnvironment] = useState<EnvironmentScope>('Production');
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [architecture, setArchitecture] = useState<ArchitecturePayload | null>(null);
  const [unacknowledgedAlerts, setUnacknowledgedAlerts] = useState<DriftEvent[]>([]);
  const [policyPrefs, setPolicyPrefs] = useState<PolicyRunPreferences>(() => loadStoredPrefs());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  const updatePolicyPrefs = useCallback((next: PolicyRunPreferences) => {
    setPolicyPrefs(next);
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage limits
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.system.health().catch(() => null),
      api.system.architecture().catch(() => null),
      api.monitoring.listDriftEvents({acknowledged: false}).catch(() => ({events: []})),
    ]).then(([h, a, alerts]) => {
      if (!active) return;
      if (h) setHealth(h);
      if (a) setArchitecture(a);
      setUnacknowledgedAlerts(alerts.events ?? []);
    });
    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  return (
    <WorkspaceContext.Provider
      value={{
        environment,
        setEnvironment,
        health,
        architecture,
        unacknowledgedAlerts,
        policyPrefs,
        updatePolicyPrefs,
        refreshTrigger,
        triggerGlobalRefresh,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
