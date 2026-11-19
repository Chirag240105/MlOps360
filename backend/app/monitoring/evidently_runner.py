"""Track B Production Evidently AI Drift & Regression Report Runner."""
from pathlib import Path
from typing import Dict
import pandas as pd
from evidently.metric_preset import DataDriftPreset, RegressionPreset
from evidently.report import Report


def run_evidently_monitoring(
    reference_df: pd.DataFrame,
    current_df: pd.DataFrame,
    output_html_path: str,
) -> Dict[str, object]:
    """
    Generate Evidently DataDrift + Regression quality report against reference window.
    """
    presets = [DataDriftPreset()]
    if "units_sold" in current_df.columns and "prediction" in current_df.columns and current_df["units_sold"].notna().sum() >= 5:
        presets.append(RegressionPreset())

    report = Report(metrics=presets)
    report.run(reference_data=reference_df, current_data=current_df)

    out_file = Path(output_html_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    report.save_html(str(out_file))

    result_dict = report.as_dict()
    drift_summary = result_dict["metrics"][0]["result"]
    return {
        "dataset_drift": bool(drift_summary.get("dataset_drift", False)),
        "share_of_drifted_columns": float(drift_summary.get("share_of_drifted_columns", 0.0)),
        "number_of_drifted_columns": int(drift_summary.get("number_of_drifted_columns", 0)),
        "html_report_path": str(out_file),
    }
