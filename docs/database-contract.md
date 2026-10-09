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
| `canvas_assignment_id` | `integer` | Nullable. Set when this Task was imported from a (mock) Canvas assignment. See "Canvas assignment synchronization" below. |
| `canvas_course_id` | `integer` | Nullable. The Canvas course the assignment above belongs to. |
| `canvas_locked` | `boolean` | Not null, default `false`. `true` only for a placeholder Task imported from a locked Canvas assignment. |
| `created_at` / `updated_at` | `timestamptz` | Default `now()`. |

### Canvas assignment synchronization (PR 1 + PR 2)

> **Migration status**: this section (and the three columns above it)
> describe `supabase/migrations/002_canvas_assignment_sync.sql`. Whether
> this migration has been applied to any shared or production Supabase
> project is not established by this PR — it was not run or deployed as
> part of this work. Confirm the target database's actual schema before
> relying on these columns existing there.

The import/update logic described below is implemented in
[`server/src/controllers/canvasController.js`](../server/src/controllers/canvasController.js)
and exposed via `GET /api/canvas/courses` / `POST /api/canvas/import` (see
`docs/api-contract.md`). The mock Canvas catalog itself lives in
[`server/services/canvasService.js`](../server/services/canvasService.js).

**Uniqueness**: `tasks_user_canvas_assignment_unique` is a `unique (user_id,
canvas_assignment_id)` constraint. Postgres treats every `NULL` as distinct
from every other `NULL` in a unique constraint, so ordinary Tasks (which
have `canvas_assignment_id = NULL`) are entirely unaffected — a user can
have unlimited non-Canvas Tasks. The constraint only ever fires on a second
row for the same user repeating the same non-null `canvas_assignment_id`,
i.e. a duplicate import; the controller catches this violation (Postgres
error code `23505`) and reports it as `skipped` / `already_imported`
instead of a hard failure, so a losing concurrent request never surfaces
as an error or creates a second row.

**Canvas-owned fields** (the sync engine updates these on an existing Task
when the Canvas assignment changes, and only these):
- `title`
- `due_date`
- `point_value`
- `canvas_assignment_id` / `canvas_course_id`
- `canvas_locked`

`point_value` is compared numerically rather than with strict equality,
since a `numeric` column can round-trip through real Supabase/PostgREST as
a string even though it was written as a number — a straight `===` there
would misreport an unchanged value as a change.

**User-managed fields** (the sync engine never reads or writes these on an
existing Task, even when re-syncing):
- `completion_status`
- `priority`
- `estimated_effort_minutes`
- `description`, and any other user-entered field not explicitly listed as
  Canvas-owned above

**Initial-import defaults** (for a Task created from an assignment that has
never been imported before): `completion_status` is explicitly set to
`not_started`; `priority`, `estimated_effort_minutes`, and `description`
are left unset — they're user-managed and nothing about a fresh import
guesses at them.

**Locked assignments**: imported as a placeholder Task with `canvas_locked =
true`, `due_date = null`, and `point_value = null` — the schema already
allows both to be `null`, so no fallback value is needed for them. `title`
is the one `not null` Task column with no database default; the mock
catalog always provides a title even for locked assignments (see
`canvasService.js`), so this hasn't been exercised in practice. If a future
source assignment truly has no title, the recommended fallback is a
clearly-labeled placeholder string such as `"Locked Canvas Assignment
#<canvas_assignment_id>"`, never a blank or guessed title — this fallback
is not implemented, since the mock catalog never triggers it.

**Synchronization failures**: per the confirmed product decision that sync
failures must not corrupt existing Task data, each assignment id in a
`POST /api/canvas/import` request is processed independently (one failing
assignment doesn't roll back or skip the others, and is reported in the
`failed` bucket with a `reason`), and updates to Canvas-owned fields only
ever happen via an explicit, successful write to that one row — never a
partial/best-effort mutation. A failure before per-id processing starts
(e.g. the initial fetch of the user's existing Tasks) returns `500` with no
Task data touched at all.

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
