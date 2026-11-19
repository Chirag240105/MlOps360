import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ml.features.pipeline import build_single_feature_vector, prepare_chronological_splits
from ml.training.metrics import compute_regression_metrics
from ml.training.models import (
    fit_gradient_boosting_model,
    fit_random_forest_model,
    fit_ridge_model,
    predict_from_model_dict,
)


def _detect_git_commit() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or "uncommitted"
    except Exception:
        return "uncommitted"


def _tune_and_fit_algorithm(
    algorithm: str,
    x_train: List[List[float]],
    y_train: List[float],
    x_val: List[List[float]],
    y_val: List[float],
    seed: int,
) -> Dict[str, Any]:
    """Tune hyperparameters strictly on validation RMSE (never touching test set)."""
    candidates: List[Dict[str, Any]] = []

    if algorithm == "ridge":
        for alpha in (0.1, 1.0, 10.0):
            model = fit_ridge_model(x_train, y_train, l2_alpha=alpha)
            val_preds = predict_from_model_dict(model, x_val)
            val_metrics = compute_regression_metrics(y_val, val_preds)
            candidates.append(
                {
                    "algorithm": "ridge",
                    "hyperparameters": {"l2_alpha": alpha},
                    "model": model,
                    "valMetrics": val_metrics,
                }
            )
    elif algorithm == "random_forest":
        for n_est, depth in ((12, 5), (20, 7)):
            model = fit_random_forest_model(x_train, y_train, n_estimators=n_est, max_depth=depth, seed=seed)
            val_preds = predict_from_model_dict(model, x_val)
            val_metrics = compute_regression_metrics(y_val, val_preds)
            candidates.append(
                {
                    "algorithm": "random_forest",
                    "hyperparameters": {"n_estimators": n_est, "max_depth": depth, "seed": seed},
                    "model": model,
                    "valMetrics": val_metrics,
                }
            )
    elif algorithm == "gradient_boosting":
        for n_est, lr, depth in ((20, 0.10, 4), (30, 0.12, 4)):
            model = fit_gradient_boosting_model(
                x_train, y_train, n_estimators=n_est, learning_rate=lr, max_depth=depth, seed=seed
            )
            val_preds = predict_from_model_dict(model, x_val)
            val_metrics = compute_regression_metrics(y_val, val_preds)
            candidates.append(
                {
                    "algorithm": "gradient_boosting",
                    "hyperparameters": {
                        "n_estimators": n_est,
                        "learning_rate": lr,
                        "max_depth": depth,
                        "seed": seed,
                    },
                    "model": model,
                    "valMetrics": val_metrics,
                }
            )
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")

    return min(candidates, key=lambda c: float(c["valMetrics"]["rmse"]))


def run_training_pipeline(
    csv_text: str,
    artifact_dir: str,
    run_id: str,
    algorithm: str = "auto",
    seed: int = 42,
    dataset_version_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute full reproducible training pipeline:
      1. Chronological feature engineering (zero leakage)
      2. Hyperparameter tuning on validation set
      3. Final evaluation on held-out test set
      4. Safe JSON artifact serialization + SHA-256 checksum
    """
    t0 = time.perf_counter()
    splits = prepare_chronological_splits(csv_text)
    x_train, y_train = splits["x_train"], splits["y_train"]
    x_val, y_val = splits["x_val"], splits["y_val"]
    x_test, y_test = splits["x_test"], splits["y_test"]

    algorithms_to_try = (
        ["ridge", "random_forest", "gradient_boosting"] if algorithm == "auto" else [algorithm]
    )

    candidate_results = []
    for algo in algorithms_to_try:
        best = _tune_and_fit_algorithm(algo, x_train, y_train, x_val, y_val, seed=seed)
        test_preds = predict_from_model_dict(best["model"], x_test)
        test_metrics = compute_regression_metrics(y_test, test_preds)
        candidate_results.append({**best, "testMetrics": test_metrics})

    # Select winning model strictly by validation RMSE (test remains unbiased held-out)
    winner = min(candidate_results, key=lambda r: float(r["valMetrics"]["rmse"]))
    duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    git_commit = _detect_git_commit()

    artifact_payload = {
        "schemaVersion": "1.0",
        "serializationFormat": "safe_json_v1",
        "runId": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "gitCommit": git_commit,
        "datasetVersionHash": dataset_version_hash or hashlib.sha256(csv_text.encode("utf-8")).hexdigest(),
        "algorithm": winner["algorithm"],
        "hyperparameters": winner["hyperparameters"],
        "featureNames": splits["featureNames"],
        "seriesMeans": splits["seriesMeans"],
        "globalMean": splits["globalMean"],
        "latestSeriesState": splits["latestSeriesState"],
        "referenceProfile": splits["referenceProfile"],
        "validationMetrics": winner["valMetrics"],
        "testMetrics": winner["testMetrics"],
        "model": winner["model"],
    }

    out_dir = Path(artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = out_dir / f"{run_id}.model.json"
    serialized = json.dumps(artifact_payload, sort_keys=True)
    artifact_sha256 = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    artifact_path.write_text(serialized, encoding="utf-8")

    return {
        "runId": run_id,
        "algorithm": winner["algorithm"],
        "hyperparameters": winner["hyperparameters"],
        "gitCommit": git_commit,
        "datasetVersionHash": artifact_payload["datasetVersionHash"],
        "durationMs": duration_ms,
        "artifactPath": str(artifact_path),
        "artifactSha256": artifact_sha256,
        "splitSummary": splits["splitSummary"],
        "validationMetrics": winner["valMetrics"],
        "testMetrics": winner["testMetrics"],
        "candidatesEvaluated": [
            {
                "algorithm": c["algorithm"],
                "hyperparameters": c["hyperparameters"],
                "validationMetrics": c["valMetrics"],
                "testMetrics": c["testMetrics"],
            }
            for c in candidate_results
        ],
    }


def load_verified_artifact(artifact_path: str, expected_sha256: str) -> Dict[str, Any]:
    """Verify SHA-256 artifact integrity before loading JSON model into memory."""
    raw = Path(artifact_path).read_text(encoding="utf-8")
    actual_sha256 = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"Artifact integrity verification failed for {artifact_path}: "
            f"expected {expected_sha256}, got {actual_sha256}"
        )
    return json.loads(raw)


def predict_with_artifact(
    artifact_path: str,
    expected_sha256: str,
    records: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Run verified inference using exact training-time feature transforms."""
    artifact = load_verified_artifact(artifact_path, expected_sha256)
    series_means = artifact["seriesMeans"]
    global_mean = float(artifact["globalMean"])
    latest_state = artifact["latestSeriesState"]

    x_rows: List[List[float]] = []
    for rec in records:
        series_key = f"{rec['store_id']}::{rec['sku_id']}"
        fallback = latest_state.get(
            series_key,
            {"lag_1": global_mean, "lag_7": global_mean, "rolling_7d_mean": global_mean, "rolling_7d_std": 0.0},
        )
        x_rows.append(
            build_single_feature_vector(
                date_str=str(rec["date"]),
                store_id=str(rec["store_id"]),
                sku_id=str(rec["sku_id"]),
                price=float(rec["price"]),
                discount_pct=float(rec["discount_pct"]),
                is_holiday=int(rec["is_holiday"]),
                lag_1=float(rec.get("lag_1", fallback["lag_1"])),
                lag_7=float(rec.get("lag_7", fallback["lag_7"])),
                rolling_7d_mean=float(rec.get("rolling_7d_mean", fallback["rolling_7d_mean"])),
                rolling_7d_std=float(rec.get("rolling_7d_std", fallback["rolling_7d_std"])),
                series_means=series_means,
                global_mean=global_mean,
            )
        )

    preds = predict_from_model_dict(artifact["model"], x_rows)
    return [
        {"store_id": rec["store_id"], "sku_id": rec["sku_id"], "date": rec["date"], "predicted_units": round(p, 2)}
        for rec, p in zip(records, preds)
    ]
