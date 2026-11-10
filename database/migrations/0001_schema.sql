-- IssueFlow AI — 0001: core schema
-- Tables, enums, constraints and indexes. Security (RLS) lives in 0003.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'member');
create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type public.issue_status as enum ('open', 'in_progress', 'blocked', 'in_review', 'resolved', 'closed');
create type public.issue_priority as enum ('critical', 'high', 'medium', 'low');
create type public.issue_category as enum (
  'bug', 'feature_request', 'performance', 'ui_ux', 'maintenance',
  'customer_complaint', 'operations', 'other'
);
create type public.import_status as enum (
  'uploaded', 'parsing', 'parsed', 'processing', 'review', 'completed', 'failed', 'duplicate'
);
create type public.draft_status as enum ('pending', 'approved', 'rejected', 'merged');
create type public.automation_run_status as enum ('running', 'success', 'failed');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (created by trigger in 0002)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name text not null check (char_length(name) between 1 and 120),
  client_name text check (char_length(client_name) <= 120),
  description text not null default '' check (char_length(description) <= 5000),
  status public.project_status not null default 'active',
  issue_counter integer not null default 0,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- imports: one WhatsApp upload session
-- ---------------------------------------------------------------------------
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  status public.import_status not null default 'uploaded',
  file_names text[] not null default '{}',
  content_hash text,
  message_count integer not null default 0,
  media_count integer not null default 0,
  draft_count integer not null default 0,
  parse_warnings jsonb not null default '[]',
  error_message text,
  ai_provider text,
  ai_model text,
  ai_simulated boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index imports_project_idx on public.imports (project_id, created_at desc);
create index imports_status_idx on public.imports (status);
-- Duplicate-import protection: the same chat content may only be imported once per project
-- (failed / duplicate attempts are excluded so a user can retry).
create unique index imports_unique_content_idx
  on public.imports (project_id, content_hash)
  where content_hash is not null and status not in ('failed', 'duplicate');

-- ---------------------------------------------------------------------------
-- source_messages: the original, unmodified WhatsApp messages
-- ---------------------------------------------------------------------------
create table public.source_messages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  seq integer not null,
  sender text,                       -- null = unknown
  sent_at timestamptz,               -- null = unknown / unparseable
  raw_timestamp text,
  body text not null default '',
  is_system boolean not null default false,
  attachment_name text,
  attachment_missing boolean not null default false,
  created_at timestamptz not null default now(),
  unique (import_id, seq)
);
create index source_messages_project_idx on public.source_messages (project_id);
create index source_messages_body_trgm on public.source_messages using gin (body gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- issues: approved, permanent records
-- ---------------------------------------------------------------------------
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  category public.issue_category not null default 'other',
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'open',
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_name text check (char_length(reporter_name) <= 120), -- external reporter, e.g. WhatsApp sender
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  source text not null default 'manual' check (source in ('manual', 'whatsapp_import')),
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (project_id, number)
);
create index issues_project_status_idx on public.issues (project_id, status);
create index issues_assignee_idx on public.issues (assignee_id);
create index issues_due_idx on public.issues (due_date) where due_date is not null;
create index issues_created_idx on public.issues (created_at desc);
create index issues_updated_idx on public.issues (updated_at);
create index issues_title_trgm on public.issues using gin (title gin_trgm_ops);
create index issues_desc_trgm on public.issues using gin (description gin_trgm_ops);

create table public.issue_source_messages (
  issue_id uuid not null references public.issues (id) on delete cascade,
  source_message_id uuid not null references public.source_messages (id) on delete cascade,
  primary key (issue_id, source_message_id)
);
create index issue_source_messages_msg_idx on public.issue_source_messages (source_message_id);

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_issue_idx on public.comments (issue_id, created_at);
create index comments_body_trgm on public.comments using gin (body gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- attachments: files in the private "evidence" storage bucket
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  issue_id uuid references public.issues (id) on delete cascade,
  import_id uuid references public.imports (id) on delete cascade,
  source_message_id uuid references public.source_messages (id) on delete set null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  ai_description text,           -- what the AI provider saw in the image (if anything)
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index attachments_issue_idx on public.attachments (issue_id);
create index attachments_import_idx on public.attachments (import_id);

-- ---------------------------------------------------------------------------
-- issue_drafts: AI output, stored separately from approved issues
-- ---------------------------------------------------------------------------
create table public.issue_drafts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  category public.issue_category not null default 'other',
  priority public.issue_priority not null default 'medium',
  reported_by text,
  reported_at timestamptz,
  suggested_assignee text,
  confidence numeric(3, 2) not null default 0 check (confidence between 0 and 1),
  source_message_ids uuid[] not null default '{}',
  attachment_ids uuid[] not null default '{}',
  duplicate_candidates jsonb not null default '[]',
  status public.draft_status not null default 'pending',
  approved_issue_id uuid references public.issues (id) on delete set null,
  merged_into_issue_id uuid references public.issues (id) on delete set null,
  merged_into_draft_id uuid references public.issue_drafts (id) on delete set null,
  ai_provider text not null,
  ai_model text not null,
  is_simulated boolean not null default false,
  raw_output jsonb,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index issue_drafts_import_idx on public.issue_drafts (import_id, status);

-- ---------------------------------------------------------------------------
-- issue_activity: per-issue history (written only by triggers)
-- ---------------------------------------------------------------------------
create table public.issue_activity (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.issues (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);
create index issue_activity_issue_idx on public.issue_activity (issue_id, created_at);

-- ---------------------------------------------------------------------------
-- automation
-- ---------------------------------------------------------------------------
create table public.automation_jobs (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  description text not null default '',
  schedule text not null,          -- cron expression (UTC), mirrors vercel.json
  enabled boolean not null default true,
  config jsonb not null default '{}',
  last_run_at timestamptz,
  last_status public.automation_run_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.automation_jobs (id) on delete cascade,
  trigger text not null check (trigger in ('cron', 'manual')),
  triggered_by uuid references public.profiles (id) on delete set null,
  status public.automation_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text,
  result jsonb not null default '{}',
  error text
);
create index automation_logs_job_idx on public.automation_logs (job_id, started_at desc);

-- ---------------------------------------------------------------------------
-- audit_logs (append-only; written by triggers and log_audit_event())
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  project_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
