import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.data.retail_generator import generate_retail_dataset_csv
from ml.features.pipeline import FEATURE_NAMES, prepare_chronological_splits
from ml.training.trainer import load_verified_artifact, predict_with_artifact, run_training_pipeline


class TestPhase3TrainingPipeline(unittest.TestCase):
    def test_feature_pipeline_has_13_features_and_reference_profile(self) -> None:
        csv_text, _, _ = generate_retail_dataset_csv(days=60, seed=42, scenario="reference")
        splits = prepare_chronological_splits(csv_text)
        self.assertEqual(len(splits["featureNames"]), 13)
        self.assertEqual(len(splits["x_train"][0]), len(FEATURE_NAMES))
        self.assertIn("price", splits["referenceProfile"])
        self.assertIn("quantileEdges", splits["referenceProfile"]["price"])

    def test_auto_training_pipeline_evaluates_all_3_families_and_saves_safe_artifact(self) -> None:
        csv_text, dataset_hash, _ = generate_retail_dataset_csv(days=120, seed=42, scenario="reference")
        with tempfile.TemporaryDirectory() as tmpdir:
            res = run_training_pipeline(
                csv_text=csv_text,
                artifact_dir=tmpdir,
                run_id="run_test_001",
                algorithm="auto",
                seed=42,
                dataset_version_hash=dataset_hash,
            )
            algos = {c["algorithm"] for c in res["candidatesEvaluated"]}
            self.assertEqual(algos, {"ridge", "random_forest", "gradient_boosting"})
            self.assertGreater(res["testMetrics"]["r2"], 0.75)
            self.assertLess(res["testMetrics"]["mapePct"], 12.0)

            # Verify SHA-256 artifact loads and predicts cleanly
            preds = predict_with_artifact(
                artifact_path=res["artifactPath"],
                expected_sha256=res["artifactSha256"],
                records=[
                    {
                        "date": "2026-05-01",
                        "store_id": "STORE-01",
                        "sku_id": "SKU-101",
                        "price": 3.50,
                        "discount_pct": 0.20,
                        "is_holiday": 0,
                    }
                ],
            )
            self.assertEqual(len(preds), 1)
            self.assertGreater(preds[0]["predicted_units"], 0.0)

            # Tamper artifact and verify SHA-256 gate blocks loading
            art_file = Path(res["artifactPath"])
            tampered = json.loads(art_file.read_text(encoding="utf-8"))
            tampered["globalMean"] = 999999.0
            art_file.write_text(json.dumps(tampered), encoding="utf-8")

            with self.assertRaises(ValueError):
                load_verified_artifact(res["artifactPath"], res["artifactSha256"])


if __name__ == "__main__":
    unittest.main()
