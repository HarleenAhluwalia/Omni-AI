
const supabase = require("../../config/supabase");

const {
  listCourses,
  findAssignmentById,
} = require("../../services/canvasService");

// Fields that Canvas synchronization is allowed to update.
// User-managed fields must remain unchanged.
const CANVAS_OWNED_KEYS = [
  "title",
  "due_date",
  "point_value",
  "canvas_course_id",
  "canvas_locked",
];

// Identify an assignment using both course and assignment IDs.
const canvasAssignmentKey = (courseId, assignmentId) =>
  `${courseId}:${assignmentId}`;

// Convert Canvas date to end-of-day UTC.
const toIsoDueDate = (dueDate) => {
  if (!dueDate) {
    return null;
  }

  return new Date(`${dueDate}T23:59:59.000Z`).toISOString();
};

// Convert Canvas assignment data into Omni AI Task fields.
const buildCanvasOwnedFields = (assignment, course) => ({
  title: assignment.title,
  due_date: toIsoDueDate(assignment.dueDate),
  point_value: assignment.points ?? null,
  canvas_assignment_id: assignment.id,
  canvas_course_id: course.id,
  canvas_locked: assignment.locked === true,
});

// Compare stored and incoming Canvas values.
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

// Only update fields owned by Canvas.
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

// Recognize duplicate imports from Supabase/Postgres.
const isUniqueViolation = (error) =>
  error?.code === "23505" ||
  (
    typeof error?.message === "string" &&
    (
      error.message.includes(
        "tasks_user_canvas_assignment_unique"
      ) ||
      error.message.includes(
        "tasks_user_canvas_course_assignment_unique"
      )
    )
  );

// =========================================================
// GET /api/canvas/courses
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
    if (
      task.canvas_course_id != null &&
      task.canvas_assignment_id != null
    ) {
      const key = canvasAssignmentKey(
        task.canvas_course_id,
        task.canvas_assignment_id
      );

      importedByAssignmentId.set(key, task);
    }
  }

  const courses = listCourses().map((course) => ({
    id: course.id,
    name: course.name,

    assignments: course.assignments.map((assignment) => {
      const existingTask = importedByAssignmentId.get(
        canvasAssignmentKey(course.id, assignment.id)
      );

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
// =========================================================

const importAssignments = async (req, res) => {
  const user_id = req.user.id;
  const { assignment_ids } = req.body || {};

  const isValidIdList =
    Array.isArray(assignment_ids) &&
    assignment_ids.length > 0 &&
    assignment_ids.every(
      (value) => Number.isInteger(value) && value > 0
    );

  if (!isValidIdList) {
    return res.status(400).json({
      success: false,
      error:
        "assignment_ids must be a non-empty array of positive integers",
    });
  }

  // Remove duplicate IDs from the request.
  const uniqueIds = [...new Set(assignment_ids)];

  const { data: existingTasks, error: fetchError } =
    await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user_id);

  if (fetchError) {
    return res.status(500).json({
      success: false,
      error: fetchError.message,
    });
  }

  // Map existing Tasks using course + assignment identity.
  const existingByAssignmentId = new Map();

  for (const task of existingTasks || []) {
    if (
      task.canvas_course_id != null &&
      task.canvas_assignment_id != null
    ) {
      const key = canvasAssignmentKey(
        task.canvas_course_id,
        task.canvas_assignment_id
      );

      existingByAssignmentId.set(key, task);
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

    const canvasFields = buildCanvasOwnedFields(
      assignment,
      course
    );

    const key = canvasAssignmentKey(
      course.id,
      assignment.id
    );

    const existingTask = existingByAssignmentId.get(key);

    // =====================================================
    // NEW ASSIGNMENT
    // =====================================================

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
          const { data: raceWinner } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", user_id)
            .eq("canvas_course_id", course.id)
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

      imported.push({
        assignment_id: assignmentId,
        task: data,
      });

      existingByAssignmentId.set(key, data);

      continue;
    }

    // =====================================================
    // EXISTING ASSIGNMENT
    // =====================================================

    const changes = diffCanvasOwnedFields(
      canvasFields,
      existingTask
    );

    if (Object.keys(changes).length === 0) {
      skipped.push({
        assignment_id: assignmentId,
        reason: "unchanged",
        task_id: existingTask.id,
      });

      continue;
    }

    // Update only Canvas-owned fields.
    const { data, error } = await supabase
      .from("tasks")
      .update(changes)
      .eq("id", existingTask.id)
      .eq("user_id", user_id)
      .select()
      .maybeSingle();

    if (error || !data) {
      failed.push({
        assignment_id: assignmentId,
        reason: "update_failed",
        detail: error?.message || "Task not found.",
      });

      continue;
    }

    updated.push({
      assignment_id: assignmentId,
      task: data,
    });

    existingByAssignmentId.set(key, data);
  }

  return res.status(200).json({
    success: true,
    data: {
      imported,
      updated,
      skipped,
      failed,
    },
  });
};

module.exports = {
  getCourses,
  importAssignments,
};
