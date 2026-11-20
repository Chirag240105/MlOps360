# Airflow Workflows Specification

## 1. Primary Pipeline: `modelops360_ml_pipeline`

- **DAG ID**: `modelops360_ml_pipeline`
- **Schedule**: `None` (Event-driven via REST API, Webhook, or Retraining Trigger)
- **Catchup**: `False`
- **Max Active Runs**: `1` (Guarantees atomic execution and avoids concurrency collisions)
- **Tags**: `["modelops360", "ml_pipeline", "retail_demand"]`

### Task Graph
```
ingest_dataset
      │
      ▼
validate_dataset
      │
      ▼
train_challenger
      │
      ▼
log_to_mlflow
      │
      ▼
evaluate_metrics
      │
      ▼
compare_champion_challenger
      │
      ▼
branch_decision
     ├──► promote_challenger ──┐
     └──► reject_challenger  ──┴──► pipeline_summary
```

### Tasks Description
1. `ingest_dataset`: Ingests or generates retail dataset CSV, writes to `/opt/airflow/artifacts/datasets/`, and outputs immutable SHA-256 hash.
2. `validate_dataset`: Runs 6 domain gates (null threshold, row threshold, value bounds). Throws `AirflowFailException` if breached.
3. `train_challenger`: Performs chronological train/val/test splitting and hyperparameter tuning on validation RMSE. Serializes model to `safe_json_v1` format.
4. `log_to_mlflow`: Connects to `http://mlflow:5000` to log params, metrics, git tags, and model artifact references.
5. `evaluate_metrics`: Re-reads and cryptographically checks artifact SHA-256, packaging held-out test metrics.
6. `compare_champion_challenger`: Compares challenger RMSE against production champion. Auto-approves first deployment; requires $\ge 2\%$ relative improvement thereafter.
7. `branch_decision`: Decides whether to route to `promote_challenger` or `reject_challenger`.
8. `promote_challenger`: Atomically points production pointer to challenger, updates database registry, and logs audit record.
9. `reject_challenger`: Marks challenger as Rejected without touching production champion.
10. `pipeline_summary`: Aggregates execution telemetry with `TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS`.

---

## 2. Monitoring Pipeline: `modelops360_scheduled_monitoring`

- **DAG ID**: `modelops360_scheduled_monitoring`
- **Schedule**: `@hourly`
- **Purpose**: Computes continuous Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) tests against production inference windows.

---

## 3. Retraining Trigger Pipeline: `modelops360_retraining_trigger`

- **DAG ID**: `modelops360_retraining_trigger`
- **Schedule**: `None` (Event-driven or invoked by Monitoring DAG)
- **Guardrails**:
  - 24-hour Cooldown Period
  - 3-strike Circuit Breaker
  - Active Job Lock (prevents concurrent retraining)
