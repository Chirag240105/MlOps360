"""Batch evaluation and champion/challenger retraining assessment."""
import csv
import hashlib
import importlib.util
import io
import json
import math
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from ml.features.pipeline import build_single_feature_vector
from ml.training.metrics import compute_regression_metrics
from ml.training.models import predict_from_model_dict
from ml.training.trainer import load_verified_artifact, run_training_pipeline
from ml.validation.validator import validate_and_profile_csv
from backend.app.services.retraining_policy import evaluate_challenger_gate


def _combine_csv(historical_csv: str, historical_rows: List[Dict[str, Any]], incoming_rows: List[Dict[str, Any]]) -> str:
    fieldnames = next(csv.reader(io.StringIO(historical_csv)), [])
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for row in historical_rows + incoming_rows:
        writer.writerow({name: row.get(name, "") for name in fieldnames})
    return output.getvalue()


def _parse_rows(csv_text: str) -> List[Dict[str, Any]]:
    return [
        {name: value.strip() if isinstance(value, str) else value for name, value in row.items()}
        for row in csv.DictReader(io.StringIO(csv_text))
    ]


def _row_key(row: Dict[str, Any]) -> Tuple[str, str, str]:
    return (row["date"].strip(), row["store_id"].strip(), row["sku_id"].strip())


def _validate_dataset(csv_text: str, dataset_name: str) -> Dict[str, Any]:
    validation = validate_and_profile_csv(csv_text, min_rows=30)
    if not validation["passed"]:
        failures = [
            check["message"]
            for check in validation["checks"]
            if check["severity"] == "error" and not check["passed"]
        ]
        raise ValueError(f"{dataset_name} validation failed: {'; '.join(failures)}")
    return validation


def _make_labeled_features(
    historical_rows: List[Dict[str, Any]],
    incoming_rows: List[Dict[str, Any]],
    artifact: Dict[str, Any],
) -> Tuple[List[List[float]], List[float]]:
    """Build causal features for new rows using the model's training-time encoding."""
    incoming_keys = {_row_key(row) for row in incoming_rows}
    all_rows = sorted(
        historical_rows + incoming_rows,
        key=lambda row: (row["date"], row["store_id"], row["sku_id"]),
    )
    histories: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    fallback_states = artifact["latestSeriesState"]
    x_rows: List[List[float]] = []
    y_rows: List[float] = []

    for row in all_rows:
        key = (row["store_id"], row["sku_id"])
        key_history = histories[key]
        if _row_key(row) in incoming_keys:
            series_key = f"{key[0]}::{key[1]}"
            fallback = fallback_states.get(
                series_key,
                {
                    "lag_1": artifact["globalMean"],
                    "lag_7": artifact["globalMean"],
                    "rolling_7d_mean": artifact["globalMean"],
                    "rolling_7d_std": 0.0,
                },
            )
            window = key_history[-7:]
            lag_1 = key_history[-1] if key_history else float(fallback["lag_1"])
            lag_7 = key_history[-7] if len(key_history) >= 7 else (
                key_history[0] if key_history else float(fallback["lag_7"])
            )
            rolling_mean = sum(window) / len(window) if window else float(fallback["rolling_7d_mean"])
            if len(window) > 1:
                rolling_std = (sum((value - rolling_mean) ** 2 for value in window) / len(window)) ** 0.5
            else:
                rolling_std = float(fallback["rolling_7d_std"]) if not window else 0.0
            x_rows.append(
                build_single_feature_vector(
                    date_str=row["date"],
                    store_id=row["store_id"],
                    sku_id=row["sku_id"],
                    price=float(row["price"]),
                    discount_pct=float(row["discount_pct"]),
                    is_holiday=int(float(row["is_holiday"])),
                    lag_1=lag_1,
                    lag_7=lag_7,
                    rolling_7d_mean=rolling_mean,
                    rolling_7d_std=rolling_std,
                    series_means=artifact["seriesMeans"],
                    global_mean=float(artifact["globalMean"]),
                )
            )
            y_rows.append(float(row["units_sold"]))
        key_history.append(float(row["units_sold"]))

    return x_rows, y_rows


def _target_distribution(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    values = [float(row["units_sold"]) for row in rows]
    return {
        "target": "units_sold",
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "mean": round(sum(values) / len(values), 4),
        "zeroCount": sum(value == 0 for value in values),
    }


def _track_mlflow(
    *,
    result: Dict[str, Any],
    dataset_hash: str,
    run_id: str,
) -> Dict[str, Any]:
    if importlib.util.find_spec("mlflow") is None:
        return {"status": "unavailable", "reason": "The mlflow package is not installed"}

    from backend.app.ml.mlflow_tracker import MlflowTracker
    tracking_uri = os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000")
    experiment_name = os.environ.get("MLFLOW_EXPERIMENT_NAME", "retail-demand-forecasting")
    tracker = MlflowTracker(tracking_uri=tracking_uri, experiment_name=experiment_name)
    tracking_run_id = tracker.log_training_run(
        run_name=run_id,
        algorithm=result["algorithm"],
        params={
            **result["hyperparameters"],
            "seed": result["seed"],
            "assessment_run_id": run_id,
        },
        val_metrics=result["validationMetrics"],
        test_metrics=result["testMetrics"],
        dataset_version_hash=dataset_hash,
        git_commit=result["gitCommit"],
        artifact_path=result["artifactPath"],
        duration_ms=result["durationMs"],
    )
    return {"status": "logged", "runId": tracking_run_id, "trackingUri": tracking_uri}


def run_retraining_assessment(
    *,
    historical_csv: str,
    incoming_csv: str,
    champion_artifact_path: str,
    champion_sha256: str,
    artifact_dir: str,
    run_id: str = "assessment_candidate",
    algorithm: str = "auto",
    seed: int = 42,
    min_relative_improvement: float = 0.02,
) -> Dict[str, Any]:
    """Evaluate an existing model, train a challenger, and persist the gate decision."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", run_id):
        raise ValueError("run_id must contain only letters, numbers, dots, underscores, and hyphens")
    if not math.isfinite(min_relative_improvement) or min_relative_improvement < 0:
        raise ValueError("min_relative_improvement must be a finite non-negative number")

    historical_validation = _validate_dataset(historical_csv, "Historical dataset")
    incoming_validation = _validate_dataset(incoming_csv, "Incoming dataset")
    historical_rows = _parse_rows(historical_csv)
    incoming_rows = _parse_rows(incoming_csv)

    historical_keys = {_row_key(row) for row in historical_rows}
    incoming_keys = [_row_key(row) for row in incoming_rows]
    if len(set(incoming_keys)) != len(incoming_keys):
        raise ValueError("Incoming dataset contains duplicate (date, store_id, sku_id) keys")
    if historical_keys.intersection(incoming_keys):
        raise ValueError("Incoming dataset contains records already present in historical data")
    latest_historical_date = max(row["date"] for row in historical_rows)
    earliest_incoming_date = min(row["date"] for row in incoming_rows)
    if earliest_incoming_date <= latest_historical_date:
        raise ValueError(
            "Incoming data must be later than historical data "
            f"(latest historical date: {latest_historical_date}, earliest incoming date: {earliest_incoming_date})"
        )

    champion = load_verified_artifact(champion_artifact_path, champion_sha256)
    champion_x, incoming_y = _make_labeled_features(historical_rows, incoming_rows, champion)
    champion_predictions = predict_from_model_dict(champion["model"], champion_x)
    champion_metrics = compute_regression_metrics(incoming_y, champion_predictions)

    combined_csv = _combine_csv(historical_csv, historical_rows, incoming_rows)
    combined_hash = hashlib.sha256(combined_csv.encode("utf-8")).hexdigest()
    out_dir = Path(artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    candidate_result = run_training_pipeline(
        csv_text=combined_csv,
        artifact_dir=str(out_dir),
        run_id=run_id,
        algorithm=algorithm,
        seed=seed,
        dataset_version_hash=combined_hash,
    )
    candidate = load_verified_artifact(
        candidate_result["artifactPath"],
        candidate_result["artifactSha256"],
    )

    test_start = candidate_result["splitSummary"]["testDateRange"]["start"]
    test_end = candidate_result["splitSummary"]["testDateRange"]["end"]
    holdout_rows = [row for row in incoming_rows if test_start <= row["date"] <= test_end]
    if not holdout_rows:
        raise ValueError("The incoming batch does not overlap the candidate's chronological test holdout")
    holdout_x_champion, holdout_y = _make_labeled_features(historical_rows, holdout_rows, champion)
    holdout_x_candidate, candidate_y = _make_labeled_features(historical_rows, holdout_rows, candidate)
    if holdout_y != candidate_y:
        raise ValueError("Champion and candidate holdout labels are inconsistent")
    champion_holdout_metrics = compute_regression_metrics(
        holdout_y, predict_from_model_dict(champion["model"], holdout_x_champion)
    )
    candidate_holdout_metrics = compute_regression_metrics(
        candidate_y, predict_from_model_dict(candidate["model"], holdout_x_candidate)
    )
    eligible, relative_improvement = evaluate_challenger_gate(
        float(champion_holdout_metrics["rmse"]),
        float(candidate_holdout_metrics["rmse"]),
        min_relative_improvement=min_relative_improvement,
    )

    mlflow_result = _track_mlflow(
        result={**candidate_result, "seed": seed},
        dataset_hash=combined_hash,
        run_id=run_id,
    )
    report = {
        "assessmentRunId": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "task": "retail_demand_regression",
        "incomingData": {
            "rows": len(incoming_rows),
            "sha256": hashlib.sha256(incoming_csv.encode("utf-8")).hexdigest(),
            "targetDistribution": _target_distribution(incoming_rows),
            "validation": incoming_validation,
        },
        "historicalData": {
            "rows": len(historical_rows),
            "sha256": hashlib.sha256(historical_csv.encode("utf-8")).hexdigest(),
            "validationPassed": historical_validation["passed"],
        },
        "championEvaluation": {
            "artifactPath": str(Path(champion_artifact_path).resolve()),
            "artifactSha256": champion_sha256,
            "newBatchMetrics": champion_metrics,
            "gateHoldoutMetrics": champion_holdout_metrics,
        },
        "candidate": {
            "artifactPath": str(Path(candidate_result["artifactPath"]).resolve()),
            "artifactSha256": candidate_result["artifactSha256"],
            "algorithm": candidate_result["algorithm"],
            "datasetVersionHash": combined_hash,
            "trainingRows": len(historical_rows) + len(incoming_rows),
            "splitSummary": candidate_result["splitSummary"],
            "newBatchHoldoutMetrics": candidate_holdout_metrics,
        },
        "qualityGate": {
            "metric": "RMSE",
            "reason": "RMSE directly penalizes large unit-forecast errors and is the existing project promotion metric.",
            "minimumRelativeImprovement": min_relative_improvement,
            "relativeImprovement": relative_improvement,
            "decision": "ELIGIBLE_FOR_PROMOTION" if eligible else "RETAIN_CHAMPION",
            "championUpdated": False,
            "recordedAt": datetime.now(timezone.utc).isoformat(),
        },
        "mlflow": mlflow_result,
    }
    report_path = out_dir / "assessment_report.json"
    report["reportPath"] = str(report_path.resolve())
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    return report
