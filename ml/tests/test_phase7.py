import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.data.retail_generator import generate_retail_dataset_csv
from ml.monitoring.drift_engine import compute_psi, compute_two_sample_ks, evaluate_monitoring_window
from ml.training.trainer import load_verified_artifact, run_training_pipeline


class TestPhase7DriftMonitoring(unittest.TestCase):
    def test_psi_and_ks_distinguish_stable_vs_shifted_distributions(self) -> None:
        ref = [3.5 + (i % 5) * 0.1 for i in range(100)]
        edges = [3.5, 3.6, 3.7, 3.8, 3.9, 3.9]
        stable = [3.5 + (i % 5) * 0.1 for i in range(60)]
        shifted = [5.2 + (i % 5) * 0.2 for i in range(60)]

        self.assertLess(compute_psi(edges, ref, stable), 0.05)
        self.assertGreater(compute_psi(edges, ref, shifted), 0.25)

        ks_stable = compute_two_sample_ks(ref, stable)
        ks_shifted = compute_two_sample_ks(ref, shifted)
        self.assertGreater(ks_stable["pValue"], 0.05)
        self.assertLess(ks_shifted["pValue"], 0.01)

    def test_monitoring_separates_covariate_drift_from_performance_degradation(self) -> None:
        csv_text, _, _ = generate_retail_dataset_csv(days=90, seed=42, scenario="reference")
        with tempfile.TemporaryDirectory() as tmpdir:
            res = run_training_pipeline(
                csv_text=csv_text,
                artifact_dir=tmpdir,
                run_id="run_p7_unit",
                algorithm="ridge",
                seed=42,
            )
            artifact = load_verified_artifact(res["artifactPath"], res["artifactSha256"])

            # Drifted inputs WITHOUT degraded labels => COVARIATE_DRIFT_WARNING, NOT performance_degraded
            drifted_records = [
                {
                    "date": f"2026-06-{10 + i:02d}",
                    "store_id": "STORE-01",
                    "sku_id": "SKU-101",
                    "features": {
                        "date": f"2026-06-{10 + i:02d}",
                        "store_id": "STORE-01",
                        "sku_id": "SKU-101",
                        "price": 7.50 + i * 0.1,  # Huge price shift from ~3.5
                        "discount_pct": 0.45,     # Aggressive promo shift from ~0.05
                        "is_holiday": 0,
                    },
                    "predicted_units": 30.0,
                    "actual_units": None,
                }
                for i in range(12)
            ]
            report = evaluate_monitoring_window(artifact=artifact, production_records=drifted_records)
            self.assertTrue(report["dataDriftDetected"])
            self.assertFalse(report["performanceDegraded"])
            self.assertEqual(report["overallStatus"], "COVARIATE_DRIFT_WARNING")

            # Now attach severely wrong ground-truth labels => PERFORMANCE_DEGRADED
            for r in drifted_records:
                r["actual_units"] = 95.0
            perf_report = evaluate_monitoring_window(artifact=artifact, production_records=drifted_records)
            self.assertTrue(perf_report["performanceDegraded"])
            self.assertEqual(perf_report["overallStatus"], "PERFORMANCE_DEGRADED")


if __name__ == "__main__":
    unittest.main()
