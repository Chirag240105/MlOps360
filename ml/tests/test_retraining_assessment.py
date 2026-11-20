import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.data.retail_generator import generate_retail_dataset_csv
from ml.monitoring.retraining_assessment import run_retraining_assessment
from ml.training.trainer import run_training_pipeline


class TestRetrainingAssessment(unittest.TestCase):
    def test_assessment_evaluates_new_batch_and_keeps_champion_unchanged(self) -> None:
        historical_csv, historical_hash, _ = generate_retail_dataset_csv(
            days=60, start_date="2026-01-01", seed=42, scenario="reference"
        )
        incoming_csv, _, _ = generate_retail_dataset_csv(
            days=30, start_date="2026-03-02", seed=43, scenario="drifted"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            champion_result = run_training_pipeline(
                csv_text=historical_csv,
                artifact_dir=str(Path(tmpdir) / "champion"),
                run_id="assessment_champion",
                algorithm="ridge",
                dataset_version_hash=historical_hash,
            )
            champion_path = Path(champion_result["artifactPath"])
            champion_before = champion_path.read_bytes()

            report = run_retraining_assessment(
                historical_csv=historical_csv,
                incoming_csv=incoming_csv,
                champion_artifact_path=str(champion_path),
                champion_sha256=champion_result["artifactSha256"],
                artifact_dir=str(Path(tmpdir) / "assessment"),
                run_id="assessment_candidate",
                algorithm="ridge",
            )

            saved_report = json.loads(Path(report["reportPath"]).read_text(encoding="utf-8"))
            self.assertEqual(report["incomingData"]["rows"], 360)
            self.assertEqual(report["incomingData"]["targetDistribution"]["count"], 360)
            self.assertEqual(report["championEvaluation"]["newBatchMetrics"]["samples"], 360)
            self.assertGreater(report["candidate"]["newBatchHoldoutMetrics"]["samples"], 0)
            self.assertTrue(Path(report["candidate"]["artifactPath"]).is_file())
            self.assertEqual(report["candidate"]["trainingRows"], 1080)
            self.assertFalse(report["qualityGate"]["championUpdated"])
            self.assertEqual(saved_report["qualityGate"], report["qualityGate"])
            self.assertEqual(champion_path.read_bytes(), champion_before)

    def test_assessment_rejects_duplicate_incoming_keys(self) -> None:
        historical_csv, _, _ = generate_retail_dataset_csv(days=30, start_date="2026-01-01")
        incoming_records_csv, _, _ = generate_retail_dataset_csv(
            days=30, start_date="2026-01-31", scenario="reference"
        )
        incoming_lines = incoming_records_csv.splitlines()
        incoming_csv = "\n".join(incoming_lines + [incoming_lines[1]]) + "\n"

        with self.assertRaisesRegex(ValueError, "duplicate"):
            run_retraining_assessment(
                historical_csv=historical_csv,
                incoming_csv=incoming_csv,
                champion_artifact_path="unused",
                champion_sha256="unused",
                artifact_dir="unused",
            )


if __name__ == "__main__":
    unittest.main()
