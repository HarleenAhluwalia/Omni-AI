const supabase = require("../config/supabase");
const {
  calculateTaskPriority,
} = require("../services/priorityService");


// ---------------------------------------------------------
// Fields the frontend is allowed to write.
// id, user_id, created_at and updated_at are managed
// separately by the backend/database.
// ---------------------------------------------------------
const WRITABLE_FIELDS = [
  "title",
  "description",
  "due_date",
  "point_value",
  "estimated_effort_minutes",
  "priority",
  "completion_status"
];

const VALID_PRIORITIES = [
  "low",
  "medium",
  "high"
];

const VALID_STATUSES = [
  "not_started",
  "in_progress",
  "completed"
];


const pickWritableFields = (body) => {
  const fields = {};

  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) {
      fields[key] = body[key];
    }
  }

  return fields;
};

const isValidUuid = (value) => {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
};


// ---------------------------------------------------------
// Validate Task fields.
// ---------------------------------------------------------
const validateFields = (fields) => {
  if (
    fields.priority !== undefined &&
    fields.priority !== null &&
    !VALID_PRIORITIES.includes(
      fields.priority
    )
  ) {
    return `priority must be one of: ${VALID_PRIORITIES.join(", ")}`;
  }

  if (
    fields.completion_status !== undefined &&
    !VALID_STATUSES.includes(
      fields.completion_status
    )
  ) {
    return `completion_status must be one of: ${VALID_STATUSES.join(", ")}`;
  }

  if (
    fields.point_value !== undefined &&
    fields.point_value !== null
  ) {
    if (
      fields.point_value === "" ||
      !Number.isFinite(Number(fields.point_value))
    ) {
      return "point_value must be a number";
    }

    if (Number(fields.point_value) < 0) {
      return "point_value must be nonnegative";
    }
  }

  if (
    fields.estimated_effort_minutes !== undefined &&
    fields.estimated_effort_minutes !== null
  ) {
    const effort = Number(fields.estimated_effort_minutes);

    if (
      fields.estimated_effort_minutes === "" ||
      !Number.isFinite(effort)
    ) {
      return "estimated_effort_minutes must be a number";
    }

    if (!Number.isInteger(effort)) {
      return "estimated_effort_minutes must be an integer";
    }

    if (effort < 0) {
      return "estimated_effort_minutes must be nonnegative";
    }
  }

  if (
    fields.due_date !== undefined &&
    fields.due_date !== null &&
    fields.due_date !== ""
  ) {
    const dueDate = new Date(fields.due_date);

    if (Number.isNaN(dueDate.getTime())) {
      return "due_date must be a valid date";
    }
  }

  if (
    fields.description !== undefined &&
    fields.description !== null &&
    typeof fields.description !== "string"
  ) {
    return "description must be a string";
  }

  return null;
};


// ---------------------------------------------------------
// TEMPORARY SPRINT 1 AUTH BRIDGE
//
// Until Task CRUD uses authentication middleware directly,
// the frontend provides the user's UUID.
//
// GET/PUT/DELETE:
//     query string user_id
//
// POST:
//     request body user_id
//
// Sprint 2:
// Replace this with req.user.id.
// ---------------------------------------------------------
const getRequestedUserId = (req) =>
  req.query.user_id ||
  req.body.user_id;


// =========================================================
// READ ALL TASKS
// GET /api/tasks?user_id=<uuid>
// =========================================================
const getTasks = async (req, res) => {
  const user_id =
    getRequestedUserId(req);

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
    });
  }

  if (!isValidUuid(user_id)) {
    return res.status(400).json({
      success: false,
      error: "user_id must be a valid UUID"
    });
  }

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", {
      ascending: true
    });

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  return res.status(200).json({
    success: true,
    data
  });
};


// =========================================================
// READ ONE TASK
// GET /api/tasks/:id?user_id=<uuid>
// =========================================================
const getTaskById = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "task id must be a valid UUID"
    });
  }

  const user_id =
    getRequestedUserId(req);

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
    });
  }

  if (!isValidUuid(user_id)) {
    return res.status(400).json({
      success: false,
      error: "user_id must be a valid UUID"
    });
  }

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      error: "Task not found"
    });
  }

  return res.status(200).json({
    success: true,
    data
  });
};


// =========================================================
// CREATE TASK
// POST /api/tasks
// =========================================================
const createTask = async (req, res) => {
  const { title } = req.body;

  const user_id =
    getRequestedUserId(req);

  if (
    typeof title !== "string" ||
    !title.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "title must be a non-empty string"
    });
  }

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
    });
  }

  if (!isValidUuid(user_id)) {
    return res.status(400).json({
      success: false,
      error: "user_id must be a valid UUID"
    });
  }

  const fields =
    pickWritableFields(req.body);

  const validationError =
    validateFields(fields);

  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError
    });
  }

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .insert([
      {
        ...fields,
        title: title.trim(),
        user_id
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  return res.status(201).json({
    success: true,
    data
  });
};


// =========================================================
// UPDATE TASK
// PUT /api/tasks/:id?user_id=<uuid>
// =========================================================
const updateTask = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "task id must be a valid UUID"
    });
  }

  const user_id =
    getRequestedUserId(req);

  const updates =
    pickWritableFields(req.body);

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
    });
  }

  if (!isValidUuid(user_id)) {
    return res.status(400).json({
      success: false,
      error: "user_id must be a valid UUID"
    });
  }

  if (
    Object.keys(updates).length === 0
  ) {
    return res.status(400).json({
      success: false,
      error: "Nothing to update"
    });
  }

  if (updates.title !== undefined) {
    if (
      typeof updates.title !== "string" ||
      !updates.title.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "title must be a non-empty string"
      });
    }

    updates.title = updates.title.trim();
  }

  const validationError =
    validateFields(updates);

  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError
    });
  }

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      error: "Task not found"
    });
  }

  return res.status(200).json({
    success: true,
    data
  });
};


// =========================================================
// DELETE TASK
// DELETE /api/tasks/:id?user_id=<uuid>
// =========================================================
const deleteTask = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "task id must be a valid UUID"
    });
  }

  const user_id =
    getRequestedUserId(req);

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
    });
  }

  if (!isValidUuid(user_id)) {
    return res.status(400).json({
      success: false,
      error: "user_id must be a valid UUID"
    });
  }

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      error: "Task not found"
    });
  }

  return res.status(200).json({
    success: true,
    data
  });
};

const getPrioritizedTasks = async (req, res) => {
  const user_id = req.query.user_id;
  const availableMinutes = Number(
    req.query.available_minutes ?? 120
  );

  if (
    !Number.isFinite(availableMinutes) ||
    availableMinutes < 0
  ) {
    return res.status(400).json({
      success: false,
      error: "available_minutes must be a nonnegative number",
    });
  }

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required",
    });
  }

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

    const prioritizedTasks = (data || []).map((task) => {
      const priorityResult = calculateTaskPriority(
        task,
        availableMinutes
      );

      return {
        ...task,
        calculated_priority_score: priorityResult.score,
        priority_breakdown: priorityResult.breakdown,
      };
    });

    const sortedTasks = [...prioritizedTasks].sort((a, b) => {
      const aCompleted =
        a.completion_status === "completed";

      const bCompleted =
        b.completion_status === "completed";

      // Active tasks before completed tasks.
      if (aCompleted !== bCompleted) {
        return aCompleted ? 1 : -1;
      }

      // Higher calculated priority score first.
      const scoreDifference =
        b.calculated_priority_score -
        a.calculated_priority_score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      // If scores are tied, earlier deadline first.
      if (a.due_date && b.due_date) {
        const dueDifference =
          new Date(a.due_date) -
          new Date(b.due_date);

        if (dueDifference !== 0) {
          return dueDifference;
        }
      }

      if (a.due_date && !b.due_date) {
        return -1;
      }

      if (!a.due_date && b.due_date) {
        return 1;
      }

      return 0;
    });

    return res.status(200).json({
      success: true,
      data: sortedTasks,
    });
  } catch (error) {
    console.error(
      "Prioritized task retrieval failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Could not load prioritized tasks.",
    });
  }
};

module.exports = {
  getTasks,
  getTaskById,
  getPrioritizedTasks,
  createTask,
  updateTask,
  deleteTask
};