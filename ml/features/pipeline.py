import csv
import io
import math
import statistics
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

FEATURE_NAMES: List[str] = [
    "price",
    "discount_pct",
    "net_price",
    "price_discount_interaction",
    "is_holiday",
    "is_weekend",
    "dow_sin",
    "dow_cos",
    "lag_1",
    "lag_7",
    "rolling_7d_mean",
    "rolling_7d_std",
    "store_sku_train_mean",
]


def build_single_feature_vector(
    *,
    date_str: str,
    store_id: str,
    sku_id: str,
    price: float,
    discount_pct: float,
    is_holiday: int,
    lag_1: float,
    lag_7: float,
    rolling_7d_mean: float,
    rolling_7d_std: float,
    series_means: Dict[str, float],
    global_mean: float,
) -> List[float]:
    """
    Canonical single-row feature vector shared identically between training and serving
    to eliminate training-serving skew.
    """
    dt = date.fromisoformat(date_str)
    dow = dt.weekday()
    is_weekend = 1.0 if dow in (4, 5, 6) else 0.0
    angle = 2.0 * math.pi * (dow / 7.0)
    dow_sin = math.sin(angle)
    dow_cos = math.cos(angle)

    net_price = price * (1.0 - discount_pct)
    price_discount_interaction = price * discount_pct
    series_key = f"{store_id}::{sku_id}"
    target_enc = series_means.get(series_key, global_mean)

    return [
        float(price),
        float(discount_pct),
        float(net_price),
        float(price_discount_interaction),
        float(is_holiday),
        float(is_weekend),
        float(dow_sin),
        float(dow_cos),
        float(lag_1),
        float(lag_7),
        float(rolling_7d_mean),
        float(rolling_7d_std),
        float(target_enc),
    ]


def prepare_chronological_splits(
    csv_text: str,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
) -> Dict[str, Any]:
    """
    Parse CSV, sort chronologically, build strictly causal lag/rolling features,
    fit target encoding only on the train split, and return train/val/test matrices
    plus reference distribution statistics for drift monitoring.
    """
    raw_rows = list(csv.DictReader(io.StringIO(csv_text)))
    parsed: List[Dict[str, Any]] = []
    for r in raw_rows:
        dt = date.fromisoformat(r["date"].strip())
        parsed.append(
            {
                "date": r["date"].strip(),
                "date_obj": dt,
                "store_id": r["store_id"].strip(),
                "sku_id": r["sku_id"].strip(),
                "category": r["category"].strip(),
                "price": float(r["price"]),
                "discount_pct": float(r["discount_pct"]),
                "is_holiday": int(float(r["is_holiday"])),
                "units_sold": float(r["units_sold"]),
            }
        )

    parsed.sort(key=lambda x: (x["date_obj"], x["store_id"], x["sku_id"]))
    unique_dates = sorted({r["date_obj"] for r in parsed})
    if len(unique_dates) < 12:
        raise ValueError("Need at least 12 distinct dates for chronological train/val/test split")

    train_cut = max(1, int(len(unique_dates) * train_ratio))
    val_cut = max(train_cut + 1, int(len(unique_dates) * (train_ratio + val_ratio)))
    val_cut = min(val_cut, len(unique_dates) - 1)

    train_dates = set(unique_dates[:train_cut])
    val_dates = set(unique_dates[train_cut:val_cut])
    test_dates = set(unique_dates[val_cut:])

    # Strictly causal per-(store_id, sku_id) history
    history: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    enriched: List[Dict[str, Any]] = []

    for row in parsed:
        key = (row["store_id"], row["sku_id"])
        hist = history[key]
        if len(hist) > 0:
            lag_1 = hist[-1]
            lag_7 = hist[-7] if len(hist) >= 7 else hist[0]
            window_7 = hist[-7:]
            rolling_mean = sum(window_7) / len(window_7)
            rolling_std = statistics.pstdev(window_7) if len(window_7) > 1 else 0.0
            enriched.append(
                {
                    **row,
                    "lag_1": lag_1,
                    "lag_7": lag_7,
                    "rolling_7d_mean": rolling_mean,
                    "rolling_7d_std": rolling_std,
                }
            )
        hist.append(row["units_sold"])

    train_rows = [r for r in enriched if r["date_obj"] in train_dates]
    val_rows = [r for r in enriched if r["date_obj"] in val_dates]
    test_rows = [r for r in enriched if r["date_obj"] in test_dates]

    # Fit target encoding strictly on training split
    grouped: Dict[str, List[float]] = defaultdict(list)
    for r in train_rows:
        grouped[f"{r['store_id']}::{r['sku_id']}"].append(r["units_sold"])

    series_means = {k: round(sum(v) / len(v), 4) for k, v in grouped.items()}
    global_mean = round(sum(r["units_sold"] for r in train_rows) / len(train_rows), 4)

    def vectorize(rows: List[Dict[str, Any]]) -> Tuple[List[List[float]], List[float]]:
        x_mat: List[List[float]] = []
        y_vec: List[float] = []
        for r in rows:
            x_mat.append(
                build_single_feature_vector(
                    date_str=r["date"],
                    store_id=r["store_id"],
                    sku_id=r["sku_id"],
                    price=r["price"],
                    discount_pct=r["discount_pct"],
                    is_holiday=r["is_holiday"],
                    lag_1=r["lag_1"],
                    lag_7=r["lag_7"],
                    rolling_7d_mean=r["rolling_7d_mean"],
                    rolling_7d_std=r["rolling_7d_std"],
                    series_means=series_means,
                    global_mean=global_mean,
                )
            )
            y_vec.append(r["units_sold"])
        return x_mat, y_vec

    x_train, y_train = vectorize(train_rows)
    x_val, y_val = vectorize(val_rows)
    x_test, y_test = vectorize(test_rows)

    # Compute reference distribution summary on training features for downstream drift detection
    reference_profile: Dict[str, Dict[str, Any]] = {}
    for idx, fname in enumerate(FEATURE_NAMES):
        col_vals = sorted(row[idx] for row in x_train)
        n = len(col_vals)
        # Compute 5 quantile bin edges (or unique-safe edges) for PSI
        q_edges = [col_vals[min(n - 1, int(q * (n - 1)))] for q in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        if n <= 300:
            sampled = col_vals
        else:
            sampled = [col_vals[int(round(i * (n - 1) / 299))] for i in range(300)]
        reference_profile[fname] = {
            "mean": round(statistics.fmean(col_vals), 4),
            "std": round(statistics.pstdev(col_vals), 4) if n > 1 else 0.0,
            "min": round(col_vals[0], 4),
            "max": round(col_vals[-1], 4),
            "quantileEdges": [round(e, 4) for e in q_edges],
            "sampleValues": [round(v, 4) for v in sampled],
        }

    # Keep latest known series histories for default serving lag lookups
    latest_series_state: Dict[str, Dict[str, Any]] = {}
    for (s_id, k_id), hist in history.items():
        recent_7 = hist[-7:]
        latest_series_state[f"{s_id}::{k_id}"] = {
            "lag_1": round(hist[-1], 4),
            "lag_7": round(hist[-7] if len(hist) >= 7 else hist[0], 4),
            "rolling_7d_mean": round(sum(recent_7) / len(recent_7), 4),
            "rolling_7d_std": round(statistics.pstdev(recent_7) if len(recent_7) > 1 else 0.0, 4),
        }

    return {
        "featureNames": FEATURE_NAMES,
        "x_train": x_train,
        "y_train": y_train,
        "x_val": x_val,
        "y_val": y_val,
        "x_test": x_test,
        "y_test": y_test,
        "seriesMeans": series_means,
        "globalMean": global_mean,
        "latestSeriesState": latest_series_state,
        "referenceProfile": reference_profile,
        "splitSummary": {
            "strategy": "chronological_date_split",
            "trainRows": len(train_rows),
            "valRows": len(val_rows),
            "testRows": len(test_rows),
            "trainDateRange": {"start": train_rows[0]["date"], "end": train_rows[-1]["date"]},
            "valDateRange": {"start": val_rows[0]["date"], "end": val_rows[-1]["date"]},
            "testDateRange": {"start": test_rows[0]["date"], "end": test_rows[-1]["date"]},
        },
    }
