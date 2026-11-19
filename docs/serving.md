# Model Serving & Prediction Logging

## 1. Prediction Request Lifecycle (Mermaid Diagram #5)

```mermaid
sequenceDiagram
    autonumber
    participant Client as Retail Client
    participant API as Serving Gateway (/predict)
    participant Reg as Model Registry Pointer
    participant Store as Artifact Store (SHA-256)
    participant ML as Shared Feature + Inference Engine
    participant DB as Predictions & Metrics Table

    Client->>API: POST /api/v1/predict { store_id, sku_id, date, price, discount_pct }
    API->>API: Validate schema, bounds (price > 0, 0 <= discount <= 0.95) & attach X-Request-ID
    API->>Reg: Resolve active Production model pointer (no hardcoded filename)
    Reg-->>API: modelVersionId, artifactPath, expectedSha256
    API->>Store: Load artifact & verify SHA-256 digest
    API->>ML: Apply build_single_feature_vector() & score model
    ML-->>API: predicted_units
    API->>DB: Persist predictionId, requestId, features, output, latency_ms
    API-->>Client: HTTP 200 { predictionId, versionNumber, algorithm, predictedUnits, latencyMs }
```

## 2. Delayed Ground-Truth Reconciliation
Retail sales actuals (`units_sold`) arrive at end-of-day or end-of-week—long after `/predict` responded. `POST /api/v1/predictions/ground-truth` joins actual sales back to logged `predictions` rows by `predictionId` or `(date, store_id, sku_id)` so Phase 7 monitoring can calculate true live `MAE` and `RMSE`.
