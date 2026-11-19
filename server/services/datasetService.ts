import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {promisify} from 'node:util';
import {config} from '../core/config.ts';
import {NotFoundError, PolicyViolationError, ValidationError} from '../core/errors.ts';

const execFileAsync = promisify(execFile);

export interface DatasetSummary {
  id: string;
  name: string;
  domain: string;
  description: string;
  createdAt: string;
  latestVersion: {
    id: string;
    versionNumber: number;
    versionHash: string;
    scenario: string;
    rowCount: number;
    validationPassed: boolean;
    createdAt: string;
  } | null;
}

export interface GenerateDatasetInput {
  name: string;
  days?: number;
  startDate?: string;
  seed?: number;
  scenario?: 'reference' | 'corrupted' | 'drifted';
  description?: string;
}

export interface IngestDatasetInput {
  name: string;
  csvContent: string;
  description?: string;
}

export class DatasetService {
  private readonly mlCliPath = path.resolve(process.cwd(), 'ml/cli.py');

  constructor(
    private readonly db: DatabaseSync,
    private readonly artifactRoot: string = config.artifactStoragePath,
  ) {
    fs.mkdirSync(path.join(this.artifactRoot, 'datasets'), {recursive: true});
  }

  private async runMlCli<T>(args: string[]): Promise<T> {
    try {
      const {stdout} = await execFileAsync(config.pythonExecutable, [this.mlCliPath, ...args], {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });
      return JSON.parse(stdout) as T;
    } catch (err: unknown) {
      const e = err as {stdout?: string; stderr?: string; message?: string};
      if (e.stdout) {
        try {
          const parsed = JSON.parse(e.stdout) as {error?: string; validation?: unknown};
          if (parsed.error === 'VALIDATION_FAILED') {
            throw new PolicyViolationError('Dataset failed pre-training data quality gates', parsed.validation);
          }
        } catch (parseErr) {
          if (parseErr instanceof PolicyViolationError) {
            throw parseErr;
          }
        }
      }
      throw new Error(`Python ML engine failed: ${e.stderr || e.message || 'unknown error'}`);
    }
  }

  private getOrCreateDataset(name: string, description = ''): {id: string; name: string} {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ValidationError('Dataset name is required');
    }

    const existing = this.db
      .prepare('SELECT id, name FROM datasets WHERE name = ?')
      .get(trimmed) as {id: string; name: string} | undefined;
    if (existing) {
      return existing;
    }

    const id = `ds_${crypto.randomUUID().slice(0, 8)}`;
    this.db
      .prepare(
        'INSERT INTO datasets (id, name, domain, description, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, trimmed, 'retail_demand', description, new Date().toISOString());

    return {id, name: trimmed};
  }

  private nextVersionNumber(datasetId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM dataset_versions WHERE dataset_id = ?')
      .get(datasetId) as {max_ver: number};
    return Number(row.max_ver) + 1;
  }

  listDatasets(): DatasetSummary[] {
    const datasets = this.db
      .prepare('SELECT id, name, domain, description, created_at FROM datasets ORDER BY created_at DESC')
      .all() as Array<{id: string; name: string; domain: string; description: string; created_at: string}>;

    const latestStmt = this.db.prepare(`
      SELECT id, version_number, version_hash, scenario, row_count, validation_passed, created_at
      FROM dataset_versions
      WHERE dataset_id = ?
      ORDER BY version_number DESC
      LIMIT 1
    `);

    return datasets.map((d) => {
      const v = latestStmt.get(d.id) as
        | {
            id: string;
            version_number: number;
            version_hash: string;
            scenario: string;
            row_count: number;
            validation_passed: number;
            created_at: string;
          }
        | undefined;
      return {
        id: d.id,
        name: d.name,
        domain: d.domain,
        description: d.description,
        createdAt: d.created_at,
        latestVersion: v
          ? {
              id: v.id,
              versionNumber: v.version_number,
              versionHash: v.version_hash,
              scenario: v.scenario,
              rowCount: v.row_count,
              validationPassed: v.validation_passed === 1,
              createdAt: v.created_at,
            }
          : null,
      };
    });
  }

  async generateDataset(input: GenerateDatasetInput) {
    const days = input.days ?? 120;
    if (!Number.isInteger(days) || days < 15 || days > 730) {
      throw new ValidationError('days must be an integer between 15 and 730');
    }

    const scenario = input.scenario ?? 'reference';
    const startDate = input.startDate ?? '2026-01-01';
    const seed = input.seed ?? 42;

    const dataset = this.getOrCreateDataset(
      input.name,
      input.description ?? `Synthetic retail demand dataset (${scenario})`,
    );
    const versionNumber = this.nextVersionNumber(dataset.id);
    const versionId = `dsv_${crypto.randomUUID().slice(0, 8)}`;
    const csvPath = path.join(this.artifactRoot, 'datasets', `${dataset.id}_v${versionNumber}.csv`);

    const generated = await this.runMlCli<{
      outputPath: string;
      versionHash: string;
      rowCount: number;
      scenario: string;
    }>([
      'generate-dataset',
      '--days',
      String(days),
      '--start-date',
      startDate,
      '--seed',
      String(seed),
      '--scenario',
      scenario,
      '--output',
      csvPath,
    ]);

    const report = await this.runMlCli<{
      passed: boolean;
      rowCount: number;
      versionHash: string;
      checks: unknown[];
      eda: unknown;
    }>(['validate-dataset', '--input', csvPath]);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO dataset_versions
         (id, dataset_id, version_number, version_hash, scenario, row_count, file_path, validation_passed, validation_report_json, eda_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        versionId,
        dataset.id,
        versionNumber,
        generated.versionHash,
        scenario,
        report.rowCount,
        csvPath,
        report.passed ? 1 : 0,
        JSON.stringify(report.checks),
        JSON.stringify(report.eda),
        now,
      );

    return {
      datasetId: dataset.id,
      name: dataset.name,
      versionId,
      versionNumber,
      versionHash: generated.versionHash,
      scenario,
      rowCount: report.rowCount,
      validationPassed: report.passed,
      checks: report.checks,
      eda: report.eda,
    };
  }

  async ingestCsvDataset(input: IngestDatasetInput) {
    if (!input.csvContent || input.csvContent.trim().length === 0) {
      throw new ValidationError('csvContent must be a non-empty CSV string');
    }

    const dataset = this.getOrCreateDataset(input.name, input.description ?? 'Uploaded retail dataset');
    const versionNumber = this.nextVersionNumber(dataset.id);
    const versionId = `dsv_${crypto.randomUUID().slice(0, 8)}`;
    const csvPath = path.join(this.artifactRoot, 'datasets', `${dataset.id}_v${versionNumber}.csv`);

    fs.writeFileSync(csvPath, input.csvContent, 'utf8');

    const report = await this.runMlCli<{
      passed: boolean;
      rowCount: number;
      versionHash: string;
      checks: unknown[];
      eda: unknown;
    }>(['validate-dataset', '--input', csvPath]);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO dataset_versions
         (id, dataset_id, version_number, version_hash, scenario, row_count, file_path, validation_passed, validation_report_json, eda_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        versionId,
        dataset.id,
        versionNumber,
        report.versionHash,
        'uploaded',
        report.rowCount,
        csvPath,
        report.passed ? 1 : 0,
        JSON.stringify(report.checks),
        JSON.stringify(report.eda),
        now,
      );

    return {
      datasetId: dataset.id,
      name: dataset.name,
      versionId,
      versionNumber,
      versionHash: report.versionHash,
      rowCount: report.rowCount,
      validationPassed: report.passed,
      checks: report.checks,
      eda: report.eda,
    };
  }

  private getLatestVersionRow(datasetId: string) {
    const row = this.db
      .prepare(
        `SELECT v.*, d.name AS dataset_name
         FROM dataset_versions v
         JOIN datasets d ON d.id = v.dataset_id
         WHERE v.dataset_id = ?
         ORDER BY v.version_number DESC
         LIMIT 1`,
      )
      .get(datasetId) as
      | {
          id: string;
          dataset_id: string;
          dataset_name: string;
          version_number: number;
          version_hash: string;
          scenario: string;
          row_count: number;
          file_path: string;
          validation_passed: number;
          validation_report_json: string;
          eda_json: string | null;
          created_at: string;
        }
      | undefined;

    if (!row) {
      throw new NotFoundError('Dataset', datasetId);
    }
    return row;
  }

  getDatasetEda(datasetId: string) {
    const row = this.getLatestVersionRow(datasetId);
    return {
      datasetId: row.dataset_id,
      name: row.dataset_name,
      versionId: row.id,
      versionNumber: row.version_number,
      versionHash: row.version_hash,
      validationPassed: row.validation_passed === 1,
      checks: JSON.parse(row.validation_report_json),
      eda: row.eda_json ? JSON.parse(row.eda_json) : null,
    };
  }

  async runBaselines(datasetId: string) {
    const row = this.getLatestVersionRow(datasetId);
    if (row.validation_passed !== 1) {
      throw new PolicyViolationError(
        'Training blocked: latest dataset version failed pre-training data quality validation',
        {datasetId, versionId: row.id, checks: JSON.parse(row.validation_report_json)},
      );
    }

    const benchmark = await this.runMlCli<Record<string, unknown>>([
      'run-baselines',
      '--input',
      row.file_path,
    ]);

    return {
      datasetId: row.dataset_id,
      versionId: row.id,
      versionNumber: row.version_number,
      versionHash: row.version_hash,
      ...benchmark,
    };
  }
}
