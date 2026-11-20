import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {promisify} from 'node:util';
import {config} from '../core/config.ts';
import {NotFoundError, PolicyViolationError, ValidationError} from '../core/errors.ts';
import type {ExperimentService} from './experimentService.ts';
import {normalizeMetricBundle} from './experimentService.ts';

const execFileAsync = promisify(execFile);

export type TrainingAlgorithm = 'auto' | 'ridge' | 'random_forest' | 'gradient_boosting';

export interface StartTrainingInput {
  datasetId: string;
  algorithm?: TrainingAlgorithm;
  seed?: number;
  experimentName?: string;
}

export class TrainingService {
  private readonly mlCliPath = path.resolve(process.cwd(), 'ml/cli.py');
  private readonly modelArtifactDir: string;

  constructor(
    private readonly db: DatabaseSync,
    artifactRoot: string = config.artifactStoragePath,
    private readonly experimentService?: ExperimentService,
  ) {
    this.modelArtifactDir = path.join(artifactRoot, 'models');
    fs.mkdirSync(this.modelArtifactDir, {recursive: true});
  }

  async runTraining(input: StartTrainingInput) {
    const algorithm = input.algorithm ?? 'auto';
    if (!['auto', 'ridge', 'random_forest', 'gradient_boosting'].includes(algorithm)) {
      throw new ValidationError(`Unsupported algorithm "${algorithm}"`);
    }

    const seed = input.seed ?? 42;
    if (!Number.isInteger(seed) || seed < 0) {
      throw new ValidationError('seed must be a non-negative integer');
    }

    const datasetVersion = this.db
      .prepare(
        `SELECT v.id, v.dataset_id, v.version_number, v.version_hash, v.file_path, v.validation_passed
         FROM dataset_versions v
         WHERE v.dataset_id = ?
         ORDER BY v.version_number DESC
         LIMIT 1`,
      )
      .get(input.datasetId) as
      | {
          id: string;
          dataset_id: string;
          version_number: number;
          version_hash: string;
          file_path: string;
          validation_passed: number;
        }
      | undefined;

    if (!datasetVersion) {
      throw new NotFoundError('Dataset', input.datasetId);
    }

    if (datasetVersion.validation_passed !== 1) {
      throw new PolicyViolationError(
        'Training blocked: latest dataset version failed pre-training data quality gates',
        {datasetId: input.datasetId, versionId: datasetVersion.id},
      );
    }

    const runId = `run_${crypto.randomUUID().slice(0, 10)}`;
    const {stdout} = await execFileAsync(
      config.pythonExecutable,
      [
        this.mlCliPath,
        'train-pipeline',
        '--input',
        datasetVersion.file_path,
        '--artifact-dir',
        this.modelArtifactDir,
        '--run-id',
        runId,
        '--algorithm',
        algorithm,
        '--seed',
        String(seed),
        '--dataset-version-hash',
        datasetVersion.version_hash,
      ],
      {cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024},
    );

    const parsed = JSON.parse(stdout) as {
      runId: string;
      algorithm: string;
      hyperparameters: Record<string, unknown>;
      gitCommit: string;
      datasetVersionHash: string;
      durationMs: number;
      artifactPath: string;
      artifactSha256: string;
      splitSummary: Record<string, unknown>;
      validationMetrics: Record<string, unknown>;
      testMetrics: Record<string, unknown>;
      candidatesEvaluated: unknown[];
    };

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO training_runs (
          id, dataset_id, dataset_version_id, algorithm, hyperparameters_json,
          validation_metrics_json, test_metrics_json, candidates_json, split_summary_json,
          artifact_path, artifact_sha256, git_commit, duration_ms, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        parsed.runId,
        datasetVersion.dataset_id,
        datasetVersion.id,
        parsed.algorithm,
        JSON.stringify(parsed.hyperparameters),
        JSON.stringify(parsed.validationMetrics),
        JSON.stringify(parsed.testMetrics),
        JSON.stringify(parsed.candidatesEvaluated),
        JSON.stringify(parsed.splitSummary),
        parsed.artifactPath,
        parsed.artifactSha256,
        parsed.gitCommit,
        parsed.durationMs,
        'COMPLETED',
        now,
      );

    const expRun = this.experimentService?.logRun({
      experimentName: input.experimentName,
      trainingRunId: parsed.runId,
      datasetVersionId: datasetVersion.id,
      algorithm: parsed.algorithm,
      parameters: parsed.hyperparameters,
      metrics: {
        validation: parsed.validationMetrics,
        test: parsed.testMetrics,
      },
      tags: {
        useCase: 'retail_demand_forecasting',
        datasetId: datasetVersion.dataset_id,
        datasetVersionHash: datasetVersion.version_hash,
        gitCommit: parsed.gitCommit,
      },
      artifactUri: parsed.artifactPath,
      artifactSha256: parsed.artifactSha256,
      gitCommit: parsed.gitCommit,
      durationMs: parsed.durationMs,
    });

    return {
      ...parsed,
      datasetId: datasetVersion.dataset_id,
      datasetVersionId: datasetVersion.id,
      datasetVersionNumber: datasetVersion.version_number,
      experimentId: expRun?.experimentId ?? null,
      experimentName: expRun?.experimentName ?? null,
      mlflowRunId: expRun?.mlflowRunId ?? null,
      status: 'COMPLETED',
      createdAt: now,
    };
  }

  listRuns() {
    const rows = this.db
      .prepare(
        `SELECT r.*, d.name AS dataset_name, dv.version_number AS dataset_version_number
         FROM training_runs r
         JOIN datasets d ON d.id = r.dataset_id
         JOIN dataset_versions dv ON dv.id = r.dataset_version_id
         ORDER BY r.created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      runId: r.id,
      datasetId: r.dataset_id,
      datasetName: r.dataset_name,
      datasetVersionId: r.dataset_version_id,
      datasetVersionNumber: r.dataset_version_number,
      algorithm: r.algorithm,
      hyperparameters: JSON.parse(String(r.hyperparameters_json)),
      validationMetrics: normalizeMetricBundle(JSON.parse(String(r.validation_metrics_json))),
      testMetrics: normalizeMetricBundle(JSON.parse(String(r.test_metrics_json))),
      artifactSha256: r.artifact_sha256,
      gitCommit: r.git_commit,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  getRun(runId: string) {
    const r = this.db
      .prepare(
        `SELECT r.*, d.name AS dataset_name, dv.version_number AS dataset_version_number, dv.version_hash AS dataset_version_hash
         FROM training_runs r
         JOIN datasets d ON d.id = r.dataset_id
         JOIN dataset_versions dv ON dv.id = r.dataset_version_id
         WHERE r.id = ?`,
      )
      .get(runId) as Record<string, unknown> | undefined;

    if (!r) {
      throw new NotFoundError('TrainingRun', runId);
    }

    return {
      runId: r.id,
      datasetId: r.dataset_id,
      datasetName: r.dataset_name,
      datasetVersionId: r.dataset_version_id,
      datasetVersionNumber: r.dataset_version_number,
      datasetVersionHash: r.dataset_version_hash,
      algorithm: r.algorithm,
      hyperparameters: JSON.parse(String(r.hyperparameters_json)),
      validationMetrics: normalizeMetricBundle(JSON.parse(String(r.validation_metrics_json))),
      testMetrics: normalizeMetricBundle(JSON.parse(String(r.test_metrics_json))),
      candidatesEvaluated: JSON.parse(String(r.candidates_json)),
      splitSummary: JSON.parse(String(r.split_summary_json)),
      artifactPath: r.artifact_path,
      artifactSha256: r.artifact_sha256,
      gitCommit: r.git_commit,
      durationMs: r.duration_ms,
      status: r.status,
      createdAt: r.created_at,
    };
  }
}
