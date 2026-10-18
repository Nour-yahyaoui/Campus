import type { Notification, NotificationKind } from "@campussphere/contracts";
import { many, one, query, iso } from "./db";

export async function notify(input: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  await query(
    `insert into notifications (user_id, kind, title, body, link)
     values ($1, $2, $3, $4, $5)`,
    [input.userId, input.kind, input.title, input.body, input.link ?? null],
  );
}

export async function notifyMany(userIds: string[], input: Omit<Parameters<typeof notify>[0], "userId">): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await query(
    `insert into notifications (user_id, kind, title, body, link)
     select unnest($1::uuid[]), $2, $3, $4, $5`,
    [unique, input.kind, input.title, input.body, input.link ?? null],
  );
}

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const rows = await many<NotificationRow>(
    `select id, kind, title, body, link, read_at, created_at
       from notifications where user_id = $1
      order by created_at desc limit $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: iso(row.read_at),
    createdAt: iso(row.created_at)!,
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await one<{ n: number }>(
    "select count(*)::int as n from notifications where user_id = $1 and read_at is null",
    [userId],
  );
  return row?.n ?? 0;
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await query(
    "update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null",
    [notificationId, userId],
  );
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await query(
    "update notifications set read_at = now() where user_id = $1 and read_at is null",
    [userId],
  );
  return result.rowCount ?? 0;
}
