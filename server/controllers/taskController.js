const supabase = require("../config/supabase");

// Fields a client is allowed to set on a task. `id`, `user_id`, `created_at`
// and `updated_at` are server/DB-managed and never taken from the request body.
const WRITABLE_FIELDS = [
  "title",
  "description",
  "due_date",
  "point_value",
  "estimated_effort_minutes",
  "priority",
  "completion_status"
];

const pickWritableFields = (body) => {
  const fields = {};
  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
};

// GET /api/tasks
const getTasks = async (req, res) => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(200).json({ success: true, data });
};

// GET /api/tasks/:id
const getTaskById = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  if (!data) {
    return res.status(404).json({ success: false, error: "Task not found" });
  }

  res.status(200).json({ success: true, data });
};

// POST /api/tasks
// NOTE: user_id is taken from the request body for now because there's no
// auth middleware yet to derive it from a session. Once login is wired up,
// this should come from req.user.id instead of the client.
const createTask = async (req, res) => {
  const { title, user_id } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, error: "title is required" });
  }

  if (!user_id) {
    return res.status(400).json({ success: false, error: "user_id is required" });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert([{ ...pickWritableFields(req.body), user_id }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(201).json({ success: true, data });
};

// PUT /api/tasks/:id
const updateTask = async (req, res) => {
  const { id } = req.params;
  const updates = pickWritableFields(req.body);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: "Nothing to update" });
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  if (!data) {
    return res.status(404).json({ success: false, error: "Task not found" });
  }

  res.status(200).json({ success: true, data });
};

// DELETE /api/tasks/:id
const deleteTask = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  if (!data) {
    return res.status(404).json({ success: false, error: "Task not found" });
  }

  res.status(200).json({ success: true, data });
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask
};
