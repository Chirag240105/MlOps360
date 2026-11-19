from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


class TrainingRunRequest(BaseModel):
    dataset_id: str = Field(..., min_length=1)
    algorithm: Literal["auto", "ridge", "random_forest", "gradient_boosting", "xgboost"] = "auto"
    seed: int = Field(default=42, ge=0)


class TrainingRunResponse(BaseModel):
    run_id: str
    dataset_id: str
    dataset_version_id: str
    algorithm: str
    hyperparameters: Dict[str, Any]
    validation_metrics: Dict[str, Any]
    test_metrics: Dict[str, Any]
    artifact_path: str
    artifact_sha256: str
    git_commit: str
    duration_ms: float
    status: str
    created_at: Optional[str] = None
