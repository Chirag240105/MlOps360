from fastapi import APIRouter

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/")
def list_experiments() -> dict:
    """Query tracked MLflow experiments."""
    return {"experiments": []}


@router.get("/runs")
def list_experiment_runs() -> dict:
    """Query logged MLflow runs with hyperparameters, metrics, and dataset lineage."""
    return {"runs": []}
