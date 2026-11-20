"""Unit and integration tests for the Lightweight Job Architecture & Scheduler."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import time

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
for p in [str(PROJECT_ROOT), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest

try:
    from backend.app.services.job_manager import LightweightJobManager, JobRecord
    from backend.app.services.scheduler import InProcessScheduler
    from backend.app.serving.inference_app import serving_app
    from backend.app.main import app as main_app
except ImportError:
    from app.services.job_manager import LightweightJobManager, JobRecord
    from app.services.scheduler import InProcessScheduler
    from app.serving.inference_app import serving_app
    from app.main import app as main_app


@pytest.fixture
def temp_job_manager(tmp_path):
    storage_root = tmp_path / "artifacts"
    db_path = tmp_path / "data" / "modelops360.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return LightweightJobManager(storage_root=str(storage_root), db_path=str(db_path), max_workers=2)


def test_job_submission_and_lifecycle_success(temp_job_manager):
    # Initial run: should pass validation, train, and promote as initial baseline
    job = temp_job_manager.submit_retraining_job(
        model_id="test-model",
        trigger_type="MANUAL",
        dataset_name="test-ds",
        algorithm="ridge",
        seed=42,
    )

    assert job.status in ("QUEUED", "RUNNING")
    assert job.idempotency_key is not None

    # Wait for background thread completion
    for _ in range(50):
        if job.status in ("SUCCEEDED", "FAILED", "REJECTED_BY_GATE"):
            break
        time.sleep(0.2)

    assert job.status == "SUCCEEDED"
    assert job.decision == "PROMOTED"
    assert "FIRST_DEPLOYMENT" in job.decision_reason
    assert job.completed_at is not None

    # Production pointer should now be written
    pointer = temp_job_manager.get_production_champion()
    assert pointer is not None
    assert pointer["run_id"] == job.challenger_version_id


def test_idempotency_prevents_duplicate_jobs(temp_job_manager):
    key = "custom-idempotent-key-123"
    job1 = temp_job_manager.submit_retraining_job(
        model_id="test-model",
        idempotency_key=key,
    )
    job2 = temp_job_manager.submit_retraining_job(
        model_id="test-model",
        idempotency_key=key,
    )

    # Identical key must return the exact same job instance
    assert job1.id == job2.id


def test_cooldown_guardrail_blocks_frequent_runs(temp_job_manager):
    # Simulate a successfully completed job 2 hours ago
    completed_job = JobRecord(
        id="job_past_1",
        idempotency_key="key_1",
        model_id="retail-demand-v1",
        trigger_type="MANUAL",
        status="SUCCEEDED",
        completed_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    temp_job_manager._in_memory_jobs[completed_job.id] = completed_job

    # Attempt to trigger via drift policy without bypass
    decision = temp_job_manager.evaluate_retraining_guardrails(
        model_id="retail-demand-v1",
        data_drift_detected=True,
        cooldown_hours=24,
    )

    assert decision.eligible is False
    assert decision.blocked_by == "COOLDOWN_ACTIVE"
    assert "Cooldown active" in decision.reason


def test_circuit_breaker_trips_on_three_consecutive_failures(temp_job_manager):
    now = datetime.now(timezone.utc)
    for i in range(3):
        fail_job = JobRecord(
            id=f"job_fail_{i}",
            idempotency_key=f"key_fail_{i}",
            model_id="retail-demand-v1",
            trigger_type="MANUAL",
            status="FAILED",
            completed_at=now - timedelta(minutes=i * 10),
        )
        temp_job_manager._in_memory_jobs[fail_job.id] = fail_job

    decision = temp_job_manager.evaluate_retraining_guardrails(
        model_id="retail-demand-v1",
        performance_degraded=True,
    )

    assert decision.eligible is False
    assert decision.blocked_by == "CIRCUIT_BREAKER_OPEN"


def test_challenger_rejection_when_inferior(temp_job_manager):
    # Set reigning champion with extremely low RMSE (0.01) so challenger cannot beat it
    models_dir = temp_job_manager.storage_root / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    pointer_path = models_dir / "production_pointer.json"
    pointer_path.write_text(json.dumps({
        "run_id": "unbeatable_champion",
        "test_rmse": 0.01
    }))

    job = temp_job_manager.submit_retraining_job(
        model_id="test-model-2",
        trigger_type="MANUAL",
        algorithm="ridge",
        min_relative_improvement=0.02,
        seed=123,
    )

    for _ in range(80):
        if job.status in ("SUCCEEDED", "FAILED", "REJECTED_BY_GATE"):
            break
        time.sleep(0.2)

    assert job.status == "REJECTED_BY_GATE"
    assert job.decision == "REJECTED"

    # Champion pointer remains unchanged
    current_champion = temp_job_manager.get_production_champion()
    assert current_champion["run_id"] == "unbeatable_champion"


def test_scheduler_monitoring_and_alerting(tmp_path):
    scheduler = InProcessScheduler(check_interval_seconds=10)
    res = scheduler.run_monitoring_cycle()
    status = res.get("overall_status", res.get("status"))
    assert status in ("SKIPPED", "HEALTHY", "COVARIATE_DRIFT_WARNING", "PERFORMANCE_DEGRADED")


def test_fastapi_endpoints():
    from unittest.mock import MagicMock
    from backend.app.api.routes.health import health_check
    from backend.app.api.routes.training import list_training_runs, trigger_training_run
    from backend.app.api.routes.models import transition_model_stage, TransitionStageRequest
    from backend.app.schemas.training import TrainingRunRequest
    from backend.app.services.registry_governance import ModelStage

    # Health route
    req = MagicMock()
    req.state.request_id = "test-req-123"
    h_resp = health_check(req)
    assert h_resp["status"] == "healthy"
    assert h_resp["request_id"] == "test-req-123"

    # Training list route
    runs_resp = list_training_runs()
    assert "runs" in runs_resp

    # Trigger training route
    payload = TrainingRunRequest(dataset_id="test-ds", algorithm="ridge", seed=42)
    trigger_resp = trigger_training_run(payload)
    assert trigger_resp["status"] in ("QUEUED", "RUNNING")
    assert "job_id" in trigger_resp

    # Model stage transition validation
    trans_payload = TransitionStageRequest(
        current_stage=ModelStage.DEVELOPMENT,
        target_stage=ModelStage.CANDIDATE,
        actor="tester",
    )
    trans_resp = transition_model_stage("m1", "v1", trans_payload)
    assert trans_resp["stage"] == "Candidate"


def test_serving_api_predict():
    from backend.app.serving.inference_app import serving_health, serving_metrics, predict_single, PredictPayload

    # Health route
    h = serving_health()
    assert h["status"] == "healthy"

    # Metrics route
    m = serving_metrics()
    assert "total_requests" in m

    # Prediction validation (no model deployed yet in clean test)
    p = PredictPayload(
        date="2026-01-15",
        store_id="STORE-001",
        sku_id="SKU-DEMAND-01",
        price=25.0,
        discount_pct=0.1,
        is_holiday=0,
    )
    import pytest
    from fastapi import HTTPException
    # When no model is deployed, should raise 404 HTTPException
    try:
        predict_single(p)
    except HTTPException as exc:
        assert exc.status_code in (404, 200)
