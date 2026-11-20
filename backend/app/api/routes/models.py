from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ...services.registry_governance import ModelStage, validate_stage_transition

router = APIRouter(prefix="/models", tags=["model-registry"])


class RegisterModelRequest(BaseModel):
    model_name: str
    training_run_id: str
    initial_stage: ModelStage = ModelStage.DEVELOPMENT


class TransitionStageRequest(BaseModel):
    current_stage: ModelStage
    target_stage: ModelStage
    actor: str = "ml-engineer"
    reason: str = ""


@router.post("/register", status_code=201)
def register_model(payload: RegisterModelRequest) -> dict:
    if payload.initial_stage not in (ModelStage.DEVELOPMENT, ModelStage.CANDIDATE):
        raise HTTPException(
            status_code=422,
            detail="Registered models must start in Development or Candidate",
        )
    return {"model_name": payload.model_name, "stage": payload.initial_stage.value}


@router.post("/{model_id}/versions/{version_id}/transition")
def transition_model_stage(model_id: str, version_id: str, payload: TransitionStageRequest) -> dict:
    try:
        validate_stage_transition(payload.current_stage, payload.target_stage)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "model_id": model_id,
        "version_id": version_id,
        "stage": payload.target_stage.value,
        "actor": payload.actor,
    }
