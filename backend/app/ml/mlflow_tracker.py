"""Track B Production MLflow Experiment Tracking & Model Registry Client."""
from typing import Any, Dict, Optional
import mlflow
from mlflow.tracking import MlflowClient


class MlflowTracker:
    """
    Wraps MLflow Tracking Server + Model Registry operations.

    Internal Architecture:
      - Backend Store (PostgreSQL): stores runs, params, metrics, tags, and registered model aliases.
      - Artifact Store (S3 / local volume): stores model binaries, JSON feature profiles, and charts.
    """

    def __init__(self, tracking_uri: str, experiment_name: str) -> None:
        self.tracking_uri = tracking_uri
        self.experiment_name = experiment_name
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment(experiment_name)
        self.client = MlflowClient(tracking_uri=tracking_uri)

    def log_training_run(
        self,
        *,
        run_name: str,
        algorithm: str,
        params: Dict[str, Any],
        val_metrics: Dict[str, float],
        test_metrics: Dict[str, float],
        dataset_version_hash: str,
        git_commit: str,
        artifact_path: str,
        duration_ms: float,
    ) -> str:
        with mlflow.start_run(run_name=run_name) as run:
            mlflow.log_params({**params, "algorithm": algorithm})
            mlflow.log_metrics({f"val_{k}": float(v) for k, v in val_metrics.items() if isinstance(v, (int, float))})
            mlflow.log_metrics({f"test_{k}": float(v) for k, v in test_metrics.items() if isinstance(v, (int, float))})
            mlflow.log_metric("duration_ms", duration_ms)
            mlflow.set_tags(
                {
                    "dataset_version_hash": dataset_version_hash,
                    "git_commit": git_commit,
                    "use_case": "retail_demand_forecasting",
                }
            )
            mlflow.log_artifact(artifact_path, artifact_path="model_artifact")
            return run.info.run_id

    def register_and_alias_model(
        self,
        *,
        model_name: str,
        run_id: str,
        artifact_subpath: str = "model_artifact",
        alias: Optional[str] = "candidate",
    ) -> str:
        try:
            self.client.create_registered_model(model_name)
        except Exception:
            pass  # Model already exists

        mv = self.client.create_model_version(
            name=model_name,
            source=f"runs:/{run_id}/{artifact_subpath}",
            run_id=run_id,
        )
        if alias:
            self.client.set_registered_model_alias(model_name, alias, mv.version)
        return str(mv.version)
