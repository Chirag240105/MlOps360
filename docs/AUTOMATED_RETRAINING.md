# Automated Closed-Loop Retraining

## 1. Overview

ModelOps360 executes **closed-loop automated retraining**. Retraining is triggered programmatically by drift signals or scheduled checks, validated through domain quality gates, evaluated against production benchmarks, and conditionally promoted—all **without human intervention, yet completely controlled**.

```mermaid
flowchart TD
    Trigger([Trigger: Drift Signal / Manual / Timer]) --> Guardrails{Policy Guardrails Check}
    Guardrails -->|Cooldown Active < 24h| Blocked[Suppress Trigger & Log]
    Guardrails -->|Circuit Breaker Open >= 3 Fails| Blocked
    Guardrails -->|Active Job Running| Blocked
    Guardrails -->|Pass| Queue[Queue Job in JobManager]

    Queue --> Worker[Worker Thread Dispatch]
    Worker --> Ingest[1. Ingest Inflow Dataset]
    Ingest --> Val{2. Pre-Training Validation Gates}
    Val -->|Failed| FailJob[Mark Job FAILED & Trip Circuit Breaker]
    Val -->|Passed| Train[3. Chronological 70/15/15 Training + GBDT/Ridge]

    Train --> Track[4. Log Parameters & Metrics to MLflow]
    Track --> Eval[5. Held-Out Test Evaluation]
    Eval --> Compare{6. Challenger vs. Champion Gate}
    Compare -->|Delta RMSE >= 2%| Promote[7a. Promote: Update Production Pointer & Stage]
    Compare -->|Delta RMSE < 2%| Reject[7b. Reject: Quarantine Candidate & Keep Champion]

    Promote --> Audit[8. Append Immutable Audit Record]
    Reject --> Audit
```

---

## 2. Champion–Challenger Gate Formula

Candidates are never promoted simply because training succeeded. They must beat the reigning champion on the held-out test split:

$$\Delta \text{RMSE} = \frac{\text{RMSE}_{\text{Champion}} - \text{RMSE}_{\text{Challenger}}}{\text{RMSE}_{\text{Champion}}} \ge 2.0\%$$

- **Initial Deployment**: If no production model exists, the first validated model is auto-promoted.
- **Superior Challenger**: Updates `production_pointer.json`, demotes previous model to `Archived`, transitions challenger to `Production`.
- **Inferior / Regressed Candidate**: Quarantined with stage `Rejected`. Production champion remains active.
