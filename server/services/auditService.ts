import crypto from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';

export interface AuditEntryInput {
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly db: DatabaseSync) {}

  record(entry: AuditEntryInput): string {
    const id = `aud_${crypto.randomUUID().slice(0, 10)}`;
    this.db
      .prepare(
        `INSERT INTO audit_logs (id, actor, action, resource_type, resource_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.actor || 'system',
        entry.action,
        entry.resourceType,
        entry.resourceId,
        JSON.stringify(entry.details ?? {}),
        new Date().toISOString(),
      );
    return id;
  }

  list(limit = 100, action?: string) {
    let sql = 'SELECT * FROM audit_logs';
    const params: (string | number)[] = [];
    if (action) {
      sql += ' WHERE action = ?';
      params.push(action);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      details: JSON.parse(String(r.details_json)),
      createdAt: r.created_at,
    }));
  }
}
