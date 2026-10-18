-- 0001 — Extensions, enums and shared functions.
-- CampusSphere schema is the single source of truth for both API implementations.

-- pgcrypto is intentionally not required: gen_random_uuid() is core since PostgreSQL 13.

create type global_role as enum ('student', 'moderator', 'super_admin');
create type user_status as enum ('active', 'suspended', 'deletion_requested');

create type club_category as enum (
  'academic', 'arts', 'career', 'cultural', 'environment',
  'media', 'sports', 'technology', 'volunteering', 'other'
);
create type club_status as enum ('active', 'suspended', 'archived');
create type membership_policy as enum ('open', 'request', 'invite');
create type club_role as enum ('member', 'officer', 'president');
create type membership_status as enum ('pending', 'active', 'rejected', 'left');

create type project_category as enum (
  'software', 'robotics', 'research', 'volunteering', 'gardening',
  'creative', 'campus-improvement', 'entrepreneurship', 'other'
);
create type project_status as enum (
  'draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'archived'
);
create type project_visibility as enum ('public', 'members');
create type application_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type project_member_role as enum ('lead', 'member');
create type task_status as enum ('todo', 'doing', 'done');

create type event_category as enum (
  'academic', 'arts', 'career', 'community', 'competition', 'cultural',
  'environment', 'sports', 'technology', 'other'
);
create type event_status as enum (
  'draft', 'submitted', 'changes_requested', 'approved', 'rejected',
  'published', 'cancelled', 'completed'
);
create type registration_status as enum (
  'registered', 'waitlisted', 'cancelled', 'attended', 'no_show'
);

create type report_target as enum ('club', 'project', 'event', 'user', 'announcement');
create type report_status as enum ('open', 'under_review', 'resolved', 'dismissed');
create type job_status as enum ('queued', 'running', 'done', 'failed', 'dead');

create type notification_kind as enum (
  'club_application_decided',
  'club_application_received',
  'project_application_decided',
  'project_application_received',
  'project_decision',
  'event_decision',
  'event_registration_confirmed',
  'event_waitlisted',
  'event_promoted',
  'event_reminder',
  'event_cancelled',
  'announcement',
  'system'
);

-- Keeps updated_at honest without trusting the application layer.
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Audit records are append-only. Even a compromised application session with
-- UPDATE privileges cannot rewrite history without disabling this trigger.
create function forbid_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

-- Slugs are part of public URLs; enforce one canonical shape.
create function is_valid_slug(value text) returns boolean
language sql immutable as $$
  select value ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(value) between 1 and 120;
$$;
