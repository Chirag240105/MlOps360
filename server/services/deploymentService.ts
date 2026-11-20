import crypto from 'node:crypto';
import fs from 'node:fs';
import type {DatabaseSync} from 'node:sqlite';
import {NotFoundError, PolicyViolationError, ValidationError} from '../core/errors.ts';
import type {AuditService} from './auditService.ts';
import {normalizeMetrics} from './experimentService.ts';

export interface CreateDeploymentInput {
  modelId: string;
  modelVersionId: string;
  endpointName?: string;
  environment?: string;
  actor?: string;
}

export class DeploymentService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly auditService: AuditService,
  ) {}

  deployVersion(input: CreateDeploymentInput) {
    const version = this.db
      .prepare(
        `SELECT mv.*, rm.name AS model_name
         FROM model_versions mv
         JOIN registered_models rm ON rm.id = mv.model_id
         WHERE mv.id = ? AND mv.model_id = ?`,
      )
      .get(input.modelVersionId, input.modelId) as Record<string, unknown> | undefined;

    if (!version) {
      throw new NotFoundError('ModelVersion', input.modelVersionId);
    }

    if (version.stage !== 'Production' && version.stage !== 'Staging') {
      throw new PolicyViolationError(
        `Cannot deploy model version in stage '${String(version.stage)}'. Only Production or Staging versions can be deployed.`,
      );
    }

    const artifactPath = String(version.artifact_path);
    if (!fs.existsSync(artifactPath)) {
      throw new PolicyViolationError('Cannot deploy: artifact file missing from storage', {artifactPath});
    }
    const actualHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(artifactPath, 'utf8'), 'utf8')
      .digest('hex');
    if (actualHash !== String(version.artifact_sha256)) {
      throw new PolicyViolationError('Cannot deploy: artifact SHA-256 integrity check failed');
    }

    const environment = (input.environment || 'production').trim();
    const endpointName = (input.endpointName || `${String(version.model_name)}-${environment}`).trim();
    if (!endpointName) {
      throw new ValidationError('endpointName cannot be empty');
    }

    const actor = input.actor || 'ml-engineer';
    const now = new Date().toISOString();

    const existing = this.db
      .prepare('SELECT id FROM deployments WHERE endpoint_name = ?')
      .get(endpointName) as {id: string} | undefined;

    let deploymentId: string;
    if (existing) {
      deploymentId = existing.id;
      this.db
        .prepare(
          `UPDATE deployments
           SET model_id = ?, model_version_id = ?, environment = ?, status = 'ACTIVE', traffic_pct = 100, updated_at = ?
           WHERE id = ?`,
        )
        .run(input.modelId, input.modelVersionId, environment, now, deploymentId);
    } else {
      deploymentId = `dep_${crypto.randomUUID().slice(0, 8)}`;
      this.db
        .prepare(
          `INSERT INTO deployments (id, model_id, model_version_id, endpoint_name, environment, status, traffic_pct, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', 100, ?, ?, ?)`,
        )
        .run(deploymentId, input.modelId, input.modelVersionId, endpointName, environment, actor, now, now);
    }

    this.auditService.record({
      actor,
      action: 'DEPLOYMENT_UPDATED',
      resourceType: 'deployment',
      resourceId: deploymentId,
      details: {
        modelId: input.modelId,
        modelVersionId: input.modelVersionId,
        endpointName,
        environment,
      },
    });

    return this.getDeployment(deploymentId);
  }

  getDeployment(deploymentId: string) {
    const row = this.db
      .prepare(
        `SELECT d.*, rm.name AS model_name, mv.version_number, mv.algorithm, mv.stage, mv.metrics_json
         FROM deployments d
         JOIN registered_models rm ON rm.id = d.model_id
         JOIN model_versions mv ON mv.id = d.model_version_id
         WHERE d.id = ?`,
      )
      .get(deploymentId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new NotFoundError('Deployment', deploymentId);
    }
    return this.formatRow(row);
  }

  listDeployments() {
    const rows = this.db
      .prepare(
        `SELECT d.*, rm.name AS model_name, mv.version_number, mv.algorithm, mv.stage, mv.metrics_json
         FROM deployments d
         JOIN registered_models rm ON rm.id = d.model_id
         JOIN model_versions mv ON mv.id = d.model_version_id
         ORDER BY d.updated_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => this.formatRow(r));
  }

  private formatRow(r: Record<string, unknown>) {
    return {
      id: String(r.id),
      modelId: String(r.model_id),
      modelName: String(r.model_name),
      modelVersionId: String(r.model_version_id),
      versionNumber: Number(r.version_number),
      algorithm: String(r.algorithm),
      stage: String(r.stage),
      endpointName: String(r.endpoint_name),
      environment: String(r.environment),
      status: String(r.status),
      trafficPct: Number(r.traffic_pct),
      metrics: normalizeMetrics(JSON.parse(String(r.metrics_json))),
      createdBy: String(r.created_by),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }
}
