# Apache Airflow Architecture in ModelOps360

## 1. System Overview

ModelOps360 employs **Apache Airflow** as its central, decoupled workflow orchestrator. Rather than embedding business logic within Airflow DAGs, Airflow acts strictly as an orchestration and state coordination layer. It delegates computational workloads to the domain modules (`ml.data`, `ml.validation`, `ml.training`, `ml.monitoring`, and `backend.app.services`).

```mermaid
graph TD
    subgraph UI & Ingestion
        A[ModelOps360 Frontend / Webhook] -->|REST Trigger| B(Backend API)
        B -->|TriggerDagRun| C[Airflow Orchestrator]
    end

    subgraph "Airflow DAG: modelops360_ml_pipeline"
        C --> D[1. Ingest Dataset]
        D --> E[2. Validate Schema & Bounds]
        E --> F[3. Train Challenger Model]
        F --> G[4. Log to MLflow Tracking]
        G --> H[5. Evaluate Held-out Metrics]
        H --> I[6. Compare Champion vs. Challenger]
        I --> J{7. Branch Decision}
        J -->|Relative Δ RMSE >= 2%| K[8a. Promote Challenger]
        J -->|Inferior or Regressed| L[8b. Reject Challenger]
        K --> M[9. Pipeline Summary & Audit]
        L --> M
    end

    subgraph "Storage & Metadata"
        D -.->|Artifacts / Datasets| S1[(Shared Storage Volume)]
        F -.->|Safe JSON v1 Models| S1
        G -.->|Metrics & Params| ML[(MLflow Tracking Server)]
        K -.->|ACID Pointer Update| S1
        K -.->|Stage Transition & Audit| DB[(PostgreSQL / SQLite)]
        L -.->|Audit Rejection| DB
    end

    subgraph "Scheduled Operations"
        SCH[Airflow Scheduler] --> N[modelops360_scheduled_monitoring]
        N -->|Hourly PSI & KS Checks| S1
        N -->|Degradation Signal| O[modelops360_retraining_trigger]
        O -->|Cooldown & Circuit Breaker Passed| C
    end
```

## 2. Core Architectural Principles

1. **Lightweight XCom Contract (The Golden Rule)**:
   - Large raw datasets, numpy matrices, and trained model weights are **never passed through XCom**.
   - Airflow XCom carries only lightweight primitives: file URIs, UUIDs, checksum digests (SHA-256), and summary metrics.
   - All bulky artifacts reside on shared persistent volumes (`/opt/airflow/artifacts/`).

2. **Idempotent Tasks**:
   - Re-running any task with identical inputs produces the identical outcome without duplicating database rows or generating orphaned files.
   - Datasets are content-addressed using SHA-256 hashes.

3. **Production Safety Gate**:
   - The reigning production champion model is never overwritten unless the challenger demonstrates a statistically significant improvement:
     $$\Delta \text{RMSE} = \frac{\text{RMSE}_{\text{Champion}} - \text{RMSE}_{\text{Challenger}}}{\text{RMSE}_{\text{Champion}}} \ge 2.0\%$$
   - Inferior, corrupted, or regressed models are routed to rejection and quarantined without touching production traffic.

4. **Retraining Guardrails**:
   - Automated triggers are guarded by a 24-hour cooldown period, an active job lock, and a 3-strike circuit breaker to prevent cascading compute waste.
