# Experiment Tracking & Model Registry Governance

## 1. Model Lifecycle State Machine (Mermaid Diagram #4)

```mermaid
stateDiagram-v2
    [*] --> Development : Register Training Run
    [*] --> Candidate : Automated Challenger Run

    Development --> Candidate : Validation Gate Passed
    Development --> Rejected : Below Baseline
    Development --> Archived : Superseded

    Candidate --> Staging : Beats Champion / QA Ready
    Candidate --> Rejected : Fails Challenger Gate
    Candidate --> Archived : Superseded

    Staging --> Production : Integrity Verified + Approved
    Staging --> Rejected : Staging Smoke Test Failed
    Staging --> Archived : Superseded

    Production --> Archived : Replaced by New Production
    Production --> Staging : Controlled Demotion

    Archived --> Production : Explicit Verified Rollback
    Archived --> Staging : Re-evaluation

    Rejected --> Archived : Cleanup
```

---

## 2. How MLflow Works Internally

When ModelOps360 runs in full containerized Python mode (`backend/app/ml/mlflow_tracker.py`), MLflow splits storage into **two distinct stores**:

1. **Backend Store (PostgreSQL):** Stores structured relational telemetry—experiment IDs, run UUIDs, parameters, metric histories, run tags, registered model names, version numbers, and aliases (`@production`, `@staging`).
2. **Artifact Store (S3 or Local Volume):** Stores large binary/JSON artifacts (`model.json`, feature profiles, Evidently drift reports) under `s3://<bucket>/mlflow/<experiment_id>/<run_id>/artifacts/`.

### Why Wrap MLflow With Application-Level PostgreSQL Governance?
- MLflow tracks *experimental lineage*, while ModelOps360's PostgreSQL registry enforces **ACID transactional state locks**, **SHA-256 tamper verification** prior to promotion, **RBAC actors**, and **immutable `audit_logs`** tied to deployments and retraining policies.
- Registering a model version places it in `Development` or `Candidate`—never `Production`.

---

## 3. Model Promotion Workflow (Mermaid Diagram #8)

```mermaid
sequenceDiagram
    actor Engineer
    participant API as Express / FastAPI Governance API
    participant Reg as ModelRegistryService
    participant FS as Artifact Store (SHA-256)
    participant DB as SQLite / PostgreSQL

    Engineer->>API: POST /api/v1/models/{modelId}/versions/{versionId}/promote
    API->>Reg: promoteVersion(modelId, versionId, forceOverride?)
    Reg->>DB: Fetch Candidate/Staging Challenger & Active Champion
    alt Active Champion Exists & !forceOverride
        Reg->>Reg: Compare Test RMSE (Challenger vs Champion)
        opt Challenger RMSE >= Champion RMSE
            Reg-->>API: 422 POLICY_VIOLATION (Blocked by Gate)
        end
    end
    Reg->>FS: Compute SHA-256 Checksum & Verify Existence
    FS-->>Reg: Digest Matches Registered Hash
    Reg->>DB: BEGIN IMMEDIATE
    Reg->>DB: Old Production -> Archived
    Reg->>DB: Challenger -> Production & Update production_version_id
    Reg->>DB: Sync ACTIVE deployments.model_version_id
    Reg->>DB: Insert MODEL_PROMOTED_TO_PRODUCTION Audit Log
    Reg->>DB: COMMIT
    Reg-->>API: 200 OK (Promoted Version)
```

---

## 4. Controlled Rollback Workflow (Mermaid Diagram #9)

```mermaid
flowchart TD
    A[POST /api/v1/models/:modelId/rollback] --> B{targetVersionId Provided?}
    B -- Yes --> C[Validate Version Exists & Stage != Rejected / Production]
    B -- No --> D[Auto-Select Latest Archived or Staging Version]
    C --> E[Verify Target Artifact Exists & SHA-256 Matches]
    D --> E
    E -- Mismatch / Missing --> F[Abort Rollback 422 POLICY_VIOLATION<br/>Current Production Untouched]
    E -- Verified --> G[BEGIN IMMEDIATE Transaction]
    G --> H[Demote Faulty Production -> Archived / Staging / Rejected]
    H --> I[Restore Target Version -> Production]
    I --> J[Update registered_models.production_version_id]
    J --> K[Sync ACTIVE deployments -> Target Version]
    K --> L[Record MODEL_ROLLBACK_EXECUTED in audit_logs]
    L --> M[COMMIT -> Next /predict Routes to Restored Version]
```

