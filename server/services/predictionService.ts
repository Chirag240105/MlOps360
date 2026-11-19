import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {config} from '../core/config.ts';
import {NotFoundError, PolicyViolationError, ValidationError} from '../core/errors.ts';

export interface PredictionRecordInput {
  date: string;
  store_id: string;
  sku_id: string;
  price: number;
  discount_pct: number;
  is_holiday: number;
  lag_1?: number;
  lag_7?: number;
  rolling_7d_mean?: number;
  rolling_7d_std?: number;
}

export interface GroundTruthUpdateInput {
  predictionId?: string;
  date?: string;
  store_id?: string;
  sku_id?: string;
  actualUnits: number;
}

interface ResolvedProductionModel {
  modelId: string;
  modelName: string;
  modelVersionId: string;
  versionNumber: number;
  algorithm: string;
  artifactPath: string;
  artifactSha256: string;
}

export class PredictionService {
  private readonly mlCliPath = path.resolve(process.cwd(), 'ml/cli.py');
  private failedRequestsCount = 0;

  constructor(private readonly db: DatabaseSync) {}

  private validateInputRecord(rec: unknown, index?: number): PredictionRecordInput {
    const prefix = index !== undefined ? `records[${index}].` : '';
    if (!rec || typeof rec !== 'object') {
      throw new ValidationError(`Invalid prediction payload at ${prefix || 'root'}`);
    }
    const obj = rec as Record<string, unknown>;

    const dateStr = typeof obj.date === 'string' ? obj.date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new ValidationError(`${prefix}date must be ISO YYYY-MM-DD`);
    }

    const storeId = typeof obj.store_id === 'string' ? obj.store_id.trim() : '';
    const skuId = typeof obj.sku_id === 'string' ? obj.sku_id.trim() : '';
    if (!storeId || !skuId) {
      throw new ValidationError(`${prefix}store_id and ${prefix}sku_id are required`);
    }

    const price = Number(obj.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new ValidationError(`${prefix}price must be a positive number`);
    }

    const discountPct = Number(obj.discount_pct ?? 0);
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 0.95) {
      throw new ValidationError(`${prefix}discount_pct must be between 0 and 0.95`);
    }

    const isHoliday = Number(obj.is_holiday ?? 0);
    if (isHoliday !== 0 && isHoliday !== 1) {
      throw new ValidationError(`${prefix}is_holiday must be 0 or 1`);
    }

    const parsed: PredictionRecordInput = {
      date: dateStr,
      store_id: storeId,
      sku_id: skuId,
      price,
      discount_pct: discountPct,
      is_holiday: isHoliday,
    };

    for (const optField of ['lag_1', 'lag_7', 'rolling_7d_mean', 'rolling_7d_std'] as const) {
      if (obj[optField] !== undefined) {
        const val = Number(obj[optField]);
        if (!Number.isFinite(val) || val < 0) {
          throw new ValidationError(`${prefix}${optField} must be a non-negative number`);
        }
        parsed[optField] = val;
      }
    }
    return parsed;
  }

  resolveProductionModel(selector?: {modelId?: string; modelName?: string}): ResolvedProductionModel {
    let row: Record<string, unknown> | undefined;

    if (selector?.modelId) {
      row = this.db
        .prepare(
          `SELECT rm.id AS model_id, rm.name AS model_name, mv.id AS version_id,
                  mv.version_number, mv.algorithm, mv.artifact_path, mv.artifact_sha256
           FROM registered_models rm
           JOIN model_versions mv ON mv.id = rm.production_version_id
           WHERE rm.id = ? AND mv.stage = 'Production'`,
        )
        .get(selector.modelId) as Record<string, unknown> | undefined;
    } else if (selector?.modelName) {
      row = this.db
        .prepare(
          `SELECT rm.id AS model_id, rm.name AS model_name, mv.id AS version_id,
                  mv.version_number, mv.algorithm, mv.artifact_path, mv.artifact_sha256
           FROM registered_models rm
           JOIN model_versions mv ON mv.id = rm.production_version_id
           WHERE rm.name = ? AND mv.stage = 'Production'`,
        )
        .get(selector.modelName) as Record<string, unknown> | undefined;
    } else {
      // Prefer active production deployment, falling back to latest Production model pointer
      row = this.db
        .prepare(
          `SELECT rm.id AS model_id, rm.name AS model_name, mv.id AS version_id,
                  mv.version_number, mv.algorithm, mv.artifact_path, mv.artifact_sha256
           FROM registered_models rm
           JOIN model_versions mv ON mv.id = rm.production_version_id
           WHERE mv.stage = 'Production'
           ORDER BY rm.updated_at DESC
           LIMIT 1`,
        )
        .get() as Record<string, unknown> | undefined;
    }

    if (!row) {
      throw new PolicyViolationError(
        'No active Production model is available for serving. Promote a validated model version to Production first.',
      );
    }

    const artifactPath = String(row.artifact_path);
    if (!fs.existsSync(artifactPath)) {
      throw new PolicyViolationError('Production model artifact file is missing from storage', {artifactPath});
    }

    return {
      modelId: String(row.model_id),
      modelName: String(row.model_name),
      modelVersionId: String(row.version_id),
      versionNumber: Number(row.version_number),
      algorithm: String(row.algorithm),
      artifactPath,
      artifactSha256: String(row.artifact_sha256),
    };
  }

  private runPythonPredict(
    artifactPath: string,
    sha256: string,
    records: PredictionRecordInput[],
  ): Promise<Array<{store_id: string; sku_id: string; date: string; predicted_units: number}>> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        config.pythonExecutable,
        [
          this.mlCliPath,
          'predict-artifact',
          '--artifact',
          artifactPath,
          '--sha256',
          sha256,
          '--records-stdin',
        ],
        {cwd: process.cwd()},
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Inference execution failed (${code}): ${stderr || stdout}`));
        }
        try {
          const parsed = JSON.parse(stdout) as {
            predictions: Array<{store_id: string; sku_id: string; date: string; predicted_units: number}>;
          };
          resolve(parsed.predictions);
        } catch (err) {
          reject(err);
        }
      });

      child.stdin.write(JSON.stringify(records));
      child.stdin.end();
    });
  }

  async predictSingle(rawInput: unknown, requestId: string, selector?: {modelId?: string; modelName?: string}) {
    const startNs = process.hrtime.bigint();
    try {
      const record = this.validateInputRecord(rawInput);
      const model = this.resolveProductionModel(selector);
      const [pred] = await this.runPythonPredict(model.artifactPath, model.artifactSha256, [record]);
      const latencyMs = Number((Number(process.hrtime.bigint() - startNs) / 1_000_000).toFixed(2));

      const predictionId = `pred_${crypto.randomUUID().slice(0, 10)}`;
      const now = new Date().toISOString();

      this.db
        .prepare(
          `INSERT INTO predictions (
            id, request_id, model_id, model_version_id, store_id, sku_id, prediction_date,
            features_json, predicted_units, actual_units, latency_ms, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'SUCCESS', ?)`,
        )
        .run(
          predictionId,
          requestId,
          model.modelId,
          model.modelVersionId,
          record.store_id,
          record.sku_id,
          record.date,
          JSON.stringify(record),
          pred.predicted_units,
          latencyMs,
          now,
        );

      return {
        predictionId,
        requestId,
        modelId: model.modelId,
        modelName: model.modelName,
        modelVersionId: model.modelVersionId,
        versionNumber: model.versionNumber,
        algorithm: model.algorithm,
        storeId: record.store_id,
        skuId: record.sku_id,
        date: record.date,
        predictedUnits: pred.predicted_units,
        latencyMs,
        createdAt: now,
      };
    } catch (err) {
      this.failedRequestsCount += 1;
      throw err;
    }
  }

  async predictBatch(rawRecords: unknown, requestId: string, selector?: {modelId?: string; modelName?: string}) {
    const startNs = process.hrtime.bigint();
    try {
      if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
        throw new ValidationError('records must be a non-empty array');
      }
      if (rawRecords.length > 500) {
        throw new ValidationError('Batch size cannot exceed 500 records per request');
      }

      const records = rawRecords.map((r, idx) => this.validateInputRecord(r, idx));
      const model = this.resolveProductionModel(selector);
      const outputs = await this.runPythonPredict(model.artifactPath, model.artifactSha256, records);
      const totalLatencyMs = Number((Number(process.hrtime.bigint() - startNs) / 1_000_000).toFixed(2));
      const perItemLatency = Number((totalLatencyMs / records.length).toFixed(2));
      const now = new Date().toISOString();

      const stmt = this.db.prepare(
        `INSERT INTO predictions (
          id, request_id, model_id, model_version_id, store_id, sku_id, prediction_date,
          features_json, predicted_units, actual_units, latency_ms, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'SUCCESS', ?)`,
      );

      const results = records.map((rec, i) => {
        const predictionId = `pred_${crypto.randomUUID().slice(0, 10)}`;
        const predictedUnits = outputs[i].predicted_units;
        stmt.run(
          predictionId,
          requestId,
          model.modelId,
          model.modelVersionId,
          rec.store_id,
          rec.sku_id,
          rec.date,
          JSON.stringify(rec),
          predictedUnits,
          perItemLatency,
          now,
        );
        return {
          predictionId,
          storeId: rec.store_id,
          skuId: rec.sku_id,
          date: rec.date,
          predictedUnits,
        };
      });

      return {
        requestId,
        modelId: model.modelId,
        modelName: model.modelName,
        modelVersionId: model.modelVersionId,
        versionNumber: model.versionNumber,
        algorithm: model.algorithm,
        count: results.length,
        latencyMs: totalLatencyMs,
        predictions: results,
      };
    } catch (err) {
      this.failedRequestsCount += 1;
      throw err;
    }
  }

  getPrediction(predictionId: string) {
    const row = this.db
      .prepare(
        `SELECT p.*, rm.name AS model_name, mv.version_number, mv.algorithm
         FROM predictions p
         JOIN registered_models rm ON rm.id = p.model_id
         JOIN model_versions mv ON mv.id = p.model_version_id
         WHERE p.id = ?`,
      )
      .get(predictionId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new NotFoundError('Prediction', predictionId);
    }

    return {
      predictionId: String(row.id),
      requestId: String(row.request_id),
      modelId: String(row.model_id),
      modelName: String(row.model_name),
      modelVersionId: String(row.model_version_id),
      versionNumber: Number(row.version_number),
      algorithm: String(row.algorithm),
      storeId: String(row.store_id),
      skuId: String(row.sku_id),
      date: String(row.prediction_date),
      features: JSON.parse(String(row.features_json)),
      predictedUnits: Number(row.predicted_units),
      actualUnits: row.actual_units !== null ? Number(row.actual_units) : null,
      latencyMs: Number(row.latency_ms),
      status: String(row.status),
      createdAt: String(row.created_at),
    };
  }

  listPredictions(limit = 50, modelId?: string) {
    let sql = `
      SELECT p.*, rm.name AS model_name, mv.version_number, mv.algorithm
      FROM predictions p
      JOIN registered_models rm ON rm.id = p.model_id
      JOIN model_versions mv ON mv.id = p.model_version_id
    `;
    const params: (string | number)[] = [];
    if (modelId) {
      sql += ' WHERE p.model_id = ?';
      params.push(modelId);
    }
    sql += ' ORDER BY p.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      predictionId: String(row.id),
      requestId: String(row.request_id),
      modelId: String(row.model_id),
      modelName: String(row.model_name),
      modelVersionId: String(row.model_version_id),
      versionNumber: Number(row.version_number),
      algorithm: String(row.algorithm),
      storeId: String(row.store_id),
      skuId: String(row.sku_id),
      date: String(row.prediction_date),
      predictedUnits: Number(row.predicted_units),
      actualUnits: row.actual_units !== null ? Number(row.actual_units) : null,
      latencyMs: Number(row.latency_ms),
      createdAt: String(row.created_at),
    }));
  }

  recordGroundTruth(updates: GroundTruthUpdateInput[]) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError('updates must be a non-empty array');
    }
    let updatedCount = 0;

    const byIdStmt = this.db.prepare('UPDATE predictions SET actual_units = ? WHERE id = ?');
    const byKeyStmt = this.db.prepare(
      'UPDATE predictions SET actual_units = ? WHERE prediction_date = ? AND store_id = ? AND sku_id = ?',
    );

    for (const item of updates) {
      const actual = Number(item.actualUnits);
      if (!Number.isFinite(actual) || actual < 0) {
        throw new ValidationError('actualUnits must be a non-negative number');
      }
      if (item.predictionId) {
        const res = byIdStmt.run(actual, item.predictionId);
        updatedCount += Number(res.changes);
      } else if (item.date && item.store_id && item.sku_id) {
        const res = byKeyStmt.run(actual, item.date, item.store_id, item.sku_id);
        updatedCount += Number(res.changes);
      } else {
        throw new ValidationError('Each ground-truth item requires predictionId or (date, store_id, sku_id)');
      }
    }

    return {updatedCount};
  }

  getServingMetrics() {
    const agg = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN actual_units IS NOT NULL THEN 1 ELSE 0 END) AS labeled_count,
                AVG(latency_ms) AS avg_latency
         FROM predictions`,
      )
      .get() as {total: number; labeled_count: number | null; avg_latency: number | null};

    const latencies = (
      this.db
        .prepare('SELECT latency_ms FROM predictions ORDER BY latency_ms ASC')
        .all() as Array<{latency_ms: number}>
    ).map((r) => Number(r.latency_ms));

    const p95LatencyMs =
      latencies.length > 0 ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;

    const perModel = this.db
      .prepare(
        `SELECT p.model_id, rm.name AS model_name, COUNT(*) AS request_count, AVG(p.latency_ms) AS avg_latency_ms
         FROM predictions p
         JOIN registered_models rm ON rm.id = p.model_id
         GROUP BY p.model_id`,
      )
      .all() as Array<Record<string, unknown>>;

    return {
      totalPredictions: Number(agg.total),
      labeledPredictions: Number(agg.labeled_count ?? 0),
      failedRequests: this.failedRequestsCount,
      avgLatencyMs: agg.avg_latency ? Number(agg.avg_latency.toFixed(2)) : 0,
      p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
      predictionsByModel: perModel.map((m) => ({
        modelId: String(m.model_id),
        modelName: String(m.model_name),
        requestCount: Number(m.request_count),
        avgLatencyMs: Number(Number(m.avg_latency_ms).toFixed(2)),
      })),
    };
  }
}
