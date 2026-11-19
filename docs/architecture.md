# ModelOps360 System Architecture

## 1. Overall System Architecture (Mermaid Diagram #1)

```mermaid
flowchart LR
    UI["React + TypeScript Dashboard"] -->|HTTPS / JWT| CP["Control Plane API\n(Express TS / FastAPI)"]
    CLIENT["Retail Forecasting Clients"] -->|POST /predict| SRV["Model Serving Plane\n(Pointer-Based Inference API)"]

    CP --> DB[("Relational Metadata DB\n(PostgreSQL / SQLite)")]
    CP --> MLF["MLflow Tracking &\nModel Registry"]
    CP --> ORCH["Workflow Orchestrator\n(Airflow / Background Worker)"]

    ORCH --> VAL["Data Quality Gates"]
    VAL --> TRN["Time-Aware Training Pipeline"]
    TRN --> MLF
    TRN --> STORE[("Artifact & Dataset Store\n(S3 / DVC / Local)")]

    SRV -->|Resolve Active Production Pointer\nVerify SHA-256 Checksum| MLF
    SRV -->|Persist Request ID, Inputs, Prediction| DB

    ORCH -->|Reference vs. Production Window| DB
    ORCH -->|Drift & Ground-Truth Eval| DB
    ORCH -->|Policy Gate + Cooldown Check| TRN
```

### Engineering Explanation

1. **Control Plane vs. Serving Plane Isolation:** Governance APIs (dataset uploads, model promotion, rollback, audit queries) never share execution bottlenecks with low-latency `/predict` traffic.
2. **Dynamic Production Pointer:** The serving layer resolves the currently approved `Production` model dynamically from metadata rather than hardcoding an artifact filename.
3. **Traceable Lineage:** Every `model_version` links back to an immutable `dataset_version` checksum, `mlflow_run_id`, training configuration, and Git commit SHA.
4. **Governance Before Promotion:** Registering a model places it in `Development` or `Candidate`. Only validated Challenger-vs-Champion gates or authorized operators promote a model to `Production`.
