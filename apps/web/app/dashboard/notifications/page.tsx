import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listNotifications } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { formatRelative } from "@/lib/format";
import { EmptyState, Notice } from "@/components/Pieces";
import { markAllReadAction, markReadAction } from "@/app/actions/notifications";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const messages = await searchParams;
  const me = await currentUser();
  if (!me) redirect("/login?next=/dashboard/notifications");
  const notifications = await listNotifications(me.id, 100);
  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="shell" style={{ maxWidth: 780 }}>
      <div className="page-head">
        <p className="eyebrow">Inbox</p>
        <h1>Notifications</h1>
        <p className="lede">{unread} unread. Decisions, announcements and reminders land here.</p>
      </div>
      {messages.ok ? <Notice>{messages.ok}</Notice> : null}
      {messages.error ? <Notice tone="danger">{messages.error}</Notice> : null}

      {notifications.length === 0 ? (
        <EmptyState title="Nothing here yet">We only notify you about real activity on your account.</EmptyState>
      ) : (
        <>
          {unread > 0 ? (
            <form action={markAllReadAction} className="mb-0">
              <SubmitButton className="btn btn-secondary btn-sm">Mark all as read</SubmitButton>
            </form>
          ) : null}
          <div className="card card-flat mt-2">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}
              >
                <div className="spread">
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: "1rem", margin: 0 }}>
                      {!notification.readAt ? <span aria-label="Unread" style={{ color: "var(--marigold)" }}>● </span> : null}
                      {notification.title}
                    </h2>
                    <p className="small muted" style={{ margin: "4px 0" }}>{notification.body}</p>
                    <p className="tiny muted" style={{ margin: 0 }}>{formatRelative(notification.createdAt)}</p>
                  </div>
                  <div className="row">
                    {notification.link ? <Link className="btn btn-secondary btn-sm" href={notification.link}>Open</Link> : null}
                    {!notification.readAt ? (
                      <form action={markReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <SubmitButton className="btn btn-ghost btn-sm">Mark read</SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
