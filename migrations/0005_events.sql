-- 0005 — Events, registrations, waitlist, attendance and feedback.
--
-- Capacity is protected in two layers:
--   1. registration is serialized by locking the event row in the same
--      transaction that counts active registrations (no oversubscription under
--      concurrency — see the integration tests);
--   2. partial unique indexes prevent duplicate active registrations.

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  club_id uuid references clubs (id) on delete set null,
  created_by uuid not null references users (id) on delete restrict,
  title text not null,
  summary text not null,
  description text not null,
  category event_category not null,
  status event_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  venue_name text,
  venue_address text,
  online_url text,
  capacity integer check (capacity is null or capacity between 1 and 10000),
  waitlist_enabled boolean not null default true,
  accessibility_notes text,
  contact_email text,
  cover_url text,
  decision_notes text,
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  submitted_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_shape check (is_valid_slug(slug)),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_title_len check (length(title) between 3 and 160),
  constraint events_summary_len check (length(summary) between 20 and 300),
  constraint events_has_location check (venue_name is not null or online_url is not null)
);

create index events_public_idx on events (starts_at) where status in ('published', 'completed');
create index events_status_idx on events (status, submitted_at);
create index events_club_idx on events (club_id, starts_at desc);
create index events_title_idx on events (lower(title));

create trigger events_updated_at
  before update on events
  for each row execute function set_updated_at();

create table event_organizers (
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_organizers_user_idx on event_organizers (user_id);

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  status registration_status not null default 'registered',
  position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  promoted_from_waitlist_at timestamptz
);

-- One live seat or one live waitlist place per person per event.
create unique index event_registrations_one_active
  on event_registrations (event_id, user_id)
  where status in ('registered', 'attended', 'waitlisted');
create index event_registrations_event_idx on event_registrations (event_id, status, created_at);
create index event_registrations_user_idx on event_registrations (user_id);

create trigger event_registrations_updated_at
  before update on event_registrations
  for each row execute function set_updated_at();

-- Check-in tokens are short-lived, single-use and stored as hashes only.
create table attendance_tokens (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references event_registrations (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index attendance_tokens_registration_idx on attendance_tokens (registration_id);

create table event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_feedback_event_idx on event_feedback (event_id);
