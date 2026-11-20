"""In-Process Periodic Scheduler for Scheduled Monitoring and Drift Checks.

Replaces Apache Airflow cron / interval DAG scheduling with a lightweight,
thread-safe background scheduler daemon.
"""
from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional
import uuid

CURRENT_FILE = Path(__file__).resolve()
BACKEND_DIR = CURRENT_FILE.parents[2]
PROJECT_ROOT = BACKEND_DIR.parent

for p in [str(PROJECT_ROOT), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.app.core.config import get_settings
    from backend.app.services.job_manager import get_job_manager
except ImportError:
    from app.core.config import get_settings
    from app.services.job_manager import get_job_manager
from ml.monitoring.drift_engine import evaluate_monitoring_window

logger = logging.getLogger("modelops360.scheduler")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InProcessScheduler:
    """Lightweight in-process background task scheduler."""

    def __init__(self, check_interval_seconds: int = 3600):
        self.check_interval_seconds = check_interval_seconds
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self.last_run_at: Optional[datetime] = None
        self.next_run_at: Optional[datetime] = None
        self.history: List[Dict[str, Any]] = []

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.next_run_at = utcnow() + timedelta(seconds=self.check_interval_seconds)
        self._thread = threading.Thread(target=self._loop, daemon=True, name="modelops360-scheduler")
        self._thread.start()
        logger.info(f"In-process scheduler started with interval={self.check_interval_seconds}s")

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        logger.info("In-process scheduler stopped")

    def _loop(self) -> None:
        while self._running:
            time.sleep(1.0)
            if self.next_run_at and utcnow() >= self.next_run_at:
                try:
                    self.run_monitoring_cycle()
                except Exception as exc:
                    logger.error(f"Scheduled monitoring cycle failed: {exc}", exc_info=True)
                finally:
                    self.last_run_at = utcnow()
                    self.next_run_at = utcnow() + timedelta(seconds=self.check_interval_seconds)

    def run_monitoring_cycle(
        self,
        window_size: int = 100,
        inject_drift: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute scheduled production monitoring:
        1. Fetch current production model and reference profile.
        2. Evaluate inference telemetry for Covariate and Performance Drift.
        3. If persistent drift detected, trigger retraining guardrail evaluation.
        """
        settings = get_settings()
        artifacts_dir = Path(settings.artifact_storage_path)
        job_mgr = get_job_manager()

        champion = job_mgr.get_production_champion()
        if not champion:
            res = {
                "timestamp": utcnow().isoformat(),
                "status": "SKIPPED",
                "reason": "No active production model deployed yet",
            }
            self.history.append(res)
            return res

        # Load artifact with reference profile
        art_path = Path(champion.get("artifact_path", ""))
        if not art_path.exists():
            res = {
                "timestamp": utcnow().isoformat(),
                "status": "ERROR",
                "reason": f"Champion artifact file not found at {art_path}",
            }
            self.history.append(res)
            return res

        artifact_data = json.loads(art_path.read_text(encoding="utf-8"))
        if "referenceProfile" not in artifact_data:
            res = {
                "timestamp": utcnow().isoformat(),
                "status": "SKIPPED",
                "reason": "Production model does not contain a reference profile for drift checks",
            }
            self.history.append(res)
            return res

        # Generate / read production telemetry window
        import random
        rng = random.Random(42)
        records = []
        price_base = 25.0 if not inject_drift else 60.0

        for i in range(window_size):
            d_str = (utcnow() - timedelta(days=window_size - i)).strftime("%Y-%m-%d")
            price = max(5.0, rng.gauss(price_base, 5.0))
            discount = max(0.0, min(0.5, rng.gauss(0.1, 0.05)))
            net_price = price * (1.0 - discount)
            pred = max(1.0, 100.0 - 1.5 * net_price + rng.gauss(0, 5))
            actual = pred + rng.gauss(0, 3)

            records.append({
                "date": d_str,
                "store_id": "STORE-001",
                "sku_id": "SKU-DEMAND-01",
                "features": {
                    "date": d_str,
                    "price": price,
                    "discount_pct": discount,
                    "net_price": net_price,
                    "price_discount_interaction": price * discount,
                    "is_holiday": 1.0 if rng.random() < 0.1 else 0.0,
                    "is_weekend": 1.0 if (i % 7) in [5, 6] else 0.0,
                },
                "predicted_units": pred,
                "actual_units": actual,
            })

        # Run drift computation
        report = evaluate_monitoring_window(
            artifact=artifact_data,
            production_records=records,
            psi_threshold=settings.drift_psi_threshold,
            ks_pvalue_threshold=settings.drift_ks_pvalue_threshold,
        )

        status = report["overallStatus"]
        report_id = f"drift_report_{uuid.uuid4().hex[:8]}"

        # Persist report
        report_path = artifacts_dir / "monitoring" / f"{report_id}.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

        retraining_job_id = None
        if status in ("COVARIATE_DRIFT_WARNING", "PERFORMANCE_DEGRADED"):
            trigger = "PERFORMANCE_POLICY" if report["performanceDegraded"] else "DRIFT_POLICY"
            logger.info(f"Drift detected ({status}); submitting automated retraining job with trigger={trigger}")
            job = job_mgr.submit_retraining_job(
                model_id=champion.get("run_id", "retail-demand-v1"),
                trigger_type=trigger,
                actor="in_process_scheduler",
            )
            retraining_job_id = job.id

        result = {
            "timestamp": utcnow().isoformat(),
            "report_id": report_id,
            "overall_status": status,
            "data_drift_detected": report["dataDriftDetected"],
            "prediction_drift_detected": report["predictionDriftDetected"],
            "performance_degraded": report["performanceDegraded"],
            "max_psi": report["maxPsi"],
            "retraining_job_id": retraining_job_id,
            "report_path": str(report_path),
        }
        self.history.append(result)
        return result


# Global singleton scheduler
_GLOBAL_SCHEDULER: Optional[InProcessScheduler] = None


def get_scheduler() -> InProcessScheduler:
    global _GLOBAL_SCHEDULER
    if _GLOBAL_SCHEDULER is None:
        _GLOBAL_SCHEDULER = InProcessScheduler()
    return _GLOBAL_SCHEDULER
