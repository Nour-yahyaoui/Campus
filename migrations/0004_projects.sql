-- 0004 — Projects, roles, applications, workspace.
-- Approval decisions and their notes live on the project row; every decision
-- is also written to audit_events by the application layer.

create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  club_id uuid references clubs (id) on delete set null,
  lead_id uuid not null references users (id) on delete restrict,
  title text not null,
  summary text not null,
  description text not null,
  category project_category not null,
  status project_status not null default 'draft',
  visibility project_visibility not null default 'public',
  goals text,
  expected_impact text,
  timeline text,
  resources text,
  cover_url text,
  decision_notes text,
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_slug_shape check (is_valid_slug(slug)),
  constraint projects_title_len check (length(title) between 3 and 160),
  constraint projects_summary_len check (length(summary) between 20 and 300),
  constraint projects_description_len check (length(description) between 40 and 12000)
);

create index projects_public_idx on projects (approved_at desc) where status = 'approved' and visibility = 'public';
create index projects_status_idx on projects (status, submitted_at);
create index projects_club_idx on projects (club_id);
create index projects_lead_idx on projects (lead_id);
create index projects_title_idx on projects (lower(title));

create trigger projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

create table project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  description text,
  slots integer not null default 1 check (slots between 1 and 20),
  created_at timestamptz not null default now()
);

create index project_roles_project_idx on project_roles (project_id);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role project_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index project_members_user_idx on project_members (user_id);

create table project_applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  role_id uuid references project_roles (id) on delete set null,
  user_id uuid not null references users (id) on delete cascade,
  message text not null,
  status application_status not null default 'pending',
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_applications_message_len check (length(message) between 10 and 1500)
);

create unique index project_applications_one_pending
  on project_applications (project_id, user_id) where status = 'pending';
create index project_applications_project_idx on project_applications (project_id, status);
create index project_applications_user_idx on project_applications (user_id);

create table project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'todo',
  assignee_id uuid references users (id) on delete set null,
  due_date timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_tasks_title_len check (length(title) between 2 and 200)
);

create index project_tasks_project_idx on project_tasks (project_id, status);

create trigger project_tasks_updated_at
  before update on project_tasks
  for each row execute function set_updated_at();

create table project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_milestones_title_len check (length(title) between 2 and 160)
);

create index project_milestones_project_idx on project_milestones (project_id);

create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index project_updates_project_idx on project_updates (project_id, created_at desc);
