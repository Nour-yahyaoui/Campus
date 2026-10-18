-- 0007 — Media assets.
--
-- Bytes live in object storage (Neon Object Storage, S3-compatible); this table
-- is the index that makes them accountable: who uploaded what, for which
-- entity, and whether the upload actually completed. Rows start as `pending`
-- and flip to `ready` only after the object is verified in storage, so an
-- abandoned presigned URL cannot produce a visible broken image.

create type media_kind as enum ('avatar', 'club_logo', 'club_cover', 'project_cover', 'event_cover');
create type media_status as enum ('pending', 'ready', 'deleted');

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete cascade,
  kind media_kind not null,
  -- Null for avatars; the club/project/event id for scoped images.
  scope_id uuid,
  object_key text not null unique,
  content_type text not null,
  byte_size integer not null,
  checksum text,
  status media_status not null default 'pending',
  alt_text text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  constraint media_size_bounded check (byte_size > 0 and byte_size <= 8388608),
  constraint media_content_type_image check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint media_scope_matches_kind check (
    (kind = 'avatar' and scope_id is null) or (kind <> 'avatar' and scope_id is not null)
  ),
  constraint media_ready_has_completion check (
    (status = 'ready' and completed_at is not null) or status <> 'ready'
  )
);

create index media_owner_idx on media_assets (owner_id, created_at desc);
create index media_scope_idx on media_assets (kind, scope_id) where status = 'ready';
-- Used by the worker to reclaim abandoned presigned uploads.
create index media_pending_idx on media_assets (created_at) where status = 'pending';

comment on table media_assets is
  'Index of uploaded images. Object bytes live in S3-compatible storage; this table is the authorization and audit record.';
