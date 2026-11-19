"""Track B Governed 6-Stage Model Registry State Machine."""
from enum import Enum
from typing import Dict, FrozenSet


class ModelStage(str, Enum):
    DEVELOPMENT = "Development"
    CANDIDATE = "Candidate"
    STAGING = "Staging"
    PRODUCTION = "Production"
    ARCHIVED = "Archived"
    REJECTED = "Rejected"


ALLOWED_STAGE_TRANSITIONS: Dict[ModelStage, FrozenSet[ModelStage]] = {
    ModelStage.DEVELOPMENT: frozenset({ModelStage.CANDIDATE, ModelStage.REJECTED, ModelStage.ARCHIVED}),
    ModelStage.CANDIDATE: frozenset({ModelStage.STAGING, ModelStage.REJECTED, ModelStage.ARCHIVED}),
    ModelStage.STAGING: frozenset({ModelStage.PRODUCTION, ModelStage.REJECTED, ModelStage.ARCHIVED}),
    ModelStage.PRODUCTION: frozenset({ModelStage.ARCHIVED, ModelStage.STAGING}),
    ModelStage.ARCHIVED: frozenset({ModelStage.PRODUCTION, ModelStage.STAGING}),
    ModelStage.REJECTED: frozenset({ModelStage.ARCHIVED}),
}


def validate_stage_transition(current: ModelStage, target: ModelStage) -> None:
    if current == target:
        raise ValueError(f"Model version is already in stage '{target.value}'")
    allowed = ALLOWED_STAGE_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise ValueError(
            f"Illegal transition '{current.value}' -> '{target.value}'. "
            f"Allowed: {[s.value for s in allowed]}"
        )


def check_promotion_gate(
    champion_rmse: float | None,
    challenger_rmse: float,
    min_improvement: float = 0.0,
    force_override: bool = False,
) -> bool:
    if champion_rmse is None or force_override:
        return True
    if champion_rmse <= 0:
        return False
    return ((champion_rmse - challenger_rmse) / champion_rmse) > min_improvement


def select_rollback_candidate(versions: list[dict]) -> dict | None:
    """Prefer most recent Archived version, falling back to Staging; never Rejected."""
    archived = [v for v in versions if v.get("stage") == ModelStage.ARCHIVED.value]
    if archived:
        return sorted(archived, key=lambda v: int(v.get("version_number", 0)), reverse=True)[0]
    staging = [v for v in versions if v.get("stage") == ModelStage.STAGING.value]
    if staging:
        return sorted(staging, key=lambda v: int(v.get("version_number", 0)), reverse=True)[0]
    return None

