# Database contract

The source of truth for table shapes lives in Supabase itself. This document
(and [`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql))
is a snapshot of that live schema as of **2026-09-11**, captured by querying
PostgREST's schema endpoint (`GET /rest/v1/`) with the service-role key —
not the original SQL used to build the tables, which wasn't available to
capture. If the schema changes, regenerate this doc rather than hand-editing
it out of sync with reality.

**Do not add fields here that the database doesn't have.** If the frontend
or backend needs a new field, add it to the actual Supabase table first, then
update this file and the migration together.

## profiles

One row per authenticated user. Created automatically by a signup trigger —
confirmed during backend verification (creating an auth user produced a
profile row with no manual insert).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK. References `auth.users.id`. Cascades on delete (verified). |
| `display_name` | `text` | Nullable. |
| `onboarding_completed` | `boolean` | Not null, default `false`. |
| `created_at` / `updated_at` | `timestamptz` | Not null, default `now()`. |

## tasks

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()`. |
| `user_id` | `uuid` | Not null. FK → `profiles.id`. |
| `title` | `text` | Not null. |
| `description` | `text` | Nullable. |
| `due_date` | `timestamptz` | Nullable. |
| `point_value` | `numeric` | Nullable. |
| `estimated_effort_minutes` | `integer` | Nullable. |
| `priority` | `text` | Nullable. Values seen: `low`, `medium`, `high`. |
| `completion_status` | `text` | Default `not_started`. Values seen: `not_started`, `in_progress`, `completed`. |
| `created_at` / `updated_at` | `timestamptz` | Default `now()`. |

## schedules

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()`. |
| `user_id` | `uuid` | Not null. FK → `profiles.id`. |
| `task_id` | `uuid` | Nullable. FK → `tasks.id` — a schedule block doesn't have to be tied to a task. |
| `start_time` / `end_time` | `timestamptz` | Not null. |
| `schedule_type` | `text` | Default `study_block`. |
| `status` | `text` | Default `scheduled`. |
| `created_at` / `updated_at` | `timestamptz` | Default `now()`. |

## preferences

One row per user, tuning how the scheduler behaves for them.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()`. |
| `user_id` | `uuid` | Not null. FK → `profiles.id`. |
| `study_session_minutes` | `integer` | Default `45`. |
| `break_interval_minutes` | `integer` | Default `10`. |
| `daily_workload_limit_minutes` | `integer` | Default `240`. |
| `scheduling_style` | `text` | Default `balanced`. |
| `communication_style` | `text` | Default `balanced`. |
| `created_at` / `updated_at` | `timestamptz` | Default `now()`. |

## notification_settings

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()`. |
| `user_id` | `uuid` | Not null. FK → `profiles.id`. |
| `enabled` | `boolean` | Default `true`. |
| `reminder_lead_minutes` | `integer` | Default `1440` (24 hours). |
| `frequency` | `text` | Default `normal`. |
| `priority_threshold` | `text` | Default `low`. |
| `delivery_method` | `text` | Default `in_app`. |
| `created_at` / `updated_at` | `timestamptz` | Default `now()`. |

## Known gaps

- **Row Level Security**: policies protecting these tables (if any) aren't
  captured here — the service-role key used to introspect this schema
  bypasses RLS entirely, and PostgREST's schema endpoint doesn't expose
  policy definitions. Check Database → Policies in the Supabase dashboard.
- **`ON DELETE` behavior**: only `profiles → auth.users` was directly
  observed to cascade. The other foreign keys above (`tasks.user_id`,
  `schedules.user_id`, `schedules.task_id`, `preferences.user_id`,
  `notification_settings.user_id`) have unconfirmed delete behavior — check
  before relying on cascading deletes for any of them.
- **Enum-like text columns** (`priority`, `completion_status`,
  `schedule_type`, `status`, `frequency`, `priority_threshold`,
  `delivery_method`, `scheduling_style`, `communication_style`) are plain
  `text`, not constrained at the database level as of this snapshot. The
  values listed above are what's been observed in use, not an enforced set.
