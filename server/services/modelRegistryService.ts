import crypto from 'node:crypto';
import fs from 'node:fs';
import type {DatabaseSync} from 'node:sqlite';
import {ConflictError, NotFoundError, PolicyViolationError, ValidationError} from '../core/errors.ts';
import type {AuditService} from './auditService.ts';
import {normalizeMetrics} from './experimentService.ts';

export type ModelStage = 'Development' | 'Candidate' | 'Staging' | 'Production' | 'Archived' | 'Rejected';

const ALLOWED_TRANSITIONS: Record<ModelStage, ReadonlySet<ModelStage>> = {
  Development: new Set<ModelStage>(['Candidate', 'Rejected', 'Archived']),
  Candidate: new Set<ModelStage>(['Staging', 'Rejected', 'Archived']),
  Staging: new Set<ModelStage>(['Production', 'Rejected', 'Archived']),
  Production: new Set<ModelStage>(['Archived', 'Staging']),
  Archived: new Set<ModelStage>(['Production', 'Staging']),
  Rejected: new Set<ModelStage>(['Archived']),
};

export interface RegisterModelInput {
  modelName: string;
  trainingRunId: string;
  initialStage?: 'Development' | 'Candidate';
  notes?: string;
  actor?: string;
  description?: string;
}

export interface TransitionStageInput {
  modelId: string;
  versionId: string;
  targetStage: ModelStage;
  actor?: string;
  reason?: string;
}

export class ModelRegistryService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly auditService: AuditService,
  ) {}

  private verifyArtifactIntegrity(artifactPath: string, expectedSha256: string): void {
    if (!fs.existsSync(artifactPath)) {
      throw new PolicyViolationError('Cannot promote model: artifact file does not exist on storage', {
        artifactPath,
      });
    }
    const content = fs.readFileSync(artifactPath, 'utf8');
    const actualHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    if (actualHash !== expectedSha256) {
      throw new PolicyViolationError('Cannot promote model: artifact SHA-256 integrity verification failed', {
        artifactPath,
        expectedSha256,
        actualHash,
      });
    }
  }

  registerModelVersion(input: RegisterModelInput) {
    const modelName = input.modelName.trim();
    if (!modelName) {
      throw new ValidationError('modelName is required');
    }

    const initialStage = input.initialStage ?? 'Development';
    if (initialStage !== 'Development' && initialStage !== 'Candidate') {
      throw new PolicyViolationError(
        'Newly registered models must start in Development or Candidate, never directly in Production',
      );
    }

    const run = this.db
      .prepare(
        `SELECT t.*, er.mlflow_run_id
         FROM training_runs t
         LEFT JOIN experiment_runs er ON er.training_run_id = t.id
         WHERE t.id = ?`,
      )
      .get(input.trainingRunId) as Record<string, unknown> | undefined;

    if (!run) {
      throw new NotFoundError('TrainingRun', input.trainingRunId);
    }

    const existingRegistration = this.db
      .prepare('SELECT id FROM model_versions WHERE training_run_id = ?')
      .get(input.trainingRunId) as {id: string} | undefined;
    if (existingRegistration) {
      throw new ConflictError(`TrainingRun '${input.trainingRunId}' is already registered as '${existingRegistration.id}'`);
    }

    const now = new Date().toISOString();
    let model = this.db.prepare('SELECT * FROM registered_models WHERE name = ?').get(modelName) as
      | Record<string, unknown>
      | undefined;

    if (!model) {
      const modelId = `mdl_${crypto.randomUUID().slice(0, 8)}`;
      this.db
        .prepare(
          `INSERT INTO registered_models (id, name, use_case, description, production_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          modelId,
          modelName,
          'retail_demand_forecasting',
          input.description ?? 'Retail demand forecasting model family',
          now,
          now,
        );
      model = this.db.prepare('SELECT * FROM registered_models WHERE id = ?').get(modelId) as Record<
        string,
        unknown
      >;
    }

    const modelId = String(model.id);
    const verRow = this.db
      .prepare('SELECT COALESCE(MAX(version_number), 0) AS max_v FROM model_versions WHERE model_id = ?')
      .get(modelId) as {max_v: number};
    const versionNumber = Number(verRow.max_v) + 1;
    const versionId = `mv_${crypto.randomUUID().slice(0, 8)}`;

    const metricsPayload = {
      validation: JSON.parse(String(run.validation_metrics_json)),
      test: JSON.parse(String(run.test_metrics_json)),
    };

    this.db
      .prepare(
        `INSERT INTO model_versions (
          id, model_id, version_number, training_run_id, mlflow_run_id, dataset_version_id,
          algorithm, stage, artifact_path, artifact_sha256, metrics_json, hyperparameters_json,
          notes, promoted_by, promoted_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(
        versionId,
        modelId,
        versionNumber,
        String(run.id),
        String(run.mlflow_run_id ?? `mlf_${run.id}`),
        String(run.dataset_version_id),
        String(run.algorithm),
        initialStage,
        String(run.artifact_path),
        String(run.artifact_sha256),
        JSON.stringify(metricsPayload),
        String(run.hyperparameters_json),
        input.notes ?? '',
        now,
      );

    this.auditService.record({
      actor: input.actor ?? 'ml-engineer',
      action: 'MODEL_VERSION_REGISTERED',
      resourceType: 'model_version',
      resourceId: versionId,
      details: {modelId, modelName, versionNumber, stage: initialStage, trainingRunId: run.id},
    });

    return this.getVersion(modelId, versionId);
  }

  transitionStage(input: TransitionStageInput) {
    const version = this.db
      .prepare('SELECT * FROM model_versions WHERE id = ? AND model_id = ?')
      .get(input.versionId, input.modelId) as Record<string, unknown> | undefined;

    if (!version) {
      throw new NotFoundError('ModelVersion', input.versionId);
    }

    const currentStage = String(version.stage) as ModelStage;
    const targetStage = input.targetStage;

    if (currentStage === targetStage) {
      throw new ConflictError(`Model version '${input.versionId}' is already in stage '${targetStage}'`);
    }

    const allowed = ALLOWED_TRANSITIONS[currentStage];
    if (!allowed || !allowed.has(targetStage)) {
      throw new PolicyViolationError(
        `Illegal lifecycle transition from '${currentStage}' to '${targetStage}'`,
        {
          currentStage,
          targetStage,
          allowedTargets: Array.from(allowed ?? []),
        },
      );
    }

    // Verify artifact integrity before entering Staging or Production
    if (targetStage === 'Staging' || targetStage === 'Production') {
      this.verifyArtifactIntegrity(String(version.artifact_path), String(version.artifact_sha256));
    }

    const actor = input.actor ?? 'ml-engineer';
    const now = new Date().toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      let archivedPreviousVersionId: string | null = null;
      if (targetStage === 'Production') {
        const currentProd = this.db
          .prepare(
            "SELECT id FROM model_versions WHERE model_id = ? AND stage = 'Production' AND id != ?",
          )
          .get(input.modelId, input.versionId) as {id: string} | undefined;

        if (currentProd) {
          archivedPreviousVersionId = currentProd.id;
          this.db
            .prepare("UPDATE model_versions SET stage = 'Archived' WHERE id = ?")
            .run(currentProd.id);
        }

          this.db
            .prepare(
              'UPDATE registered_models SET production_version_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(input.versionId, now, input.modelId);

          this.db
            .prepare(
              "UPDATE deployments SET model_version_id = ?, status = 'ACTIVE', updated_at = ? WHERE model_id = ? AND status = 'ACTIVE'",
            )
            .run(input.versionId, now, input.modelId);
        } else if (currentStage === 'Production') {
          // Demoting or archiving the active production model clears pointer
          this.db
            .prepare(
              'UPDATE registered_models SET production_version_id = NULL, updated_at = ? WHERE id = ? AND production_version_id = ?',
            )
            .run(now, input.modelId, input.versionId);
        }

        this.db
          .prepare('UPDATE model_versions SET stage = ?, promoted_by = ?, promoted_at = ? WHERE id = ?')
          .run(targetStage, actor, now, input.versionId);

        this.auditService.record({
          actor,
          action:
            targetStage === 'Production'
              ? 'MODEL_PROMOTED_TO_PRODUCTION'
              : targetStage === 'Rejected'
                ? 'MODEL_REJECTED'
                : 'MODEL_STAGE_TRANSITION',
          resourceType: 'model_version',
          resourceId: input.versionId,
          details: {
            modelId: input.modelId,
            fromStage: currentStage,
            toStage: targetStage,
            archivedPreviousVersionId,
            reason: input.reason ?? '',
          },
        });

        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }

    return this.getVersion(input.modelId, input.versionId);
  }

  promoteVersion(input: {
    modelId: string;
    versionId: string;
    actor?: string;
    reason?: string;
    forceOverride?: boolean;
  }) {
    const challenger = this.getVersion(input.modelId, input.versionId);
    if (challenger.stage === 'Production') {
      throw new ConflictError(`Model version '${input.versionId}' is already in Production`);
    }
    if (challenger.stage !== 'Staging' && challenger.stage !== 'Candidate') {
      throw new PolicyViolationError(
        `Only Candidate or Staging models can enter promotion gate (found '${challenger.stage}')`,
      );
    }

    const modelRow = this.db
      .prepare('SELECT production_version_id FROM registered_models WHERE id = ?')
      .get(input.modelId) as {production_version_id: string | null} | undefined;
    if (!modelRow) {
      throw new NotFoundError('RegisteredModel', input.modelId);
    }

    if (modelRow.production_version_id && !input.forceOverride) {
      const cmp = this.compareVersions(input.modelId, modelRow.production_version_id, input.versionId);
      if (!cmp.comparison.challengerBeatsBaselineOnRmse) {
        throw new PolicyViolationError(
          `Promotion gate blocked: Challenger test RMSE (${(challenger.metrics.test as Record<string, number>).rmse}) does not improve on active Champion (${(cmp.baseline.metrics.test as Record<string, number>).rmse}). Pass forceOverride=true with a documented reason to override.`,
          {comparison: cmp.comparison},
        );
      }
    }

    if (input.forceOverride && (!input.reason || input.reason.trim().length < 5)) {
      throw new ValidationError('A clear reason (>= 5 chars) is required when forceOverride=true');
    }

    // Walk Candidate -> Staging cleanly if starting from Candidate
    if (challenger.stage === 'Candidate') {
      this.transitionStage({
        modelId: input.modelId,
        versionId: input.versionId,
        targetStage: 'Staging',
        actor: input.actor,
        reason: input.reason ?? 'Passed promotion pre-flight gate',
      });
    }

    return this.transitionStage({
      modelId: input.modelId,
      versionId: input.versionId,
      targetStage: 'Production',
      actor: input.actor,
      reason: input.reason ?? 'Promoted via governed promotion gate',
    });
  }

  rollbackModel(input: {
    modelId: string;
    targetVersionId?: string;
    demoteCurrentTo?: 'Archived' | 'Rejected' | 'Staging';
    reason?: string;
    actor?: string;
  }) {
    const model = this.db.prepare('SELECT * FROM registered_models WHERE id = ?').get(input.modelId) as
      | Record<string, unknown>
      | undefined;
    if (!model) {
      throw new NotFoundError('RegisteredModel', input.modelId);
    }

    const currentProdId = model.production_version_id ? String(model.production_version_id) : null;
    const demoteCurrentTo = input.demoteCurrentTo ?? 'Archived';
    if (!['Archived', 'Rejected', 'Staging'].includes(demoteCurrentTo)) {
      throw new ValidationError('demoteCurrentTo must be Archived, Rejected, or Staging');
    }

    let targetRow: Record<string, unknown> | undefined;
    if (input.targetVersionId) {
      targetRow = this.db
        .prepare('SELECT * FROM model_versions WHERE id = ? AND model_id = ?')
        .get(input.targetVersionId, input.modelId) as Record<string, unknown> | undefined;
      if (!targetRow) {
        throw new NotFoundError('ModelVersion', input.targetVersionId);
      }
      if (targetRow.id === currentProdId || targetRow.stage === 'Production') {
        throw new ConflictError(`Version '${input.targetVersionId}' is already the active Production model`);
      }
      if (targetRow.stage === 'Rejected') {
        throw new PolicyViolationError(
          `Cannot roll back to version '${input.targetVersionId}' because its stage is 'Rejected'`,
        );
      }
    } else {
      targetRow = this.db
        .prepare(
          `SELECT * FROM model_versions
           WHERE model_id = ? AND id != COALESCE(?, '') AND stage IN ('Archived', 'Staging')
           ORDER BY CASE WHEN stage = 'Archived' THEN 0 ELSE 1 END ASC,
                    COALESCE(promoted_at, created_at) DESC,
                    version_number DESC
           LIMIT 1`,
        )
        .get(input.modelId, currentProdId) as Record<string, unknown> | undefined;

      if (!targetRow) {
        throw new PolicyViolationError(
          'No previous stable Archived or Staging version exists to roll back to',
        );
      }
    }

    // Verify target artifact existence + SHA-256 BEFORE mutating database pointers
    this.verifyArtifactIntegrity(String(targetRow.artifact_path), String(targetRow.artifact_sha256));

    const actor = input.actor ?? 'ml-engineer';
    const reason = input.reason?.trim() || 'Controlled emergency rollback to previous stable version';
    const now = new Date().toISOString();
    const targetId = String(targetRow.id);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (currentProdId) {
        this.db
          .prepare('UPDATE model_versions SET stage = ?, notes = ? WHERE id = ?')
          .run(demoteCurrentTo, `Rolled back out of Production: ${reason}`, currentProdId);
      }

      this.db
        .prepare("UPDATE model_versions SET stage = 'Production', promoted_by = ?, promoted_at = ? WHERE id = ?")
        .run(actor, now, targetId);

      this.db
        .prepare('UPDATE registered_models SET production_version_id = ?, updated_at = ? WHERE id = ?')
        .run(targetId, now, input.modelId);

      this.db
        .prepare(
          "UPDATE deployments SET model_version_id = ?, status = 'ACTIVE', updated_at = ? WHERE model_id = ? AND status IN ('ACTIVE', 'ROLLED_BACK')",
        )
        .run(targetId, now, input.modelId);

      this.auditService.record({
        actor,
        action: 'MODEL_ROLLBACK_EXECUTED',
        resourceType: 'registered_model',
        resourceId: input.modelId,
        details: {
          rolledBackFromVersionId: currentProdId,
          demotedToStage: currentProdId ? demoteCurrentTo : null,
          restoredVersionId: targetId,
          restoredVersionNumber: Number(targetRow.version_number),
          reason,
        },
      });

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      modelId: input.modelId,
      rolledBackFromVersionId: currentProdId,
      demotedToStage: currentProdId ? demoteCurrentTo : null,
      restoredVersion: this.getVersion(input.modelId, targetId),
      reason,
      executedAt: now,
    };
  }

  listModels() {
    const models = this.db
      .prepare('SELECT * FROM registered_models ORDER BY updated_at DESC')
      .all() as Array<Record<string, unknown>>;

    const countStmt = this.db.prepare('SELECT COUNT(*) AS cnt FROM model_versions WHERE model_id = ?');
    const verStmt = this.db.prepare('SELECT * FROM model_versions WHERE id = ?');

    return models.map((m) => {
      const cnt = (countStmt.get(String(m.id)) as {cnt: number}).cnt;
      const prodVer = m.production_version_id
        ? (verStmt.get(String(m.production_version_id)) as Record<string, unknown> | undefined)
        : undefined;
      return {
        id: m.id,
        name: m.name,
        useCase: m.use_case,
        description: m.description,
        productionVersionId: m.production_version_id,
        productionVersion: prodVer ? this.formatVersion(prodVer) : null,
        versionCount: Number(cnt),
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      };
    });
  }

  getModelDetails(modelId: string) {
    const m = this.db.prepare('SELECT * FROM registered_models WHERE id = ?').get(modelId) as
      | Record<string, unknown>
      | undefined;
    if (!m) {
      throw new NotFoundError('RegisteredModel', modelId);
    }

    const versions = this.db
      .prepare('SELECT * FROM model_versions WHERE model_id = ? ORDER BY version_number DESC')
      .all(modelId) as Array<Record<string, unknown>>;

    return {
      id: m.id,
      name: m.name,
      useCase: m.use_case,
      description: m.description,
      productionVersionId: m.production_version_id,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      versions: versions.map((v) => this.formatVersion(v)),
    };
  }

  getVersion(modelId: string, versionId: string) {
    const v = this.db
      .prepare('SELECT * FROM model_versions WHERE id = ? AND model_id = ?')
      .get(versionId, modelId) as Record<string, unknown> | undefined;
    if (!v) {
      throw new NotFoundError('ModelVersion', versionId);
    }
    return this.formatVersion(v);
  }

  compareVersions(modelId: string, baselineVersionId: string, challengerVersionId: string) {
    const base = this.getVersion(modelId, baselineVersionId);
    const chal = this.getVersion(modelId, challengerVersionId);

    const bTest = base.metrics.test as Record<string, number | null>;
    const cTest = chal.metrics.test as Record<string, number | null>;

    const deltaRmse = Number(((cTest.rmse ?? 0) - (bTest.rmse ?? 0)).toFixed(4));
    const deltaMae = Number(((cTest.mae ?? 0) - (bTest.mae ?? 0)).toFixed(4));
    const deltaR2 = Number(((cTest.r2 ?? 0) - (bTest.r2 ?? 0)).toFixed(4));
    const rmseImprovementPct =
      bTest.rmse && bTest.rmse > 0 ? Number((((bTest.rmse - (cTest.rmse ?? 0)) / bTest.rmse) * 100).toFixed(2)) : 0;

    return {
      modelId,
      baseline: base,
      challenger: chal,
      comparison: {
        deltaRmse,
        deltaMae,
        deltaR2,
        rmseImprovementPct,
        challengerBeatsBaselineOnRmse: deltaRmse < 0,
      },
    };
  }

  private formatVersion(v: Record<string, unknown>) {
    return {
      id: String(v.id),
      modelId: String(v.model_id),
      versionNumber: Number(v.version_number),
      trainingRunId: String(v.training_run_id),
      mlflowRunId: String(v.mlflow_run_id),
      datasetVersionId: String(v.dataset_version_id),
      algorithm: String(v.algorithm),
      stage: String(v.stage) as ModelStage,
      artifactPath: String(v.artifact_path),
      artifactSha256: String(v.artifact_sha256),
      metrics: normalizeMetrics(JSON.parse(String(v.metrics_json))),
      hyperparameters: JSON.parse(String(v.hyperparameters_json)),
      notes: String(v.notes),
      promotedBy: v.promoted_by ? String(v.promoted_by) : null,
      promotedAt: v.promoted_at ? String(v.promoted_at) : null,
      createdAt: String(v.created_at),
    };
  }
}
