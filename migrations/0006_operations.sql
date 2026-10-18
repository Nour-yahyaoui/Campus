-- 0006 — Notifications, moderation, settings, API metrics.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind notification_kind not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

create table moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  target_type report_target not null,
  target_id uuid not null,
  target_label text,
  reason text not null,
  details text,
  status report_status not null default 'open',
  resolved_by uuid references users (id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index moderation_reports_status_idx on moderation_reports (status, created_at);
create index moderation_reports_target_idx on moderation_reports (target_type, target_id);

-- Key/value operational settings. Values are JSON so they stay typed at the
-- edge; only known keys are read by the application.
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users (id) on delete set null
);

-- Per-request samples used by the System Observatory. Rows older than 30 days
-- are deleted by a durable cleanup job; route labels are bounded templates
-- (never raw user paths) so cardinality stays controlled.
create table api_metrics (
  id bigint generated always as identity primary key,
  route text not null,
  method text not null,
  status_code integer not null,
  duration_ms integer not null,
  created_at timestamptz not null default now()
);

create index api_metrics_created_idx on api_metrics (created_at desc);
create index api_metrics_route_idx on api_metrics (route, created_at desc);

insert into settings (key, value) values
  ('maintenance', '{"enabled": false, "message": null}'::jsonb),
  ('registration', '{"devSignInEnabled": true}'::jsonb)
on conflict (key) do nothing;
