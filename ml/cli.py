import argparse
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.data.retail_generator import compute_sha256, generate_retail_dataset_csv
from ml.monitoring.drift_engine import evaluate_monitoring_window
from ml.monitoring.retraining_assessment import run_retraining_assessment
from ml.training.baselines import evaluate_baselines
from ml.training.trainer import load_verified_artifact, predict_with_artifact, run_training_pipeline
from ml.validation.validator import validate_and_profile_csv


def main() -> None:
    parser = argparse.ArgumentParser(description="ModelOps360 Python ML Engine CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    gen_p = subparsers.add_parser("generate-dataset")
    gen_p.add_argument("--days", type=int, default=120)
    gen_p.add_argument("--start-date", default="2026-01-01")
    gen_p.add_argument("--seed", type=int, default=42)
    gen_p.add_argument("--scenario", choices=["reference", "corrupted", "drifted"], default="reference")
    gen_p.add_argument("--output", required=True)

    val_p = subparsers.add_parser("validate-dataset")
    val_p.add_argument("--input", required=True)

    base_p = subparsers.add_parser("run-baselines")
    base_p.add_argument("--input", required=True)

    train_p = subparsers.add_parser("train-pipeline")
    train_p.add_argument("--input", required=True)
    train_p.add_argument("--artifact-dir", required=True)
    train_p.add_argument("--run-id", required=True)
    train_p.add_argument("--algorithm", choices=["auto", "ridge", "random_forest", "gradient_boosting"], default="auto")
    train_p.add_argument("--seed", type=int, default=42)
    train_p.add_argument("--dataset-version-hash", default="")

    pred_p = subparsers.add_parser("predict-artifact")
    pred_p.add_argument("--artifact", required=True)
    pred_p.add_argument("--sha256", required=True)
    pred_p.add_argument("--records-json", default="")
    pred_p.add_argument("--records-stdin", action="store_true")

    mon_p = subparsers.add_parser("evaluate-monitoring")
    mon_p.add_argument("--artifact", required=True)
    mon_p.add_argument("--sha256", required=True)
    mon_p.add_argument("--psi-threshold", type=float, default=0.20)
    mon_p.add_argument("--ks-pvalue-threshold", type=float, default=0.05)
    mon_p.add_argument("--rmse-degradation-factor", type=float, default=1.25)

    assessment_p = subparsers.add_parser(
        "retraining-assessment",
        help="Evaluate a champion on new data and train a gated challenger",
    )
    assessment_p.add_argument("--historical", required=True, help="Previously used labeled training CSV")
    assessment_p.add_argument("--new-data", required=True, help="New labeled incoming CSV")
    assessment_p.add_argument("--champion-artifact", required=True)
    assessment_p.add_argument("--champion-sha256", required=True)
    assessment_p.add_argument("--artifact-dir", required=True)
    assessment_p.add_argument("--run-id", default="assessment_candidate")
    assessment_p.add_argument(
        "--algorithm",
        choices=["auto", "ridge", "random_forest", "gradient_boosting"],
        default="auto",
    )
    assessment_p.add_argument("--seed", type=int, default=42)
    assessment_p.add_argument("--min-relative-improvement", type=float, default=0.02)

    args = parser.parse_args()

    if args.command == "generate-dataset":
        csv_text, sha256, row_count = generate_retail_dataset_csv(
            days=args.days,
            start_date=args.start_date,
            seed=args.seed,
            scenario=args.scenario,
        )
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(csv_text, encoding="utf-8")
        print(
            json.dumps(
                {
                    "outputPath": str(out_path),
                    "versionHash": sha256,
                    "rowCount": row_count,
                    "scenario": args.scenario,
                }
            )
        )
    elif args.command == "validate-dataset":
        csv_text = Path(args.input).read_text(encoding="utf-8")
        report = validate_and_profile_csv(csv_text)
        report["versionHash"] = compute_sha256(csv_text)
        print(json.dumps(report))
    elif args.command == "run-baselines":
        csv_text = Path(args.input).read_text(encoding="utf-8")
        validation = validate_and_profile_csv(csv_text)
        if not validation["passed"]:
            print(json.dumps({"error": "VALIDATION_FAILED", "validation": validation}))
            sys.exit(2)
        results = evaluate_baselines(csv_text)
        print(json.dumps(results))
    elif args.command == "train-pipeline":
        csv_text = Path(args.input).read_text(encoding="utf-8")
        validation = validate_and_profile_csv(csv_text)
        if not validation["passed"]:
            print(json.dumps({"error": "VALIDATION_FAILED", "validation": validation}))
            sys.exit(2)
        result = run_training_pipeline(
            csv_text=csv_text,
            artifact_dir=args.artifact_dir,
            run_id=args.run_id,
            algorithm=args.algorithm,
            seed=args.seed,
            dataset_version_hash=args.dataset_version_hash or None,
        )
        print(json.dumps(result))
    elif args.command == "predict-artifact":
        raw_json = sys.stdin.read() if args.records_stdin else args.records_json
        records = json.loads(raw_json)
        preds = predict_with_artifact(
            artifact_path=args.artifact,
            expected_sha256=args.sha256,
            records=records,
        )
        print(json.dumps({"predictions": preds}))
    elif args.command == "evaluate-monitoring":
        prod_records = json.loads(sys.stdin.read())
        artifact = load_verified_artifact(args.artifact, args.sha256)
        report = evaluate_monitoring_window(
            artifact=artifact,
            production_records=prod_records,
            psi_threshold=args.psi_threshold,
            ks_pvalue_threshold=args.ks_pvalue_threshold,
            rmse_degradation_factor=args.rmse_degradation_factor,
        )
        print(json.dumps(report))
    elif args.command == "retraining-assessment":
        report = run_retraining_assessment(
            historical_csv=Path(args.historical).read_text(encoding="utf-8"),
            incoming_csv=Path(args.new_data).read_text(encoding="utf-8"),
            champion_artifact_path=args.champion_artifact,
            champion_sha256=args.champion_sha256,
            artifact_dir=args.artifact_dir,
            run_id=args.run_id,
            algorithm=args.algorithm,
            seed=args.seed,
            min_relative_improvement=args.min_relative_improvement,
        )
        print(json.dumps(report))


if __name__ == "__main__":
    main()
