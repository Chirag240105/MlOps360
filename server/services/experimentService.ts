import crypto from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {config} from '../core/config.ts';
import {NotFoundError, ValidationError} from '../core/errors.ts';

export interface LogExperimentRunInput {
  experimentName?: string;
  trainingRunId: string;
  datasetVersionId: string;
  algorithm: string;
  parameters: Record<string, unknown>;
  metrics: Record<string, unknown>;
  tags: Record<string, string>;
  artifactUri: string;
  artifactSha256: string;
  gitCommit: string;
  durationMs: number;
}

export class ExperimentService {
  constructor(private readonly db: DatabaseSync) {}

  getOrCreateExperiment(name: string, description = ''): {id: string; name: string} {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ValidationError('Experiment name is required');
    }

    const existing = this.db
      .prepare('SELECT id, name FROM experiments WHERE name = ?')
      .get(trimmed) as {id: string; name: string} | undefined;
    if (existing) {
      return existing;
    }

    const id = `exp_${crypto.randomUUID().slice(0, 8)}`;
    this.db
      .prepare('INSERT INTO experiments (id, name, description, created_at) VALUES (?, ?, ?, ?)')
      .run(id, trimmed, description, new Date().toISOString());
    return {id, name: trimmed};
  }

  logRun(input: LogExperimentRunInput) {
    const exp = this.getOrCreateExperiment(
      input.experimentName || config.mlflowExperimentName,
      'Retail demand forecasting experiment tracking',
    );
    const id = `erun_${crypto.randomUUID().slice(0, 8)}`;
    const mlflowRunId = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO experiment_runs (
          id, experiment_id, mlflow_run_id, training_run_id, dataset_version_id,
          algorithm, parameters_json, metrics_json, tags_json, artifact_uri,
          artifact_sha256, git_commit, duration_ms, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        exp.id,
        mlflowRunId,
        input.trainingRunId,
        input.datasetVersionId,
        input.algorithm,
        JSON.stringify(input.parameters),
        JSON.stringify(input.metrics),
        JSON.stringify(input.tags),
        input.artifactUri,
        input.artifactSha256,
        input.gitCommit,
        input.durationMs,
        'FINISHED',
        now,
      );

    return {
      id,
      experimentId: exp.id,
      experimentName: exp.name,
      mlflowRunId,
      trainingRunId: input.trainingRunId,
      status: 'FINISHED',
      createdAt: now,
    };
  }

  listExperiments() {
    const rows = this.db
      .prepare(
        `SELECT e.*, COUNT(r.id) AS run_count
         FROM experiments e
         LEFT JOIN experiment_runs r ON r.experiment_id = e.id
         GROUP BY e.id
         ORDER BY e.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      runCount: Number(e.run_count),
      createdAt: e.created_at,
    }));
  }

  listRuns(filters: {experimentId?: string; algorithm?: string} = {}) {
    let sql = `
      SELECT r.*, e.name AS experiment_name
      FROM experiment_runs r
      JOIN experiments e ON e.id = r.experiment_id
      WHERE 1=1
    `;
    const params: string[] = [];

    if (filters.experimentId) {
      sql += ' AND r.experiment_id = ?';
      params.push(filters.experimentId);
    }
    if (filters.algorithm) {
      sql += ' AND r.algorithm = ?';
      params.push(filters.algorithm);
    }
    sql += ' ORDER BY r.created_at DESC';

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id,
      experimentId: r.experiment_id,
      experimentName: r.experiment_name,
      mlflowRunId: r.mlflow_run_id,
      trainingRunId: r.training_run_id,
      datasetVersionId: r.dataset_version_id,
      algorithm: r.algorithm,
      parameters: JSON.parse(String(r.parameters_json)),
      metrics: JSON.parse(String(r.metrics_json)),
      tags: JSON.parse(String(r.tags_json)),
      artifactUri: r.artifact_uri,
      artifactSha256: r.artifact_sha256,
      gitCommit: r.git_commit,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  getExperimentOrThrow(experimentId: string) {
    const row = this.db.prepare('SELECT * FROM experiments WHERE id = ?').get(experimentId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new NotFoundError('Experiment', experimentId);
    }
    return {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      createdAt: String(row.created_at),
    };
  }
}
