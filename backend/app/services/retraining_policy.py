"""Track B Automated Retraining Policy Engine & Champion/Challenger Gate."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


@dataclass(frozen=True)
class PolicyInput:
    model_id: str
    performance_degraded: bool
    data_drift_detected: bool
    prediction_drift_detected: bool
    max_psi: float
    psi_threshold: float = 0.20
    cooldown_hours: int = 24
    last_completed_at: Optional[datetime] = None
    consecutive_failures: int = 0
    has_active_job: bool = False
    bypass_cooldown: bool = False


@dataclass(frozen=True)
class PolicyDecision:
    eligible: bool
    recommended_trigger: Optional[str]
    blocked_by: Optional[str]
    reason: str


def evaluate_retraining_policy(
    inp: PolicyInput,
    now: Optional[datetime] = None,
) -> PolicyDecision:
    current = now or datetime.now(timezone.utc)

    if inp.has_active_job:
        return PolicyDecision(False, None, "ACTIVE_JOB", "Retraining job already QUEUED or RUNNING")

    if inp.consecutive_failures >= 3:
        return PolicyDecision(
            False,
            None,
            "CIRCUIT_BREAKER_OPEN",
            "Circuit breaker tripped after 3 consecutive failed retraining runs",
        )

    if not inp.bypass_cooldown and inp.last_completed_at is not None and inp.cooldown_hours > 0:
        elapsed_hours = (current - inp.last_completed_at).total_seconds() / 3600.0
        if elapsed_hours < inp.cooldown_hours:
            return PolicyDecision(
                False,
                None,
                "COOLDOWN_ACTIVE",
                f"Cooldown active ({inp.cooldown_hours - elapsed_hours:.2f}h remaining)",
            )

    if inp.performance_degraded:
        return PolicyDecision(True, "PERFORMANCE_POLICY", None, "Proven live RMSE degradation detected")

    if inp.max_psi >= inp.psi_threshold * 1.5 or (inp.data_drift_detected and inp.prediction_drift_detected):
        return PolicyDecision(
            True,
            "DRIFT_POLICY",
            None,
            "Corroborated high-magnitude covariate & prediction drift detected",
        )

    return PolicyDecision(
        False,
        None,
        "NO_TRIGGER_SIGNAL",
        "No qualifying degradation or persistent drift signal",
    )


def evaluate_challenger_gate(
    champion_rmse: float,
    challenger_rmse: float,
    min_relative_improvement: float = 0.02,
) -> tuple[bool, float]:
    """Return (passed, relative_improvement) comparing Challenger against Production Champion."""
    if champion_rmse <= 0:
        return True, 0.0
    rel = (champion_rmse - challenger_rmse) / champion_rmse
    return rel >= min_relative_improvement, round(rel, 4)
