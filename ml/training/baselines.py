import csv
import io
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Tuple

from ml.training.metrics import compute_regression_metrics


def _solve_linear_system(a: List[List[float]], b: List[float]) -> List[float]:
    """Gaussian elimination with partial pivoting for small dense normal equations."""
    n = len(b)
    mat = [row[:] + [b[i]] for i, row in enumerate(a)]

    for col in range(n):
        pivot_row = max(range(col, n), key=lambda r: abs(mat[r][col]))
        mat[col], mat[pivot_row] = mat[pivot_row], mat[col]
        pivot = mat[col][col]
        if abs(pivot) < 1e-12:
            continue
        for j in range(col, n + 1):
            mat[col][j] /= pivot
        for r in range(n):
            if r != col and mat[r][col] != 0.0:
                factor = mat[r][col]
                for j in range(col, n + 1):
                    mat[r][j] -= factor * mat[col][j]

    return [mat[i][n] for i in range(n)]


def fit_ridge_regression(
    x_train: List[List[float]],
    y_train: List[float],
    l2_alpha: float = 1.0,
) -> List[float]:
    """Closed-form Ridge Regression: w = (X^T X + alpha*I)^-1 X^T y (intercept unpenalized)."""
    n_features = len(x_train[0])
    xtx = [[0.0] * n_features for _ in range(n_features)]
    xty = [0.0] * n_features

    for row, target in zip(x_train, y_train):
        for i in range(n_features):
            xty[i] += row[i] * target
            ri = row[i]
            for j in range(n_features):
                xtx[i][j] += ri * row[j]

    # Do not regularize bias term at index 0
    for i in range(1, n_features):
        xtx[i][i] += l2_alpha

    return _solve_linear_system(xtx, xty)


def predict_linear(x_rows: List[List[float]], weights: List[float]) -> List[float]:
    return [max(0.0, sum(w * xi for w, xi in zip(weights, row))) for row in x_rows]


def chronological_split_records(
    csv_text: str,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parse CSV and split strictly by unique sorted dates to eliminate temporal leakage.
    """
    rows_raw = list(csv.DictReader(io.StringIO(csv_text)))
    parsed: List[Dict[str, Any]] = []
    for r in rows_raw:
        dt = date.fromisoformat(r["date"].strip())
        parsed.append(
            {
                "date": r["date"].strip(),
                "date_obj": dt,
                "dow": dt.weekday(),
                "is_weekend": 1.0 if dt.weekday() in (4, 5, 6) else 0.0,
                "store_id": r["store_id"].strip(),
                "sku_id": r["sku_id"].strip(),
                "category": r["category"].strip(),
                "price": float(r["price"]),
                "discount_pct": float(r["discount_pct"]),
                "is_holiday": float(r["is_holiday"]),
                "units_sold": float(r["units_sold"]),
            }
        )

    parsed.sort(key=lambda r: (r["date_obj"], r["store_id"], r["sku_id"]))
    unique_dates = sorted({r["date_obj"] for r in parsed})
    if len(unique_dates) < 10:
        raise ValueError("Need at least 10 distinct dates for chronological train/val/test split")

    train_cut = max(1, int(len(unique_dates) * train_ratio))
    val_cut = max(train_cut + 1, int(len(unique_dates) * (train_ratio + val_ratio)))
    val_cut = min(val_cut, len(unique_dates) - 1)

    train_dates = set(unique_dates[:train_cut])
    val_dates = set(unique_dates[train_cut:val_cut])
    test_dates = set(unique_dates[val_cut:])

    # Compute lag features strictly sequentially per (store_id, sku_id)
    history: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    for row in parsed:
        key = (row["store_id"], row["sku_id"])
        hist = history[key]
        row["lag_1"] = hist[-1] if hist else row["units_sold"]
        recent_7 = hist[-7:] if hist else [row["units_sold"]]
        row["rolling_7d_mean"] = sum(recent_7) / len(recent_7)
        row["has_history"] = len(hist) > 0
        hist.append(row["units_sold"])

    # Drop first day per series where lag_1 wasn't a true prior observation
    enriched = [r for r in parsed if r["has_history"]]
    train = [r for r in enriched if r["date_obj"] in train_dates]
    val = [r for r in enriched if r["date_obj"] in val_dates]
    test = [r for r in enriched if r["date_obj"] in test_dates]

    return train, val, test


def _build_feature_matrix(
    rows: List[Dict[str, Any]],
    series_means: Dict[Tuple[str, str], float],
    global_mean: float,
) -> List[List[float]]:
    matrix: List[List[float]] = []
    for r in rows:
        key = (r["store_id"], r["sku_id"])
        target_enc = series_means.get(key, global_mean)
        matrix.append(
            [
                1.0,  # intercept
                r["price"],
                r["discount_pct"],
                r["is_holiday"],
                r["is_weekend"],
                r["lag_1"],
                r["rolling_7d_mean"],
                target_enc,
            ]
        )
    return matrix


def evaluate_baselines(csv_text: str) -> Dict[str, Any]:
    """
    Benchmark three chronological baselines on the test set:
      1. Naive Lag-1 Persistence
      2. 7-Day Seasonal/Series Moving Average
      3. Ridge Linear Regression (fit strictly on training split)
    """
    train, val, test = chronological_split_records(csv_text)

    # Fit store-SKU target encoding strictly on training split
    grouped: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    for r in train:
        grouped[(r["store_id"], r["sku_id"])].append(r["units_sold"])
    series_means = {k: sum(v) / len(v) for k, v in grouped.items()}
    global_mean = sum(r["units_sold"] for r in train) / len(train)

    y_test = [r["units_sold"] for r in test]
    y_val = [r["units_sold"] for r in val]

    # Baseline 1: Naive Lag-1
    pred_naive_test = [r["lag_1"] for r in test]
    pred_naive_val = [r["lag_1"] for r in val]

    # Baseline 2: 7-Day Moving Average
    pred_ma7_test = [r["rolling_7d_mean"] for r in test]
    pred_ma7_val = [r["rolling_7d_mean"] for r in val]

    # Baseline 3: Ridge Linear Regression
    x_train = _build_feature_matrix(train, series_means, global_mean)
    y_train = [r["units_sold"] for r in train]
    x_val = _build_feature_matrix(val, series_means, global_mean)
    x_test = _build_feature_matrix(test, series_means, global_mean)

    weights = fit_ridge_regression(x_train, y_train, l2_alpha=1.0)
    pred_ridge_val = predict_linear(x_val, weights)
    pred_ridge_test = predict_linear(x_test, weights)

    return {
        "splitSummary": {
            "strategy": "chronological_date_split",
            "trainRows": len(train),
            "valRows": len(val),
            "testRows": len(test),
            "trainDateRange": {"start": train[0]["date"], "end": train[-1]["date"]},
            "valDateRange": {"start": val[0]["date"], "end": val[-1]["date"]},
            "testDateRange": {"start": test[0]["date"], "end": test[-1]["date"]},
        },
        "models": [
            {
                "name": "Naive Lag-1 Baseline",
                "validation": compute_regression_metrics(y_val, pred_naive_val),
                "test": compute_regression_metrics(y_test, pred_naive_test),
            },
            {
                "name": "7-Day Moving Average Baseline",
                "validation": compute_regression_metrics(y_val, pred_ma7_val),
                "test": compute_regression_metrics(y_test, pred_ma7_test),
            },
            {
                "name": "Ridge Linear Regression Baseline",
                "validation": compute_regression_metrics(y_val, pred_ridge_val),
                "test": compute_regression_metrics(y_test, pred_ridge_test),
                "featureNames": [
                    "intercept",
                    "price",
                    "discount_pct",
                    "is_holiday",
                    "is_weekend",
                    "lag_1",
                    "rolling_7d_mean",
                    "store_sku_train_mean",
                ],
                "weights": [round(w, 4) for w in weights],
            },
        ],
    }
