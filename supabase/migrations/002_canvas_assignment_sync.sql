-- Omni-AI: Canvas assignment synchronization foundation (PR 1)
--
-- Adds the columns needed to link a Task back to the mock Canvas
-- assignment/course it was imported from, and enforces that a user can
-- never have two Tasks imported from the same Canvas assignment.
--
-- Type choices:
--  - canvas_assignment_id / canvas_course_id are `integer` to match the
--    mock catalog's plain numeric ids (see server/services/canvasService.js
--    and dummy-canvas/src/App.jsx, both of which use small integers like
--    101, 201, 301 for assignments and 1, 2, 3 for courses). Real Canvas
--    assignment/course ids are also integers, so this holds for a future
--    swap from mock to real data.
--  - canvas_locked is `boolean not null default false` so every existing
--    row (and every ordinary, non-Canvas Task going forward) is
--    unambiguously "not a locked placeholder" with no NULL-handling needed
--    by callers.
--
-- Safety:
--  - Every statement is additive and guarded (IF NOT EXISTS / existence
--    checks), so this is safe to run against a database that already has
--    the `tasks` table from 001_initial_schema.sql, and safe to re-run.
--  - No existing column is altered, renamed, or dropped. No existing Task
--    CRUD behavior changes as a result of this migration alone - the
--    columns are simply unused (NULL / false) until a later PR's import
--    logic starts writing them.
--  - This file has NOT been run against any shared or production Supabase
--    project. It is proposed for review alongside this PR.

alter table public.tasks
  add column if not exists canvas_assignment_id integer,
  add column if not exists canvas_course_id integer,
  add column if not exists canvas_locked boolean not null default false;

-- Per-user uniqueness of non-null Canvas assignment ids.
--
-- Postgres treats every NULL as distinct from every other NULL in a unique
-- constraint, so ordinary Tasks (canvas_assignment_id IS NULL - the default
-- for every pre-existing row and every non-Canvas Task created from here
-- on) are completely unaffected: a user can have unlimited such Tasks. The
-- constraint only ever fires when a *second* row for the same user repeats
-- the same non-null canvas_assignment_id - i.e. a duplicate import.
--
-- Wrapped in a DO block with an existence check (rather than a bare
-- `add constraint`) so this migration stays safe to re-run.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_user_canvas_assignment_unique'
  ) then
    alter table public.tasks
      add constraint tasks_user_canvas_assignment_unique
      unique (user_id, canvas_assignment_id);
  end if;
end;
$$;
