# ModelOps360 UI Architecture & Design System

## Design Tokens (`src/index.css` & `index.html`)

- **Typography**: `Plus Jakarta Sans` (UI sans) and `JetBrains Mono` (monospace metrics, IDs, hashes, tabular numeric cells with `.tabular-nums`).
- **Dark Surfaces**:
  - Canvas background: `#0B0D12`
  - Sidebar navigation: `#10131B`
  - Card surface: `#151923` with `1px solid #232A3C` borders
  - Elevated / hover / popover surface: `#1B2130`
- **Accents & Status**:
  - Primary Accent (Purple): `#8B7CFF`
  - Secondary Accent (Blue): `#6C9EFF`
  - Success: `#32C98A`
  - Warning: `#F5B942`
  - Error: `#F16C78`
  - Primary Text: `#F3F4F8` | Secondary Text: `#9299AA` | Muted Text: `#646D82`

## Reusable Component Library (`src/components/ui/`)

- `Button` (`primary` | `secondary` | `ghost` | `danger`, loading spinner, icon slot)
- `Input` / `Textarea` (label, helper text, inline error, left icon)
- `Select` (accessible native `<select>` styled cleanly for dark surfaces)
- `Dropdown` (animated popover menu with outside-click & Escape handling)
- `Card` / `CardHeader` / `CardContent` (single-elevation crisp bordered containers)
- `DataTable` (client-side search, sortable numeric/string columns, pagination, loading & empty states)
- `StatusBadge` (semantic status indicator with text & tone dot)
- `MetricCard` (KPI readout with monospace `tabular-nums` value and optional click drill-down)
- `Modal` / `ConfirmationDialog` (Escape & backdrop dismissal, danger/primary variants)
- `Tooltip` (accessible hover/focus tooltip for collapsed nav & icon controls)
- `Tabs` (`segmented` and `underline` modes with optional counts)
- `Breadcrumb` (clickable hierarchy path)
- `Pagination` (range counter & Prev/Next controls)
- `EmptyState` / `LoadingSkeleton` (`SkeletonBlock`, `CardGridSkeleton`, `TableSkeleton`)
- `ChartContainer` (uniform Recharts wrapper with loading skeleton & empty state fallback)

## Context & Data Integration (`src/context/`, `src/lib/`, `src/types/`)

- `src/types/api.ts`: Full TypeScript request/response schemas matching `/api/v1/*`.
- `src/lib/api.ts`: Typed HTTP wrapper injecting Bearer token from `localStorage` and throwing structured `ApiRequestError`.
- `src/lib/format.ts`: Deterministic number, decimal, duration, relative timestamp, hash truncation, and stage/status mappers.
- `src/context/ToastContext.tsx`: Toast notification queue (`success`, `warning`, `error`, `info`).
- `src/context/AuthContext.tsx`: Real JWT sign-in/register/session hydration & RBAC (`canMutate`, `isAdmin`).
- `src/context/WorkspaceContext.tsx`: Live health/alerts polling, environment selector (`Development` / `Staging` / `Production`), and workspace threshold defaults.

## Application Shell & Navigation (`src/components/layout/`, `src/lib/navigation.ts`)

- `Sidebar`: Collapsible desktop rail (`244px` / `68px` persisted in `localStorage`) + responsive mobile drawer covering all 12 sections (`Overview`, `Datasets`, `Experiments`, `Model Registry`, `Deployments`, `Predictions`, `Monitoring`, `Drift Detection`, `Retraining Jobs`, `Model Comparison`, `Audit Logs`, `Settings`) with collapsed `<Tooltip>` labels and live drift alert count badges.
- `TopNav`: Dynamic clickable `<Breadcrumb>`, `⌘K` Global Search trigger, live unacknowledged Drift & Alerts popover with inline acknowledgement, Environment Selector (`Development`/`Staging`/`Production`), and User Profile menu.
- `CommandSearchModal`: Keyboard-accessible (`⌘K` / `Ctrl+K`) index across navigation routes, datasets, registered models, and MLflow experiment runs.
- `AuthModal`: JWT Sign In / Register modal supporting `ML_Engineer`, `Admin`, and `Viewer` RBAC roles.

## Implemented Pages

- **Overview (`src/pages/OverviewPage.tsx`)**: 6 clickable KPI cards (`Registered Models`, `Active Production`, `Experiments Done`, `Active Deployments`, `Drift Alerts`, `Pending Retraining`), 4 Recharts charts (`Model Performance Over Time`, `Prediction Volume`, `Drift Score Trends`, `Training Activity by Algorithm`), operational panels (`Recent Experiments`, `Model Deployment Status`, `Recent Activity`, `System Health & Serving Telemetry`), plus a live one-click Retail Demand Lifecycle seeder when the database is empty.
- **Datasets & Dataset Detail (`src/pages/DatasetsPage.tsx`)**: Versioned dataset table, synthetic generator (`reference` / `drifted` / `corrupted`), CSV file upload/ingest modal, and detail view showing canonical 8-column schema preview, missing-value counts, data quality checks, numeric summary statistics, and live baseline benchmark execution.
- **Experiments (`src/pages/ExperimentsPage.tsx`)**: Filterable & sortable MLflow training runs table, multi-run Recharts RMSE/MAE comparison chart, training launcher modal, and one-click Register Model modal.
- **Model Registry & Details (`src/pages/ModelRegistryPage.tsx`, `src/pages/ModelDetailsPage.tsx`)**: Lifecycle stage tabs (`Production`, `Staging`, `Candidate`, `Development`, `Archived`, `Rejected`), artifact SHA-256 & hyperparameters inspection, version history switcher, promotion gate controls (`forceOverride`), stage transitions, and rollback confirmation dialogs.
- **Deployments (`src/pages/DeploymentsPage.tsx`)**: Active endpoints, serving latency/error KPIs, deployment creation modal, and `ConfirmationDialog`-protected production rollback with target version selection.
- **Predictions (`src/pages/PredictionsPage.tsx`)**: Online single-record Retail Demand forecaster, clean & drifted batch scoring triggers, predictions log table, JSON payload inspector, and delayed ground-truth reconciliation modal.
- **Monitoring (`src/pages/MonitoringPage.tsx`)**: Selectable check window range, Recharts time-series for Feature/Prediction PSI, Live RMSE vs Baseline RMSE with degradation threshold line, API latency & request volume by model, missingness data quality rates, and alert threshold explanations.
- **Drift Detection (`src/pages/DriftDetectionPage.tsx`)**: Feature-level PSI & KS test breakdown, Reference vs Production mean comparison Recharts graphs, remediation recommendations, severity/acknowledgement filters, and inline alert acknowledgement.
- **Retraining Jobs (`src/pages/RetrainingPage.tsx`)**: 5-step closed-loop workflow strip (`Drift Detected -> Retraining Triggered -> Challenger Trained -> Gate Evaluation -> Promotion/Rejection`), real-time policy gate evaluator (cooldown + circuit breaker), manual/policy retraining trigger modal, and retry/decision table.
- **Model Comparison (`src/pages/ComparisonPage.tsx`)**: Champion vs Challenger metric matrix (RMSE, MAE, MAPE, R², training duration, dataset version), promotion criteria verdict banner with direct promotion action, and Recharts error comparison graph.
- **Audit Logs (`src/pages/AuditLogsPage.tsx`)**: Searchable immutable event log with backend `?action=` filtering, state transition summaries (`fromStage -> toStage`), and full JSON detail inspection modal.
- **Settings (`src/pages/SettingsPage.tsx`)**: Operator session & RBAC controls, Admin-only user directory, read-only runtime & API configuration (no exposed secrets), environment scoping, and workspace monitoring/retraining threshold settings.

## Real API & Auth Verification (Phase 9)

- Every page consumes live `/api/v1/*` endpoints with zero hardcoded metrics or mock fallbacks.
- Bearer JWT authentication (`AuthContext`) binds user identity (`ML_Engineer`, `Admin`, `Viewer`) to control-plane actions and restricts read-only `Viewer` roles in the UI while matching `requireAuth` / `requireRole` middleware on `/auth/me` and `/users`.
- Verified live `/api/v1/health` (`status: 'healthy'`) contract alignment in `OverviewPage` and `DeploymentsPage`, and enforced strict lifecycle stage transition guards (`Development -> Candidate -> Staging -> Production`) in `ModelDetailsPage`.


