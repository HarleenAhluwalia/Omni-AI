-- Omni-AI: initial database schema
--
-- Provenance: this file was NOT the SQL originally used to create these
-- tables (that history lives only in the Supabase dashboard's SQL history,
-- which this session had no access to). It was reverse-engineered from the
-- live schema via PostgREST's OpenAPI introspection (GET /rest/v1/) on
-- 2026-09-11, so the team has a version-controlled record of the shape of
-- the database.
--
-- What's verified vs. inferred:
--  - Table names, column names, types, and defaults: read directly from the
--    live schema. Accurate as of the date above.
--  - NOT NULL on columns with no default (e.g. tasks.title): read directly
--    from the schema's required-fields list. Accurate.
--  - Foreign keys: read directly from the schema (table + column). Accurate.
--  - ON DELETE behavior: only confirmed for profiles -> auth.users, where
--    deleting a test auth user was observed to cascade-delete its profile
--    row. Cascade behavior for the other foreign keys below was NOT
--    observed and is left unspecified (defaults to NO ACTION) rather than
--    guessed -- confirm the real behavior in Database > Tables before
--    relying on it.
--  - Row Level Security: PostgREST's schema endpoint doesn't expose policies,
--    and this session only had the service-role key, which bypasses RLS.
--    Any policies protecting these tables are NOT captured here -- export
--    them separately (Database > Policies) if the team wants them versioned.
--  - Text fields that read like enums (priority, completion_status,
--    schedule_type, status, frequency, priority_threshold, delivery_method,
--    scheduling_style, communication_style) are plain `text` here, not
--    Postgres enums or CHECK constraints, because no constraint was
--    observed enforcing a fixed value set. Values seen in use are noted
--    inline as comments.
--
-- Running this file against a database that already has these tables is
-- safe (every statement is guarded with IF NOT EXISTS).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user (auth.users), created by a signup
-- trigger observed during Task 5 verification.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text,
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks: the work items the app schedules and tracks.
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.profiles (id),
  title                       text not null,
  description                 text,
  due_date                    timestamptz,
  point_value                 numeric,
  estimated_effort_minutes    integer,
  priority                    text,       -- values seen in use: 'low', 'medium', 'high'
  completion_status           text default 'not_started', -- seen: 'not_started', 'in_progress', 'completed'
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- schedules: time blocks placed on a user's calendar, optionally tied to a
-- specific task (task_id is nullable -- a schedule can be a bare block, e.g.
-- a break, with no task attached).
-- ---------------------------------------------------------------------------
create table if not exists public.schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id),
  task_id         uuid references public.tasks (id),
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  schedule_type   text not null default 'study_block', -- seen: 'study_block'
  status          text not null default 'scheduled',   -- seen: 'scheduled'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- preferences: one row per user, tuning how the scheduler behaves for them.
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references public.profiles (id),
  study_session_minutes           integer not null default 45,
  break_interval_minutes          integer not null default 10,
  daily_workload_limit_minutes    integer not null default 240,
  scheduling_style                text not null default 'balanced', -- seen: 'balanced'
  communication_style             text not null default 'balanced', -- seen: 'balanced'
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notification_settings: one row per user, controlling reminders.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_settings (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles (id),
  enabled                   boolean not null default true,
  reminder_lead_minutes     integer not null default 1440,
  frequency                 text not null default 'normal',   -- seen: 'normal'
  priority_threshold        text not null default 'low',      -- seen: 'low'
  delivery_method           text not null default 'in_app',   -- seen: 'in_app'
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
