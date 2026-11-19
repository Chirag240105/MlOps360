import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.services.retraining_policy import (
    PolicyInput,
    evaluate_challenger_gate,
    evaluate_retraining_policy,
)


class TestPhase8RetrainingPolicy(unittest.TestCase):
    def test_cooldown_and_circuit_breaker_guardrails(self) -> None:
        now = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
        in_cooldown = evaluate_retraining_policy(
            PolicyInput(
                model_id="mdl_1",
                performance_degraded=True,
                data_drift_detected=True,
                prediction_drift_detected=True,
                max_psi=0.45,
                cooldown_hours=24,
                last_completed_at=now - timedelta(hours=4),
            ),
            now=now,
        )
        self.assertFalse(in_cooldown.eligible)
        self.assertEqual(in_cooldown.blocked_by, "COOLDOWN_ACTIVE")

        breaker_open = evaluate_retraining_policy(
            PolicyInput(
                model_id="mdl_1",
                performance_degraded=True,
                data_drift_detected=True,
                prediction_drift_detected=True,
                max_psi=0.45,
                consecutive_failures=3,
            ),
            now=now,
        )
        self.assertFalse(breaker_open.eligible)
        self.assertEqual(breaker_open.blocked_by, "CIRCUIT_BREAKER_OPEN")

    def test_challenger_gate_enforces_minimum_improvement(self) -> None:
        passed, rel = evaluate_challenger_gate(champion_rmse=12.0, challenger_rmse=8.4)
        self.assertTrue(passed)
        self.assertGreater(rel, 0.25)

        failed, rel_bad = evaluate_challenger_gate(champion_rmse=8.4, challenger_rmse=8.35)
        self.assertFalse(failed)
        self.assertLess(rel_bad, 0.02)


if __name__ == "__main__":
    unittest.main()
