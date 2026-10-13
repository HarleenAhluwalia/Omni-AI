
const supabase = require("../../config/supabase");

const {
  listCourses,
  findAssignmentById,
  findAssignmentByCourseAndId,
} = require("../../services/canvasService");

// Canvas is allowed to update only these fields.
// Never overwrite user-managed task settings.
const CANVAS_OWNED_KEYS = [
  "title",
  "due_date",
  "point_value",
  "canvas_course_id",
  "canvas_locked",
];

// Composite assignment identity matches the Supabase unique index.
const canvasAssignmentKey = (courseId, assignmentId) =>
  `${courseId}:${assignmentId}`;

// Convert Canvas dates to end-of-day UTC.
const toIsoDueDate = (dueDate) => {
  if (!dueDate) {
    return null;
  }

  return new Date(`${dueDate}T23:59:59.000Z`).toISOString();
};

// Convert Canvas assignment data into Task fields.
const buildCanvasOwnedFields = (assignment, course) => ({
  title: assignment.title,
  due_date: toIsoDueDate(assignment.dueDate),
  point_value: assignment.points ?? null,
  canvas_assignment_id: assignment.id,
  canvas_course_id: course.id,
  canvas_locked: assignment.locked === true,
});

// Compare values without treating numeric strings as changes.
const valuesEqual = (key, next, current) => {
  if (next === current) {
    return true;
  }

  if (next == null && current == null) {
    return true;
  }

  if (
    key === "point_value" &&
    next != null &&
    current != null
  ) {
    return Number(next) === Number(current);
  }

  return false;
};

// Only synchronize fields owned by Canvas.
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

// Handle Postgres unique-constraint violations.
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

// Find an assignment by ID only when its ID is unambiguous.
// This keeps legacy requests compatible while preventing
// the wrong course from being selected.
const findLegacyAssignment = (assignmentId) => {
  const matches = [];

  for (const course of listCourses()) {
    for (const assignment of course.assignments) {
      if (assignment.id === assignmentId) {
        matches.push({
          course,
          assignment,
        });
      }
    }
  }

  if (matches.length > 1) {
    return {
      ambiguous: true,
      found: null,
    };
  }

  return {
    ambiguous: false,
    found:
      matches.length === 1
        ? findAssignmentById(assignmentId)
        : null,
  };
};

// =========================================================
// GET /api/canvas/courses
// =========================================================

const getCourses = async (req, res) => {
  const user_id = req.user.id;

  try {
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
          task_id: existingTask?.id ?? null,
        };
      }),
    }));

    return res.status(200).json({
      success: true,
      data: { courses },
    });
  } catch (error) {
    console.error("Canvas course retrieval failed:", error);

    return res.status(500).json({
      success: false,
      error: "Could not retrieve Canvas courses.",
    });
  }
};

// =========================================================
// POST /api/canvas/import
//
// Legacy format:
// { assignment_ids: [101, 201] }
//
// Course-aware format:
// {
//   assignments: [
//     { course_id: 1, assignment_id: 101 }
//   ]
// }
// =========================================================

const importAssignments = async (req, res) => {
  const user_id = req.user.id;

  const { assignment_ids, assignments } = req.body || {};

  const courseAware = assignments !== undefined;

  let requestedAssignments = [];

  // Validate and normalize incoming requests.
  if (courseAware) {
    const valid =
      Array.isArray(assignments) &&
      assignments.length > 0 &&
      assignments.every(
        (item) =>
          item &&
          Number.isInteger(item.course_id) &&
          item.course_id > 0 &&
          Number.isInteger(item.assignment_id) &&
          item.assignment_id > 0
      );

    if (!valid) {
      return res.status(400).json({
        success: false,
        error:
          "assignments must contain positive integer course_id and assignment_id values",
      });
    }

    requestedAssignments = assignments.map((item) => ({
      course_id: item.course_id,
      assignment_id: item.assignment_id,
    }));
  } else {
    const valid =
      Array.isArray(assignment_ids) &&
      assignment_ids.length > 0 &&
      assignment_ids.every(
        (id) => Number.isInteger(id) && id > 0
      );

    if (!valid) {
      return res.status(400).json({
        success: false,
        error:
          "assignment_ids must be a non-empty array of positive integers",
      });
    }

    requestedAssignments = assignment_ids.map((id) => ({
      course_id: null,
      assignment_id: id,
    }));
  }

  // Remove duplicate references within the same request.
  const seen = new Set();

  requestedAssignments = requestedAssignments.filter((item) => {
    const key = canvasAssignmentKey(
      item.course_id ?? "legacy",
      item.assignment_id
    );

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  try {
    // Retrieve Tasks belonging only to the authenticated user.
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

    const existingByAssignmentId = new Map();

    for (const task of existingTasks || []) {
      if (
        task.canvas_course_id != null &&
        task.canvas_assignment_id != null
      ) {
        existingByAssignmentId.set(
          canvasAssignmentKey(
            task.canvas_course_id,
            task.canvas_assignment_id
          ),
          task
        );
      }
    }

    const imported = [];
    const updated = [];
    const skipped = [];
    const failed = [];

    for (const requested of requestedAssignments) {
      const assignmentId = requested.assignment_id;

      let found;

      if (requested.course_id != null) {
        found = findAssignmentByCourseAndId(
          requested.course_id,
          assignmentId
        );
      } else {
        const legacyResult = findLegacyAssignment(assignmentId);

        if (legacyResult.ambiguous) {
          failed.push({
            assignment_id: assignmentId,
            reason: "ambiguous_assignment_id",
          });

          continue;
        }

        found = legacyResult.found;
      }

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

      // ---------------------------------------------
      // NEW ASSIGNMENT
      // ---------------------------------------------
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
            // A concurrent import may have inserted
            // the same assignment first.
            const { data: raceWinner, error: raceError } =
              await supabase
                .from("tasks")
                .select("*")
                .eq("user_id", user_id)
                .eq("canvas_course_id", course.id)
                .eq("canvas_assignment_id", assignment.id)
                .maybeSingle();

            if (raceError) {
              failed.push({
                assignment_id: assignmentId,
                reason: "duplicate_lookup_failed",
                detail: raceError.message,
              });

              continue;
            }

            skipped.push({
              assignment_id: assignmentId,
              reason: "already_imported",
              task_id: raceWinner?.id ?? null,
            });

            if (raceWinner) {
              existingByAssignmentId.set(key, raceWinner);
            }

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

      // ---------------------------------------------
      // EXISTING ASSIGNMENT
      // ---------------------------------------------
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
  } catch (error) {
    console.error("Canvas synchronization failed:", error);

    return res.status(500).json({
      success: false,
      error: "Could not synchronize Canvas assignments.",
    });
  }
};

module.exports = {
  getCourses,
  importAssignments,
};
