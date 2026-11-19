# ModelOps360 — Automated Retraining Engine & Guardrails (Phase 8)

## 1. Automated Retraining Workflow (Mermaid Diagram #7)

```mermaid
flowchart TD
    A[Trigger Request or Schedule<br/>POST /api/v1/retraining/trigger] --> B{Idempotency Key<br/>Already Exists?}
    B -- Yes --> C[Return Existing Job Idempotently<br/>HTTP 200 idempotentReplay=true]
    B -- No --> D[Run Retraining Policy Evaluator]
    D --> E{Active Job or<br/>Circuit Breaker >= 3 Fails?}
    E -- Yes --> F[Block Execution<br/>422 POLICY_VIOLATION]
    E -- No --> G{Cooldown Window Active<br/>and Not Bypassed?}
    G -- Yes --> F
    G -- No --> H{Automated Policy Eligible?<br/>Degradation or Corroborated Drift}
    H -- No --> F
    H -- Yes --> I[Queue & Start Job<br/>Select Latest Validated Dataset]
    I --> J[Train Challenger Candidate<br/>Chronological Split + Hyperparameter Search]
    J --> K[Register Challenger as Candidate]
    K --> L{Champion vs Challenger Gate<br/>RMSE Improvement >= 2%?}
    L -- No --> M[Transition Challenger -> Rejected<br/>Job=REJECTED_BY_GATE<br/>Keep Champion Untouched]
    L -- Yes --> N[Promote Candidate -> Staging -> Production<br/>Atomically Archive Old Champion & Sync Deployment]
    N --> O[Job=SUCCEEDED<br/>Write Immutable Audit Log]
```

---

## 2. Production Guardrails Implemented

| Guardrail | Mechanism | Why It Matters in Production |
| :--- | :--- | :--- |
| **Idempotency Keys** | `UNIQUE(idempotency_key)` on `retraining_jobs` | Prevents duplicate GPU/CPU training runs when Airflow tasks retry or webhooks fire twice |
| **Cooldown Window** | `RETRAINING_COOLDOWN_HOURS` (default `24h`) | Prevents "retraining storms" on oscillating traffic; operators must pass `bypassCooldown: true` for emergency runs |
| **Circuit Breaker** | Trips at `3` consecutive `FAILED` runs | Stops infinite retry loops against corrupted upstream feeds or broken code |
| **Policy Eligibility** | Requires proven `PERFORMANCE_POLICY` or corroborated severe `DRIFT_POLICY` | Never wastes compute retraining on benign single-feature noise |
| **Champion vs Challenger Gate** | Enforces `MIN_PROMOTION_RMSE_IMPROVEMENT` (`>= 2%`) before promotion | Never promotes a new model just because retraining ran; inferior challengers are marked `Rejected` while Champion stays live |

---

## 3. API Endpoints (Phase 8)
- `POST /api/v1/retraining/evaluate` — Evaluate policy eligibility, cooldown status, and circuit breaker without starting a job.
- `POST /api/v1/retraining/trigger` — Idempotently trigger Challenger training and run the Champion vs Challenger promotion gate.
- `GET /api/v1/retraining/jobs` — List historical retraining jobs and decisions (`?modelId=...`).
- `GET /api/v1/retraining/jobs/:jobId` — Inspect a specific retraining run.
