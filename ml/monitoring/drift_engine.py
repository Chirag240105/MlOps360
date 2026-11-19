import math
import statistics
from typing import Any, Dict, List, Optional

from ml.features.pipeline import build_single_feature_vector
from ml.training.metrics import compute_regression_metrics

MONITORED_FEATURES = [
    "price",
    "discount_pct",
    "net_price",
    "price_discount_interaction",
    "is_holiday",
    "is_weekend",
]


def compute_psi(
    reference_edges: List[float],
    reference_values: List[float],
    current_values: List[float],
    eps: float = 1e-4,
) -> float:
    """
    Compute Population Stability Index (PSI) across reference quantile bins:
      PSI = sum((p_curr - p_ref) * ln(p_curr / p_ref))
    Interpretation: <0.10 stable, 0.10-0.20 moderate shift, >=0.20 significant drift.
    """
    if not reference_values or not current_values:
        return 0.0

    # Sample-size-aware Jeffreys smoothing floor prevents 1/10,000 log-odds spikes on finite windows
    smooth = max(eps, 0.5 / max(10, min(len(reference_values), len(current_values))))

    # 1. Low-cardinality discrete / binary features (e.g. is_holiday, is_weekend)
    unique_ref = sorted(set(round(v, 6) for v in reference_values))
    if len(unique_ref) <= 6:
        n_ref = len(reference_values)
        n_cur = len(current_values)
        psi = 0.0
        for u in unique_ref:
            p = max(smooth, sum(1 for v in reference_values if abs(v - u) < 1e-6) / n_ref)
            q = max(smooth, sum(1 for v in current_values if abs(v - u) < 1e-6) / n_cur)
            psi += (q - p) * math.log(q / p)
        cur_other = sum(1 for v in current_values if all(abs(v - u) >= 1e-6 for u in unique_ref)) / n_cur
        if cur_other > 0:
            psi += (max(smooth, cur_other) - smooth) * math.log(max(smooth, cur_other) / smooth)
        return round(max(0.0, psi), 4)

    # 2. Zero-inflated / tied continuous features where quantile edges collapse (< 4 unique edges)
    edges = sorted(set(reference_edges))
    if len(edges) < 4:
        lo = min(reference_values)
        hi = max(reference_values)
        if abs(hi - lo) < 1e-9:
            edges = [lo]
        else:
            above_lo = sorted(v for v in reference_values if v > lo + 1e-6)
            if len(above_lo) >= 6:
                m = len(above_lo)
                q1 = above_lo[m // 3]
                q2 = above_lo[(2 * m) // 3]
                edges = sorted(set([lo, lo + 1e-6, q1, q2, hi]))
            else:
                edges = [lo, lo + 1e-6, hi]

    if len(edges) < 2:
        return 0.0

    n_bins = len(edges) - 1
    ref_counts = [0] * n_bins
    cur_counts = [0] * n_bins

    def bin_index(val: float) -> int:
        for b in range(n_bins - 1):
            if val <= edges[b + 1]:
                return b
        return n_bins - 1

    for v in reference_values:
        ref_counts[bin_index(v)] += 1
    for v in current_values:
        cur_counts[bin_index(v)] += 1

    n_ref = len(reference_values)
    n_cur = len(current_values)
    psi = 0.0
    for b in range(n_bins):
        p = max(smooth, ref_counts[b] / n_ref)
        q = max(smooth, cur_counts[b] / n_cur)
        psi += (q - p) * math.log(q / p)

    return round(max(0.0, psi), 4)


def compute_two_sample_ks(ref_vals: List[float], cur_vals: List[float]) -> Dict[str, float]:
    """
    Compute two-sample Kolmogorov-Smirnov statistic D and asymptotic p-value.
    """
    n = len(ref_vals)
    m = len(cur_vals)
    if n == 0 or m == 0:
        return {"ksStat": 0.0, "pValue": 1.0}

    a = sorted(ref_vals)
    b = sorted(cur_vals)
    i = 0
    j = 0
    d_max = 0.0

    while i < n and j < m:
        if a[i] < b[j]:
            v = a[i]
            while i < n and a[i] == v:
                i += 1
        elif b[j] < a[i]:
            v = b[j]
            while j < m and b[j] == v:
                j += 1
        else:
            v = a[i]
            while i < n and a[i] == v:
                i += 1
            while j < m and b[j] == v:
                j += 1
        d = abs((i / n) - (j / m))
        if d > d_max:
            d_max = d

    n_eff = (n * m) / (n + m)
    sqrt_n = math.sqrt(n_eff)
    lam = (sqrt_n + 0.12 + 0.11 / max(1.0, sqrt_n)) * d_max

    if lam <= 0.0:
        p_val = 1.0
    else:
        total = 0.0
        for k in range(1, 50):
            term = math.exp(-2.0 * (k * k) * (lam * lam))
            total += term if (k % 2 == 1) else -term
            if term < 1e-12:
                break
        p_val = max(0.0, min(1.0, 2.0 * total))

    return {"ksStat": round(d_max, 4), "pValue": round(p_val, 6)}


def evaluate_monitoring_window(
    *,
    artifact: Dict[str, Any],
    production_records: List[Dict[str, Any]],
    psi_threshold: float = 0.20,
    ks_pvalue_threshold: float = 0.05,
    rmse_degradation_factor: float = 1.25,
    min_labeled_for_perf: int = 5,
) -> Dict[str, Any]:
    """
    Analyze a production prediction window against the training reference profile.
    Explicitly separates:
      1. Data (Covariate) Drift
      2. Missingness Drift
      3. Prediction Drift
      4. Concept Drift / Proven Performance Degradation (only when ground truth exists)
    """
    if len(production_records) < 5:
        raise ValueError("Need at least 5 production predictions to run statistical monitoring")

    ref_profile: Dict[str, Dict[str, Any]] = artifact["referenceProfile"]
    feature_names: List[str] = artifact["featureNames"]
    series_means: Dict[str, float] = artifact["seriesMeans"]
    global_mean = float(artifact["globalMean"])

    # Reconstruct feature matrix for production payloads + check missingness
    prod_feature_cols: Dict[str, List[float]] = {fname: [] for fname in MONITORED_FEATURES}
    missing_counts: Dict[str, int] = {"price": 0, "discount_pct": 0, "is_holiday": 0}
    pred_values: List[float] = []
    labeled_y_true: List[float] = []
    labeled_y_pred: List[float] = []

    for rec in production_records:
        feats = rec.get("features") or {}
        for k in missing_counts:
            if feats.get(k) is None or feats.get(k) == "":
                missing_counts[k] += 1

        vec = build_single_feature_vector(
            date_str=str(feats.get("date") or rec["date"]),
            store_id=str(feats.get("store_id") or rec["store_id"]),
            sku_id=str(feats.get("sku_id") or rec["sku_id"]),
            price=float(feats.get("price", 0.0) or 0.0),
            discount_pct=float(feats.get("discount_pct", 0.0) or 0.0),
            is_holiday=int(feats.get("is_holiday", 0) or 0),
            lag_1=float(feats.get("lag_1", global_mean)),
            lag_7=float(feats.get("lag_7", global_mean)),
            rolling_7d_mean=float(feats.get("rolling_7d_mean", global_mean)),
            rolling_7d_std=float(feats.get("rolling_7d_std", 0.0)),
            series_means=series_means,
            global_mean=global_mean,
        )
        for fname in MONITORED_FEATURES:
            idx = feature_names.index(fname)
            prod_feature_cols[fname].append(vec[idx])

        pred_val = float(rec["predicted_units"])
        pred_values.append(pred_val)

        if rec.get("actual_units") is not None:
            labeled_y_true.append(float(rec["actual_units"]))
            labeled_y_pred.append(pred_val)

    # 1. Feature (Covariate) Drift
    feature_results: List[Dict[str, Any]] = []
    max_psi = 0.0
    min_ks_pvalue = 1.0
    drifted_features: List[str] = []

    for fname in MONITORED_FEATURES:
        ref = ref_profile[fname]
        ref_vals = [float(x) for x in ref["sampleValues"]]
        cur_vals = prod_feature_cols[fname]
        psi = compute_psi(ref["quantileEdges"], ref_vals, cur_vals)
        ks = compute_two_sample_ks(ref_vals, cur_vals)

        # Require meaningful effect size (PSI >= threshold OR (KS significant AND noticeable mean shift))
        cur_mean = statistics.fmean(cur_vals)
        ref_mean = float(ref["mean"])
        drifted = psi >= psi_threshold or (ks["pValue"] < ks_pvalue_threshold and psi >= psi_threshold * 0.5)

        if psi > max_psi:
            max_psi = psi
        if ks["pValue"] < min_ks_pvalue:
            min_ks_pvalue = ks["pValue"]
        if drifted:
            drifted_features.append(fname)

        feature_results.append(
            {
                "feature": fname,
                "referenceMean": round(ref_mean, 4),
                "productionMean": round(cur_mean, 4),
                "psi": psi,
                "ksStat": ks["ksStat"],
                "ksPvalue": ks["pValue"],
                "drifted": drifted,
            }
        )

    data_drift_detected = len(drifted_features) > 0

    # 2. Missingness Drift
    n_samples = len(production_records)
    missingness_rates = {k: round(v / n_samples, 4) for k, v in missing_counts.items()}
    missingness_drift = any(rate > 0.05 for rate in missingness_rates.values())

    # 3. Prediction Drift (compare production predictions against reference store_sku_train_mean distribution)
    ref_pred_proxy = [float(x) for x in ref_profile["store_sku_train_mean"]["sampleValues"]]
    ref_pred_edges = ref_profile["store_sku_train_mean"]["quantileEdges"]
    pred_psi = compute_psi(ref_pred_edges, ref_pred_proxy, pred_values)
    pred_ks = compute_two_sample_ks(ref_pred_proxy, pred_values)
    prediction_drift_detected = pred_psi >= psi_threshold

    # 4. Ground-Truth Performance / Concept Drift (only when labels exist!)
    baseline_rmse = float(artifact["testMetrics"]["rmse"])
    baseline_mae = float(artifact["testMetrics"]["mae"])
    live_performance: Optional[Dict[str, Any]] = None
    performance_degraded = False

    if len(labeled_y_true) >= min_labeled_for_perf:
        live_metrics = compute_regression_metrics(labeled_y_true, labeled_y_pred)
        live_rmse = float(live_metrics["rmse"])
        degradation_ratio = round(live_rmse / max(0.01, baseline_rmse), 3)
        performance_degraded = live_rmse > (baseline_rmse * rmse_degradation_factor)
        live_performance = {
            **live_metrics,
            "baselineRmse": baseline_rmse,
            "baselineMae": baseline_mae,
            "rmseDegradationRatio": degradation_ratio,
            "degraded": performance_degraded,
        }

    if performance_degraded:
        overall_status = "PERFORMANCE_DEGRADED"
    elif data_drift_detected or prediction_drift_detected or missingness_drift:
        overall_status = "COVARIATE_DRIFT_WARNING"
    else:
        overall_status = "HEALTHY"

    return {
        "overallStatus": overall_status,
        "sampleCount": n_samples,
        "labeledCount": len(labeled_y_true),
        "dataDriftDetected": data_drift_detected,
        "missingnessDriftDetected": missingness_drift,
        "predictionDriftDetected": prediction_drift_detected,
        "performanceDegraded": performance_degraded,
        "maxPsi": max_psi,
        "minKsPvalue": min_ks_pvalue,
        "driftedFeatures": drifted_features,
        "featureDrift": feature_results,
        "missingnessRates": missingness_rates,
        "predictionDrift": {
            "referenceMean": round(statistics.fmean(ref_pred_proxy), 4),
            "productionMean": round(statistics.fmean(pred_values), 4),
            "psi": pred_psi,
            "ksStat": pred_ks["ksStat"],
            "ksPvalue": pred_ks["pValue"],
            "drifted": prediction_drift_detected,
        },
        "livePerformance": live_performance,
    }
