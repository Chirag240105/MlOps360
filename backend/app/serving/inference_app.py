"""Production FastAPI Model Serving Service with Pointer Resolution & Telemetry."""
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ..core.config import get_settings
from ml.training.trainer import predict_with_artifact

serving_app = FastAPI(title="ModelOps360 Serving API", version="1.0.0")
_METRICS = {"total_requests": 0, "failed_requests": 0, "latencies_ms": []}


class PredictPayload(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    store_id: str = Field(..., min_length=1)
    sku_id: str = Field(..., min_length=1)
    price: float = Field(..., gt=0)
    discount_pct: float = Field(default=0.0, ge=0.0, le=0.95)
    is_holiday: int = Field(default=0, ge=0, le=1)


class BatchPredictPayload(BaseModel):
    records: List[PredictPayload] = Field(..., min_length=1, max_length=500)


def _resolve_production_artifact() -> Optional[Dict[str, Any]]:
    """Resolves active production model pointer from storage."""
    settings = get_settings()
    artifacts_dir = Path(settings.artifact_storage_path)
    pointer_path = artifacts_dir / "models" / "production_pointer.json"

    if pointer_path.exists():
        try:
            pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
            art_path = Path(pointer["artifact_path"])
            if art_path.exists():
                return {
                    "artifact_path": str(art_path),
                    "artifact_sha256": pointer.get("artifact_sha256", ""),
                    "run_id": pointer.get("run_id", "prod"),
                }
        except Exception:
            pass

    # Fallback to any model file in artifacts/models
    models_dir = artifacts_dir / "models"
    for cand in models_dir.glob("*.model.json"):
        import hashlib
        raw = cand.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        return {
            "artifact_path": str(cand),
            "artifact_sha256": sha,
            "run_id": cand.stem,
        }

    return None


@serving_app.get("/health")
def serving_health() -> dict:
    pointer = _resolve_production_artifact()
    return {
        "status": "healthy",
        "service": "modelops360-serving",
        "has_active_model": pointer is not None,
        "active_model_run_id": pointer["run_id"] if pointer else None,
    }


@serving_app.get("/metrics")
def serving_metrics() -> dict:
    lats = sorted(_METRICS["latencies_ms"])
    p95 = lats[int(len(lats) * 0.95)] if lats else 0.0
    avg = sum(lats) / len(lats) if lats else 0.0
    return {
        "total_requests": _METRICS["total_requests"],
        "failed_requests": _METRICS["failed_requests"],
        "avg_latency_ms": round(avg, 2),
        "p95_latency_ms": round(p95, 2),
    }


@serving_app.post("/predict")
def predict_single(payload: PredictPayload) -> dict:
    start = time.perf_counter()
    pointer = _resolve_production_artifact()

    if not pointer:
        _METRICS["failed_requests"] += 1
        raise HTTPException(
            status_code=404,
            detail="No production model is deployed. Please run initial training pipeline.",
        )

    try:
        record_dict = payload.model_dump()
        record_dict["features"] = {
            "date": payload.date,
            "price": payload.price,
            "discount_pct": payload.discount_pct,
            "net_price": payload.price * (1.0 - payload.discount_pct),
            "price_discount_interaction": payload.price * payload.discount_pct,
            "is_holiday": float(payload.is_holiday),
            "is_weekend": 0.0,
        }

        preds = predict_with_artifact(
            artifact_path=pointer["artifact_path"],
            expected_sha256=pointer["artifact_sha256"],
            records=[record_dict],
        )

        duration = (time.perf_counter() - start) * 1000.0
        _METRICS["total_requests"] += 1
        _METRICS["latencies_ms"].append(duration)

        pred_val = float(preds[0]["predicted_units"]) if isinstance(preds[0], dict) else float(preds[0])

        return {
            "prediction_id": str(uuid.uuid4()),
            "model_run_id": pointer["run_id"],
            "predicted_units": round(pred_val, 2),
            "latency_ms": round(duration, 2),
        }
    except Exception as exc:
        _METRICS["failed_requests"] += 1
        raise HTTPException(status_code=500, detail=f"Inference error: {exc}")


@serving_app.post("/predict/batch")
def predict_batch(payload: BatchPredictPayload) -> dict:
    start = time.perf_counter()
    pointer = _resolve_production_artifact()

    if not pointer:
        _METRICS["failed_requests"] += 1
        raise HTTPException(status_code=404, detail="No production model deployed.")

    try:
        records_dict = []
        for p in payload.records:
            d = p.model_dump()
            d["features"] = {
                "date": p.date,
                "price": p.price,
                "discount_pct": p.discount_pct,
                "net_price": p.price * (1.0 - p.discount_pct),
                "price_discount_interaction": p.price * p.discount_pct,
                "is_holiday": float(p.is_holiday),
                "is_weekend": 0.0,
            }
            records_dict.append(d)

        preds = predict_with_artifact(
            artifact_path=pointer["artifact_path"],
            expected_sha256=pointer["artifact_sha256"],
            records=records_dict,
        )

        duration = (time.perf_counter() - start) * 1000.0
        _METRICS["total_requests"] += len(payload.records)
        _METRICS["latencies_ms"].append(duration)

        pred_vals = [
            round(float(p["predicted_units"]), 2) if isinstance(p, dict) else round(float(p), 2)
            for p in preds
        ]

        return {
            "batch_size": len(preds),
            "model_run_id": pointer["run_id"],
            "predictions": pred_vals,
            "total_latency_ms": round(duration, 2),
        }
    except Exception as exc:
        _METRICS["failed_requests"] += 1
        raise HTTPException(status_code=500, detail=f"Batch inference error: {exc}")
