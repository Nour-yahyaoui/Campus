import type pg from "pg";
import type { AuditEvent } from "@campussphere/contracts";
import { many, query, isoRequired } from "./db";

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit writes are append-only and intentionally never throw into the caller's
 * happy path for non-critical reads, but security-relevant callers await this.
 */
export async function writeAudit(input: AuditInput, client?: pg.PoolClient): Promise<void> {
  const sql = `insert into audit_events (actor_id, action, entity_type, entity_id, metadata)
               values ($1, $2, $3, $4, $5)`;
  const values = [
    input.actorId,
    input.action,
    input.entityType,
    input.entityId,
    JSON.stringify(input.metadata ?? {}),
  ];
  if (client) await client.query(sql, values);
  else await query(sql, values);
}

interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
}

export async function listAudit(options: {
  limit?: number;
  beforeId?: number;
  actionPrefix?: string;
  entityType?: string;
} = {}): Promise<AuditEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await many<AuditRow>(
    `select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
            u.id as actor_id, u.name as actor_name, u.avatar_url as actor_avatar
       from audit_events a left join users u on u.id = a.actor_id
      where ($1::bigint is null or a.id < $1)
        and ($2::text is null or a.action like $2 || '%')
        and ($3::text is null or a.entity_type = $3)
      order by a.id desc
      limit $4`,
    [options.beforeId ?? null, options.actionPrefix ?? null, options.entityType ?? null, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    action: row.action,
    actor: row.actor_id
      ? { id: row.actor_id, name: row.actor_name ?? "Deleted user", avatarUrl: row.actor_avatar, bio: null }
      : null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: isoRequired(row.created_at),
  }));
}
