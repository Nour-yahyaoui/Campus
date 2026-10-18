import type { ModerationReport, ReportStatus, ReportTarget } from "@campussphere/contracts";
import { isModerator, requireModerator, type Me } from "../auth";
import { iso, isoRequired, many, one, query } from "../db";
import { badRequest, notFound } from "../errors";
import { writeAudit } from "../audit";

async function resolveTargetLabel(targetType: ReportTarget, targetId: string): Promise<string> {
  switch (targetType) {
    case "club": {
      const row = await one<{ name: string }>("select name from clubs where id = $1", [targetId]);
      return row?.name ?? "Unknown club";
    }
    case "project": {
      const row = await one<{ title: string }>("select title from projects where id = $1", [targetId]);
      return row?.title ?? "Unknown project";
    }
    case "event": {
      const row = await one<{ title: string }>("select title from events where id = $1", [targetId]);
      return row?.title ?? "Unknown event";
    }
    case "user": {
      const row = await one<{ name: string }>("select name from users where id = $1", [targetId]);
      return row?.name ?? "Unknown user";
    }
    default: {
      const row = await one<{ title: string }>("select title from announcements where id = $1", [targetId]);
      return row?.title ?? "Unknown announcement";
    }
  }
}

export async function createReport(
  me: Me,
  input: { targetType: ReportTarget; targetId: string; reason: string; details?: string | null },
): Promise<{ id: string }> {
  const label = await resolveTargetLabel(input.targetType, input.targetId);
  if (label.startsWith("Unknown")) throw badRequest("The reported item does not exist.");
  const inserted = await one<{ id: string }>(
    `insert into moderation_reports (reporter_id, target_type, target_id, target_label, reason, details)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [me.id, input.targetType, input.targetId, label, input.reason, input.details ?? null],
  );
  await writeAudit({
    actorId: me.id,
    action: "moderation.report_created",
    entityType: input.targetType,
    entityId: input.targetId,
    metadata: { reportId: inserted!.id, reason: input.reason },
  });
  return { id: inserted!.id };
}

export async function listReports(me: Me, status?: ReportStatus): Promise<ModerationReport[]> {
  await requireModerator(me);
  const rows = await many<{
    id: string;
    target_type: ReportTarget;
    target_id: string;
    target_label: string | null;
    reason: string;
    details: string | null;
    status: ReportStatus;
    created_at: Date;
    resolved_at: Date | null;
    resolution_notes: string | null;
    reporter_id: string;
    reporter_name: string;
    reporter_avatar: string | null;
  }>(
    `select r.id, r.target_type, r.target_id, r.target_label, r.reason, r.details, r.status,
            r.created_at, r.resolved_at, r.resolution_notes,
            u.id as reporter_id, u.name as reporter_name, u.avatar_url as reporter_avatar
       from moderation_reports r join users u on u.id = r.reporter_id
      where ($1::report_status is null or r.status = $1::report_status)
      order by case r.status when 'open' then 0 when 'under_review' then 1 else 2 end, r.created_at asc
      limit 200`,
    [status ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporter: { id: row.reporter_id, name: row.reporter_name, avatarUrl: row.reporter_avatar, bio: null },
    createdAt: isoRequired(row.created_at),
    resolvedAt: iso(row.resolved_at),
    resolutionNotes: row.resolution_notes,
  }));
}

export async function resolveReport(
  reportId: string,
  me: Me,
  input: { status: "under_review" | "resolved" | "dismissed"; notes?: string | null },
): Promise<void> {
  await requireModerator(me);
  const report = await one<{ id: string; status: string; target_type: string; target_id: string }>(
    "select id, status, target_type, target_id from moderation_reports where id = $1",
    [reportId],
  );
  if (!report) throw notFound("Report not found");
  const resolvedAt =
    input.status === "resolved" || input.status === "dismissed" ? new Date() : null;
  await query(
    `update moderation_reports
        set status = $2, resolution_notes = $3, resolved_by = $4, resolved_at = $5
      where id = $1`,
    [reportId, input.status, input.notes ?? null, me.id, resolvedAt],
  );
  await writeAudit({
    actorId: me.id,
    action: "moderation.report_resolved",
    entityType: report.target_type,
    entityId: report.target_id,
    metadata: { reportId, status: input.status, previousStatus: report.status },
  });
}

export async function openReportCount(): Promise<number> {
  const row = await one<{ n: number }>("select count(*)::int as n from moderation_reports where status = 'open'");
  return row?.n ?? 0;
}

export { isModerator };
