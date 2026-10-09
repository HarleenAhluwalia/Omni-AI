const supabase = require("../../config/supabase");
const {
  listCourses,
  findAssignmentById,
} = require("../../services/canvasService");

// Canvas-owned fields, per the PR 1/PR 2 product decisions: a synchronization
// pass may update these on an existing Task, but must never touch anything
// else (completion_status, priority, estimated_effort_minutes, description).
const CANVAS_OWNED_KEYS = [
  "title",
  "due_date",
  "point_value",
  "canvas_course_id",
  "canvas_locked",
];

// Canvas's mock due dates are plain "YYYY-MM-DD" strings. Stored as
// end-of-day UTC, consistent with how due_date is day-granularity
// everywhere else in this schema (see AddTask.jsx / taskController.js).
const toIsoDueDate = (dueDate) => {
  if (!dueDate) {
    return null;
  }

  return new Date(`${dueDate}T23:59:59.000Z`).toISOString();
};

// Maps a canvasService assignment/course pair onto the Task columns a
// synchronization pass owns. Locked assignments pass their (already-null)
// dueDate/points straight through - canvasService represents missing
// details as null rather than inventing them, and this does the same.
const buildCanvasOwnedFields = (assignment, course) => ({
  title: assignment.title,
  due_date: toIsoDueDate(assignment.dueDate),
  point_value: assignment.points ?? null,
  canvas_assignment_id: assignment.id,
  canvas_course_id: course.id,
  canvas_locked: assignment.locked === true,
});

// point_value is a Postgres `numeric` column, which can come back through
// real Supabase/PostgREST as a string even though it was written as a
// number (a documented quirk, not reproduced by the test mock) - compare
// numerically for that one field so a real-world round trip never looks
// like a spurious "change". Every other Canvas-owned field is compared
// directly.
const valuesEqual = (key, next, current) => {
  if (next === current) {
    return true;
  }

  if (next == null && current == null) {
    return true;
  }

  if (key === "point_value") {
    return Number(next) === Number(current);
  }

  return false;
};

// Diffs only the Canvas-owned fields against an existing Task, returning
// just the keys that actually changed. User-managed fields are never
// read or written here, so they can never appear in the result.
const diffCanvasOwnedFields = (canvasFields, existingTask) => {
  const changes = {};

  for (const key of CANVAS_OWNED_KEYS) {
    const next = canvasFields[key] ?? null;
    const current = existingTask[key] ?? null;

    if (!valuesEqual(key, next, current)) {
      changes[key] = canvasFields[key];
    }
  }

  return changes;
};

// Recognizes a per-user unique-constraint violation on
// (user_id, canvas_assignment_id) from either a real Postgres/PostgREST
// error (code 23505) or the shape the test mock returns.
const isUniqueViolation = (error) =>
  error?.code === "23505" ||
  (typeof error?.message === "string" &&
    error.message.includes("tasks_user_canvas_assignment_unique"));


// =========================================================
// GET /api/canvas/courses
// (requireAuth populates req.user.id)
// =========================================================
const getCourses = async (req, res) => {
  const user_id = req.user.id;

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user_id);

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  const importedByAssignmentId = new Map();

  for (const task of data || []) {
    if (task.canvas_assignment_id != null) {
      importedByAssignmentId.set(task.canvas_assignment_id, task);
    }
  }

  const courses = listCourses().map((course) => ({
    id: course.id,
    name: course.name,
    assignments: course.assignments.map((assignment) => {
      const existingTask = importedByAssignmentId.get(assignment.id);

      return {
        id: assignment.id,
        title: assignment.title,
        due_date: assignment.dueDate,
        points: assignment.points,
        locked: assignment.locked === true,
        imported: Boolean(existingTask),
        task_id: existingTask ? existingTask.id : null,
      };
    }),
  }));

  return res.status(200).json({
    success: true,
    data: { courses },
  });
};


// =========================================================
// POST /api/canvas/import
// (requireAuth populates req.user.id)
//
// Processes each requested assignment id independently (own try/catch,
// own push into one of four result buckets) so one failure never affects
// the others, and Supabase is never told anything was imported unless the
// write actually succeeded.
// =========================================================
const importAssignments = async (req, res) => {
  const user_id = req.user.id;
  const { assignment_ids } = req.body;

  const isValidIdList =
    Array.isArray(assignment_ids) &&
    assignment_ids.length > 0 &&
    assignment_ids.every(
      (value) => Number.isInteger(value) && value > 0
    );

  if (!isValidIdList) {
    return res.status(400).json({
      success: false,
      error: "assignment_ids must be a non-empty array of positive integers",
    });
  }

  // De-duplicate the request itself - a client sending the same id twice
  // is processed once.
  const uniqueIds = [...new Set(assignment_ids)];

  // One query covers every id in the batch, instead of one query per id.
  const { data: existingTasks, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user_id);

  if (fetchError) {
    return res.status(500).json({
      success: false,
      error: fetchError.message,
    });
  }

  const existingByAssignmentId = new Map();

  for (const task of existingTasks || []) {
    if (task.canvas_assignment_id != null) {
      existingByAssignmentId.set(task.canvas_assignment_id, task);
    }
  }

  const imported = [];
  const updated = [];
  const skipped = [];
  const failed = [];

  for (const assignmentId of uniqueIds) {
    const found = findAssignmentById(assignmentId);

    if (!found) {
      failed.push({
        assignment_id: assignmentId,
        reason: "assignment_not_found",
      });
      continue;
    }

    const { course, assignment } = found;
    const canvasFields = buildCanvasOwnedFields(assignment, course);
    const existingTask = existingByAssignmentId.get(assignment.id);

    if (!existingTask) {
      const { data, error } = await supabase
        .from("tasks")
        .insert([
          {
            ...canvasFields,
            user_id,
            completion_status: "not_started",
          },
        ])
        .select()
        .single();

      if (error) {
        if (isUniqueViolation(error)) {
          // A concurrent request imported this assignment first. Never
          // report a hard failure or create a second row - re-fetch and
          // report it exactly as an ordinary duplicate would be.
          const { data: raceWinner } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", user_id)
            .eq("canvas_assignment_id", assignment.id)
            .maybeSingle();

          skipped.push({
            assignment_id: assignmentId,
            reason: "already_imported",
            task_id: raceWinner ? raceWinner.id : null,
          });
          continue;
        }

        failed.push({
          assignment_id: assignmentId,
          reason: "import_failed",
          detail: error.message,
        });
        continue;
      }

      imported.push({ assignment_id: assignmentId, task: data });
      continue;
    }

    const changes = diffCanvasOwnedFields(canvasFields, existingTask);

    if (Object.keys(changes).length === 0) {
      skipped.push({
        assignment_id: assignmentId,
        reason: "unchanged",
        task_id: existingTask.id,
      });
      continue;
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(changes)
      .eq("id", existingTask.id)
      .eq("user_id", user_id)
      .select()
      .maybeSingle();

    if (error) {
      failed.push({
        assignment_id: assignmentId,
        reason: "update_failed",
        detail: error.message,
      });
      continue;
    }

    updated.push({ assignment_id: assignmentId, task: data });
  }

  return res.status(200).json({
    success: true,
    data: { imported, updated, skipped, failed },
  });
};


module.exports = {
  getCourses,
  importAssignments,
};
