# ModelOps360 — Engineering Learning Notes

## Phase 1: Core Architecture, Configuration, Logging & Separation of Concerns

### 1. 12-Factor Environment Configuration (`config.ts` / `config.py`)
- **What it is:** Loading all runtime parameters (`PORT`, `DATABASE_URL`, `DRIFT_PSI_THRESHOLD`, `JWT_SECRET`) from environment variables validated at startup.
- **Why it exists:** Prevents leaking secrets into Git and allows identical code/Docker images to run in development, staging, and AWS production with zero code edits.
- **What happens without it:** Hardcoded credentials leak via Git history; deploying to staging accidentally writes to the production database.
- **Fail-Fast Validation:** Both `loadConfig()` (TypeScript) and `Settings` (Pydantic v2) crash immediately on startup if an invalid `LOG_LEVEL` or negative threshold is passed, rather than failing silently hours later during a retraining run.

### 2. Structured JSON Logging & Request Correlation (`X-Request-ID`)
- **What it is:** Emitting every log line as single-line JSON (`timestamp`, `level`, `service`, `requestId`, `message`, `durationMs`).
- **Why it exists:** Plain `print()` or `console.log("error happened")` cannot be indexed or filtered in AWS CloudWatch Logs Insights or Datadog.
- **How `X-Request-ID` works internally:** Middleware checks for an incoming `X-Request-ID` header (or generates a UUIDv4), attaches it to the request context and response header, and passes it into all downstream logs and error payloads. When a client sees a `500` error, they report that single `requestId` and an engineer traces the exact request across microservices.

### 3. Separating App Factory (`createApiApp` / `create_app`) from Server Bootstrap (`server.ts`)
- **Why it exists:** Binding port `3000` inside the same module that defines routes makes automated integration testing painful (`EADDRINUSE` collisions).
- **How it works:** `app.ts` / `main.py` returns a configured app instance; tests mount it on an ephemeral port (`0`) or ASGI test client cleanly.

---

## Phase 2: Data Quality Gates, Temporal Leakage & Baseline Benchmarks

### 1. Pre-Training Data Validation Gates (`validator.py`)
- **What it is:** Automated assertions (schema presence, missing-value ceiling, composite key uniqueness, domain bounds) executed *before* any training job starts.
- **Why it exists:** Silent garbage-in-garbage-out corrupts production models (e.g., negative `units_sold` from return-order bugs or duplicate ETL ingestion inflating demand 2x).
- **Production rule:** Distinguish hard blockers (`severity: "error"`, e.g., negative prices) from informative diagnostics (`severity: "warning"`, e.g., Black Friday IQR sales spikes).

### 2. Why Always Start with Naive & Linear Baselines?
- **What it is:** Benchmarking `Naive Lag-1` and `7-Day Moving Average` alongside `Ridge Regression` before introducing `Random Forest` or `XGBoost`.
- **Why it exists:** If a complex gradient-boosted tree takes 10 minutes to train and only achieves `RMSE = 6.2` while a 1-line `7-Day Moving Average` gets `RMSE = 6.0`, your feature pipeline has a bug or lacks signal. Baselines establish the **minimum bar** every challenger model must clear.

### 3. Ridge Regression Closed-Form Solution
- **How it works internally:** Ridge adds an $L_2$ penalty $\alpha \|w\|^2$ to OLS: $w = (X^T X + \alpha I)^{-1} X^T y$. Note that index `0` (the intercept/bias term) is **not** penalized so predictions remain centered around the true demand mean.

---

## Phase 3: Feature Engineering, Bagging vs. Boosting & Safe Artifacts

### 1. Eliminating Training-Serving Skew
- **What it is:** Divergence between how features are computed during offline Pandas/Python training versus online `/predict` requests.
- **How we prevent it:** `build_single_feature_vector()` in `ml/features/pipeline.py` is the single source of truth called both when building `x_train` and when serving live inference via `predict_with_artifact()`.

### 2. Cyclical Calendar Encoding (`dow_sin`, `dow_cos`)
- **Why it exists:** Encoding Monday=0..Sunday=6 as a raw integer implies Sunday (6) and Monday (0) are maximally far apart. Mapping day-of-week onto the unit circle $(\sin(2\pi d/7), \cos(2\pi d/7))$ preserves wrap-around continuity.

### 3. Bagging (Random Forest) vs. Stagewise Boosting (GBDT)
- **Random Forest (Bagging):** Trains independent deep trees in parallel on bootstrap samples + random feature subsets (`max_features`), averaging them to **reduce variance**.
- **Gradient Boosting:** Trains shallow trees sequentially, where each tree fits the negative gradient (residuals $y_i - \hat{y}_i$) of the previous ensemble scaled by `learning_rate`, **reducing bias**.

### 4. Why Validation Set Tunes Hyperparameters & Test Set Stays Untouched
- Tuning hyperparameters directly on the test set leaks test information into model selection, yielding optimistically biased metrics. Validation RMSE selects hyperparameters and winning model family; the test split measures unbiased generalization once.

---

## Phase 4: MLflow Internals & Governed Model Lifecycle

### 1. MLflow Backend Store vs. Artifact Store
- **Interview Question:** *"If you delete an artifact in S3, why does MLflow still list the run in the UI?"*
  - **Answer:** Because MLflow separates metadata (PostgreSQL Backend Store) from blobs (S3 Artifact Store). The database still holds the `run_id`, params, and metrics while `artifact_uri` points to a missing S3 key—which is why ModelOps360's `verifyArtifactIntegrity()` explicitly verifies existence + SHA-256 checksum before any `Staging` or `Production` transition!

### 2. Why Registering $\neq$ Promoting
- Registering creates an immutable version snapshot (`v1`, `v2`) in `Development` or `Candidate`.
- Promotion to `Production` runs inside an ACID database transaction (`BEGIN IMMEDIATE ... COMMIT`) that atomically archives the previous `Production` version, updates the single `production_version_id` pointer, and appends an immutable row to `audit_logs`.

---

## Phase 5: Database Architecture, Security, Scrypt & RBAC

### 1. Why `scrypt` Instead of `SHA-256` for Password Storage?
- **Problem:** Fast hashes like `SHA-256` can be brute-forced on GPUs at billions of hashes per second.
- **Solution:** `scrypt` is deliberately **memory-hard and CPU-expensive** with a per-user 16-byte random salt, and `crypto.timingSafeEqual` / `hmac.compare_digest` prevents timing side-channel leaks.

### 2. JWT Authentication + RBAC (`Admin`, `ML_Engineer`, `Viewer`)
- Stateless HMAC-SHA256 bearer tokens carry `{ sub, email, role, exp }`.
- Middleware separates **Authentication** (who are you? `401 UNAUTHORIZED`) from **Authorization** (what can your role do? `403 FORBIDDEN`). For example, a `Viewer` can read `/datasets`, `/models`, and `/audit`, but receives `403 FORBIDDEN` on `POST /datasets/generate` or `GET /users`.

---

## Phase 6: Model Serving, Pointer Resolution & Delayed Ground Truth

### 1. Why Never Hardcode `model_v1.pkl` in Your Serving Code?
- Hardcoding a model path couples deployment lifecycle to source-code commits and prevents instant rollback. Resolving `registered_models.production_version_id` dynamically means promoting `v2` or rolling back to `v1` switches live inference immediately with zero code changes.

### 2. Why Log Input Features Alongside Every Prediction?
- Computing covariate drift ($P(X)$ shifts) and debugging anomalous customer predictions requires knowing the exact input vector the model saw at inference time, not just the predicted number.

---

## Phase 7: Statistical Drift Detection & Ground-Truth Performance Monitoring

### 1. Why Covariate Drift Alone Does NOT Prove Model Failure
- **Concept:** Suppose a retailer runs an unusual `45%` clearance sale ($P(X)$ shifts strongly, so `PSI > 0.20`), but if the trained Ridge/GBDT model already learned the true price-elasticity curve accurately, its predictions remain close to `actual_units`.
- **Rule:** Data drift triggers a `COVARIATE_DRIFT_WARNING` for visibility, whereas proven `PERFORMANCE_DEGRADATION` requires reconciled ground-truth labels (`actual_units`) showing $\text{RMSE}_{\text{live}} > 1.25 \times \text{RMSE}_{\text{test}}$.

### 2. Why Combine PSI and KS Instead of Using KS Alone?
- Two-sample KS computes the max ECDF gap $D$ and asymptotic $p$-value. At large traffic volumes ($n > 5{,}000$), tiny, harmless shifts yield $p \approx 0$, flooding on-call engineers with false alerts.
- Requiring **effect size** via quantile-binned $\text{PSI}$ alongside KS prevents false-positive retraining storms.

---

## Phase 8: Automated Retraining Engine, Guardrails & Champion-Challenger Gates

### 1. Why Never Auto-Promote After Retraining Without a Gate?
- Fresh data does not guarantee a better model—noisy recent weeks or bad hyperparameters can yield a worse model (`higher RMSE`). ModelOps360 compares the Challenger against the live Champion and marks failing Challengers `Rejected` while leaving Production traffic untouched.

### 2. Idempotency Keys, Cooldowns & Circuit Breakers
- **Idempotency Keys:** Distributed schedulers (Airflow/EventBridge) deliver at-least-once triggers. Keying `retraining_jobs` by a unique `idempotency_key` guarantees retries return the existing job safely.
- **Cooldown Window:** Prevents endless hourly retraining loops during prolonged promo campaigns.
- **Circuit Breaker:** Halts automated runs after 3 consecutive `FAILED` jobs until an engineer inspects and resolves the upstream failure.

---

## Phase 9: Promotion Gates & Controlled Atomic Rollback

### 1. Why Preserving Faulty Models Beats Deleting Them
- During an emergency rollback, teams often delete or overwrite the broken `v2` container/record. Deleting `v2` destroys forensic evidence needed to reproduce the bug.
- ModelOps360 transitions `v2` to `Archived`, `Staging`, or `Rejected` (retaining its dataset hash, MLflow run, and artifact) while atomically switching `registered_models.production_version_id` and `deployments` back to `v1`.

### 2. Why Verify SHA-256 Before Rolling Back?
- If an older artifact was corrupted or purged by an S3 lifecycle retention rule, switching `production_version_id` blindly causes an instant serving outage (`500 FileNotFound`). Validating file existence + `SHA-256` checksum **before** entering the database transaction keeps `Production` safe.

