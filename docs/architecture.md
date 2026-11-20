# ModelOps360 Architecture Specification

## 1. System Overview

**ModelOps360** is a lightweight, modular, intelligent MLOps platform for retail demand forecasting. It unifies the entire machine learning lifecycle—from data validation and training to continuous drift monitoring, closed-loop automated retraining, and atomic rollback—**without requiring heavyweight orchestration clusters like Apache Airflow**.

```mermaid
graph TD
    subgraph UI ["Frontend Presentation Tier"]
        Dashboard["React 19 Dashboard<br/>• Real-time monitoring metrics<br/>• Model comparison charts<br/>• Drift alerts & audit timeline"]
    end

    subgraph API ["Application & Control Plane"]
        Express["Workspace Control Plane (Express 4.21)<br/>• Port 3000<br/>• Subprocess CLI workers<br/>• SQLite WAL ledger"]
        FastAPI["Production API Service (FastAPI 0.115)<br/>• Port 8000<br/>• Model Serving & Batch Prediction<br/>• Retraining Policy Engine"]
    end

    subgraph JobLayer ["Lightweight Job & Scheduling Engine"]
        JobMgr["LightweightJobManager<br/>• Thread-safe ThreadPoolExecutor<br/>• State Machine: QUEUED -> RUNNING -> SUCCEEDED / REJECTED<br/>• Idempotency Deduplication<br/>• Active Job Locks"]
        Scheduler["InProcessScheduler<br/>• Periodic telemetry window sampling<br/>• Automated drift checks<br/>• Event-driven retraining dispatch"]
    end

    subgraph MLEngine ["Pure Python ML Core"]
        Validator["Data Validator (6 Pre-Training Gates)"]
        Trainer["Training Pipeline (Chronological 70/15/15 Split + GBDT/Ridge)"]
        Tracker["MLflow Tracking Client (Params, Metrics, Artifacts)"]
        DriftEngine["Statistical Drift Engine (PSI + Two-Sample KS)"]
        Registry["Governed Registry (6 Stages: Dev -> Cand -> Stag -> Prod -> Arch -> Rej)"]
    end

    subgraph Storage ["Persistent Storage Tier"]
        DB[("Relational Metadata DB<br/>PostgreSQL / SQLite WAL")]
        Artifacts[("Artifact Storage<br/>safe_json_v1 Models + SHA-256 Digests")]
        MLflowStore[("MLflow Tracking Server<br/>Port 5000")]
    end

    Dashboard -->|REST / JSON| Express
    Dashboard -->|REST / JSON| FastAPI
    FastAPI --> JobMgr
    Scheduler --> JobMgr
    JobMgr --> Validator --> Trainer --> Tracker --> Registry
    Scheduler --> DriftEngine
    Trainer -->|Save safe_json_v1| Artifacts
    Tracker -->|Log Metrics| MLflowStore
    Registry -->|ACID Pointer Update| Artifacts
    JobMgr -->|Audit Logging| DB
```

---

## 2. Core Architectural Decisions

### A. Removal of Heavyweight Orchestrators
Previous versions utilized Apache Airflow 2.10. While functional, Airflow required 5 Docker containers, added over 3.5 GB of RAM overhead, lacked native Windows support, and introduced a 30-second scheduling loop. 

ModelOps360 replaced this with `LightweightJobManager` and `InProcessScheduler`:
- **Direct in-process asynchronous dispatch** using standard Python `ThreadPoolExecutor`.
- **Zero latency**: Retraining triggers immediately when drift is detected.
- **Cross-platform**: Runs identically on Windows, Linux, and macOS without containers.

### B. Lightweight XCom Alternative (Filesystem Pointer System)
To avoid storing bulky blobs in relational tables:
- Model artifacts are serialized into canonical `safe_json_v1` JSON files and stored on disk.
- Each model is identified by a SHA-256 digest.
- Active production model is resolved atomically via `production_pointer.json`.

### C. Retraining Guardrail Engine
Automated retraining is protected by three essential guardrails:
1. **Active Job Lock**: Only one job per model can run at any time.
2. **24-hour Cooldown**: Prevents thrashing and redundant compute expenses.
3. **3-strike Circuit Breaker**: Suppresses automated retraining if 3 consecutive runs fail.
