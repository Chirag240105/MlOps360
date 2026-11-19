# ModelOps360 ML Pipeline & Data Validation

## 1. Data Ingestion & Pre-Training Validation Pipeline (Mermaid Diagram #2)

```mermaid
flowchart TD
    IN["Raw Retail CSV / Generator\n(date, store_id, sku_id, category, price, discount_pct, is_holiday, units_sold)"]
    HASH["Compute Immutable SHA-256\nDataset Version Hash"]
    SCH["Gate 1: Required Schema &\nMinimum Row Count"]
    MISS["Gate 2: Missing-Value\nRatio Threshold"]
    DUP["Gate 3: Composite Key\nUniqueness (date, store_id, sku_id)"]
    DOM["Gate 4: Domain Bounds\n(units_sold >= 0, price > 0, discount <= 0.95)"]
    IQR["Diagnostic: IQR Outlier\n& Zero-Demand Profiling"]
    BLOCK["Block Training\n(HTTP 422 POLICY_VIOLATION)"]
    PASS["Persist Verified Version +\nEDA Profile to Metadata DB"]
    SPLIT["Chronological Split\n(70% Train / 15% Val / 15% Test)"]
    BASE["Train & Benchmark Baselines\n(Naive Lag-1, 7-Day MA, Ridge Regression)"]

    IN --> HASH --> SCH --> MISS --> DUP --> DOM --> IQR
    SCH -->|Fail| BLOCK
    MISS -->|Fail| BLOCK
    DUP -->|Fail| BLOCK
    DOM -->|Fail| BLOCK
    IQR -->|Error Gates Passed| PASS --> SPLIT --> BASE
```

## 2. Why Chronological Splitting Is Mandatory

Retail demand is autocorrelated over time and exhibits calendar seasonality (weekends, paydays, holidays). Randomly shuffling rows (`train_test_split(..., shuffle=True)`) places Tuesday's sales in the test set while Wednesday's and Monday's sales of the *same week* sit in training—causing **temporal leakage**.

In `ml/training/baselines.py`:
1. Records are sorted strictly by `(date, store_id, sku_id)`.
2. Lag features (`lag_1`, `rolling_7d_mean`) are computed strictly causally from $t - 1 \dots t - 7$.
3. Store-SKU target encoding (`store_sku_train_mean`) is fit **only** on the training split and mapped to validation/test.
4. `max(train.date) < min(val.date) <= max(val.date) < min(test.date)` is asserted in automated tests.

## 3. Safeguarded MAPE

Standard $\text{MAPE} = \frac{100}{n}\sum \frac{|y - \hat{y}|}{|y|}$ fails with division-by-zero whenever a SKU experiences a zero-sales stockout day ($y = 0$). Our `ml/training/metrics.py` computes:
- `MAE` and `RMSE` across all samples.
- Safeguarded `mapePct` computed strictly over samples where $|y| \ge 1.0$, alongside explicit `zeroActualCount`.
- `smapePct` (Symmetric MAPE), which remains bounded $[0\%, 200\%]$ even when $y = 0$.

---

## 4. Reproducible ML Training Workflow (Mermaid Diagram #3)

```mermaid
flowchart LR
    DS["Validated Dataset Version\n(SHA-256 Locked)"] --> FE["Shared Feature Pipeline\n(lags, rolling stats, cyclic DOW,\nnet_price, train-only target enc)"]
    FE --> SPLIT["Chronological Split\n70% Train / 15% Val / 15% Test"]
    SPLIT --> TUNE["Hyperparameter Tuning\n(Ridge, Random Forest,\nGradient Boosting)\non Validation RMSE"]
    TUNE --> TEST["Unbiased Held-Out\nTest Evaluation"]
    TEST --> ART["Safe JSON Artifact +\nReference Profile +\nSHA-256 Checksum"]
    ART --> DB[("training_runs Lineage\nGit SHA + Dataset Hash")]
```

### Feature Engineering Catalog (`ml/features/pipeline.py`)
* **Pricing & Promo Signals:** `price`, `discount_pct`, `net_price = price * (1 - discount_pct)`, `price_discount_interaction = price * discount_pct`
* **Calendar Cyclicity:** `is_holiday`, `is_weekend`, `dow_sin = sin(2*pi*dow/7)`, `dow_cos = cos(2*pi*dow/7)`
* **Causal Demand History:** `lag_1`, `lag_7`, `rolling_7d_mean`, `rolling_7d_std`
* **Series Baseline:** `store_sku_train_mean` (fit strictly on `train_rows`)

### Safe Serialization vs. `pickle`
Python `pickle.loads()` executes arbitrary `__reduce__` opcodes and is an RCE vector if an attacker compromises artifact storage. ModelOps360 serializes trees and linear weights as canonical `safe_json_v1` JSON (or XGBoost `.json`/`.ubj` in Track B) and verifies the `SHA-256` checksum before loading.

