import crypto from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {config} from '../core/config.ts';
import {NotFoundError, PolicyViolationError, ValidationError} from '../core/errors.ts';
import type {AuditService} from './auditService.ts';
import type {ModelRegistryService} from './modelRegistryService.ts';
import type {TrainingAlgorithm, TrainingService} from './trainingService.ts';

export type RetrainingTriggerType = 'DRIFT_POLICY' | 'PERFORMANCE_POLICY' | 'MANUAL' | 'SCHEDULED';

export interface EvaluatePolicyOptions {
  modelId: string;
  bypassCooldown?: boolean;
}

export interface TriggerRetrainingInput {
  modelId?: string;
  datasetId?: string;
  triggerType?: RetrainingTriggerType;
  algorithm?: TrainingAlgorithm;
  seed?: number;
  experimentName?: string;
  idempotencyKey?: string;
  bypassCooldown?: boolean;
  promoteToStagingOnly?: boolean;
  minRmseImprovement?: number;
  actor?: string;
}

export class RetrainingService {
  private readonly circuitBreakerThreshold = 3;

  constructor(
    private readonly db: DatabaseSync,
    private readonly trainingService: TrainingService,
    private readonly registryService: ModelRegistryService,
    private readonly auditService: AuditService,
  ) {}

  private resolveTargetModelId(explicitModelId?: string): string {
    if (explicitModelId) {
      const m = this.db.prepare('SELECT id FROM registered_models WHERE id = ?').get(explicitModelId) as
        | {id: string}
        | undefined;
      if (!m) {
        throw new NotFoundError('RegisteredModel', explicitModelId);
      }
      return m.id;
    }

    const latest = this.db
      .prepare('SELECT id FROM registered_models ORDER BY updated_at DESC LIMIT 1')
      .get() as {id: string} | undefined;
    if (!latest) {
      throw new PolicyViolationError('No registered models exist to retrain');
    }
    return latest.id;
  }

  private resolveValidatedDatasetId(modelId: string, explicitDatasetId?: string): {
    datasetId: string;
    datasetVersionId: string;
  } {
    if (explicitDatasetId) {
      const ds = this.db
        .prepare(
          `SELECT id AS dataset_version_id, dataset_id, validation_passed
           FROM dataset_versions
           WHERE dataset_id = ?
           ORDER BY version_number DESC
           LIMIT 1`,
        )
        .get(explicitDatasetId) as
        | {dataset_version_id: string; dataset_id: string; validation_passed: number}
        | undefined;
      if (!ds) {
        throw new NotFoundError('Dataset', explicitDatasetId);
      }
      return {datasetId: ds.dataset_id, datasetVersionId: ds.dataset_version_id};
    }

    // Prefer dataset lineage of current production version or latest model version
    const ver = this.db
      .prepare(
        `SELECT dv.dataset_id, dv.id AS dataset_version_id
         FROM model_versions mv
         JOIN dataset_versions dv ON dv.id = mv.dataset_version_id
         WHERE mv.model_id = ? AND dv.validation_passed = 1
         ORDER BY mv.version_number DESC
         LIMIT 1`,
      )
      .get(modelId) as {dataset_id: string; dataset_version_id: string} | undefined;

    if (ver) {
      return {datasetId: ver.dataset_id, datasetVersionId: ver.dataset_version_id};
    }

    const fallback = this.db
      .prepare(
        `SELECT dataset_id, id AS dataset_version_id
         FROM dataset_versions
         WHERE validation_passed = 1
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get() as {dataset_id: string; dataset_version_id: string} | undefined;

    if (!fallback) {
      throw new PolicyViolationError('No validated dataset version is available for retraining');
    }
    return {datasetId: fallback.dataset_id, datasetVersionId: fallback.dataset_version_id};
  }

  evaluatePolicy(options: EvaluatePolicyOptions) {
    const model = this.db
      .prepare('SELECT id, name, production_version_id FROM registered_models WHERE id = ?')
      .get(options.modelId) as
      | {id: string; name: string; production_version_id: string | null}
      | undefined;

    if (!model) {
      throw new NotFoundError('RegisteredModel', options.modelId);
    }

    const reasons: string[] = [];

    // 1. Active Job Guard
    const activeJob = this.db
      .prepare(
        `SELECT id, status FROM retraining_jobs
         WHERE model_id = ? AND status IN ('QUEUED', 'RUNNING')
         LIMIT 1`,
      )
      .get(model.id) as {id: string; status: string} | undefined;

    if (activeJob) {
      return {
        modelId: model.id,
        modelName: model.name,
        eligible: false,
        recommendedTrigger: null as RetrainingTriggerType | null,
        blockedBy: 'ACTIVE_JOB',
        cooldownActive: false,
        circuitBreakerOpen: false,
        latestMonitoringReportId: null as string | null,
        latestDriftEventId: null as string | null,
        reasons: [`Active retraining job '${activeJob.id}' is currently ${activeJob.status}`],
      };
    }

    // 2. Circuit Breaker Check (consecutive FAILED jobs >= threshold)
    const recentJobs = this.db
      .prepare(
        `SELECT id, status, completed_at, created_at
         FROM retraining_jobs
         WHERE model_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(model.id, this.circuitBreakerThreshold) as Array<{
      id: string;
      status: string;
      completed_at: string | null;
      created_at: string;
    }>;

    const consecutiveFailures =
      recentJobs.length >= this.circuitBreakerThreshold &&
      recentJobs.every((j) => j.status === 'FAILED');

    if (consecutiveFailures) {
      return {
        modelId: model.id,
        modelName: model.name,
        eligible: false,
        recommendedTrigger: null as RetrainingTriggerType | null,
        blockedBy: 'CIRCUIT_BREAKER_OPEN',
        cooldownActive: false,
        circuitBreakerOpen: true,
        latestMonitoringReportId: null as string | null,
        latestDriftEventId: null as string | null,
        reasons: [
          `Circuit breaker open after ${this.circuitBreakerThreshold} consecutive FAILED retraining jobs`,
        ],
      };
    }

    // 3. Cooldown Window Check
    const lastCompleted = this.db
      .prepare(
        `SELECT id, status, COALESCE(completed_at, created_at) AS finished_at
         FROM retraining_jobs
         WHERE model_id = ? AND status IN ('SUCCEEDED', 'REJECTED_BY_GATE')
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(model.id) as {id: string; status: string; finished_at: string} | undefined;

    let cooldownActive = false;
    let cooldownRemainingHours = 0;
    if (!options.bypassCooldown && lastCompleted && config.retrainingCooldownHours > 0) {
      const elapsedMs = Date.now() - new Date(lastCompleted.finished_at).getTime();
      const cooldownMs = config.retrainingCooldownHours * 3600 * 1000;
      if (elapsedMs < cooldownMs) {
        cooldownActive = true;
        cooldownRemainingHours = Number(((cooldownMs - elapsedMs) / 3600000).toFixed(2));
        reasons.push(
          `Cooldown window active (${cooldownRemainingHours}h remaining of ${config.retrainingCooldownHours}h window since job '${lastCompleted.id}')`,
        );
      }
    }

    // 4. Monitoring & Drift Signal Inspection
    const latestReport = this.db
      .prepare(
        `SELECT * FROM monitoring_reports
         WHERE model_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(model.id) as Record<string, unknown> | undefined;

    const latestEvent = this.db
      .prepare(
        `SELECT id, drift_type, severity
         FROM drift_events
         WHERE model_id = ? AND acknowledged = 0
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(model.id) as {id: string; drift_type: string; severity: string} | undefined;

    let recommendedTrigger: RetrainingTriggerType | null = null;
    if (latestReport) {
      const perfDegraded = Number(latestReport.performance_degraded) === 1;
      const dataDrift = Number(latestReport.data_drift_detected) === 1;
      const predDrift = Number(latestReport.prediction_drift_detected) === 1;
      const maxPsi = Number(latestReport.max_psi);

      if (perfDegraded) {
        recommendedTrigger = 'PERFORMANCE_POLICY';
        reasons.push('Live ground-truth RMSE exceeded degradation threshold vs baseline test RMSE');
      } else if (maxPsi >= config.driftPsiThreshold * 1.5 || (dataDrift && predDrift)) {
        recommendedTrigger = 'DRIFT_POLICY';
        reasons.push(
          `Severe/corroborated drift detected (maxPSI=${maxPsi}, dataDrift=${dataDrift}, predictionDrift=${predDrift})`,
        );
      } else if (dataDrift) {
        reasons.push(
          'Moderate/isolated covariate drift observed without performance degradation; holding retraining',
        );
      } else {
        reasons.push('Latest monitoring report is HEALTHY');
      }
    } else {
      reasons.push('No monitoring reports recorded yet for this model');
    }

    const eligible = !cooldownActive && recommendedTrigger !== null;
    const blockedBy = cooldownActive
      ? 'COOLDOWN_ACTIVE'
      : recommendedTrigger === null
        ? 'NO_TRIGGER_SIGNAL'
        : null;

    return {
      modelId: model.id,
      modelName: model.name,
      eligible,
      recommendedTrigger,
      blockedBy,
      cooldownActive,
      cooldownRemainingHours,
      circuitBreakerOpen: false,
      latestMonitoringReportId: latestReport ? String(latestReport.id) : null,
      latestDriftEventId: latestEvent ? latestEvent.id : null,
      reasons,
    };
  }

  async triggerRetraining(input: TriggerRetrainingInput = {}) {
    const triggerType: RetrainingTriggerType = input.triggerType ?? 'MANUAL';
    if (!['DRIFT_POLICY', 'PERFORMANCE_POLICY', 'MANUAL', 'SCHEDULED'].includes(triggerType)) {
      throw new ValidationError(`Unsupported triggerType "${triggerType}"`);
    }

    const modelId = this.resolveTargetModelId(input.modelId);
    const actor = input.actor ?? 'retraining-orchestrator';
    const {datasetId, datasetVersionId} = this.resolveValidatedDatasetId(modelId, input.datasetId);

    const policy = this.evaluatePolicy({
      modelId,
      bypassCooldown: input.bypassCooldown,
    });

    // Deterministic idempotency key prevents duplicate runs on retries / overlapping schedules
    const hourBucket = new Date().toISOString().slice(0, 13);
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `retrain:${modelId}:${triggerType}:${datasetVersionId}:${policy.latestMonitoringReportId ?? hourBucket}`;

    const existing = this.db
      .prepare('SELECT * FROM retraining_jobs WHERE idempotency_key = ?')
      .get(idempotencyKey) as Record<string, unknown> | undefined;

    if (existing) {
      return {
        ...this.formatJob(existing),
        idempotentReplay: true,
      };
    }

    // Guardrail enforcement
    if (policy.blockedBy === 'ACTIVE_JOB') {
      throw new PolicyViolationError(policy.reasons[0], {blockedBy: 'ACTIVE_JOB'});
    }
    if (policy.blockedBy === 'CIRCUIT_BREAKER_OPEN' && !input.bypassCooldown) {
      throw new PolicyViolationError(policy.reasons[0], {blockedBy: 'CIRCUIT_BREAKER_OPEN'});
    }
    if (policy.cooldownActive && !input.bypassCooldown) {
      throw new PolicyViolationError(
        `Retraining blocked by cooldown policy (${policy.cooldownRemainingHours}h remaining). Set bypassCooldown=true for manual emergency override.`,
        {blockedBy: 'COOLDOWN_ACTIVE', cooldownRemainingHours: policy.cooldownRemainingHours},
      );
    }
    if (
      (triggerType === 'DRIFT_POLICY' || triggerType === 'PERFORMANCE_POLICY') &&
      !policy.eligible
    ) {
      throw new PolicyViolationError(
        `Automated policy trigger '${triggerType}' rejected: ${policy.reasons.join('; ')}`,
        {blockedBy: policy.blockedBy, reasons: policy.reasons},
      );
    }

    const modelRow = this.db
      .prepare('SELECT id, name, production_version_id FROM registered_models WHERE id = ?')
      .get(modelId) as {id: string; name: string; production_version_id: string | null};

    const championVersionId = modelRow.production_version_id;
    const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO retraining_jobs (
          id, idempotency_key, model_id, trigger_type, drift_event_id, dataset_version_id,
          status, challenger_version_id, champion_version_id, decision, decision_reason,
          attempt_count, error_message, started_at, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', NULL, ?, NULL, NULL, 1, NULL, NULL, NULL, ?)`,
      )
      .run(
        jobId,
        idempotencyKey,
        modelId,
        triggerType,
        policy.latestDriftEventId,
        datasetVersionId,
        championVersionId,
        now,
      );

    this.auditService.record({
      actor,
      action: 'RETRAINING_JOB_STARTED',
      resourceType: 'retraining_job',
      resourceId: jobId,
      details: {modelId, triggerType, datasetId, datasetVersionId, idempotencyKey, championVersionId},
    });

    const startedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE retraining_jobs SET status = 'RUNNING', started_at = ? WHERE id = ?")
      .run(startedAt, jobId);

    try {
      const trainingRun = await this.trainingService.runTraining({
        datasetId,
        algorithm: input.algorithm ?? 'auto',
        seed: input.seed ?? 42,
        experimentName: input.experimentName,
      });

      const challenger = this.registryService.registerModelVersion({
        modelName: modelRow.name,
        trainingRunId: trainingRun.runId,
        initialStage: 'Candidate',
        notes: `Challenger trained by retraining job ${jobId} (trigger=${triggerType})`,
        actor,
      });

      const minImprovement = input.minRmseImprovement ?? config.minPromotionRmseImprovement;
      let gatePassed = true;
      let decisionReason = 'No existing Production champion; Challenger approved as initial Production baseline';
      let comparisonSummary: Record<string, unknown> | null = null;

      if (championVersionId) {
        const cmp = this.registryService.compareVersions(modelId, championVersionId, challenger.id);
        comparisonSummary = cmp.comparison;
        const baseRmse = Number((cmp.baseline.metrics.test as Record<string, number>).rmse);
        const chalRmse = Number((cmp.challenger.metrics.test as Record<string, number>).rmse);
        const chalR2 = Number((cmp.challenger.metrics.test as Record<string, number>).r2 ?? 0);
        const relImprovement = baseRmse > 0 ? (baseRmse - chalRmse) / baseRmse : 0;

        const sameDataset = cmp.challenger.datasetVersionId === cmp.baseline.datasetVersionId;
        const regimeRecoveryPass =
          !sameDataset &&
          triggerType === 'PERFORMANCE_POLICY' &&
          chalR2 >= 0.72 &&
          relImprovement >= -0.25;

        if (relImprovement >= minImprovement || regimeRecoveryPass) {
          gatePassed = true;
          decisionReason = regimeRecoveryPass
            ? `Regime-recovery gate passed on new dataset version (Challenger R2=${chalR2}, RMSE=${chalRmse})`
            : `Challenger improved test RMSE by ${(relImprovement * 100).toFixed(2)}% (threshold >= ${(minImprovement * 100).toFixed(2)}%)`;
        } else {
          gatePassed = false;
          decisionReason = `Challenger test RMSE (${chalRmse}) failed to beat Champion (${baseRmse}) by ${(minImprovement * 100).toFixed(2)}% (actual improvement ${(relImprovement * 100).toFixed(2)}%)`;
        }
      }

      const completedAt = new Date().toISOString();
      if (!gatePassed) {
        this.registryService.transitionStage({
          modelId,
          versionId: challenger.id,
          targetStage: 'Rejected',
          actor,
          reason: decisionReason,
        });

        this.db
          .prepare(
            `UPDATE retraining_jobs
             SET status = 'REJECTED_BY_GATE', challenger_version_id = ?, decision = 'REJECTED',
                 decision_reason = ?, completed_at = ?
             WHERE id = ?`,
          )
          .run(challenger.id, decisionReason, completedAt, jobId);

        this.auditService.record({
          actor,
          action: 'RETRAINING_CHALLENGER_REJECTED',
          resourceType: 'retraining_job',
          resourceId: jobId,
          details: {modelId, challengerVersionId: challenger.id, championVersionId, decisionReason},
        });
      } else {
        // Candidate -> Staging
        this.registryService.transitionStage({
          modelId,
          versionId: challenger.id,
          targetStage: 'Staging',
          actor,
          reason: decisionReason,
        });

        let finalDecision = 'STAGED_FOR_APPROVAL';
        if (!input.promoteToStagingOnly) {
          this.registryService.transitionStage({
            modelId,
            versionId: challenger.id,
            targetStage: 'Production',
            actor,
            reason: decisionReason,
          });
          // Sync active deployments for this model
          this.db
            .prepare(
              `UPDATE deployments SET model_version_id = ?, updated_at = ?
               WHERE model_id = ? AND status = 'ACTIVE'`,
            )
            .run(challenger.id, completedAt, modelId);
          finalDecision = 'PROMOTED_TO_PRODUCTION';
        }

        this.db
          .prepare(
            `UPDATE retraining_jobs
             SET status = 'SUCCEEDED', challenger_version_id = ?, decision = ?,
                 decision_reason = ?, completed_at = ?
             WHERE id = ?`,
          )
          .run(challenger.id, finalDecision, decisionReason, completedAt, jobId);

        this.auditService.record({
          actor,
          action:
            finalDecision === 'PROMOTED_TO_PRODUCTION'
              ? 'RETRAINING_CHALLENGER_PROMOTED'
              : 'RETRAINING_CHALLENGER_STAGED',
          resourceType: 'retraining_job',
          resourceId: jobId,
          details: {modelId, challengerVersionId: challenger.id, championVersionId, decisionReason},
        });
      }

      const finalRow = this.db.prepare('SELECT * FROM retraining_jobs WHERE id = ?').get(jobId) as Record<
        string,
        unknown
      >;
      return {
        ...this.formatJob(finalRow),
        idempotentReplay: false,
        comparison: comparisonSummary,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const completedAt = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE retraining_jobs
           SET status = 'FAILED', error_message = ?, decision = 'FAILED', decision_reason = ?, completed_at = ?
           WHERE id = ?`,
        )
        .run(msg, msg, completedAt, jobId);

      this.auditService.record({
        actor,
        action: 'RETRAINING_JOB_FAILED',
        resourceType: 'retraining_job',
        resourceId: jobId,
        details: {modelId, error: msg},
      });
      throw err;
    }
  }

  listJobs(modelId?: string) {
    let sql = `
      SELECT rj.*, rm.name AS model_name
      FROM retraining_jobs rj
      JOIN registered_models rm ON rm.id = rj.model_id
    `;
    const params: string[] = [];
    if (modelId) {
      sql += ' WHERE rj.model_id = ?';
      params.push(modelId);
    }
    sql += ' ORDER BY rj.created_at DESC LIMIT 100';

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.formatJob(r));
  }

  getJob(jobId: string) {
    const row = this.db
      .prepare(
        `SELECT rj.*, rm.name AS model_name
         FROM retraining_jobs rj
         JOIN registered_models rm ON rm.id = rj.model_id
         WHERE rj.id = ?`,
      )
      .get(jobId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new NotFoundError('RetrainingJob', jobId);
    }
    return this.formatJob(row);
  }

  private formatJob(r: Record<string, unknown>) {
    return {
      id: String(r.id),
      idempotencyKey: String(r.idempotency_key),
      modelId: String(r.model_id),
      modelName: r.model_name ? String(r.model_name) : undefined,
      triggerType: String(r.trigger_type) as RetrainingTriggerType,
      driftEventId: r.drift_event_id ? String(r.drift_event_id) : null,
      datasetVersionId: r.dataset_version_id ? String(r.dataset_version_id) : null,
      status: String(r.status),
      challengerVersionId: r.challenger_version_id ? String(r.challenger_version_id) : null,
      championVersionId: r.champion_version_id ? String(r.champion_version_id) : null,
      decision: r.decision ? String(r.decision) : null,
      decisionReason: r.decision_reason ? String(r.decision_reason) : null,
      attemptCount: Number(r.attempt_count),
      errorMessage: r.error_message ? String(r.error_message) : null,
      startedAt: r.started_at ? String(r.started_at) : null,
      completedAt: r.completed_at ? String(r.completed_at) : null,
      createdAt: String(r.created_at),
    };
  }
}
