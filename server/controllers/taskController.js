const supabase = require("../config/supabase");
const {
  calculateTaskPriority,
} = require("../services/priorityService");
const {
  resolveAndReschedule,
} = require("../services/schedulingService");


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


// =========================================================
// READ ALL TASKS
// GET /api/tasks
// (requireAuth populates req.user.id)
// =========================================================
const getTasks = async (req, res) => {
  const user_id = req.user.id;

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
// GET /api/tasks/:id
// =========================================================
const getTaskById = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "task id must be a valid UUID"
    });
  }

  const user_id = req.user.id;

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

  const user_id = req.user.id;

  if (
    typeof title !== "string" ||
    !title.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "title must be a non-empty string"
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
// PUT /api/tasks/:id
// =========================================================
const updateTask = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "task id must be a valid UUID"
    });
  }

  const user_id = req.user.id;

  const updates =
    pickWritableFields(req.body);

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
// DELETE /api/tasks/:id
// =========================================================
const deleteTask = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "task id must be a valid UUID"
    });
  }

  const user_id = req.user.id;

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
  const user_id = req.user.id;
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

// =========================================================
// RESOLVE SCHEDULING CONFLICT
// POST /api/tasks/resolve-schedule
// =========================================================
const resolveSchedule = async (req, res) => {
  try {
    const {
      taskA,
      taskB,
      scheduledTasks,
      availableMinutes = 60,
      incrementMinutes = 30,
    } = req.body;

    if (!taskA || !taskB) {
      return res.status(400).json({
        success: false,
        error: "taskA and taskB are required",
      });
    }

    if (!Array.isArray(scheduledTasks)) {
      return res.status(400).json({
        success: false,
        error: "scheduledTasks must be an array",
      });
    }

    if (
      !taskA.start_time ||
      !taskA.end_time ||
      !taskB.start_time ||
      !taskB.end_time
    ) {
      return res.status(400).json({
        success: false,
        error:
          "taskA and taskB must include start_time and end_time",
      });
    }

    const available = Number(availableMinutes);
    const increment = Number(incrementMinutes);

    if (
      !Number.isFinite(available) ||
      available < 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "availableMinutes must be a nonnegative number",
      });
    }

    if (
      !Number.isFinite(increment) ||
      increment <= 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "incrementMinutes must be greater than 0",
      });
    }

    const result = resolveAndReschedule(
      taskA,
      taskB,
      scheduledTasks,
      available,
      increment
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "Schedule resolution failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Could not resolve scheduling conflict.",
    });
  }
};

// ---------------------------------------------------------
// Daily Summary helpers.
//
// "Today" is the current UTC calendar date, and due_date is compared
// by its UTC calendar date rather than its exact timestamp - Tasks
// are day-granularity even though due_date is a timestamptz (the
// frontend always writes end-of-day). Using UTC consistently avoids
// the summary's classification depending on the server/CI runner's
// local timezone.
//
// Known limitation: due_date is written as "end of the browser's
// local day, converted to UTC," so a user in a timezone behind UTC
// can have a task due "today" by their own clock land on tomorrow's
// UTC date. This will need real per-user timezone support to fix;
// out of scope for this first Sprint 2 version.
// ---------------------------------------------------------
const toUtcDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
};

const toSummaryItem = (task) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  due_date: task.due_date,
  priority: task.priority,
  point_value: task.point_value,
  estimated_effort_minutes: task.estimated_effort_minutes,
  completion_status: task.completion_status,
});

const byDueDateAscending = (a, b) =>
  new Date(a.due_date) - new Date(b.due_date);


// =========================================================
// DAILY SUMMARY
// GET /api/tasks/summary/daily
// (requireAuth populates req.user.id)
// =========================================================
const getDailySummary = async (req, res) => {
  const user_id = req.user.id;

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user_id);

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  const tasks = data || [];

  const now = new Date();
  const todayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const todayDateString = new Date(todayUtcMs)
    .toISOString()
    .slice(0, 10);

  const dueToday = [];
  const overdue = [];
  const upcoming = [];

  let completedCount = 0;
  let highPriorityCount = 0;

  for (const task of tasks) {
    const isCompleted = task.completion_status === "completed";

    if (isCompleted) {
      completedCount += 1;
    }

    if (!isCompleted && task.priority === "high") {
      highPriorityCount += 1;
    }

    // dueToday/overdue/upcoming only ever hold incomplete tasks -
    // a completed task is tracked via counts.completed instead, so
    // it can never be misreported as overdue.
    if (isCompleted) {
      continue;
    }

    const dueDateUtcMs = toUtcDateOnly(task.due_date);

    if (dueDateUtcMs === null) {
      continue;
    }

    if (dueDateUtcMs === todayUtcMs) {
      dueToday.push(task);
    } else if (dueDateUtcMs < todayUtcMs) {
      overdue.push(task);
    } else {
      upcoming.push(task);
    }
  }

  dueToday.sort(byDueDateAscending);
  overdue.sort(byDueDateAscending);
  upcoming.sort(byDueDateAscending);

  return res.status(200).json({
    success: true,
    data: {
      date: todayDateString,
      counts: {
        dueToday: dueToday.length,
        overdue: overdue.length,
        completed: completedCount,
        highPriority: highPriorityCount,
        total: tasks.length,
      },
      dueToday: dueToday.map(toSummaryItem),
      overdue: overdue.map(toSummaryItem),
      upcoming: upcoming.slice(0, 5).map(toSummaryItem),
    },
  });
};


// ---------------------------------------------------------
// Weekly Summary helpers.
//
// Week = Monday through Sunday, UTC - matching Daily Summary's UTC
// "today" so both summaries share one consistent, deterministic time
// definition. Inherits the same day-boundary caveat documented above
// getDailySummary for users in timezones behind UTC.
// ---------------------------------------------------------
const getUtcWeekStart = (date) => {
  const utcDayOfWeek = date.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const daysSinceMonday = (utcDayOfWeek + 6) % 7;

  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday
  );
};

const sumField = (tasks, field) =>
  tasks.reduce(
    (total, task) => total + (Number(task[field]) || 0),
    0
  );


// =========================================================
// WEEKLY SUMMARY
// GET /api/tasks/summary/weekly
// (requireAuth populates req.user.id)
// =========================================================
const getWeeklySummary = async (req, res) => {
  const user_id = req.user.id;

  const {
    data,
    error
  } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user_id);

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  const allTasks = data || [];

  const now = new Date();
  const todayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  const weekStartMs = getUtcWeekStart(now);
  const weekEndExclusiveMs =
    weekStartMs + 7 * 24 * 60 * 60 * 1000;
  const weekEndMs = weekEndExclusiveMs - 24 * 60 * 60 * 1000;

  const weekStartDateString = new Date(weekStartMs)
    .toISOString()
    .slice(0, 10);
  const weekEndDateString = new Date(weekEndMs)
    .toISOString()
    .slice(0, 10);

  const tasksThisWeek = [];
  const overdue = [];

  for (const task of allTasks) {
    const isCompleted = task.completion_status === "completed";
    const dueDateUtcMs = toUtcDateOnly(task.due_date);

    if (dueDateUtcMs === null) {
      continue;
    }

    if (
      dueDateUtcMs >= weekStartMs &&
      dueDateUtcMs < weekEndExclusiveMs
    ) {
      tasksThisWeek.push(task);
    }

    if (!isCompleted && dueDateUtcMs < todayUtcMs) {
      overdue.push(task);
    }
  }

  tasksThisWeek.sort(byDueDateAscending);
  overdue.sort(byDueDateAscending);

  const completedTasks = tasksThisWeek.filter(
    (task) => task.completion_status === "completed"
  );
  const incompleteTasks = tasksThisWeek.filter(
    (task) => task.completion_status !== "completed"
  );

  const total = tasksThisWeek.length;
  const completed = completedTasks.length;
  const remaining = total - completed;

  const completionPercentage =
    total === 0
      ? 0
      : Math.round((completed / total) * 100);

  return res.status(200).json({
    success: true,
    data: {
      week: {
        start: weekStartDateString,
        end: weekEndDateString,
      },
      counts: {
        total,
        completed,
        remaining,
        overdue: overdue.length,
      },
      workload: {
        totalEffortMinutes: sumField(
          tasksThisWeek,
          "estimated_effort_minutes"
        ),
        completedEffortMinutes: sumField(
          completedTasks,
          "estimated_effort_minutes"
        ),
        remainingEffortMinutes: sumField(
          incompleteTasks,
          "estimated_effort_minutes"
        ),
        totalPoints: sumField(tasksThisWeek, "point_value"),
        completedPoints: sumField(completedTasks, "point_value"),
        remainingPoints: sumField(incompleteTasks, "point_value"),
      },
      completionPercentage,
      tasks: tasksThisWeek.map(toSummaryItem),
      overdue: overdue.map(toSummaryItem),
    },
  });
};


module.exports = {
  getTasks,
  getTaskById,
  getPrioritizedTasks,
  getDailySummary,
  getWeeklySummary,
  createTask,
  updateTask,
  deleteTask,
  resolveSchedule,
};