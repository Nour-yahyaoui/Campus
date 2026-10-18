-- 0003 — Clubs and memberships.
-- Exactly one active membership per (user, club), enforced by a partial unique
-- index rather than application logic alone.

create table clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  description text not null,
  category club_category not null,
  status club_status not null default 'active',
  verified boolean not null default false,
  logo_url text,
  cover_url text,
  website_url text,
  contact_email text,
  instagram_url text,
  membership_policy membership_policy not null default 'request',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_slug_shape check (is_valid_slug(slug)),
  constraint clubs_name_len check (length(name) between 2 and 120),
  constraint clubs_description_len check (length(description) between 20 and 8000)
);

create index clubs_category_idx on clubs (category) where status = 'active';
create index clubs_name_trgm_idx on clubs (lower(name));
create index clubs_created_idx on clubs (created_at desc);

create trigger clubs_updated_at
  before update on clubs
  for each row execute function set_updated_at();

create table club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role club_role not null default 'member',
  status membership_status not null default 'pending',
  message text,
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index club_memberships_one_active
  on club_memberships (club_id, user_id) where status = 'active';
create unique index club_memberships_one_pending
  on club_memberships (club_id, user_id) where status = 'pending';
create index club_memberships_club_idx on club_memberships (club_id, status);
create index club_memberships_user_idx on club_memberships (user_id, status);

create trigger club_memberships_updated_at
  before update on club_memberships
  for each row execute function set_updated_at();

create table announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  constraint announcements_title_len check (length(title) between 3 and 200)
);

create index announcements_club_idx on announcements (club_id, published_at desc);
