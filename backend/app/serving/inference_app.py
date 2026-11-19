"""Standalone Production Track B FastAPI Model Serving Service."""
import time
import uuid
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

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


@serving_app.get("/health")
def serving_health() -> dict:
    return {"status": "healthy", "service": "modelops360-serving"}


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
    try:
        # In containerized deployment, resolves active @production model via MLflow/Postgres pointer
        raise HTTPException(status_code=503, detail="Load verified @production artifact via registry pointer")
    finally:
        _METRICS["total_requests"] += 1
        _METRICS["latencies_ms"].append((time.perf_counter() - start) * 1000.0)
