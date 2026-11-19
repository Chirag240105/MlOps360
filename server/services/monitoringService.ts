import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {config} from '../core/config.ts';
import {NotFoundError, PolicyViolationError} from '../core/errors.ts';
import type {AuditService} from './auditService.ts';
import type {PredictionService} from './predictionService.ts';

export interface RunMonitoringInput {
  modelId?: string;
  windowLimit?: number;
  psiThreshold?: number;
  ksPvalueThreshold?: number;
  rmseDegradationFactor?: number;
}

export class MonitoringService {
  private readonly mlCliPath = path.resolve(process.cwd(), 'ml/cli.py');

  constructor(
    private readonly db: DatabaseSync,
    private readonly predictionService: PredictionService,
    private readonly auditService: AuditService,
  ) {}

  private runPythonMonitoring(
    artifactPath: string,
    sha256: string,
    records: unknown[],
    thresholds: {psi: number; ks: number; rmseFactor: number},
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        config.pythonExecutable,
        [
          this.mlCliPath,
          'evaluate-monitoring',
          '--artifact',
          artifactPath,
          '--sha256',
          sha256,
          '--psi-threshold',
          String(thresholds.psi),
          '--ks-pvalue-threshold',
          String(thresholds.ks),
          '--rmse-degradation-factor',
          String(thresholds.rmseFactor),
        ],
        {cwd: process.cwd()},
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => (stdout += c.toString()));
      child.stderr.on('data', (c) => (stderr += c.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Monitoring engine failed (${code}): ${stderr || stdout}`));
        }
        try {
          resolve(JSON.parse(stdout) as Record<string, unknown>);
        } catch (err) {
          reject(err);
        }
      });

      child.stdin.write(JSON.stringify(records));
      child.stdin.end();
    });
  }

  async runMonitoring(input: RunMonitoringInput = {}) {
    const model = this.predictionService.resolveProductionModel(
      input.modelId ? {modelId: input.modelId} : undefined,
    );

    const limit = Math.max(5, Math.min(1000, input.windowLimit ?? 200));
    const predRows = this.db
      .prepare(
        `SELECT id, store_id, sku_id, prediction_date, features_json, predicted_units, actual_units, created_at
         FROM predictions
         WHERE model_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(model.modelId, limit) as Array<Record<string, unknown>>;

    if (predRows.length < 5) {
      throw new PolicyViolationError(
        `Need at least 5 logged predictions for model '${model.modelName}' to evaluate drift (found ${predRows.length})`,
      );
    }

    const psiThresh = input.psiThreshold ?? config.driftPsiThreshold;
    const ksThresh = input.ksPvalueThreshold ?? config.driftKsPvalueThreshold;
    const rmseFactor = input.rmseDegradationFactor ?? 1.25;

    const payload = predRows.map((r) => ({
      prediction_id: String(r.id),
      store_id: String(r.store_id),
      sku_id: String(r.sku_id),
      date: String(r.prediction_date),
      features: JSON.parse(String(r.features_json)),
      predicted_units: Number(r.predicted_units),
      actual_units: r.actual_units !== null ? Number(r.actual_units) : null,
      created_at: String(r.created_at),
    }));

    const report = (await this.runPythonMonitoring(model.artifactPath, model.artifactSha256, payload, {
      psi: psiThresh,
      ks: ksThresh,
      rmseFactor,
    })) as {
      overallStatus: string;
      sampleCount: number;
      labeledCount: number;
      dataDriftDetected: boolean;
      missingnessDriftDetected: boolean;
      predictionDriftDetected: boolean;
      performanceDegraded: boolean;
      maxPsi: number;
      minKsPvalue: number;
      driftedFeatures: string[];
      featureDrift: Array<{feature: string; psi: number; ksPvalue: number; drifted: boolean}>;
      predictionDrift: {psi: number; drifted: boolean};
      livePerformance: {rmse: number; mae: number; baselineRmse: number; degraded: boolean} | null;
    };

    const windowEnd = String(predRows[0].created_at);
    const windowStart = String(predRows[predRows.length - 1].created_at);
    const reportId = `mon_${crypto.randomUUID().slice(0, 10)}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO monitoring_reports (
          id, model_id, model_version_id, window_start, window_end, sample_count,
          data_drift_detected, prediction_drift_detected, performance_degraded,
          max_psi, min_ks_pvalue, live_rmse, live_mae, report_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reportId,
        model.modelId,
        model.modelVersionId,
        windowStart,
        windowEnd,
        report.sampleCount,
        report.dataDriftDetected ? 1 : 0,
        report.predictionDriftDetected ? 1 : 0,
        report.performanceDegraded ? 1 : 0,
        report.maxPsi,
        report.minKsPvalue,
        report.livePerformance?.rmse ?? null,
        report.livePerformance?.mae ?? null,
        JSON.stringify(report),
        now,
      );

    const createdEvents: Array<Record<string, unknown>> = [];
    const insertEvent = this.db.prepare(
      `INSERT INTO drift_events (
        id, monitoring_report_id, model_id, drift_type, feature_name, severity,
        metric_name, metric_value, threshold_value, acknowledged, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    );

    for (const fd of report.featureDrift) {
      if (fd.drifted) {
        const evtId = `drf_${crypto.randomUUID().slice(0, 8)}`;
        const severity = fd.psi >= psiThresh * 1.75 ? 'HIGH' : 'MEDIUM';
        insertEvent.run(
          evtId,
          reportId,
          model.modelId,
          'DATA_DRIFT',
          fd.feature,
          severity,
          'PSI',
          fd.psi,
          psiThresh,
          now,
        );
        createdEvents.push({id: evtId, driftType: 'DATA_DRIFT', feature: fd.feature, severity, psi: fd.psi});
      }
    }

    if (report.predictionDriftDetected) {
      const evtId = `drf_${crypto.randomUUID().slice(0, 8)}`;
      insertEvent.run(
        evtId,
        reportId,
        model.modelId,
        'PREDICTION_DRIFT',
        'predicted_units',
        'MEDIUM',
        'PSI',
        report.predictionDrift.psi,
        psiThresh,
        now,
      );
      createdEvents.push({id: evtId, driftType: 'PREDICTION_DRIFT', severity: 'MEDIUM'});
    }

    if (report.performanceDegraded && report.livePerformance) {
      const evtId = `drf_${crypto.randomUUID().slice(0, 8)}`;
      const threshRmse = Number((report.livePerformance.baselineRmse * rmseFactor).toFixed(4));
      insertEvent.run(
        evtId,
        reportId,
        model.modelId,
        'PERFORMANCE_DEGRADATION',
        'units_sold',
        'CRITICAL',
        'RMSE',
        report.livePerformance.rmse,
        threshRmse,
        now,
      );
      createdEvents.push({
        id: evtId,
        driftType: 'PERFORMANCE_DEGRADATION',
        severity: 'CRITICAL',
        liveRmse: report.livePerformance.rmse,
      });
    }

    if (createdEvents.length > 0) {
      this.auditService.record({
        actor: 'monitoring-engine',
        action: 'MONITORING_ALERT_RAISED',
        resourceType: 'monitoring_report',
        resourceId: reportId,
        details: {
          modelId: model.modelId,
          overallStatus: report.overallStatus,
          eventsCount: createdEvents.length,
        },
      });
    }

    return {
      reportId,
      modelId: model.modelId,
      modelName: model.modelName,
      modelVersionId: model.modelVersionId,
      versionNumber: model.versionNumber,
      windowStart,
      windowEnd,
      createdAt: now,
      ...report,
      eventsCreated: createdEvents,
    };
  }

  listReports(modelId?: string) {
    let sql = `
      SELECT r.*, rm.name AS model_name, mv.version_number
      FROM monitoring_reports r
      JOIN registered_models rm ON rm.id = r.model_id
      JOIN model_versions mv ON mv.id = r.model_version_id
    `;
    const params: string[] = [];
    if (modelId) {
      sql += ' WHERE r.model_id = ?';
      params.push(modelId);
    }
    sql += ' ORDER BY r.created_at DESC LIMIT 100';

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      reportId: String(r.id),
      modelId: String(r.model_id),
      modelName: String(r.model_name),
      modelVersionId: String(r.model_version_id),
      versionNumber: Number(r.version_number),
      windowStart: String(r.window_start),
      windowEnd: String(r.window_end),
      sampleCount: Number(r.sample_count),
      dataDriftDetected: r.data_drift_detected === 1,
      predictionDriftDetected: r.prediction_drift_detected === 1,
      performanceDegraded: r.performance_degraded === 1,
      maxPsi: Number(r.max_psi),
      minKsPvalue: Number(r.min_ks_pvalue),
      liveRmse: r.live_rmse !== null ? Number(r.live_rmse) : null,
      liveMae: r.live_mae !== null ? Number(r.live_mae) : null,
      details: JSON.parse(String(r.report_json)),
      createdAt: String(r.created_at),
    }));
  }

  listDriftEvents(filters: {modelId?: string; acknowledged?: boolean} = {}) {
    let sql = `
      SELECT d.*, rm.name AS model_name
      FROM drift_events d
      JOIN registered_models rm ON rm.id = d.model_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    if (filters.modelId) {
      sql += ' AND d.model_id = ?';
      params.push(filters.modelId);
    }
    if (filters.acknowledged !== undefined) {
      sql += ' AND d.acknowledged = ?';
      params.push(filters.acknowledged ? 1 : 0);
    }
    sql += ' ORDER BY d.created_at DESC LIMIT 200';

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((d) => ({
      id: String(d.id),
      monitoringReportId: String(d.monitoring_report_id),
      modelId: String(d.model_id),
      modelName: String(d.model_name),
      driftType: String(d.drift_type),
      featureName: d.feature_name ? String(d.feature_name) : null,
      severity: String(d.severity),
      metricName: String(d.metric_name),
      metricValue: Number(d.metric_value),
      thresholdValue: Number(d.threshold_value),
      acknowledged: d.acknowledged === 1,
      createdAt: String(d.created_at),
    }));
  }

  acknowledgeDriftEvent(eventId: string, actor = 'ml-engineer') {
    const res = this.db.prepare('UPDATE drift_events SET acknowledged = 1 WHERE id = ?').run(eventId);
    if (Number(res.changes) === 0) {
      throw new NotFoundError('DriftEvent', eventId);
    }
    this.auditService.record({
      actor,
      action: 'DRIFT_EVENT_ACKNOWLEDGED',
      resourceType: 'drift_event',
      resourceId: eventId,
    });
    return {id: eventId, acknowledged: true};
  }
}
