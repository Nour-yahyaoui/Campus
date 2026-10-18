-- 0002 — Identity, sessions and audit.
-- Sessions are opaque random tokens; only their SHA-256 hash is stored so a
-- database leak cannot be replayed as a live session.

create table users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique,
  email text not null,
  email_verified boolean not null default false,
  name text not null,
  avatar_url text,
  bio text,
  roles global_role[] not null default '{student}',
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint users_email_lowercase check (email = lower(email)),
  constraint users_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint users_name_len check (length(name) between 1 and 120),
  constraint users_roles_not_empty check (array_length(roles, 1) >= 1)
);

-- A user without a Google subject is possible only in explicit development
-- mode (dev sign-in), which is refused at startup in production.
create unique index users_email_unique on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text,
  check (expires_at > created_at)
);

create index sessions_user_idx on sessions (user_id) where revoked_at is null;
create index sessions_expiry_idx on sessions (expires_at);

create table sign_in_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_hash text not null unique,
  user_id uuid not null references users (id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > issued_at)
);

create table oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  nonce_hash text not null,
  verifier_hash text not null,
  redirect_to text not null default '/',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

-- Append-only. See forbid_audit_mutation in migration 0001.
create table audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_created_idx on audit_events (created_at desc);
create index audit_events_entity_idx on audit_events (entity_type, entity_id);
create index audit_events_actor_idx on audit_events (actor_id) where actor_id is not null;

create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function forbid_audit_mutation();

create trigger users_updated_at
  before update on users
  for each row execute function set_updated_at();

/* ------------------------------------------------------------------ */
/* Rate limiting — shared by every instance, fixed windows.            */
/* ------------------------------------------------------------------ */

create table rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, window_start)
);

create index rate_limit_window_idx on rate_limit_counters (window_start);

/* ------------------------------------------------------------------ */
/* Durable background jobs.                                            */
/* ------------------------------------------------------------------ */

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status job_status not null default 'queued',
  last_error text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index jobs_ready_idx on jobs (run_at) where status = 'queued';
create index jobs_status_idx on jobs (status, created_at);

create table outbound_emails (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs (id) on delete set null,
  recipient text not null,
  subject text not null,
  body text not null,
  provider text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index outbound_emails_created_idx on outbound_emails (created_at desc);
