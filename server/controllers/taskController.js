const supabase = require("../config/supabase");


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
    fields.point_value !== null &&
    Number(fields.point_value) < 0
  ) {
    return "point_value must be nonnegative";
  }

  if (
    fields.estimated_effort_minutes !== undefined &&
    fields.estimated_effort_minutes !== null &&
    Number(fields.estimated_effort_minutes) < 0
  ) {
    return "estimated_effort_minutes must be nonnegative";
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

  const user_id =
    getRequestedUserId(req);

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
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
    !title ||
    !title.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "title is required"
    });
  }

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
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

  if (
    Object.keys(updates).length === 0
  ) {
    return res.status(400).json({
      success: false,
      error: "Nothing to update"
    });
  }

  if (
    updates.title !== undefined &&
    !updates.title.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "title cannot be empty"
    });
  }

  if (
    updates.title !== undefined
  ) {
    updates.title =
      updates.title.trim();
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

  const user_id =
    getRequestedUserId(req);

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "user_id is required"
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


module.exports = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask
};