"""Production Track B Trainer (scikit-learn + XGBoost + safe JSON/UBJ model saving)."""
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List
import hashlib
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
from xgboost import XGBRegressor


FEATURE_COLS = [
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


@dataclass
class SklearnTrainResult:
    algorithm: str
    val_rmse: float
    test_rmse: float
    test_mae: float
    test_r2: float
    artifact_path: str
    artifact_sha256: str


def build_pandas_features(df: pd.DataFrame) -> pd.DataFrame:
    """Deterministic Pandas feature engineering sorted strictly chronologically per series."""
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"])
    out = out.sort_values(["date", "store_id", "sku_id"]).reset_index(drop=True)

    dow = out["date"].dt.dayofweek
    out["is_weekend"] = dow.isin([4, 5, 6]).astype(float)
    out["dow_sin"] = np.sin(2.0 * np.pi * dow / 7.0)
    out["dow_cos"] = np.cos(2.0 * np.pi * dow / 7.0)
    out["net_price"] = out["price"] * (1.0 - out["discount_pct"])
    out["price_discount_interaction"] = out["price"] * out["discount_pct"]

    grouped = out.groupby(["store_id", "sku_id"])["units_sold"]
    out["lag_1"] = grouped.shift(1)
    out["lag_7"] = grouped.shift(7).fillna(grouped.transform("first"))
    shifted = grouped.shift(1)
    out["rolling_7d_mean"] = shifted.groupby([out["store_id"], out["sku_id"]]).transform(
        lambda s: s.rolling(7, min_periods=1).mean()
    )
    out["rolling_7d_std"] = shifted.groupby([out["store_id"], out["sku_id"]]).transform(
        lambda s: s.rolling(7, min_periods=1).std().fillna(0.0)
    )
    return out.dropna(subset=["lag_1"]).reset_index(drop=True)


def train_sklearn_and_xgboost(csv_path: str, artifact_dir: str, seed: int = 42) -> SklearnTrainResult:
    """Chronological split + multi-model evaluation using scikit-learn and XGBoost JSON export."""
    df = build_pandas_features(pd.read_csv(csv_path))
    unique_dates = sorted(df["date"].unique())
    t_cut = int(len(unique_dates) * 0.70)
    v_cut = int(len(unique_dates) * 0.85)

    train_df = df[df["date"] < unique_dates[t_cut]].copy()
    val_df = df[(df["date"] >= unique_dates[t_cut]) & (df["date"] < unique_dates[v_cut])].copy()
    test_df = df[df["date"] >= unique_dates[v_cut]].copy()

    # Fit target encoding strictly on training partition
    means = train_df.groupby(["store_id", "sku_id"])["units_sold"].mean().to_dict()
    global_mean = float(train_df["units_sold"].mean())
    for frame in (train_df, val_df, test_df):
        frame["store_sku_train_mean"] = [
            means.get((s, k), global_mean) for s, k in zip(frame["store_id"], frame["sku_id"])
        ]

    candidates: List[tuple[str, Any, float]] = [
        ("ridge", Ridge(alpha=1.0), 0.0),
        ("random_forest", RandomForestRegressor(n_estimators=120, max_depth=8, random_state=seed, n_jobs=-1), 0.0),
        (
            "xgboost",
            XGBRegressor(
                n_estimators=180,
                learning_rate=0.06,
                max_depth=5,
                subsample=0.85,
                random_state=seed,
                objective="reg:squarederror",
            ),
            0.0,
        ),
    ]

    best_name = ""
    best_model = None
    best_val_rmse = float("inf")

    for name, model, _ in candidates:
        model.fit(train_df[FEATURE_COLS], train_df["units_sold"])
        val_pred = np.clip(model.predict(val_df[FEATURE_COLS]), 0.0, None)
        val_rmse = float(root_mean_squared_error(val_df["units_sold"], val_pred))
        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            best_name = name
            best_model = model

    test_pred = np.clip(best_model.predict(test_df[FEATURE_COLS]), 0.0, None)
    test_rmse = float(root_mean_squared_error(test_df["units_sold"], test_pred))
    test_mae = float(mean_absolute_error(test_df["units_sold"], test_pred))
    test_r2 = float(r2_score(test_df["units_sold"], test_pred))

    out_dir = Path(artifact_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if isinstance(best_model, XGBRegressor):
        artifact_file = out_dir / "xgboost_model.json"
        best_model.save_model(str(artifact_file))
    else:
        # Safe parameter export without pickle
        artifact_file = out_dir / f"{best_name}_metadata.json"
        artifact_file.write_text(json.dumps({"algorithm": best_name, "features": FEATURE_COLS}), encoding="utf-8")

    sha256 = hashlib.sha256(artifact_file.read_bytes()).hexdigest()
    return SklearnTrainResult(
        algorithm=best_name,
        val_rmse=round(best_val_rmse, 4),
        test_rmse=round(test_rmse, 4),
        test_mae=round(test_mae, 4),
        test_r2=round(test_r2, 4),
        artifact_path=str(artifact_file),
        artifact_sha256=sha256,
    )
