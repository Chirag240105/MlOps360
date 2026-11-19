import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.data.retail_generator import compute_sha256, generate_retail_dataset_csv
from ml.training.baselines import chronological_split_records, evaluate_baselines
from ml.training.metrics import compute_regression_metrics
from ml.validation.validator import validate_and_profile_csv


class TestPhase2DatasetAndBaselines(unittest.TestCase):
    def test_generator_is_deterministic_and_versioned(self) -> None:
        csv_a, hash_a, count_a = generate_retail_dataset_csv(days=60, seed=42, scenario="reference")
        csv_b, hash_b, count_b = generate_retail_dataset_csv(days=60, seed=42, scenario="reference")
        self.assertEqual(hash_a, hash_b)
        self.assertEqual(csv_a, csv_b)
        self.assertEqual(count_a, 60 * 3 * 4)
        self.assertEqual(count_a, count_b)
        self.assertEqual(compute_sha256(csv_a), hash_a)

    def test_validator_passes_reference_and_blocks_corrupted(self) -> None:
        ref_csv, _, _ = generate_retail_dataset_csv(days=60, seed=42, scenario="reference")
        ref_report = validate_and_profile_csv(ref_csv)
        self.assertTrue(ref_report["passed"])
        self.assertEqual(ref_report["rowCount"], 720)

        bad_csv, _, _ = generate_retail_dataset_csv(days=60, seed=42, scenario="corrupted")
        bad_report = validate_and_profile_csv(bad_csv)
        self.assertFalse(bad_report["passed"])
        failed_rules = {c["rule"] for c in bad_report["checks"] if not c["passed"]}
        self.assertIn("unique_date_store_sku_keys", failed_rules)
        self.assertIn("domain_value_constraints", failed_rules)

    def test_chronological_split_has_zero_temporal_leakage(self) -> None:
        ref_csv, _, _ = generate_retail_dataset_csv(days=90, seed=42, scenario="reference")
        train, val, test = chronological_split_records(ref_csv)
        self.assertGreater(len(train), 0)
        self.assertGreater(len(val), 0)
        self.assertGreater(len(test), 0)
        self.assertLess(max(r["date"] for r in train), min(r["date"] for r in val))
        self.assertLess(max(r["date"] for r in val), min(r["date"] for r in test))

    def test_safeguarded_mape_handles_zero_actuals(self) -> None:
        metrics = compute_regression_metrics([0.0, 10.0, 20.0], [2.0, 12.0, 18.0])
        self.assertEqual(metrics["zeroActualCount"], 1)
        # Only 10->12 (20%) and 20->18 (10%) enter MAPE => avg 15.0%
        self.assertEqual(metrics["mapePct"], 15.0)

    def test_ridge_baseline_beats_naive_on_reference_dataset(self) -> None:
        ref_csv, _, _ = generate_retail_dataset_csv(days=120, seed=42, scenario="reference")
        results = evaluate_baselines(ref_csv)
        models = {m["name"]: m["test"] for m in results["models"]}
        naive_rmse = models["Naive Lag-1 Baseline"]["rmse"]
        ridge_rmse = models["Ridge Linear Regression Baseline"]["rmse"]
        self.assertLess(ridge_rmse, naive_rmse)


if __name__ == "__main__":
    unittest.main()
