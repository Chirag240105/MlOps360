# ModelOps360 Airflow Integration Guide

## 1. Storage & Volume Integration

ModelOps360 utilizes a unified volume mount strategy across Docker Compose services:

```yaml
volumes:
  - shared-artifacts:/opt/airflow/artifacts
```

Directories inside the shared volume:
- `artifacts/datasets/`: Ingested, versioned raw CSV data named `<name>_<hash[:12]>.csv`.
- `artifacts/models/`: Serialized models in `safe_json_v1` format (`<run_id>.model.json`).
- `artifacts/models/production_pointer.json`: The single source-of-truth pointer identifying the currently promoted production champion.
- `artifacts/monitoring/`: JSON reports containing PSI quantile calculations, KS test statistics, and drift alerts.
- `artifacts/mlflow/`: Offline audit log fallbacks if the central tracking server is unreachable.

## 2. MLflow Tracking Integration

- **Tracking URI**: Configurable via `MLFLOW_TRACKING_URI` (defaults to `http://mlflow:5000` in Docker network).
- **Logged Entities**:
  - Run name: `challenger_{run_id}`
  - Hyperparameters: `algorithm`, `l2_alpha`, `n_estimators`, `learning_rate`, `max_depth`
  - Validation metrics: `val_rmse`, `val_mae`, `val_smape`, `val_mape_pct`
  - Test metrics: `test_rmse`, `test_mae`, `test_smape`, `test_mape_pct`
  - Artifacts: Path to the signed model JSON and reference distribution profile.

## 3. Database & Audit Log Integration

- **Database Connection**: `postgresql+psycopg://airflow:airflow@postgres:5432/modelops360` (or local SQLite in development: `./data/modelops360.db`).
- **Audit Logging Table**: `audit_logs` records every governance milestone:
  - `DATASET_INGESTION`
  - `MODEL_TRAINING`
  - `CHALLENGER_EVALUATION`
  - `PROMOTE_TO_PRODUCTION`
  - `REJECT_CHALLENGER`
  - `MONITORING_EVALUATION`
  - `RETRAINING_POLICY_EVALUATION`

## 4. Retraining Trigger Guardrails

The `modelops360_retraining_trigger` DAG implements enterprise-grade guardrails:
1. **Cooldown Gate**: Prevents automated retraining from running more frequently than once every 24 hours.
2. **Circuit Breaker**: Automatically trips and suppresses runs if 3 consecutive retraining jobs fail.
3. **Active Job Lock**: Skips execution if another retraining DAG run is currently active.
