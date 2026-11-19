/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {useCallback, useEffect, useState} from 'react';
import {AppShell} from './components/layout';
import {AuthProvider} from './context/AuthContext';
import {ToastProvider} from './context/ToastContext';
import {WorkspaceProvider} from './context/WorkspaceContext';
import {
  buildHashRoute,
  parseHashRoute,
  type NavPageId,
  type RouteState,
} from './lib/navigation';
import {AuditLogsPage} from './pages/AuditLogsPage';
import {ComparisonPage} from './pages/ComparisonPage';
import {DatasetsPage} from './pages/DatasetsPage';
import {DeploymentsPage} from './pages/DeploymentsPage';
import {DriftDetectionPage} from './pages/DriftDetectionPage';
import {ExperimentsPage} from './pages/ExperimentsPage';
import {ModelDetailsPage} from './pages/ModelDetailsPage';
import {ModelRegistryPage} from './pages/ModelRegistryPage';
import {MonitoringPage} from './pages/MonitoringPage';
import {OverviewPage} from './pages/OverviewPage';
import {PredictionsPage} from './pages/PredictionsPage';
import {RetrainingPage} from './pages/RetrainingPage';
import {SettingsPage} from './pages/SettingsPage';

function WorkspaceRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseHashRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((page: NavPageId, detailId?: string) => {
    const nextHash = buildHashRoute(page, detailId);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      setRoute({page, detailId});
    }
  }, []);

  const renderPage = () => {
    switch (route.page) {
      case 'overview':
        return <OverviewPage onNavigate={navigate} />;
      case 'datasets':
        return <DatasetsPage detailId={route.detailId} onNavigate={navigate} />;
      case 'experiments':
        return <ExperimentsPage onNavigate={navigate} />;
      case 'models':
        return route.detailId ? (
          <ModelDetailsPage modelId={route.detailId} onNavigate={navigate} />
        ) : (
          <ModelRegistryPage onNavigate={navigate} />
        );
      case 'deployments':
        return <DeploymentsPage onNavigate={navigate} />;
      case 'predictions':
        return <PredictionsPage />;
      case 'monitoring':
        return <MonitoringPage onNavigate={navigate} />;
      case 'drift':
        return <DriftDetectionPage onNavigate={navigate} />;
      case 'retraining':
        return <RetrainingPage onNavigate={navigate} />;
      case 'comparison':
        return <ComparisonPage onNavigate={navigate} />;
      case 'audit':
        return <AuditLogsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <OverviewPage onNavigate={navigate} />;
    }
  };

  return (
    <AppShell route={route} onNavigate={navigate}>
      {renderPage()}
    </AppShell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <WorkspaceRouter />
        </WorkspaceProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
