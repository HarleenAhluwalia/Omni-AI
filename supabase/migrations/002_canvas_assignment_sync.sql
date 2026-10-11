
-- =========================================================
-- Omni AI - Canvas Assignment Synchronization
-- Sprint 3 - Consolidated Migration
-- =========================================================
--
-- Combines the previous two 002 Canvas migrations.
--
-- Tracks Canvas assignments imported into Omni AI.
--
-- Assignment uniqueness is based on:
--   user_id + canvas_course_id + canvas_assignment_id
--
-- This matches the existing shared Supabase database.
--
-- Intended for fresh database setup.
-- Do not reapply blindly to the shared database.
-- =========================================================

-- Add Canvas assignment tracking columns.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS canvas_assignment_id BIGINT,
  ADD COLUMN IF NOT EXISTS canvas_course_id BIGINT,
  ADD COLUMN IF NOT EXISTS canvas_locked BOOLEAN NOT NULL DEFAULT FALSE;


-- =========================================================
-- Course-aware duplicate prevention
-- =========================================================
--
-- A user cannot import the same assignment twice
-- from the same Canvas course.
--
-- Different courses may use the same assignment ID.
--
-- Manually created Tasks are unaffected because
-- their Canvas tracking columns are NULL.
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  tasks_user_canvas_assignment_unique
ON public.tasks (
  user_id,
  canvas_course_id,
  canvas_assignment_id
)
WHERE canvas_assignment_id IS NOT NULL
  AND canvas_course_id IS NOT NULL;
