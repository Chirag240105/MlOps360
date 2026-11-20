"""Precision sync from local SQLite database to Neon PostgreSQL."""
import json
import os
import sqlite3
import psycopg

SQLITE_PATH = os.environ.get("LOCAL_SQLITE_PATH", "/app/data/modelops360.db")
if not os.path.exists(SQLITE_PATH) and os.path.exists("./data/modelops360.db"):
    SQLITE_PATH = "./data/modelops360.db"

NEON_URL = "postgresql://neondb_owner:npg_lieWzB0LKc6d@ep-empty-base-bd3ul02o-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require"

print(f"Connecting to SQLite: {SQLITE_PATH}")
sconn = sqlite3.connect(SQLITE_PATH)
sconn.row_factory = sqlite3.Row
scur = sconn.cursor()

print("Connecting to Neon PostgreSQL...")
pconn = psycopg.connect(NEON_URL, autocommit=True)
pcur = pconn.cursor()

# 1. Datasets
scur.execute("SELECT * FROM datasets")
for r in scur.fetchall():
    pcur.execute(
        """INSERT INTO public.datasets (id, name, domain, description, created_at)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['name'], r['domain'], r['description'], r['created_at'])
    )
print("1. Datasets synced.")

# 2. Dataset Versions
scur.execute("SELECT * FROM dataset_versions")
for r in scur.fetchall():
    vr = json.loads(r['validation_report_json']) if r['validation_report_json'] else {}
    eda = json.loads(r['eda_json']) if r['eda_json'] else None
    pcur.execute(
        """INSERT INTO public.dataset_versions
           (id, dataset_id, version_number, version_hash, row_count, storage_uri, validation_passed, validation_report, eda_summary, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['dataset_id'], r['version_number'], r['version_hash'], r['row_count'],
         r['file_path'], bool(r['validation_passed']), json.dumps(vr), json.dumps(eda) if eda else None, r['created_at'])
    )
print("2. Dataset Versions synced.")

# 3. Models
scur.execute("SELECT * FROM registered_models")
for r in scur.fetchall():
    pcur.execute(
        """INSERT INTO public.models (id, name, use_case, production_version_id, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['name'], r['use_case'], r['production_version_id'], r['created_at'], r['updated_at'])
    )
print("3. Models synced.")

# 4. Experiments
scur.execute("SELECT * FROM experiments")
for r in scur.fetchall():
    pcur.execute(
        """INSERT INTO public.experiments (id, name, description, created_at)
           VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['name'], r['description'], r['created_at'])
    )
print("4. Experiments synced.")

# 5. Experiment Runs
scur.execute("SELECT * FROM experiment_runs")
run_map = {}
for r in scur.fetchall():
    params = json.loads(r['parameters_json']) if r['parameters_json'] else {}
    metrics = json.loads(r['metrics_json']) if r['metrics_json'] else {}
    run_map[r['training_run_id']] = r['id']
    pcur.execute(
        """INSERT INTO public.experiment_runs
           (id, experiment_id, mlflow_run_id, dataset_version_id, algorithm, parameters, metrics, artifact_uri, artifact_sha256, git_commit, duration_ms, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['experiment_id'], r['mlflow_run_id'], r['dataset_version_id'], r['algorithm'],
         json.dumps(params), json.dumps(metrics), r['artifact_uri'], r['artifact_sha256'], r['git_commit'], float(r['duration_ms']), r['created_at'])
    )
print(f"5. Experiment Runs synced ({len(run_map)} runs).")

# 6. Model Versions
scur.execute("SELECT * FROM model_versions")
for r in scur.fetchall():
    metrics = json.loads(r['metrics_json']) if r['metrics_json'] else {}
    erun_id = run_map.get(r['training_run_id'])
    if not erun_id:
        pcur.execute("SELECT id FROM public.experiment_runs LIMIT 1")
        row = pcur.fetchone()
        erun_id = row[0] if row else "erun_unknown"
        
    pcur.execute(
        """INSERT INTO public.model_versions
           (id, model_id, version_number, experiment_run_id, dataset_version_id, stage, artifact_uri, artifact_sha256, metrics, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['model_id'], r['version_number'], erun_id, r['dataset_version_id'],
         r['stage'], r['artifact_path'], r['artifact_sha256'], json.dumps(metrics), r['created_at'])
    )
print("6. Model Versions synced.")

# 7. Deployments
scur.execute("SELECT * FROM deployments")
for r in scur.fetchall():
    pcur.execute(
        """INSERT INTO public.deployments
           (id, model_id, model_version_id, endpoint_name, status, traffic_pct, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['model_id'], r['model_version_id'], r['endpoint_name'], r['status'], int(r['traffic_pct']), r['created_at'])
    )
print("7. Deployments synced.")

# 8. Predictions
scur.execute("SELECT * FROM predictions")
pred_rows = scur.fetchall()
for r in pred_rows:
    feats = json.loads(r['features_json']) if r['features_json'] else {}
    pcur.execute(
        """INSERT INTO public.predictions
           (id, request_id, model_id, model_version_id, store_id, sku_id, features, predicted_units, actual_units, latency_ms, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['request_id'], r['model_id'], r['model_version_id'], r['store_id'], r['sku_id'],
         json.dumps(feats), float(r['predicted_units']), float(r['actual_units']) if r['actual_units'] is not None else None,
         float(r['latency_ms']), r['created_at'])
    )
print(f"8. Predictions synced ({len(pred_rows)} predictions).")

# 9. Monitoring Reports
scur.execute("SELECT * FROM monitoring_reports")
mon_rows = scur.fetchall()
for r in mon_rows:
    rep = json.loads(r['report_json']) if r['report_json'] else {}
    pcur.execute(
        """INSERT INTO public.monitoring_reports
           (id, model_id, model_version_id, sample_count, data_drift_detected, prediction_drift_detected, performance_degraded, max_psi, report, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['model_id'], r['model_version_id'], int(r['sample_count']), bool(r['data_drift_detected']),
         bool(r['prediction_drift_detected']), bool(r['performance_degraded']), float(r['max_psi']), json.dumps(rep), r['created_at'])
    )
print(f"9. Monitoring Reports synced ({len(mon_rows)} reports).")

# 10. Drift Events
scur.execute("SELECT * FROM drift_events")
drift_rows = scur.fetchall()
for r in drift_rows:
    pcur.execute(
        """INSERT INTO public.drift_events
           (id, monitoring_report_id, model_id, drift_type, severity, metric_name, metric_value, threshold_value, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['monitoring_report_id'], r['model_id'], r['drift_type'], r['severity'],
         r['metric_name'], float(r['metric_value']), float(r['threshold_value']), r['created_at'])
    )
print(f"10. Drift Events synced ({len(drift_rows)} events).")

# 11. Audit Logs
scur.execute("SELECT * FROM audit_logs")
audit_rows = scur.fetchall()
for r in audit_rows:
    details = json.loads(r['details_json']) if r['details_json'] else {}
    pcur.execute(
        """INSERT INTO public.audit_logs
           (id, actor, action, resource_type, resource_id, details, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
        (r['id'], r['actor'], r['action'], r['resource_type'], r['resource_id'], json.dumps(details), r['created_at'])
    )
print(f"11. Audit Logs synced ({len(audit_rows)} logs).")

print("\n=== ALL DATA FULLY SYNCED TO NEON POSTGRESQL! ===")
sconn.close()
pconn.close()
