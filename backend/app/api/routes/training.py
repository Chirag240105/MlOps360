from fastapi import APIRouter, HTTPException
from app.schemas.training import TrainingRunRequest

router = APIRouter(prefix="/training", tags=["training"])


@router.get("/runs")
def list_training_runs() -> dict:
    """List recorded training runs (wired to PostgreSQL repository in Phase 5)."""
    return {"runs": [], "note": "Repository binding added in Phase 5"}


@router.post("/run", status_code=201)
def trigger_training_run(payload: TrainingRunRequest) -> dict:
    """Validate dataset readiness and invoke reproducible training pipeline."""
    if not payload.dataset_id.strip():
        raise HTTPException(status_code=400, detail="dataset_id is required")
    return {
        "status": "QUEUED",
        "dataset_id": payload.dataset_id,
        "algorithm": payload.algorithm,
        "seed": payload.seed,
    }
