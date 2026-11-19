# ModelOps360

> **From Model Development to Production Intelligence.**
> A unified, production-grade MLOps platform for retail demand forecasting featuring automated data validation, reproducible ML pipelines, governed model registry, pointer-based serving, continuous drift monitoring, and closed-loop automated retraining with champion–challenger safety gates.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg?logo=express&logoColor=white)](https://expressjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4.0-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![MLflow](https://img.shields.io/badge/MLflow-2.19+-0194E2.svg?logo=mlflow&logoColor=white)](https://mlflow.org/)
[![Scikit--Learn](https://img.shields.io/badge/Scikit--Learn-1.6+-F7931E.svg?logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL--Mode-003B57.svg?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg)](LICENSE)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Product Features](#3-product-features)
4. [System Architecture](#4-system-architecture)
5. [Complete System Workflow](#5-complete-system-workflow)
   - [Stage 1: Dataset Ingestion & Validation](#stage-1-dataset-ingestion--validation)
   - [Stage 2: Data Validation and Preprocessing](#stage-2-data-validation-and-preprocessing)
   - [Stage 3: Model Training](#stage-3-model-training)
   - [Stage 4: Experiment Tracking](#stage-4-experiment-tracking)
   - [Stage 5: Governed Model Registry](#stage-5-governed-model-registry)
   - [Stage 6: Model Deployment & Serving](#stage-6-model-deployment--serving)
   - [Stage 7: Continuous Monitoring](#stage-7-continuous-monitoring)
   - [Stage 8: Statistical Drift Detection](#stage-8-statistical-drift-detection)
   - [Stage 9: Automated Retraining Engine](#stage-9-automated-retraining-engine)
   - [Stage 10: Champion–Challenger Evaluation](#stage-10-championchallenger-evaluation)
   - [Stage 11: Controlled Model Promotion & Atomic Rollback](#stage-11-controlled-model-promotion--atomic-rollback)
6. [Technology Stack](#6-technology-stack)
7. [Project Structure](#7-project-structure)
8. [Database Architecture](#8-database-architecture)
9. [API Documentation](#9-api-documentation)
10. [Installation and Setup](#10-installation-and-setup)
11. [Environment Variables](#11-environment-variables)
12. [Running the Complete Application](#12-running-the-complete-application)
13. [Testing and Quality Assurance](#13-testing-and-quality-assurance)
14. [Security & RBAC](#14-security--rbac)
15. [User Interface & Dashboard](#15-user-interface--dashboard)
16. [Deployment Guide](#16-deployment-guide)
17. [Limitations and Future Roadmap](#17-limitations-and-future-roadmap)
18. [Contributing](#18-contributing)
19. [License and Contact](#19-license-and-contact)

---

## 1. Overview

**ModelOps360** is an enterprise-grade, end-to-end Machine Learning Operations (MLOps) platform designed to eliminate the operational chasm between ML experimentation and continuous production intelligence. While typical ML systems treat model training as an isolated, one-off exercise, ModelOps360 treats models as living software systems that require strict data validation, reproducible artifact versioning, low-latency pointer-based serving, real-time drift detection, and closed-loop retraining guardrails.

Built around a high-volume **Retail Demand Forecasting** domain, ModelOps360 implements a **Dual-Track Architecture**:
- **Track A (Workspace Operational Plane):** An Express + TypeScript control plane and API gateway tightly integrated with a Python 3.11 ML worker (`ml/cli.py`), persistent SQLite storage (with Write-Ahead Logging and strict foreign keys), and a responsive React 19 / Tailwind CSS v4 dashboard running on port `3000`.
- **Track B (Production Target Plane):** A modular FastAPI + Pydantic v2 + SQLAlchemy 2.0 / Alembic backend (`backend/app`) engineered for PostgreSQL, MLflow tracking servers, and cloud container orchestration.

```
       ┌─────────────────────────────────────────────────────────────┐
       │                         ModelOps360                         │
       │           Unified Machine Learning Lifecycle Plane          │
       └──────┬──────────────────────┬────────────────────────┬──────┘
              │                      │                        │
       ┌──────▼──────┐        ┌──────▼──────┐          ┌──────▼──────┐
       │ Data & ML   │        │ Governance  │          │ Production  │
       │ Pipeline    │        │ & Registry  │          │ Intelligence│
       ├─────────────┤        ├─────────────┤          ├─────────────┤
       │ Ingestion   │        │ MLflow Runs │          │ Serving API │
       │ 6 QA Gates  │        │ 6-Stage SM  │          │ PSI/KS Drift│
       │ Baselines   │        │ Cryptographic│         │ Closed-Loop │
       │ Leak-Free FE│        │ Checksums   │          │ Retraining  │
       │ GBDT/Trees  │        │ Atomic Prom.│          │ Rollback    │
       └─────────────┘        └─────────────┘          └─────────────┘
```

By unifying data validation, model registration, live scoring telemetry, and policy-driven retraining, ModelOps360 ensures that production models remain accurate, auditable, and resilient to sudden retail market shifts, price wars, supply chain disruptions, and upstream data corruption.

---

## 2. Problem Statement

Modern enterprise machine learning initiatives rarely fail because of poor algorithms; they fail because of broken operational feedback loops:

| Traditional ML Pain Point | Real-World Failure Mode in Production | How ModelOps360 Solves It |
| :--- | :--- | :--- |
| **Manual Training & Deployment** | Ad-hoc Jupyter notebook training; engineers copy `.pkl` files manually to servers via SFTP, risking version mismatch. | Automated chronological ML pipeline with strict CLI automation, programmatic experiment tracking, and pointer-based serving. |
| **Temporal Data Leakage** | Random `train_test_split(..., shuffle=True)` places future sales in training and past sales in testing, inflating test metrics. | Strict chronological train/val/test splitting (`70% / 15% / 15%`) and causal lag calculation; verified by unit tests. |
| **Arbitrary Deserialization (Pickle RCE)** | Using standard Python `pickle.load()` on untrusted artifact storage allows Remote Code Execution via `__reduce__` exploit payloads. | Custom `safe_json_v1` JSON-based weight and tree serialization with mandatory SHA-256 integrity verification before loading. |
| **Hardcoded Deployment Pointers** | Serving applications hardcode `model_v2.pkl` in code, requiring full application redeployments to roll back an outage. | Dynamic database pointer resolution (`registered_models.production_version_id`); rollback occurs in milliseconds via atomic DB update. |
| **Undetected Covariate Drift** | Upstream promo feeds spike discounts from 10% to 45%; models fail silently without raising runtime errors. | Continuous sliding-window monitoring computing Population Stability Index (PSI) and Two-Sample Kolmogorov-Smirnov (KS) tests. |
| **Retraining Storms** | Oscillating real-time data triggers non-stop retraining, exhausting cloud compute quotas and thrashing production models. | Enforced cooldown windows (`RETRAINING_COOLDOWN_HOURS`, default 24h), unique idempotency keys, and 3-strike circuit breakers. |
| **Blind Auto-Promotion** | Retrained models are deployed automatically simply because they finished training, even if their accuracy deteriorated. | Automated Champion–Challenger evaluation requiring $\ge 2\%$ test RMSE improvement over live Champion before promotion. |
| **Zero Auditability & Traceability** | Regulatory compliance or post-mortem debugging cannot determine which dataset or code SHA produced a bad forecast. | Immutable `audit_logs` table recording every actor, stage transition, checksum, parameter diff, and promotion decision. |

---

## 3. Product Features

### 1. Pre-Training Data Quality Gates & Diagnostic Profiling
- **What it does:** Executes 6 automated validation gates against incoming CSV datasets before any compute resources are spent on training.
- **Why it is needed:** Prevents garbage-in, garbage-out failures (e.g., negative prices, corrupted dates, duplicated keys).
- **How it works:** Inspects column presence, sample size ($\ge 30$ rows), missingness rates ($< 5\%$), composite primary key uniqueness on `(date, store_id, sku_id)`, domain bounds ($P > 0$, $0 \le \text{discount} \le 0.95$, $\text{units} \ge 0$), and performs an Interquartile Range (IQR) outlier and zero-demand analysis.
- **Output:** Structured JSON validation report with boolean pass/fail status, violation details, and descriptive EDA distribution statistics.

### 2. Time-Aware Feature Engineering & Baseline Benchmarking
- **What it does:** Generates 13 causal retail demand features without temporal leakage and benchmarks simple heuristics before running complex ensembles.
- **Why it is needed:** Complex gradient boosted trees are useless if they cannot beat a simple 7-day moving average.
- **How it works:** Computes pricing signals (`net_price`, `price_discount_interaction`), calendar cyclicity ($\sin/\cos$ day-of-week transforms), demand history (`lag_1`, `lag_7`, `rolling_7d_mean`, `rolling_7d_std`), and train-only target encoding (`store_sku_train_mean`). Benchmarks `Naive Lag-1`, `7-Day Moving Average`, and closed-form `Ridge Regression`.
- **Output:** Baseline evaluation metrics (MAE, RMSE, MAPE, SMAPE) and feature transformation matrices.

### 3. Multi-Algorithm Hyperparameter Tuning & Model Selection
- **What it does:** Trains Ridge Regression, Random Forest (bagging), and Gradient Boosted Decision Trees (GBDT), tuning hyperparameters on a validation split.
- **Why it is needed:** Different SKU volume regimes require different inductive biases; validation-based selection avoids test set contamination.
- **How it works:** Fits candidate hyperparameter configurations against the training set, measures validation RMSE, selects the optimal model, and evaluates final generalization performance on an untouched held-out test split.
- **Output:** Sealed `safe_json_v1` model artifact containing tree nodes, weights, reference quantile profiles, and an immutable SHA-256 hash.

### 4. Governed 6-Stage Model Registry
- **What it does:** Enforces a finite-state machine controlling model lifecycle: `Development` $\rightarrow$ `Candidate` $\rightarrow$ `Staging` $\rightarrow$ `Production` $\rightarrow$ `Archived` $\rightarrow$ `Rejected`.
- **Why it is needed:** Eliminates accidental promotions to production and provides strict operational governance.
- **How it works:** Prevents unauthorized direct transitions to `Production`. Verifies storage existence and SHA-256 checksums before updating active production pointers in an ACID transaction.
- **Output:** Audited model versions linked to training runs, Git commit hashes, and dataset version checksums.

### 5. Dynamic Pointer-Based Serving & Delayed Ground-Truth Reconciliation
- **What it does:** Serves real-time online predictions and batch inferences via `/api/v1/predict` without hardcoded model artifact paths, while logging inputs for drift analysis.
- **Why it is needed:** Decouples serving infrastructure from model deployment lifecycles and enables live accuracy measurement when sales actuals arrive.
- **How it works:** Resolves the active production model version ID from metadata, verifies the artifact hash, generates forecasts, logs latency and features to `predictions`, and reconciles delayed end-of-day sales figures via `/api/v1/predictions/ground-truth`.
- **Output:** Sub-50ms inference responses and structured telemetry records.

### 6. Four-Signal Drift & Performance Monitoring
- **What it does:** Regularly evaluates production inference traffic against the training baseline reference profile stored in the model artifact.
- **Why it is needed:** Distinguishes benign market behavior changes from upstream data corruption and true model degradation.
- **How it works:** Evaluates:
  1. *Covariate (Data) Drift:* Population Stability Index (PSI) and Two-Sample Kolmogorov-Smirnov (KS) tests across continuous and discrete features.
  2. *Missingness Drift:* Null-rate spikes in inference payloads.
  3. *Prediction Drift:* PSI shifts in model output distributions.
  4. *Performance Degradation:* True live RMSE vs. baseline test RMSE ($\text{RMSE}_{\text{live}} > 1.25 \times \text{RMSE}_{\text{test}}$).
- **Output:** Persisted `monitoring_reports` and granular `drift_events` with severity levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).

### 7. Closed-Loop Automated Retraining with Champion–Challenger Gates
- **What it does:** Automatically orchestrates retraining when critical performance degradation or corroborated drift is detected.
- **Why it is needed:** Keeps models fresh without manual engineering intervention while preventing retraining storms and performance regressions.
- **How it works:** Evaluates retraining policy (cooldown window, active job locks, 3-strike circuit breaker). Upon eligibility, triggers chronological retraining on fresh data, registers the new model as a `Candidate`, and runs a Champion–Challenger evaluation. The Challenger is only promoted if it achieves $\ge 2\%$ relative RMSE improvement over the active Champion.
- **Output:** Updated production model pointer or gate-rejection record with full audit log entry.

### 8. Atomic Emergency Rollback
- **What it does:** Restores a verified previous stable model version to `Production` within an atomic database transaction.
- **Why it is needed:** Mitigates production outages or post-deployment anomalies in seconds without server restarts or code rollbacks.
- **How it works:** Verifies the target artifact's physical presence and SHA-256 hash, demotes the faulty production model to `Archived` (or `Rejected`), sets the target model to `Production`, synchronizes active deployment records, and writes an audit log.
- **Output:** Immediate, zero-downtime routing of subsequent `/predict` calls to the restored version.

---

## 4. System Architecture

ModelOps360 separates concerns into isolated operational planes to guarantee that governance, monitoring, and retraining workloads never degrade low-latency production prediction traffic.

### Architectural Planes
1. **Control Plane:** Handles administrative operations, dataset ingestion, validation gate execution, model registry transitions, RBAC enforcement, and audit ledger queries.
2. **Serving Plane:** Optimized for low-latency inference (`/api/v1/predict`), request schema validation, runtime artifact verification, and asynchronous prediction logging.
3. **ML Training & Orchestration Plane:** Executes Python 3.11 feature engineering, hyperparameter search, baseline benchmarking, and model serialization.
4. **Monitoring & Retraining Engine:** Periodically computes PSI/KS drift statistics, checks cooldown policies, trips circuit breakers, and executes champion–challenger promotion gates.
5. **Metadata & Artifact Store:** Relational metadata (SQLite in local development; PostgreSQL in production) paired with an immutable file/object store for versioned datasets, JSON model artifacts, and MLflow run parameters.

### High-Level System Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["Clients & Users"]
        ENG["ML Engineer / Admin<br/>(Web Dashboard & CLI)"]
        APP["Retail Application<br/>(Inference Consumer)"]
    end

    subgraph ControlPlane["Control Plane & API Gateway (Port 3000)"]
        AUTH["Auth & RBAC Middleware<br/>(JWT + Scrypt)"]
        ROUTER["REST API Router<br/>(/api/v1/*)"]
        AUDIT["Immutable Audit Service"]
    end

    subgraph ServingPlane["Model Serving Plane"]
        SRV["Inference Handler<br/>(POST /api/v1/predict)"]
        PTR["Dynamic Production Pointer<br/>Resolver"]
        VAL_IN["Input Schema & Range<br/>Validator"]
    end

    subgraph MLOpsEngine["ML Engine & Pipelines (Python 3.11)"]
        DATA_VAL["Data Quality Gatekeeper<br/>(6 Schema/Domain Gates)"]
        FEAT["Time-Aware Feature Pipeline<br/>(No Temporal Leakage)"]
        TRAIN["Training & Tuning Engine<br/>(Ridge / RF / GBDT)"]
        DRIFT["Statistical Drift Engine<br/>(PSI & Two-Sample KS)"]
        RETRAIN["Retraining Guardrail Engine<br/>(Cooldown + Circuit Breaker)"]
        CHAMP["Champion-Challenger<br/>Gate Evaluator"]
    end

    subgraph StorageLayer["Persistence & Storage Layer"]
        DB[("Relational Metadata DB<br/>PostgreSQL / SQLite WAL<br/>(14 Tables + ACID Locks)")]
        STORE[("Artifact Storage<br/>S3 / Local Filesystem<br/>(safe_json_v1 + SHA-256)")]
        MLF["MLflow Tracking Server<br/>(Runs, Params, Metrics)"]
    end

    ENG -->|HTTPS / JWT| AUTH
    AUTH --> ROUTER
    APP -->|POST /predict| SRV

    ROUTER --> DATA_VAL
    ROUTER --> TRAIN
    ROUTER --> DRIFT
    ROUTER --> RETRAIN
    ROUTER --> AUDIT

    SRV --> VAL_IN
    VAL_IN --> PTR
    PTR -->|Resolve Version ID| DB
    PTR -->|Verify SHA-256| STORE
    SRV -->|Log Request & Output| DB

    DATA_VAL -->|Persist Version| DB
    FEAT --> TRAIN
    TRAIN -->|Log Telemetry| MLF
    TRAIN -->|Store Artifact| STORE
    TRAIN -->|Register Version| DB

    DRIFT -->|Read Prediction Window| DB
    DRIFT -->|Read Reference Profile| STORE
    DRIFT -->|Persist Reports & Events| DB

    RETRAIN -->|Check Policy & Cooldown| DB
    RETRAIN --> TRAIN
    TRAIN --> CHAMP
    CHAMP -->|Pass >= 2%| DB
    CHAMP -->|Fail Gate -> Reject| DB

    AUDIT -->|Append-Only| DB
```

---

## 5. Complete System Workflow

The machine learning lifecycle in ModelOps360 is divided into 11 strictly governed stages.

```mermaid
flowchart LR
    S1["1. Ingestion"] --> S2["2. Validation"]
    S2 --> S3["3. Training"]
    S3 --> S4["4. Tracking"]
    S4 --> S5["5. Registry"]
    S5 --> S6["6. Serving"]
    S6 --> S7["7. Monitoring"]
    S7 --> S8["8. Drift Check"]
    S8 --> S9["9. Retraining"]
    S9 --> S10["10. Evaluation"]
    S10 --> S11["11. Promotion / Rollback"]
    S11 -.->|Continuous Cycle| S6
```

---

### Stage 1: Dataset Ingestion & Validation
- **Entry Points:** Datasets enter either through deterministic synthetic generation (`POST /api/v1/datasets/generate`) across three defined scenarios (`reference`, `corrupted`, `drifted`), or via raw CSV upload (`POST /api/v1/datasets/ingest`).
- **Metadata Registration:** An immutable SHA-256 checksum is computed from the raw CSV payload. A parent `datasets` row is linked to a child `dataset_versions` record containing the checksum, file path, scenario tag, and timestamp.
- **Storage:** CSV files are stored immutably in `./artifacts/datasets/` or an S3 bucket tracked by DVC.

### Stage 2: Data Validation and Preprocessing
- **Validation Pipeline:** Handled by `ml/validation/validator.py`, which executes 6 quality gates:
  1. *Schema Check:* Asserts presence of `date`, `store_id`, `sku_id`, `category`, `price`, `discount_pct`, `is_holiday`, and `units_sold`.
  2. *Sample Size Check:* Requires minimum row count ($\ge 30$).
  3. *Missingness Gate:* Rejects datasets if any primary column has nulls or if feature missingness exceeds 5%.
  4. *Composite Key Uniqueness:* Asserts zero duplicates on `(date, store_id, sku_id)`.
  5. *Domain Bounds:* Enforces $\text{price} > 0$, $0.0 \le \text{discount\_pct} \le 0.95$, $\text{is\_holiday} \in \{0, 1\}$, and $\text{units\_sold} \ge 0$.
  6. *IQR Outlier Diagnostic:* Flags excessive target spikes without blocking valid holiday sales.
- **Chronological Splitting:** Data is strictly ordered by date and partitioned into **70% Train**, **15% Validation**, and **15% Test**. Shuffling is strictly disallowed to prevent temporal leakage.
- **Feature Pipeline:** Computes calendar harmonics ($\sin/\cos$ day-of-week), causal lags ($t-1$, $t-7$, 7-day rolling statistics), price-discount interactions, and store-SKU target encoding fit exclusively on the training split.

```mermaid
flowchart TD
    RAW["Raw Retail CSV Upload / Generator"] --> HASH["Compute SHA-256 Checksum"]
    HASH --> G1{"Gate 1: Schema Check<br/>All 8 Columns Present?"}
    G1 -- No --> REJ["HTTP 422: Ingestion Rejected<br/>Validation Failed"]
    G1 -- Yes --> G2{"Gate 2: Sample Size<br/>Rows >= 30?"}
    G2 -- No --> REJ
    G2 -- Yes --> G3{"Gate 3: Missingness<br/>Nulls <= 5%?"}
    G3 -- No --> REJ
    G3 -- Yes --> G4{"Gate 4: Uniqueness<br/>Unique (date, store, sku)?"}
    G4 -- No --> REJ
    G4 -- Yes --> G5{"Gate 5: Domain Bounds<br/>Price > 0, Discount <= 0.95?"}
    G5 -- No --> REJ
    G5 -- Yes --> G6["Gate 6: Diagnostic Profiling<br/>IQR Outlier & Zero-Demand Ratios"]
    G6 --> PASS["Persist Dataset Version & EDA<br/>Status: validation_passed = 1"]
    PASS --> BASE["Execute Baselines Benchmark<br/>(Naive Lag-1, 7-Day MA, Ridge)"]
```

---

### Stage 3: Model Training
- **Pipeline Execution:** Triggered via `POST /api/v1/training/run`.
- **Algorithms Supported:**
  - `ridge`: Closed-form $L_2$ regularized regression: $w = (X^T X + \alpha I)^{-1} X^T y$, where index 0 (intercept) is not penalized.
  - `random_forest`: Parallel bootstrap aggregation (bagging) of randomized decision trees to reduce variance.
  - `gradient_boosting`: Sequential stage-wise gradient boosted regression trees fitting residuals to reduce bias.
  - `auto`: Trains all three algorithm families across hyperparameter grids and selects the winner.
- **Reproducibility & Hyperparameter Tuning:** Grid searches across $\alpha$, `n_estimators`, `learning_rate`, and `max_depth` evaluate strictly on **validation RMSE**. The winning model is then evaluated once on the unbiased held-out **test set**.
- **Metrics Computed:** Root Mean Squared Error (RMSE), Mean Absolute Error (MAE), Safeguarded MAPE (excluding zero actuals), and Symmetric MAPE (SMAPE):

$$\text{SMAPE} = \frac{100\%}{n} \sum_{t=1}^{n} \frac{|\hat{y}_t - y_t|}{(|\hat{y}_t| + |y_t|) / 2}$$

- **Serialization:** Saved as `safe_json_v1` JSON files containing model weights/trees, feature names, series target encodings, and training reference distribution profiles. Python `pickle` is deliberately avoided to eliminate RCE vulnerabilities.

---

### Stage 4: Experiment Tracking
- **MLflow Tracking Integration:** Every training run records:
  - Parameters: `algorithm`, `seed`, `l2_alpha`, `n_estimators`, `max_depth`, `learning_rate`.
  - Metrics: Split-level RMSE, MAE, MAPE, SMAPE, and wall-clock training duration in milliseconds.
  - Lineage: Git commit SHA, dataset version hash, and artifact URI.
- **Relational Mirroring:** Express/FastAPI mirrors runs into `experiments`, `experiment_runs`, and `training_runs` tables, enabling offline UI search and instant SQL comparisons.

---

### Stage 5: Governed Model Registry
- **Registration:** Successful training runs are registered via `POST /api/v1/models/register`.
- **Initial Stage Restriction:** Models can only enter the registry in `Development` or `Candidate` stages—never directly in `Production`.
- **Finite-State Lifecycle Machine:**
  - `Development` $\rightarrow$ `Candidate`, `Rejected`, `Archived`
  - `Candidate` $\rightarrow$ `Staging`, `Rejected`, `Archived`
  - `Staging` $\rightarrow$ `Production`, `Rejected`, `Archived`
  - `Production` $\rightarrow$ `Archived`, `Staging` (controlled demotion)
  - `Archived` $\rightarrow$ `Production` (rollback), `Staging`
  - `Rejected` $\rightarrow$ `Archived` (cleanup)

```mermaid
stateDiagram-v2
    [*] --> Development : Register Training Run
    [*] --> Candidate : Automated Retraining Run

    Development --> Candidate : Code Review & Quality Pass
    Development --> Rejected : Sub-Baseline Performance
    Development --> Archived : Superseded

    Candidate --> Staging : Beats Champion / QA Ready
    Candidate --> Rejected : Fails Champion Gate
    Candidate --> Archived : Superseded

    Staging --> Production : Verified Promotion
    Staging --> Rejected : Staging Smoke Test Failed
    Staging --> Archived : Superseded

    Production --> Archived : Replaced by New Champion
    Production --> Staging : Controlled Demotion

    Archived --> Production : Explicit Verified Rollback
    Archived --> Staging : Re-activation

    Rejected --> Archived : Compliance Retention
```

---

### Stage 6: Model Deployment & Serving
- **Serving Architecture:** When a client issues `POST /api/v1/predict`, the server executes a dynamic resolution sequence:
  1. Reads `registered_models.production_version_id` to determine the active production version.
  2. Resolves the corresponding artifact path and expected SHA-256 hash.
  3. Validates the physical artifact on storage against the expected hash.
  4. Applies the canonical `build_single_feature_vector()` pipeline.
  5. Computes predicted demand and logs the request ID, inputs, predicted value, and execution latency to `predictions`.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Retail Forecasting Client
    participant API as Serving Gateway (/predict)
    participant DB as Relational Metadata DB
    participant Store as Artifact Storage
    participant ML as Feature & Inference Worker

    Client->>API: POST /api/v1/predict {store_id, sku_id, date, price, discount_pct}
    API->>API: Attach X-Request-ID & Validate Payload Bounds
    API->>DB: Query Active production_version_id for Model
    DB-->>API: version_id, artifact_path, expected_sha256
    API->>Store: Load Artifact & Verify SHA-256 Digest
    Store-->>API: Digest Verified (safe_json_v1)
    API->>ML: Apply build_single_feature_vector() & Score
    ML-->>API: Return predicted_units (e.g., 42.8)
    API->>DB: Persist predictionId, features_json, predicted_units, latency_ms
    API-->>Client: HTTP 200 {predictionId, algorithm, predictedUnits, latencyMs}
```

---

### Stage 7: Continuous Monitoring
- **Monitoring Trigger:** Initiated on a schedule or on demand via `POST /api/v1/monitoring/run`.
- **Sliding Window:** Fetches recent production inference records from the `predictions` table (default: recent 50–500 rows).
- **Four Distinct Failure Modes:**
  1. *Data (Covariate) Drift:* Distribution of features $P_{\text{prod}}(X)$ deviates from training reference $P_{\text{ref}}(X)$.
  2. *Missingness Drift:* Rate of null or unpopulated values in production payloads exceeds 5%.
  3. *Prediction Drift:* Distribution of model outputs $P_{\text{prod}}(\hat{y})$ shifts relative to reference demand.
  4. *Performance Degradation (Concept Drift):* Evaluated when delayed actual sales labels are reconciled via `POST /api/v1/predictions/ground-truth`. If live RMSE exceeds $1.25 \times \text{baseline test RMSE}$, a critical performance event is raised.

---

### Stage 8: Statistical Drift Detection
- **Population Stability Index (PSI):** Measures shift across quantile bins established during training:

$$\text{PSI} = \sum_{b=1}^{B} (q_b - p_b) \ln\left(\frac{q_b}{p_b}\right)$$

  - $\text{PSI} < 0.10$: Stable distribution (No action).
  - $0.10 \le \text{PSI} < 0.20$: Moderate shift (Warning).
  - $\text{PSI} \ge 0.20$: Significant drift (Alert triggered).
- **Two-Sample Kolmogorov-Smirnov (KS) Test:** Measures maximum empirical CDF divergence $D = \sup_x |F_{\text{ref}}(x) - F_{\text{prod}}(x)|$ and calculates asymptotic $p$-value.
- **Alert Suppression Strategy:** High-volume traffic can make KS tests overly sensitive to trivial mean shifts. ModelOps360 guards against alert fatigue by requiring **either** $\text{PSI} \ge 0.20$ **or** both $p < 0.05$ AND $\text{PSI} \ge 0.10$.

```mermaid
flowchart TD
    START["Trigger Monitoring Window<br/>POST /api/v1/monitoring/run"] --> FETCH["Fetch Recent Production Predictions<br/>& Active Model Reference Profile"]
    FETCH --> CALC_PSI["Compute Quantile PSI for Each Monitored Feature"]
    FETCH --> CALC_KS["Compute Two-Sample KS Statistic & p-value"]
    FETCH --> CALC_MISS["Evaluate Feature Missingness Rates"]
    FETCH --> CALC_OUT["Compute Prediction Distribution PSI"]

    CALC_PSI --> EVAL{"PSI >= 0.20 OR<br/>(p < 0.05 AND PSI >= 0.10)?"}
    CALC_MISS --> EVAL_MISS{"Missingness > 5%?"}
    CALC_OUT --> EVAL_OUT{"Prediction PSI >= 0.20?"}

    EVAL -- Yes --> EVT_DATA["Emit DATA_DRIFT Event<br/>Severity: HIGH"]
    EVAL_MISS -- Yes --> EVT_MISS["Emit MISSINGNESS_DRIFT Event<br/>Severity: HIGH"]
    EVAL_OUT -- Yes --> EVT_OUT["Emit PREDICTION_DRIFT Event<br/>Severity: MEDIUM"]

    FETCH --> GROUND{"Reconciled Ground Truth<br/>Actuals Available?"}
    GROUND -- Yes --> CALC_PERF["Calculate Live RMSE vs Baseline Test RMSE"]
    CALC_PERF --> EVAL_PERF{"Live RMSE > 1.25 * Baseline?"}
    EVAL_PERF -- Yes --> EVT_PERF["Emit PERFORMANCE_DEGRADATION<br/>Severity: CRITICAL"]

    EVT_DATA --> REPORT["Assemble & Persist monitoring_reports<br/>& drift_events Ledger"]
    EVT_MISS --> REPORT
    EVT_OUT --> REPORT
    EVT_PERF --> REPORT
    EVAL -- No --> REPORT
    REPORT --> DISPATCH["Notify Operators & Retraining Engine"]
```

---

### Stage 9: Automated Retraining Engine
- **Policy Evaluator (`evaluatePolicy`):** Evaluates whether an automated retraining run is permitted:
  1. *Active Job Lock:* Blocks execution if another retraining job is already `QUEUED` or `RUNNING`.
  2. *Circuit Breaker:* Trips and blocks training if 3 consecutive previous retraining runs have `FAILED`.
  3. *Cooldown Window:* Enforces a 24-hour waiting period (`RETRAINING_COOLDOWN_HOURS`) since the last completed retraining job (unless `bypassCooldown: true` is passed by an administrator).
  4. *Signal Eligibility:* Requires proven `PERFORMANCE_DEGRADATION` or corroborated high-magnitude `DATA_DRIFT` + `PREDICTION_DRIFT`.
- **Idempotency Guarantee:** Jobs accept an `idempotencyKey`. If an external scheduler (e.g., Airflow or EventBridge) retries a trigger, the platform returns the existing job record without re-running training.

```mermaid
flowchart TD
    TRIG["Retraining Trigger<br/>POST /api/v1/retraining/trigger"] --> IDEM{"Idempotency Key<br/>Already Exists in DB?"}
    IDEM -- Yes --> RET_IDEM["Return Existing Job Record<br/>HTTP 200 (idempotentReplay=true)"]

    IDEM -- No --> LOCK{"Active Retraining Job<br/>Already Running?"}
    LOCK -- Yes --> BLK_LOCK["HTTP 422: Blocked by ACTIVE_JOB"]

    LOCK -- No --> CB{"Circuit Breaker Open?<br/>Consecutive Failures >= 3?"}
    CB -- Yes --> BLK_CB["HTTP 422: Blocked by CIRCUIT_BREAKER_OPEN"]

    CB -- No --> COOL{"Cooldown Active?<br/>Last Run < 24 Hours Ago?"}
    COOL -- Yes --> BLK_COOL["HTTP 422: Blocked by COOLDOWN_ACTIVE<br/>(Requires bypassCooldown)"]

    COOL -- No --> SIG{"Valid Signal?<br/>Performance Degradation OR Corroborated Drift?"}
    SIG -- No --> BLK_SIG["HTTP 422: Blocked by NO_TRIGGER_SIGNAL"]

    SIG -- Yes --> RUN["Create retraining_jobs Record (QUEUED)<br/>Fetch Latest Validated Dataset Version"]
    RUN --> TRAIN["Train New Candidate Challenger<br/>(Chronological Splits + Tuning)"]
    TRAIN --> REG["Register Challenger Version<br/>Initial Stage: Candidate"]
    REG --> GATE["Proceed to Champion-Challenger Gate"]
```

---

### Stage 10: Champion–Challenger Evaluation
- **Evaluation Criteria:** Compares test RMSE of the newly trained Challenger against the active Production Champion:

$$\Delta_{\text{RMSE}} = \frac{\text{RMSE}_{\text{Champion}} - \text{RMSE}_{\text{Challenger}}}{\text{RMSE}_{\text{Champion}}}$$

- **Gate Decision:**
  - *Pass:* $\Delta_{\text{RMSE}} \ge 0.02$ ($\ge 2\%$ improvement). Challenger is accepted for promotion.
  - *Fail:* $\Delta_{\text{RMSE}} < 0.02$. Challenger is rejected.
- **Safety Action:** Failing Challengers are transitioned immediately to `Rejected`. Production traffic remains routed to the Champion without interruption.

```mermaid
flowchart TD
    CHALL["Challenger Model Trained & Sealed"] --> FETCH_CHAMP["Fetch Active Production Champion Metrics"]
    FETCH_CHAMP --> HAS_CHAMP{"Active Champion<br/>Exists in DB?"}
    HAS_CHAMP -- No --> AUTO_PASS["Initial Model Setup<br/>Automatic Gate Pass"]
    HAS_CHAMP -- Yes --> COMP["Calculate Relative Test RMSE Improvement<br/>rel = (Champion_RMSE - Challenger_RMSE) / Champion_RMSE"]

    COMP --> CHECK{"rel >= MIN_PROMOTION_RMSE_IMPROVEMENT<br/>(Default: >= 2.0%)?"}

    CHECK -- Yes --> PROMOTE["Verdict: GATE_PASSED<br/>Challenger Wins Promotion Gate"]
    PROMOTE --> PROCEED["Transition Challenger -> Staging -> Production<br/>Archive Previous Champion"]

    CHECK -- No --> REJECT["Verdict: GATE_REJECTED<br/>Challenger Inferior or Insufficient Gain"]
    REJECT --> MARK_REJ["Transition Challenger -> Rejected<br/>Update retraining_jobs = REJECTED_BY_GATE"]
    MARK_REJ --> LEAVE["Active Production Champion Untouched<br/>Serving Remains Uninterrupted"]
```

---

### Stage 11: Controlled Model Promotion & Atomic Rollback
- **Promotion Sequence:** When a model is approved (either automatically via the Champion–Challenger gate or manually via `POST /api/v1/models/:modelId/versions/:versionId/promote`):
  1. Verifies physical artifact existence and SHA-256 hash.
  2. Opens an ACID transaction (`BEGIN IMMEDIATE`).
  3. Demotes active production version to `Archived`.
  4. Sets promoted version stage to `Production`.
  5. Updates `registered_models.production_version_id`.
  6. Synchronizes active endpoint in `deployments`.
  7. Inserts `MODEL_PROMOTED_TO_PRODUCTION` into `audit_logs`.
  8. Commits transaction (`COMMIT`).
- **Emergency Rollback (`POST /api/v1/models/:modelId/rollback`):**
  - Allows immediate rollback to a specified version or auto-selects the latest stable `Archived` version.
  - Validates target artifact presence and SHA-256 checksum *before* touching the database.
  - Demotes faulty production version to `Archived`, `Staging`, or `Rejected`.
  - Atomically restores the previous version to `Production` and updates deployment pointers.

```mermaid
sequenceDiagram
    autonumber
    actor Operator as ML Engineer / Admin
    participant API as Registry API (/rollback)
    participant Reg as ModelRegistryService
    participant Store as Artifact Storage
    participant DB as Relational Database (SQL)

    Operator->>API: POST /api/v1/models/{modelId}/rollback {targetVersionId, demoteCurrentTo}
    API->>Reg: rollbackModel()
    Reg->>DB: Query Target Version Metadata (or auto-select latest stable Archived)
    DB-->>Reg: target_id, target_artifact_path, target_sha256
    Reg->>Store: verifyArtifactIntegrity(target_artifact_path, target_sha256)
    Store-->>Reg: Checksum Matches Registered Digest
    Reg->>DB: BEGIN IMMEDIATE TRANSACTION
    Reg->>DB: UPDATE model_versions SET stage = 'Archived' WHERE id = current_prod_id
    Reg->>DB: UPDATE model_versions SET stage = 'Production' WHERE id = target_id
    Reg->>DB: UPDATE registered_models SET production_version_id = target_id
    Reg->>DB: UPDATE deployments SET model_version_id = target_id WHERE status = 'ACTIVE'
    Reg->>DB: INSERT INTO audit_logs (action = 'MODEL_ROLLBACK_EXECUTED')
    Reg->>DB: COMMIT TRANSACTION
    Reg-->>API: Rollback Completed Successfully
    API-->>Operator: HTTP 200 {restoredVersion, demotedToStage, executedAt}
```

---

## 6. Technology Stack

| Category | Technology | Version | Justification & Architectural Role |
| :--- | :--- | :--- | :--- |
| **Workspace Control Plane** | Node.js / Express / TypeScript | `Node 22`, `Express 4.21`, `TS 5.x` | Unified developer workspace running API gateway, Vite SSR middleware, and CLI worker orchestration on port 3000. |
| **Production API Target** | Python / FastAPI / Pydantic v2 | `FastAPI 0.115`, `Pydantic 2.10` | High-performance asynchronous API framework providing automatic OpenAPI schema generation, dependency injection, and Pydantic validation. |
| **Frontend Framework** | React / Tailwind CSS / Recharts | `React 19`, `Tailwind v4`, `Recharts 3.11` | Responsive, real-time dark-mode operational dashboard with Recharts time-series, command palettes (`⌘K`), and live metrics. |
| **Machine Learning Core** | Scikit-learn / NumPy / Pandas | `Scikit-learn 1.6`, `NumPy 2.2`, `Pandas 2.2` | Implements Ridge Regression, Random Forest, GBDT, chronological splitting, causal lag engineering, and baseline heuristics. |
| **Serialization Safety** | Custom Canonical JSON (`safe_json_v1`) | Custom Specification | Eliminates Python `pickle` deserialization Remote Code Execution (RCE) vulnerabilities; coupled with SHA-256 hash checks. |
| **Experiment Tracking** | MLflow Tracking Server | `MLflow 2.19` | Tracks hyperparameters, validation/test metrics, artifacts, and execution lineage across training experiments. |
| **Database (Dev / Local)** | Node.js Built-in SQLite | `node:sqlite` (WAL Mode) | Zero-dependency local relational persistence with foreign keys enabled and Write-Ahead Logging for concurrent API operations. |
| **Database (Prod Target)** | PostgreSQL / SQLAlchemy / Alembic | `PG 16+`, `SQLAlchemy 2.0`, `Alembic 1.14` | ACID transactional storage supporting multi-master constraints, unique idempotency keys, and enterprise audit ledgers. |
| **Drift Monitoring** | Custom Statistical Engine & Evidently AI | `Evidently 0.5.1` + Custom Engine | Implements Jeffreys-smoothed Population Stability Index (PSI) and asymptotic Two-Sample Kolmogorov-Smirnov (KS) tests. |
| **Security & Cryptography** | `node:crypto` / `scrypt` / PyJWT | Native `scrypt`, `HS256` | Salted, memory-hard `scrypt` password hashing, constant-time equality checks, stateless JWT authentication, and RBAC authorization. |
| **Bundler & Build Tool** | Vite / TSX | `Vite 8.3`, `TSX 4.21` | Sub-second Hot Module Replacement (HMR) for the React frontend and direct TypeScript execution for the Express control plane. |

---

## 7. Project Structure

The ModelOps360 repository is structured into clear architectural domains:

```text
ModelOps360/
├── .env.example                 # Secret-free environment variable template
├── .gitignore                   # Git exclusion rules for databases, artifacts, and node_modules
├── package.json                 # Node dependencies, build scripts, and test definitions
├── tsconfig.json                # TypeScript compiler configuration (strict mode)
├── vite.config.ts               # Vite configuration with React and Tailwind plugins
├── server.ts                    # Application bootstrap: binds Express + Vite SPA to port 3000
│
├── server/                      # Track A: TypeScript Control Plane & API Gateway
│   ├── app.ts                   # Express application factory with middleware and route bindings
│   ├── core/                    # Core configuration, structured JSON logging, and domain errors
│   │   ├── config.ts            # 12-Factor environment configuration loader and validator
│   │   ├── errors.ts            # Domain error classes (ValidationError, NotFoundError, PolicyViolationError)
│   │   ├── logger.ts            # Structured JSON logger with request correlation
│   │   └── security.ts          # Scrypt password hashing and JWT token generator
│   ├── db/                      # Relational database initialization
│   │   └── sqlite.ts            # SQLite connection, WAL mode, and 14-table schema initialization
│   ├── middleware/              # Express request middleware
│   │   ├── auth.ts              # Bearer JWT extraction, principal context, and RBAC guards
│   │   ├── rateLimiter.ts       # Sliding-window IP-based rate limiting middleware
│   │   └── requestContext.ts    # X-Request-ID propagation and centralized JSON error boundary
│   ├── services/                # Business logic services
│   │   ├── auditService.ts      # Immutable governance audit ledger
│   │   ├── authService.ts       # User registration, scrypt verification, and JWT issuance
│   │   ├── datasetService.ts    # Synthetic dataset generator, CSV ingestion, and baseline execution
│   │   ├── deploymentService.ts # Deployment endpoint management and traffic control
│   │   ├── experimentService.ts # MLflow-compatible experiment and run tracking
│   │   ├── modelRegistryService.ts # 6-stage lifecycle state machine, promotions, and rollbacks
│   │   ├── monitoringService.ts # Sliding-window drift evaluation, reports, and alerts
│   │   ├── predictionService.ts # Dynamic pointer serving, batch inference, and ground truth
│   │   ├── retrainingService.ts # Retraining policy evaluator, cooldown, and champion gates
│   │   └── trainingService.ts   # Python ML CLI orchestrator and artifact verification
│   ├── api/routes/              # REST API endpoint handlers
│   │   ├── audit.ts             # GET /api/v1/audit
│   │   ├── auth.ts              # POST /auth/register, POST /auth/login, GET /auth/me, GET /users
│   │   ├── datasets.ts          # GET /datasets, POST /generate, POST /ingest, GET /eda, POST /baseline
│   │   ├── deployments.ts       # GET /deployments, POST /deployments
│   │   ├── experiments.ts       # GET /experiments, POST /experiments, GET /runs
│   │   ├── models.ts            # GET /models, POST /register, POST /transition, POST /promote, POST /rollback
│   │   ├── monitoring.ts        # POST /monitoring/run, GET /reports, GET /drift-events, POST /acknowledge
│   │   ├── predictions.ts       # POST /predict, POST /predict/batch, GET /predictions, POST /ground-truth
│   │   ├── retraining.ts        # POST /retraining/evaluate, POST /trigger, GET /jobs, GET /jobs/:id
│   │   ├── system.ts            # GET /health, GET /system/architecture
│   │   └── training.ts          # POST /training/run, GET /runs, GET /runs/:id
│   └── tests/                   # Automated Node.js integration tests (Phases 1 through 9)
│
├── ml/                          # Core Machine Learning Engine (Python 3.11)
│   ├── cli.py                   # Unified CLI entry point invoked by TypeScript services
│   ├── data/                    # Data generation modules
│   │   └── retail_generator.py  # Deterministic retail demand synthesizer (reference/corrupted/drifted)
│   ├── validation/              # Data validation and profiling
│   │   └── validator.py         # 6 pre-training data quality gates and EDA summarizer
│   ├── features/                # Feature engineering pipeline
│   │   └── pipeline.py          # Time-aware features, causal lags, and chronological splits
│   ├── training/                # Training algorithms and metrics
│   │   ├── baselines.py         # Naive Lag-1, 7-Day Moving Average, and Ridge baselines
│   │   ├── metrics.py           # MAE, RMSE, Safeguarded MAPE, and SMAPE evaluators
│   │   ├── models.py            # Ridge, Random Forest, and GBDT implementations
│   │   └── trainer.py           # Training pipeline, tuning, safe_json_v1 serialization, and SHA-256
│   ├── monitoring/              # Drift detection algorithms
│   │   └── drift_engine.py      # Quantile-binned PSI and Two-Sample KS test calculators
│   └── tests/                   # Python unit tests for validation, training, and drift
│
├── backend/                     # Track B: Production Python & Container Target (FastAPI)
│   ├── requirements.txt         # Pinned Python production dependencies
│   ├── alembic.ini              # Alembic database migration configuration
│   ├── alembic/                 # Database migrations for PostgreSQL
│   │   ├── env.py               # Alembic environment runner
│   │   └── versions/            # Versioned SQL migration scripts
│   ├── app/                     # Modular FastAPI application package
│   │   ├── main.py              # FastAPI app factory, CORS, request IDs, and exception handlers
│   │   ├── core/                # Pydantic v2 settings, JSON logging, and security
│   │   ├── models/orm.py        # SQLAlchemy 2.0 ORM models matching the 14 database tables
│   │   ├── schemas/             # Pydantic request and response schemas
│   │   ├── services/            # Python business logic (registry governance, retraining policy)
│   │   ├── ml/                  # MLflow tracking client and Scikit-learn trainer
│   │   ├── monitoring/          # Evidently AI integration runner
│   │   └── api/routes/          # FastAPI route routers (health, models, training, experiments)
│   └── tests/                   # Pytest test suite for core, security, registry, and retraining
│
├── src/                         # React 19 Frontend Dashboard
│   ├── index.html               # SPA HTML entry point loading JetBrains Mono and Plus Jakarta Sans
│   ├── main.tsx                 # React DOM root mounting App.tsx
│   ├── App.tsx                  # Hash router and root context provider wrapper
│   ├── index.css                # Tailwind CSS v4 design tokens and dark surface styling
│   ├── context/                 # Application state providers
│   │   ├── AuthContext.tsx      # Authentication state, JWT persistence, and RBAC permissions
│   │   ├── ToastContext.tsx     # Toast notification queue
│   │   └── WorkspaceContext.tsx # System health polling, alert counts, and environment switching
│   ├── lib/                     # Client utilities and API SDK
│   │   ├── api.ts               # Typed API client injecting JWT Bearer tokens
│   │   ├── format.ts            # Formatting helpers for metrics, dates, hashes, and numbers
│   │   └── navigation.ts        # Hash-based navigation definitions
│   ├── components/              # Component library
│   │   ├── layout/              # AppShell, Sidebar, TopNav, and CommandSearchModal (⌘K)
│   │   ├── ui/                  # Reusable accessible components (Button, Card, DataTable, Modal)
│   │   └── charts/              # Recharts wrappers for drift, latency, and performance trends
│   └── pages/                   # 12 functional operational views
│       ├── OverviewPage.tsx     # Executive KPI cards, Recharts trends, and system health
│       ├── DatasetsPage.tsx     # Dataset generator, CSV uploader, and EDA profiling
│       ├── ExperimentsPage.tsx  # MLflow training run comparisons and run launcher
│       ├── ModelRegistryPage.tsx# 6-stage registry lifecycle tabs and version switcher
│       ├── ModelDetailsPage.tsx # Hyperparameter inspection, stage transitions, and rollback
│       ├── DeploymentsPage.tsx  # Active serving endpoints, traffic weights, and latency KPIs
│       ├── PredictionsPage.tsx  # Online demand forecast playground and batch inference
│       ├── MonitoringPage.tsx   # PSI/KS drift charts, live RMSE, and missingness graphs
│       ├── DriftDetectionPage.tsx # Feature-level drift breakdown and alert acknowledgement
│       ├── RetrainingPage.tsx   # Retraining closed-loop workflow and policy gate evaluator
│       ├── ComparisonPage.tsx   # Side-by-side Champion vs. Challenger metric comparison
│       ├── AuditLogsPage.tsx    # Immutable governance audit ledger with JSON detail modal
│       └── SettingsPage.tsx     # RBAC user directory, API runtime config, and thresholds
│
└── docs/                        # Comprehensive Architectural & Engineering Documentation
    ├── architecture.md          # Control vs. serving plane isolation and pointer-based serving
    ├── api-reference.md         # Full REST API endpoint specifications and error envelopes
    ├── database-design.md       # Relational schema design, indexes, and retention strategy
    ├── ml-pipeline.md           # Validation gates, chronological splitting, and safe artifacts
    ├── registry-and-mlflow.md   # 6-stage state machine, promotion gates, and MLflow internals
    ├── serving.md               # Prediction lifecycle, feature logging, and ground truth
    ├── monitoring.md            # PSI/KS statistical formulation and 4 failure modes
    ├── retraining.md            # Cooldown guardrails, circuit breakers, and champion gates
    ├── ui-architecture.md       # React component library, design tokens, and route index
    └── learning-notes.md        # Detailed engineering trade-offs and interview technical deep dives
```

---

## 8. Database Architecture

ModelOps360 uses a strictly typed relational schema (implemented in SQLite for local development and PostgreSQL via SQLAlchemy/Alembic in production) comprising 14 tables designed with foreign-key constraints, composite indexes for sliding-window queries, and unique idempotency keys.

### Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USERS ||--o{ AUDIT_LOGS : "performs"
    DATASETS ||--o{ DATASET_VERSIONS : "versions"
    DATASET_VERSIONS ||--o{ TRAINING_RUNS : "feeds"
    EXPERIMENTS ||--o{ EXPERIMENT_RUNS : "groups"
    TRAINING_RUNS ||--|| EXPERIMENT_RUNS : "tracks"
    TRAINING_RUNS ||--o{ MODEL_VERSIONS : "produces"
    REGISTERED_MODELS ||--o{ MODEL_VERSIONS : "contains"
    REGISTERED_MODELS ||--o{ DEPLOYMENTS : "exposes"
    MODEL_VERSIONS ||--o{ DEPLOYMENTS : "serves"
    MODEL_VERSIONS ||--o{ PREDICTIONS : "generates"
    REGISTERED_MODELS ||--o{ MONITORING_REPORTS : "monitors"
    MONITORING_REPORTS ||--o{ DRIFT_EVENTS : "raises"
    REGISTERED_MODELS ||--o{ RETRAINING_JOBS : "triggers"

    USERS {
        string id PK
        string email UK
        string full_name
        string password_hash
        string role
        int is_active
        string created_at
    }

    DATASETS {
        string id PK
        string name UK
        string domain
        string description
        string created_at
    }

    DATASET_VERSIONS {
        string id PK
        string dataset_id FK
        int version_number
        string version_hash
        string scenario
        int row_count
        string file_path
        int validation_passed
        string validation_report_json
        string eda_json
        string created_at
    }

    TRAINING_RUNS {
        string id PK
        string dataset_id FK
        string dataset_version_id FK
        string algorithm
        string hyperparameters_json
        string validation_metrics_json
        string test_metrics_json
        string artifact_path
        string artifact_sha256
        string git_commit
        float duration_ms
        string status
        string created_at
    }

    EXPERIMENTS {
        string id PK
        string name UK
        string description
        string created_at
    }

    EXPERIMENT_RUNS {
        string id PK
        string experiment_id FK
        string mlflow_run_id UK
        string training_run_id FK
        string dataset_version_id FK
        string algorithm
        string parameters_json
        string metrics_json
        string artifact_uri
        string artifact_sha256
        string git_commit
        float duration_ms
        string status
        string created_at
    }

    REGISTERED_MODELS {
        string id PK
        string name UK
        string use_case
        string description
        string production_version_id
        string created_at
        string updated_at
    }

    MODEL_VERSIONS {
        string id PK
        string model_id FK
        int version_number
        string training_run_id FK
        string mlflow_run_id
        string dataset_version_id
        string algorithm
        string stage
        string artifact_path
        string artifact_sha256
        string metrics_json
        string hyperparameters_json
        string notes
        string promoted_by
        string promoted_at
        string created_at
    }

    DEPLOYMENTS {
        string id PK
        string model_id FK
        string model_version_id FK
        string endpoint_name UK
        string environment
        string status
        int traffic_pct
        string created_by
        string created_at
        string updated_at
    }

    PREDICTIONS {
        string id PK
        string request_id
        string model_id FK
        string model_version_id FK
        string store_id
        string sku_id
        string prediction_date
        string features_json
        float predicted_units
        float actual_units
        float latency_ms
        string status
        string created_at
    }

    MONITORING_REPORTS {
        string id PK
        string model_id FK
        string model_version_id
        string window_start
        string window_end
        int sample_count
        int data_drift_detected
        int prediction_drift_detected
        int performance_degraded
        float max_psi
        float min_ks_pvalue
        float live_rmse
        float live_mae
        string report_json
        string created_at
    }

    DRIFT_EVENTS {
        string id PK
        string monitoring_report_id FK
        string model_id FK
        string drift_type
        string feature_name
        string severity
        string metric_name
        float metric_value
        float threshold_value
        int acknowledged
        string created_at
    }

    RETRAINING_JOBS {
        string id PK
        string idempotency_key UK
        string model_id FK
        string trigger_type
        string drift_event_id
        string dataset_version_id
        string status
        string challenger_version_id
        string champion_version_id
        string decision
        string decision_reason
        int attempt_count
        string error_message
        string started_at
        string completed_at
        string created_at
    }

    AUDIT_LOGS {
        string id PK
        string actor
        string action
        string resource_type
        string resource_id
        string details_json
        string created_at
    }
```

### Indexing and Data Retention Policies
1. **Sliding-Window Indexes:** Composite indexes on `predictions(model_id, created_at DESC)` and `monitoring_reports(model_id, created_at DESC)` allow sliding-window drift queries to execute in sub-millisecond time without full-table scans.
2. **Idempotency Uniqueness:** `retraining_jobs.idempotency_key` carries a `UNIQUE` constraint preventing duplicate runs from concurrent schedulers.
3. **Data Retention:**
   - `predictions`: Stored in hot relational storage for 90 days, then partitioned to Parquet on Amazon S3.
   - `model_versions` & `dataset_versions`: Immutably preserved while referenced by any active, candidate, or rollback-eligible version.
   - `audit_logs`: Append-only compliance ledger with a 7-year regulatory retention policy.

---

## 9. API Documentation

All API endpoints reside under `/api/v1`. Endpoints emit an `X-Request-ID` response header for distributed tracing and return structured JSON error envelopes:

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Cannot promote model: Challenger RMSE (4.82) is not superior to Champion RMSE (4.15)",
    "requestId": "req_8f192b0c-d3",
    "details": { "challengerRmse": 4.82, "championRmse": 4.15 }
  }
}
```

### 1. System & Authentication Endpoints

#### `GET /api/v1/health`
- **Purpose:** System liveness, uptime, and Python ML worker verification.
- **Auth:** None.
- **Response Example (200 OK):**
```json
{
  "status": "healthy",
  "service": "ModelOps360",
  "environment": "development",
  "uptimeSeconds": 1420,
  "requestId": "req_104a-9b",
  "checks": {
    "apiGateway": "ok",
    "nodeRuntime": "v22.15.0",
    "pythonWorkerRuntime": "Python 3.11.9"
  }
}
```

#### `GET /api/v1/system/architecture`
- **Purpose:** Exposes registered planes, governance defaults, and allowed lifecycle states.
- **Auth:** None.

#### `POST /api/v1/auth/register`
- **Purpose:** Registers an operator user account with salted `scrypt` password hashing.
- **Auth:** None (or Admin when user provisioning is locked).
- **Request Example:**
```json
{
  "email": "engineer@modelops360.internal",
  "fullName": "Sarah Connor",
  "password": "SecurePassword123!",
  "role": "ML_Engineer"
}
```
- **Response Example (201 Created):**
```json
{
  "id": "usr_9b2e1a",
  "email": "engineer@modelops360.internal",
  "fullName": "Sarah Connor",
  "role": "ML_Engineer",
  "isActive": true,
  "createdAt": "2026-11-19T10:00:00.000Z"
}
```

#### `POST /api/v1/auth/login`
- **Purpose:** Authenticates credentials and issues a stateless HMAC-SHA256 JWT bearer token.
- **Request Example:**
```json
{
  "email": "engineer@modelops360.internal",
  "password": "SecurePassword123!"
}
```
- **Response Example (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr_9b2e1a",
    "email": "engineer@modelops360.internal",
    "role": "ML_Engineer"
  },
  "expiresInMinutes": 60
}
```

#### `GET /api/v1/auth/me`
- **Purpose:** Returns authenticated caller identity and role claims.
- **Auth:** Bearer JWT required.

#### `GET /api/v1/users`
- **Purpose:** Lists registered platform users.
- **Auth:** Bearer JWT required (`Admin` role only).

---

### 2. Dataset Ingestion & Validation Endpoints

#### `GET /api/v1/datasets`
- **Purpose:** Lists all registered datasets, version counts, and latest validation status.

#### `POST /api/v1/datasets/generate`
- **Purpose:** Generates deterministic synthetic retail demand CSV data across scenarios.
- **Request Example:**
```json
{
  "name": "retail-store-q1",
  "days": 120,
  "startDate": "2026-01-01",
  "seed": 42,
  "scenario": "reference",
  "description": "Baseline 120-day multi-store retail dataset"
}
```

#### `POST /api/v1/datasets/ingest`
- **Purpose:** Ingests raw CSV text, computes SHA-256 hash, and runs 6 data quality gates.
- **Request Example:**
```json
{
  "name": "uploaded-store-feed",
  "csvContent": "date,store_id,sku_id,category,price,discount_pct,is_holiday,units_sold\n2026-01-01,STORE_01,SKU_100,Groceries,2.99,0.00,0,45\n...",
  "description": "Custom CSV sales extract"
}
```

#### `GET /api/v1/datasets/:datasetId/eda`
- **Purpose:** Returns summary statistics, missingness counts, IQR bounds, and date ranges.

#### `POST /api/v1/datasets/:datasetId/baseline`
- **Purpose:** Benchmarks `Naive Lag-1`, `7-Day Moving Average`, and `Ridge Regression` on the dataset.

---

### 3. Model Training & Experiment Endpoints

#### `POST /api/v1/training/run`
- **Purpose:** Executes chronological ML training pipeline with hyperparameter tuning.
- **Request Example:**
```json
{
  "datasetId": "ds_8a12f9",
  "algorithm": "auto",
  "seed": 42,
  "experimentName": "retail-demand-forecasting"
}
```
- **Response Example (201 Created):**
```json
{
  "id": "run_04b8e21a",
  "algorithm": "gradient_boosting",
  "hyperparameters": { "n_estimators": 30, "learning_rate": 0.12, "max_depth": 4 },
  "validationMetrics": { "rmse": 4.12, "mae": 2.85, "mapePct": 8.4 },
  "testMetrics": { "rmse": 4.25, "mae": 2.91, "mapePct": 8.9 },
  "artifactPath": "./artifacts/models/run_04b8e21a.model.json",
  "artifactSha256": "3e9b10c851fd28c46a6f1d69d71b...",
  "durationMs": 1420.5
}
```

#### `GET /api/v1/training/runs`
- **Purpose:** Lists all historical training runs with split summaries and checksums.

#### `GET /api/v1/experiments`
- **Purpose:** Lists tracked MLflow experiments and run summaries.

---

### 4. Governed Model Registry Endpoints

#### `GET /api/v1/models`
- **Purpose:** Lists registered models and current `productionVersion` pointers.

#### `GET /api/v1/models/:modelId`
- **Purpose:** Returns full version history across all 6 lifecycle stages.

#### `POST /api/v1/models/register`
- **Purpose:** Registers a completed training run into `Development` or `Candidate`.
- **Request Example:**
```json
{
  "modelName": "retail-demand-gbdt",
  "trainingRunId": "run_04b8e21a",
  "initialStage": "Candidate",
  "notes": "Trained on Q1 validated retail feed"
}
```

#### `POST /api/v1/models/:modelId/versions/:versionId/transition`
- **Purpose:** Transitions a version across allowed lifecycle stages with SHA-256 validation.
- **Request Example:**
```json
{
  "targetStage": "Staging",
  "reason": "QA smoke tests verified in staging environment"
}
```

#### `POST /api/v1/models/:modelId/versions/:versionId/promote`
- **Purpose:** Promotes version to `Production`, enforcing Champion–Challenger test RMSE superiority.
- **Request Example:**
```json
{
  "forceOverride": false,
  "reason": "Challenger achieves 5.2% RMSE reduction over Champion"
}
```

#### `POST /api/v1/models/:modelId/rollback`
- **Purpose:** Controlled atomic rollback to a previous stable `Archived` version.
- **Request Example:**
```json
{
  "targetVersionId": "ver_01a9b",
  "demoteCurrentTo": "Archived",
  "reason": "Emergency rollback due to holiday promotional skew"
}
```

#### `GET /api/v1/models/:modelId/compare?baseline=:v1&challenger=:v2`
- **Purpose:** Side-by-side metric diff (RMSE, MAE, MAPE, duration) with promotion recommendation.

---

### 5. Serving & Inference Endpoints

#### `POST /api/v1/predict`
- **Purpose:** Low-latency online retail demand inference with feature logging.
- **Request Example:**
```json
{
  "store_id": "STORE_01",
  "sku_id": "SKU_100",
  "date": "2026-03-15",
  "price": 3.49,
  "discount_pct": 0.10,
  "is_holiday": 0
}
```
- **Response Example (200 OK):**
```json
{
  "predictionId": "pred_c910a-3e",
  "modelId": "mdl_7a1b",
  "modelVersionId": "ver_04f8",
  "versionNumber": 2,
  "algorithm": "gradient_boosting",
  "predictedUnits": 38.64,
  "latencyMs": 8.42
}
```

#### `POST /api/v1/predict/batch`
- **Purpose:** Batch inference for up to 500 records in a single transactional request.

#### `GET /api/v1/predictions`
- **Purpose:** Lists recent logged prediction requests with filter options (`?limit=50&modelId=...`).

#### `POST /api/v1/predictions/ground-truth`
- **Purpose:** Reconciles delayed actual sales figures (`units_sold`) against logged predictions.
- **Request Example:**
```json
{
  "updates": [
    { "predictionId": "pred_c910a-3e", "actualUnits": 41.0 },
    { "date": "2026-03-15", "store_id": "STORE_01", "sku_id": "SKU_100", "actualUnits": 41.0 }
  ]
}
```

#### `GET /api/v1/metrics`
- **Purpose:** Returns serving operational telemetry: total predictions, labeled count, average latency, p95 latency, and error counts.

---

### 6. Monitoring & Drift Endpoints

#### `POST /api/v1/monitoring/run`
- **Purpose:** Executes statistical PSI and KS drift evaluation across recent prediction windows.
- **Request Example:**
```json
{
  "modelId": "mdl_7a1b",
  "windowLimit": 200,
  "psiThreshold": 0.20,
  "ksPvalueThreshold": 0.05,
  "rmseDegradationFactor": 1.25
}
```

#### `GET /api/v1/monitoring/reports`
- **Purpose:** Lists historical monitoring window reports and aggregate drift indicators.

#### `GET /api/v1/monitoring/drift-events`
- **Purpose:** Lists granular feature alerts (`?acknowledged=false&modelId=...`).

#### `POST /api/v1/monitoring/drift-events/:eventId/acknowledge`
- **Purpose:** Marks a drift alert as acknowledged, writing an immutable record to `audit_logs`.

---

### 7. Retraining & Governance Endpoints

#### `POST /api/v1/retraining/evaluate`
- **Purpose:** Evaluates retraining eligibility, cooldown window status, and circuit breakers without triggering a job.

#### `POST /api/v1/retraining/trigger`
- **Purpose:** Idempotently triggers automated retraining, challenger evaluation, and gated promotion.
- **Request Example:**
```json
{
  "modelId": "mdl_7a1b",
  "triggerType": "PERFORMANCE_POLICY",
  "idempotencyKey": "retrain-alert-ev_8b21c",
  "bypassCooldown": false,
  "minRmseImprovement": 0.02
}
```

#### `GET /api/v1/retraining/jobs`
- **Purpose:** Lists historical retraining job outcomes, execution durations, and gate decisions.

#### `GET /api/v1/audit`
- **Purpose:** Immutable audit trail filterable by action (`?limit=100&action=MODEL_PROMOTED_TO_PRODUCTION`).

---

## 10. Installation and Setup

### Prerequisites
- **Operating System:** Windows 10/11, macOS, or Linux (Ubuntu 22.04+ recommended).
- **Node.js:** `v20.x` or `v22.x` (LTS) installed (`node --version`).
- **Python:** `v3.11.x` installed and accessible via PATH (`python --version` or `python3 --version`).
- **Git:** Installed and configured (`git --version`).

---

### Step 1: Clone Repository & Create Virtual Environment

```bash
# Clone the repository
git clone https://github.com/your-org/ModelOps360.git
cd ModelOps360

# Create and activate a Python 3.11 virtual environment
# Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux / macOS:
python3 -m venv .venv
source .venv/bin/activate
```

---

### Step 2: Install Dependencies

```bash
# Install Python dependencies for the ML worker and testing
pip install --upgrade pip
pip install -r backend/requirements.txt

# Install Node.js dependencies for the API control plane and frontend
npm install
```

---

### Step 3: Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Windows (PowerShell):
Copy-Item .env.example .env
```

Ensure `.env` contains valid local development settings (see [Environment Variables](#11-environment-variables)). For local dev, SQLite is used automatically via `./data/modelops360.db`.

---

### Step 4: Verify Installation & Run Health Checks

```bash
# Run the Python test suite
pytest ml/tests/ backend/tests/

# Run the TypeScript server test suite
npm test
```

---

## 11. Environment Variables

ModelOps360 complies with **12-Factor App principles**. All runtime settings are loaded from environment variables and validated at startup using `loadConfig()` (TypeScript) and `pydantic-settings` (Python).

| Variable | Purpose | Required | Default in Local Dev |
| :--- | :--- | :---: | :--- |
| `APP_NAME` | Logical application name displayed in logs and headers | No | `ModelOps360` |
| `APP_ENV` | Application environment (`development`, `test`, `staging`, `production`) | No | `development` |
| `LOG_LEVEL` | Logging verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`) | No | `INFO` |
| `PORT` | HTTP port for the Express control plane and Vite frontend | No | `3000` |
| `JWT_SECRET` | Secret key used for signing HMAC-SHA256 bearer tokens (min 32 chars) | **Yes in Prod** | `CHANGE_ME_LOCAL_DEV_ONLY_MIN_32_CHARS` |
| `JWT_ALGORITHM` | Algorithm used for JWT encoding | No | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token validity duration in minutes | No | `60` |
| `ALLOWED_ORIGINS` | Comma-delimited list of allowed CORS origins | No | `http://localhost:3000` |
| `ENFORCE_AUTH` | When `true`, enforces JWT Bearer tokens on all mutating API routes | No | `false` (in dev) |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests allowed per 60-second window per IP | No | `300` |
| `LOCAL_SQLITE_PATH` | Path to local SQLite database file in development | No | `./data/modelops360.db` |
| `DATABASE_URL` | PostgreSQL connection URI for production container deployments | **Yes in Prod** | `postgresql+psycopg://user:pass@localhost:5432/modelops360` |
| `ARTIFACT_STORAGE_PATH` | Directory where sealed model JSON artifacts are stored | No | `./artifacts` |
| `MLFLOW_TRACKING_URI` | Address of the central MLflow tracking server | No | `http://localhost:5000` |
| `MLFLOW_EXPERIMENT_NAME` | Default experiment namespace inside MLflow | No | `retail-demand-forecasting` |
| `DRIFT_PSI_THRESHOLD` | Population Stability Index ceiling triggering drift alerts | No | `0.20` |
| `DRIFT_KS_PVALUE_THRESHOLD` | Kolmogorov-Smirnov p-value threshold for statistical significance | No | `0.05` |
| `RETRAINING_COOLDOWN_HOURS` | Mandatory cooldown window between automated retraining runs | No | `24` |
| `MIN_PROMOTION_RMSE_IMPROVEMENT` | Minimum relative RMSE improvement required for Challenger promotion | No | `0.02` (2%) |
| `PYTHON_EXECUTABLE` | Command used by Express to spawn Python ML sub-processes | No | `python` (or `python3`) |

> [!CAUTION]
> Never commit `.env` or production secrets to source control. In production environments, inject secrets via AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets.

---

## 12. Running the Complete Application

ModelOps360 is engineered to boot immediately in development mode with a single command:

```bash
# Start the unified Control Plane and React Dashboard on http://localhost:3000
npm run dev
```

### Startup Sequence & Component Initialization
1. **Config Validation:** Validates environment variables; fails fast if required settings are invalid.
2. **Database Initialization:** Opens SQLite database in `./data/modelops360.db`, applies `PRAGMA journal_mode = WAL;`, enables foreign keys, and idempotently provisions the 14 schema tables.
3. **Artifact Directory Provisioning:** Ensures `./artifacts/models` and `./artifacts/datasets` directories exist with proper write permissions.
4. **Vite SSR Middleware:** Attaches Vite middleware to the Express pipeline in development, providing instant Hot Module Replacement (HMR).
5. **Worker Verification:** Probes Python runtime (`detectPythonVersion()`) to ensure `ml/cli.py` can be spawned.
6. **Listener Activation:** Starts listening on `0.0.0.0:3000`.

### Bootstrapping Initial Demo Data
To explore the platform with realistic retail demand data:
1. Open your browser at `http://localhost:3000`.
2. On the **Overview** page, if the database is unseeded, click the **"Seed Retail Demand Lifecycle"** button.
3. This triggers a full automated end-to-end lifecycle run:
   - Generates a 120-day baseline retail dataset (`retail-store-q1`).
   - Runs the 6 data validation gates.
   - Fits baselines and trains a Gradient Boosted Decision Tree model.
   - Registers the model as `retail-demand-forecaster` (v1) in `Candidate`.
   - Promotes v1 to `Production` and creates an active deployment endpoint.
   - Simulates 50 production prediction requests.
   - Runs a monitoring check confirming zero initial drift.

---

## 13. Testing and Quality Assurance

The repository includes a comprehensive, multi-phase test suite covering TypeScript services, Python ML algorithms, database constraints, and governance gates.

```
                  ┌───────────────────────────────────────────┐
                  │          Continuous Test Matrix           │
                  └─────┬───────────────────────────────┬─────┘
                        │                               │
             ┌──────────▼──────────┐         ┌──────────▼──────────┐
             │ TypeScript Integration │       │ Python Unit & ML     │
             │ (node:test + assert) │        │ (pytest + scikit)   │
             ├─────────────────────┤         ├─────────────────────┤
             │ Phase 1: Core Config│         │ Phase 2: QA Gates   │
             │ Phase 2: QA Gates   │         │ Phase 3: Train/Split│
             │ Phase 3: FE & Tuning│         │ Phase 7: Drift/PSI  │
             │ Phase 4: Registry SM│         │ Core Logging/Config │
             │ Phase 5: RBAC/Scrypt│         │ Registry Governance │
             │ Phase 6: Pointer Srv│         │ Scrypt Security     │
             │ Phase 7: Drift/PSI  │         │ Retraining Policy   │
             │ Phase 8: Retraining │         │ Rollback Integrity  │
             │ Phase 9: Rollback   │         └─────────────────────┘
             └─────────────────────┘
```

### Running the Python ML Test Suite

```bash
pytest ml/tests/ backend/tests/ -v
```
*Verified Output:* **20 passed in 7.48s**
- `ml/tests/test_phase2.py`: Verifies schema detection, missingness rejection, duplicate key detection, negative price bounds, and IQR upper-fence profiling.
- `ml/tests/test_phase3.py`: Verifies chronological train/val/test split ordering, causal lag computation, and `safe_json_v1` serialization.
- `ml/tests/test_phase7.py`: Verifies mathematical PSI binning stability and Two-Sample KS statistic convergence.
- `backend/tests/test_phase1_core.py`: Verifies 12-Factor settings validation and structured JSON log formatting.
- `backend/tests/test_phase4_registry.py`: Validates legal and illegal state transitions in the 6-stage model registry state machine.
- `backend/tests/test_phase5_security.py`: Validates `scrypt` password hashing, timing-safe equality, and JWT role extraction.
- `backend/tests/test_phase8_retraining.py`: Validates cooldown window enforcement, circuit breaker trip conditions, and Champion–Challenger relative RMSE gates.
- `backend/tests/test_phase9_rollback.py`: Validates rollback candidate selection prioritizing `Archived` over `Staging` and strictly blocking `Rejected`.

### Running the TypeScript Server Test Suite

```bash
npm test
```
- Tests all 9 architectural phases against isolated in-memory SQLite instances on ephemeral ports (`127.0.0.1:0`).

---

## 14. Security & RBAC

ModelOps360 implements strict security guardrails across authentication, authorization, input validation, and artifact storage.

### 1. Password Storage with `scrypt`
- Uses Node.js native `crypto.scryptSync` with:
  - 16-byte cryptographically secure random salt (`crypto.randomBytes(16)`).
  - Memory-hard parameters ($N=16384, r=8, p=1$).
  - 64-byte derived key length.
- Password verification uses constant-time `crypto.timingSafeEqual` to eliminate timing side-channel attacks.

### 2. Role-Based Access Control (RBAC)
Stateless JWT bearer tokens encode `{ sub, email, role, exp }`. Middleware enforces three distinct authorization tiers:

| Role | Permissions | Access Scope |
| :--- | :--- | :--- |
| **`Admin`** | Full platform authority | All endpoints, including user provisioning (`GET /users`), emergency rollbacks, and policy overrides. |
| **`ML_Engineer`** | Model and data lifecycle mutator | Ingests datasets, launches training, transitions registry stages, acknowledges drift events, and triggers retraining. Read-only on user directory. |
| **`Viewer`** | Read-only observer | Can view dashboard, inspect models, examine drift charts, and read audit logs. Mutating routes return `403 FORBIDDEN`. |

### 3. API Protection & Correlation
- **Request Correlation:** The `requestContextMiddleware` extracts or generates an `X-Request-ID` UUIDv4, attaching it to the request context, response header, and all structured JSON logs.
- **Rate Limiting:** Sliding-window in-memory rate limiter restricting requests per IP (default: 300 requests/minute).
- **CORS & Headers:** Explicitly whitelist allowed origins; removes `X-Powered-By`.

### 4. Safe Model Deserialization
- Traditional Python `pickle.load()` allows arbitrary code execution if an artifact bucket is compromised. ModelOps360 stores trees and linear coefficients in a strict JSON format (`safe_json_v1`). Before any model is loaded into memory, its SHA-256 digest is checked against the database ledger.

---

## 15. User Interface & Dashboard

The frontend is an enterprise dark-mode Single Page Application (SPA) built with React 19, Tailwind CSS v4, and Recharts, styled with custom design tokens (`#0B0D12` canvas, `#151923` surfaces, `#8B7CFF` purple accent, `#32C98A` success, `#F16C78` error, and `JetBrains Mono` tabular figures).

### Overview Dashboard
Displays 6 live KPI cards (`Registered Models`, `Active Production`, `Experiments Done`, `Active Deployments`, `Drift Alerts`, `Pending Retraining`) and 4 interactive Recharts charts:
- Model Performance Over Time (RMSE trends across versions).
- Real-time Prediction Volume and Latency distribution.
- Drift Score Trends (PSI progression across monitoring windows).
- Training Activity by Algorithm distribution.

### 12 Functional Views
1. **Overview (`/#/overview`):** High-level operational health, KPI cards, Recharts trends, recent activity stream, and live seeder.
2. **Datasets (`/#/datasets`):** Dataset version table, synthetic scenario generator (`reference`, `drifted`, `corrupted`), CSV uploader, and EDA profiling panel with 8-column distribution summaries.
3. **Experiments (`/#/experiments`):** Filterable MLflow runs table, hyperparameter inspector, multi-run RMSE/MAE comparison charts, and one-click model registration.
4. **Model Registry (`/#/models`):** 6 lifecycle stage tabs (`Production`, `Staging`, `Candidate`, `Development`, `Archived`, `Rejected`), active production pointers, and SHA-256 integrity badges.
5. **Model Details (`/#/models/:modelId`):** Artifact inspection, version history switcher, stage transition guards, force-override promotion controls, and rollback confirmation modals.
6. **Deployments (`/#/deployments`):** Active serving endpoints, traffic weights, latency/error readouts, and rollback triggers.
7. **Predictions (`/#/predictions`):** Online demand forecaster, clean/drifted batch inference triggers, prediction log table, and delayed ground-truth reconciliation modal.
8. **Monitoring (`/#/monitoring`):** Feature PSI trends, live RMSE vs. baseline degradation threshold line, API latency tracking, and missingness quality rates.
9. **Drift Detection (`/#/drift`):** Feature-by-feature PSI & KS test breakdown, Reference vs. Production mean comparison bars, remediation recommendations, and inline alert acknowledgement.
10. **Retraining Jobs (`/#/retraining`):** 5-step closed-loop workflow strip, real-time policy gate evaluator (cooldown and circuit breaker status), manual retraining modal, and retry decision table.
11. **Model Comparison (`/#/comparison`):** Side-by-side Champion vs. Challenger metric matrix, gate verdict banner, and error comparison charts.
12. **Audit Logs (`/#/audit`):** Searchable, immutable event ledger with action filters (`?action=MODEL_PROMOTED_TO_PRODUCTION`) and full JSON payload modal.

---

## 16. Deployment Guide

ModelOps360 supports dual-track deployment: local containerized environments and enterprise cloud infrastructure on Amazon Web Services (AWS).

### Local Container Deployment (Docker Compose Target)

The platform is designed to run in Docker Compose with the following service topology:

```yaml
# Conceptual Docker Compose Topology (Target Track B)
services:
  # 1. Reverse Proxy & Frontend Control Plane
  control-plane:
    build: .
    ports:
      - "3000:3000"
    environment:
      - APP_ENV=production
      - DATABASE_URL=postgresql+psycopg://modelops:secure_pass@postgres:5432/modelops360
      - MLFLOW_TRACKING_URI=http://mlflow:5000
    depends_on:
      - postgres
      - mlflow

  # 2. Metadata Database
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: modelops
      POSTGRES_PASSWORD: secure_pass
      POSTGRES_DB: modelops360
    volumes:
      - pgdata:/var/lib/postgresql/data

  # 3. MLflow Tracking Server
  mlflow:
    image: ghcr.io/mlflow/mlflow:v2.19.0
    command: mlflow server --backend-store-uri postgresql://modelops:secure_pass@postgres:5432/modelops360 --default-artifact-root /artifacts --host 0.0.0.0
    volumes:
      - artifact_data:/artifacts
    depends_on:
      - postgres

volumes:
  pgdata:
  artifact_data:
```

### AWS Production Architecture (Deployment Guide)

For high-availability enterprise environments, ModelOps360 maps directly to managed AWS services:

```mermaid
flowchart TD
    CF["CloudFront CDN / Route 53"] --> ALB["Application Load Balancer (ALB)"]
    ALB --> ECS_CP["ECS Fargate: Control Plane API<br/>(Express / FastAPI Containers)"]
    ALB --> ECS_SRV["ECS Fargate: Serving Plane<br/>(Autoscaled /predict Instances)"]

    ECS_CP --> RDS[("Amazon RDS PostgreSQL Multi-AZ<br/>(Metadata, Registry, Audit Logs)")]
    ECS_SRV --> RDS

    ECS_CP --> S3[("Amazon S3 Bucket<br/>(Immutable Artifacts & Datasets)")]
    ECS_SRV --> S3

    ECS_CP --> MLF_ECS["ECS Fargate: MLflow Tracking Server"]
    MLF_ECS --> RDS
    MLF_ECS --> S3

    CW["Amazon CloudWatch Logs & Metrics"] --- ECS_CP
    CW --- ECS_SRV

    EVENT["Amazon EventBridge / Airflow DAG"] -->|Trigger Scheduled Monitoring & Retraining| ECS_CP
```

- **Inference & Serving:** AWS ECS Fargate autoscaled on CPU and request latency metrics.
- **Relational Metadata:** Amazon RDS PostgreSQL Multi-AZ with automated backups.
- **Artifacts & Datasets:** Amazon S3 with Object Lock enabled for compliance and DVC remote storage.
- **Telemetry:** AWS CloudWatch Logs Insights indexing structured JSON log lines and `X-Request-ID`.
- **Scheduled Orchestration:** Amazon EventBridge or Apache Airflow triggering `/api/v1/monitoring/run` and `/api/v1/retraining/trigger`.

---

## 17. Limitations and Future Roadmap

### Current Implementation Status

| Capability | Status | Implementation Details |
| :--- | :---: | :--- |
| **Workspace Control Plane** | Complete | Express 4.21, TypeScript, SQLite WAL mode, full API routes under `/api/v1/*`. |
| **Data Validation & Baselines** | Complete | 6 quality gates, chronological splitting, Naive, 7-Day MA, and Ridge baselines. |
| **Feature Engineering & ML Training** | Complete | 13 causal features, Ridge, RF, GBDT, `safe_json_v1` JSON artifacts, SHA-256 verification. |
| **Model Registry State Machine** | Complete | Governed 6-stage FSM, promotion gate, ACID transactions, and atomic rollback. |
| **Prediction Serving & Logging** | Complete | Dynamic production pointer resolution, input validation, and asynchronous logging. |
| **Continuous Drift Monitoring** | Complete | Jeffreys-smoothed PSI, Two-Sample KS tests, 4 failure modes, and alert ledger. |
| **Automated Retraining Engine** | Complete | Cooldown window (24h), idempotency keys, circuit breaker, and champion–challenger gate. |
| **Security & RBAC** | Complete | Salted `scrypt` hashing, constant-time checks, JWT bearer tokens, `Admin`/`ML_Engineer`/`Viewer`. |
| **React 19 Dashboard** | Complete | 12 functional views, dark mode, Recharts visualizations, and ⌘K search modal. |
| **FastAPI / SQLAlchemy Target** | Complete | Modular `backend/app` package, SQLAlchemy 2.0 ORM models, Alembic migrations, Pytest suite. |
| **Docker Compose Stack** | Partial | Specifications defined; root `docker-compose.yml` pending repository commit. |
| **Evidently AI Reporting** | Partial | Stubbed in `backend/app/monitoring`; native PSI/KS engine is fully functional. |

### Planned Roadmap
- **Distributed Model Serving:** Support for Triton Inference Server and KServe for high-throughput GPU inference.
- **Streaming Ingestion:** Real-time event streaming via Apache Kafka / Redpanda for millisecond point-of-sale updates.
- **Advanced Deep Learning Models:** Incorporation of modern foundation time-series architectures (PatchTST, TimesFM, Chronos).
- **Multi-Tenancy:** Workspace-level isolation with fine-grained row-level security (RLS) in PostgreSQL.
- **Automated Canary Deployments:** Traffic splitters enabling automated 90/10 canary evaluations and shadow scoring before full promotion.
- **Infrastructure as Code (IaC):** Production-ready Terraform and AWS CloudFormation templates for ECS Fargate, RDS, and S3.

---

## 18. Contributing

We welcome contributions from the MLOps and open-source machine learning community!

### Contribution Guidelines
1. **Fork the Repository:** Create your feature branch (`git checkout -b feature/modelops-enhancement`).
2. **Follow Code Standards:**
   - TypeScript: Follow strict mode conventions (`npm run lint`).
   - Python: Follow PEP 8 guidelines; format with `black` and `ruff`.
3. **Write Tests:** Add unit tests for every new feature or bug fix. Ensure all existing tests pass:
   ```bash
   npm test
   pytest ml/tests/ backend/tests/
   ```
4. **Preserve Architectural Invariants:**
   - Never introduce temporal leakage in ML feature engineering.
   - Never serialize models with Python `pickle`; use `safe_json_v1`.
   - Never permit direct promotion to `Production` without going through `Candidate`/`Staging` and verifying artifact SHA-256 checksums.
5. **Submit a Pull Request:** Open a descriptive PR against `main` referencing any related issues.

---

## 19. License and Contact

### License
This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

### Maintainers & Contact
- **Project Maintainer:** ModelOps360 Engineering Team
- **Issue Tracker:** [GitHub Issues](https://github.com/your-org/ModelOps360/issues)
- **Documentation:** Explore the complete technical deep dives in the [`docs/`](docs/) directory:
  - [System Architecture](docs/architecture.md)
  - [REST API Reference](docs/api-reference.md)
  - [Database Design & Retention](docs/database-design.md)
  - [ML Pipeline & Validation](docs/ml-pipeline.md)
  - [Model Registry & MLflow Internals](docs/registry-and-mlflow.md)
  - [Model Serving & Ground Truth](docs/serving.md)
  - [Drift & Performance Monitoring](docs/monitoring.md)
  - [Automated Retraining Engine](docs/retraining.md)
  - [UI Architecture & Design System](docs/ui-architecture.md)
  - [Engineering Learning Notes](docs/learning-notes.md)
