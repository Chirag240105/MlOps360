import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {config} from '../core/config.ts';

export function openDatabase(dbPath: string = config.localSqlitePath): DatabaseSync {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  initializeSchema(db);
  return db;
}

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL DEFAULT 'retail_demand',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dataset_versions (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      version_hash TEXT NOT NULL,
      scenario TEXT NOT NULL DEFAULT 'uploaded',
      row_count INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      validation_passed INTEGER NOT NULL CHECK (validation_passed IN (0, 1)),
      validation_report_json TEXT NOT NULL,
      eda_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
      UNIQUE (dataset_id, version_number)
    );

    CREATE INDEX IF NOT EXISTS idx_dataset_versions_dataset_id
      ON dataset_versions(dataset_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS training_runs (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      dataset_version_id TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      hyperparameters_json TEXT NOT NULL,
      validation_metrics_json TEXT NOT NULL,
      test_metrics_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      split_summary_json TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      artifact_sha256 TEXT NOT NULL,
      git_commit TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      created_at TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
      FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_training_runs_created_at
      ON training_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiment_runs (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      mlflow_run_id TEXT NOT NULL UNIQUE,
      training_run_id TEXT NOT NULL UNIQUE,
      dataset_version_id TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      artifact_uri TEXT NOT NULL,
      artifact_sha256 TEXT NOT NULL,
      git_commit TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'FINISHED',
      created_at TEXT NOT NULL,
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
      FOREIGN KEY (training_run_id) REFERENCES training_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS registered_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      use_case TEXT NOT NULL DEFAULT 'retail_demand_forecasting',
      description TEXT NOT NULL DEFAULT '',
      production_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_versions (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      training_run_id TEXT NOT NULL,
      mlflow_run_id TEXT NOT NULL,
      dataset_version_id TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('Development', 'Candidate', 'Staging', 'Production', 'Archived', 'Rejected')),
      artifact_path TEXT NOT NULL,
      artifact_sha256 TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      hyperparameters_json TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      promoted_by TEXT,
      promoted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES registered_models(id) ON DELETE CASCADE,
      FOREIGN KEY (training_run_id) REFERENCES training_runs(id) ON DELETE RESTRICT,
      UNIQUE (model_id, version_number)
    );

    CREATE INDEX IF NOT EXISTS idx_model_versions_model_stage
      ON model_versions(model_id, stage);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Admin', 'ML_Engineer', 'Viewer')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      model_version_id TEXT NOT NULL,
      endpoint_name TEXT NOT NULL UNIQUE,
      environment TEXT NOT NULL DEFAULT 'production',
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DRAINING', 'INACTIVE', 'ROLLED_BACK')),
      traffic_pct INTEGER NOT NULL DEFAULT 100 CHECK (traffic_pct >= 0 AND traffic_pct <= 100),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES registered_models(id) ON DELETE CASCADE,
      FOREIGN KEY (model_version_id) REFERENCES model_versions(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_version_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      prediction_date TEXT NOT NULL,
      features_json TEXT NOT NULL,
      predicted_units REAL NOT NULL,
      actual_units REAL,
      latency_ms REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      created_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES registered_models(id) ON DELETE CASCADE,
      FOREIGN KEY (model_version_id) REFERENCES model_versions(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_model_created
      ON predictions(model_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS monitoring_reports (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      model_version_id TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      sample_count INTEGER NOT NULL,
      data_drift_detected INTEGER NOT NULL CHECK (data_drift_detected IN (0, 1)),
      prediction_drift_detected INTEGER NOT NULL CHECK (prediction_drift_detected IN (0, 1)),
      performance_degraded INTEGER NOT NULL CHECK (performance_degraded IN (0, 1)),
      max_psi REAL NOT NULL,
      min_ks_pvalue REAL NOT NULL,
      live_rmse REAL,
      live_mae REAL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES registered_models(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_monitoring_reports_model_created
      ON monitoring_reports(model_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS drift_events (
      id TEXT PRIMARY KEY,
      monitoring_report_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      drift_type TEXT NOT NULL CHECK (drift_type IN ('DATA_DRIFT', 'MISSINGNESS_DRIFT', 'PREDICTION_DRIFT', 'PERFORMANCE_DEGRADATION')),
      feature_name TEXT,
      severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      threshold_value REAL NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (monitoring_report_id) REFERENCES monitoring_reports(id) ON DELETE CASCADE,
      FOREIGN KEY (model_id) REFERENCES registered_models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS retraining_jobs (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      model_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('DRIFT_POLICY', 'PERFORMANCE_POLICY', 'MANUAL', 'SCHEDULED')),
      drift_event_id TEXT,
      dataset_version_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'REJECTED_BY_GATE', 'FAILED')),
      challenger_version_id TEXT,
      champion_version_id TEXT,
      decision TEXT,
      decision_reason TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES registered_models(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_retraining_jobs_model_created
      ON retraining_jobs(model_id, created_at DESC);
  `);
}
