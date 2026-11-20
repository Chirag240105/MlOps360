# Continuous Production Monitoring

## 1. Overview

Production machine learning models operate in dynamic real-world environments. Changes in consumer preferences, supplier pricing, economic conditions, or upstream data pipelines cause **model decay**.

ModelOps360 provides continuous, automated production monitoring without requiring external infrastructure like Airflow or Datadog.

---

## 2. Monitored Metrics

ModelOps360 tracks four distinct operational categories:

```mermaid
graph TD
    subgraph IngestionTraffic ["1. Inference Traffic & Service Health"]
        Vol["Request Volume (total / 1m / 1h)"]
        Lat["Inference Latency (avg & p95 ms)"]
        Err["API Error Rates & Status Codes"]
    end

    subgraph DataIntegrity ["2. Input Data Quality"]
        Nulls["Missing Value Ratios (< 5%)"]
        Types["Schema Type Validation"]
        Bounds["Range Bounds (e.g. Price > 0)"]
    end

    subgraph CovariateShift ["3. Covariate / Feature Drift"]
        PSI["Population Stability Index (PSI >= 0.20)"]
        KS["Two-Sample Kolmogorov-Smirnov Test (p < 0.05)"]
    end

    subgraph ConceptShift ["4. Ground-Truth Performance Drift"]
        RMSE["Live Root Mean Squared Error"]
        MAE["Live Mean Absolute Error"]
        Degradation["RMSE Degradation Factor (> 1.25x Baseline)"]
    end
```

---

## 3. Storage and Telemetry Flow

1. **Prediction Logging**: Every call to `POST /predict` records:
   - Unique `request_id`
   - Active `model_version_id`
   - Monitored feature values
   - Predicted units and latency
2. **Ground-Truth Label Joining**: When actual sales data arrives, records are joined on `(store_id, sku_id, date)`.
3. **Audit Ledger**: Monitoring reports are saved as JSON artifacts in `artifacts/monitoring/{report_id}.json` and indexed in the `monitoring_reports` table.
