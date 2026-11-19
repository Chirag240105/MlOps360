# ModelOps360 — REST API Reference (`/api/v1`)

All endpoints emit an `X-Request-ID` response header and return structured JSON error envelopes `{ "error": { "code", "message", "requestId", "details?" } }`.

When `ENFORCE_AUTH=true`, endpoints require `Authorization: Bearer <jwt>` (`Admin` and `ML_Engineer` may mutate state; `Viewer` is read-only; `Admin` exclusively accesses `/users`).

---

## 1. System & Authentication
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Runtime liveness & Python worker verification |
| `GET` | `/api/v1/system/architecture` | Planes, lifecycle stages, and design metadata |
| `POST` | `/api/v1/auth/register` | Register a user (`scrypt` salted password hash) |
| `POST` | `/api/v1/auth/login` | Authenticate & issue HMAC-SHA256 JWT |
| `GET` | `/api/v1/auth/me` | Inspect authenticated caller identity |
| `GET` | `/api/v1/users` | Admin-only user directory |

## 2. Datasets, Validation, EDA & Baselines
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/datasets` | List datasets and latest version status |
| `POST` | `/api/v1/datasets/generate` | Generate deterministic `reference`, `corrupted`, or `drifted` retail dataset |
| `POST` | `/api/v1/datasets/ingest` | Ingest custom CSV dataset & run 6 quality validation gates |
| `GET` | `/api/v1/datasets/:datasetId/eda` | Exploratory distributions, missingness, and outlier summary |
| `POST` | `/api/v1/datasets/:datasetId/baseline` | Chronological Naive, 7-Day MA, and Ridge baselines |

## 3. Training, Experiments & Governed Registry
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/training/run` | Run chronological pipeline (`auto`, `ridge`, `random_forest`, `gradient_boosting`) |
| `GET` | `/api/v1/training/runs` | List training runs & SHA-256 artifact hashes |
| `GET` | `/api/v1/training/runs/:runId` | Detailed candidate tuning & split breakdown |
| `GET` | `/api/v1/experiments` | List tracked MLflow-compatible experiments & runs |
| `GET` | `/api/v1/models` | List registered models & current `productionVersion` pointer |
| `GET` | `/api/v1/models/:modelId` | Version history across all 6 lifecycle stages |
| `POST` | `/api/v1/models/register` | Register trained run in `Development` or `Candidate` |
| `POST` | `/api/v1/models/:modelId/versions/:versionId/transition` | Validate allowed transition + SHA-256 check + atomic swap |
| `POST` | `/api/v1/models/:modelId/versions/:versionId/promote` | Promotion gate checking Challenger beats Champion RMSE |
| `POST` | `/api/v1/models/:modelId/rollback` | Controlled atomic rollback to verified previous stable version |
| `GET` | `/api/v1/models/:modelId/compare?baseline=...&challenger=...` | Side-by-side metric comparison |

## 4. Deployments, Serving, Monitoring, Retraining & Audit
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/deployments` | Deploy a `Production`/`Staging` model version to a named endpoint |
| `GET` | `/api/v1/deployments` | List active deployment endpoints |
| `POST` | `/api/v1/predict` | Live single-record demand prediction + feature logging |
| `POST` | `/api/v1/predict/batch` | Batch demand inference (up to 500 records) |
| `GET` | `/api/v1/predictions` | List logged inference requests |
| `GET` | `/api/v1/predictions/:predictionId` | Inspect full feature payload & ground-truth status |
| `POST` | `/api/v1/predictions/ground-truth` | Reconcile delayed `actualUnits` labels |
| `GET` | `/api/v1/metrics` | Latency (`avg`, `p95`), labeled counts, and error counts |
| `POST` | `/api/v1/monitoring/run` | Compute PSI, KS, missingness, prediction drift, and live RMSE |
| `GET` | `/api/v1/monitoring/reports` | List persisted monitoring windows |
| `GET` | `/api/v1/monitoring/drift-events` | List alerts filterable by `modelId` & `acknowledged` |
| `POST` | `/api/v1/monitoring/drift-events/:eventId/acknowledge` | Acknowledge a drift event |
| `POST` | `/api/v1/retraining/evaluate` | Evaluate cooldown, circuit breaker, and drift/performance eligibility |
| `POST` | `/api/v1/retraining/trigger` | Idempotent automated retraining + Champion/Challenger gate |
| `GET` | `/api/v1/retraining/jobs` | List automated retraining job outcomes |
| `GET` | `/api/v1/audit` | Immutable governance audit ledger |
