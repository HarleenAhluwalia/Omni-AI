
-- Sprint 3: Dummy Canvas Assignment Tracking

-- Track the original Canvas assignment and course.
-- Nullable fields allow manually created tasks to remain unchanged.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS canvas_assignment_id BIGINT,
ADD COLUMN IF NOT EXISTS canvas_course_id BIGINT;

-- Prevent duplicate imports of the same assignment
-- for the same user and course.

CREATE UNIQUE INDEX IF NOT EXISTS
tasks_user_canvas_assignment_unique
ON public.tasks (
    user_id,
    canvas_course_id,
    canvas_assignment_id
)
WHERE canvas_assignment_id IS NOT NULL
  AND canvas_course_id IS NOT NULL;
