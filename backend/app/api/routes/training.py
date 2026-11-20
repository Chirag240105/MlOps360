from fastapi import APIRouter, HTTPException
from ...schemas.training import TrainingRunRequest
from ...services.job_manager import get_job_manager

router = APIRouter(prefix="/training", tags=["training"])


@router.get("/runs")
def list_training_runs() -> dict:
    """List recent background training and retraining jobs."""
    manager = get_job_manager()
    jobs = manager.list_jobs(limit=50)
    return {"runs": jobs, "total": len(jobs)}


@router.get("/jobs/{job_id}")
def get_training_job(job_id: str) -> dict:
    """Fetch status and telemetry of a specific background job."""
    manager = get_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job.to_dict()


@router.post("/run", status_code=202)
def trigger_training_run(payload: TrainingRunRequest) -> dict:
    """Validate dataset readiness and dispatch asynchronous training job."""
    if not payload.dataset_id.strip():
        raise HTTPException(status_code=400, detail="dataset_id is required")

    manager = get_job_manager()
    job = manager.submit_retraining_job(
        model_id="retail-demand-v1",
        trigger_type="MANUAL",
        dataset_name=payload.dataset_id,
        algorithm=payload.algorithm,
        seed=payload.seed,
        actor="api_user",
    )

    return {
        "job_id": job.id,
        "status": job.status,
        "model_id": job.model_id,
        "trigger_type": job.trigger_type,
        "created_at": job.created_at.isoformat(),
    }
