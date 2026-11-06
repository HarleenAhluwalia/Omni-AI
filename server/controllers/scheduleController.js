const supabase = require("../config/supabase");
const {
  resolveAndReschedule,
} = require("../services/schedulingService");

const isValidUuid = (value) => {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
};


// =========================================================
// READ ALL SCHEDULES FOR THE AUTHENTICATED USER
// GET /api/schedules
// =========================================================
const getSchedules = async (req, res) => {
  // CC6.3 remediation: user_id now comes exclusively from the verified
  // token (requireAuth), never from a client-supplied query parameter -
  // see docs/security/sprint-4/cc63-authorization-review.md.
  const user_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from("schedules")
      .select(`
        *,
        tasks (
          id,
          title,
          description,
          due_date,
          priority,
          point_value,
          estimated_effort_minutes,
          completion_status
        )
      `)
      .eq("user_id", user_id)
      .order("start_time", {
        ascending: true,
      });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error(
      "Schedule retrieval failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Could not load schedules.",
    });
  }
};


// =========================================================
// CREATE SCHEDULE
// POST /api/schedules
// =========================================================
const createSchedule = async (req, res) => {
  // CC6.3 remediation: user_id comes from the verified token, never
  // from the request body - a client can no longer attribute a
  // schedule to any user they choose.
  const user_id = req.user.id;

  const {
    task_id = null,
    start_time,
    end_time,
    schedule_type = "study_block",
    status = "scheduled",
  } = req.body;

  if (
    task_id !== null &&
    !isValidUuid(task_id)
  ) {
    return res.status(400).json({
      success: false,
      error: "task_id must be a valid UUID",
    });
  }

  if (!start_time || !end_time) {
    return res.status(400).json({
      success: false,
      error: "start_time and end_time are required",
    });
  }

  const startDate = new Date(start_time);
  const endDate = new Date(end_time);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return res.status(400).json({
      success: false,
      error:
        "start_time and end_time must be valid dates",
    });
  }

  if (endDate <= startDate) {
    return res.status(400).json({
      success: false,
      error:
        "end_time must be after start_time",
    });
  }

  try {
    // CC6.3: a schedule's task_id is embedded (joined) back into Task
    // fields on every GET /api/schedules response - linking to a task_id
    // the caller doesn't own would let them read another user's Task
    // title/description/due_date/priority/effort/completion_status
    // through their own schedule list. Confirmed the same ownership
    // check this codebase already uses elsewhere (.eq("user_id", ...)).
    if (task_id !== null) {
      const { data: ownedTask, error: taskLookupError } = await supabase
        .from("tasks")
        .select("id")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (taskLookupError) {
        return res.status(500).json({
          success: false,
          error: taskLookupError.message,
        });
      }

      if (!ownedTask) {
        // Never distinguishes "doesn't exist" from "belongs to someone
        // else" - same reasoning as taskController.js's 404s.
        return res.status(400).json({
          success: false,
          error: "task_id must reference a task you own",
        });
      }
    }

    const { data, error } = await supabase
      .from("schedules")
      .insert([
        {
          user_id,
          task_id,
          start_time,
          end_time,
          schedule_type,
          status,
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Schedule creation failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Could not create schedule.",
    });
  }
};


// =========================================================
// UPDATE SCHEDULE
// PUT /api/schedules/:id
// =========================================================
const updateSchedule = async (req, res) => {
  const { id } = req.params;
  // CC6.3 remediation: user_id comes from the verified token, never
  // from a client-supplied query parameter. The .eq("user_id", user_id)
  // filter below means a schedule id belonging to another user now
  // resolves to 404 ("not found"), the same ownership-scoping pattern
  // taskController.js already uses - never a 403 that would confirm
  // the record exists under someone else's account.
  const user_id = req.user.id;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: "schedule id must be a valid UUID",
    });
  }

  const allowedFields = [
    "task_id",
    "start_time",
    "end_time",
    "schedule_type",
    "status",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: "Nothing to update",
    });
  }

  if (
    updates.task_id !== undefined &&
    updates.task_id !== null &&
    !isValidUuid(updates.task_id)
  ) {
    return res.status(400).json({
      success: false,
      error: "task_id must be a valid UUID",
    });
  }

  if (updates.start_time !== undefined) {
    const startDate =
      new Date(updates.start_time);

    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        error:
          "start_time must be a valid date",
      });
    }
  }

  if (updates.end_time !== undefined) {
    const endDate =
      new Date(updates.end_time);

    if (Number.isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        error:
          "end_time must be a valid date",
      });
    }
  }

  try {
    // CC6.3: same task_id ownership check as createSchedule - a client
    // could otherwise re-point an existing schedule at a task they
    // don't own and read its fields back through the embedded join.
    if (updates.task_id !== undefined && updates.task_id !== null) {
      const { data: ownedTask, error: taskLookupError } = await supabase
        .from("tasks")
        .select("id")
        .eq("id", updates.task_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (taskLookupError) {
        return res.status(500).json({
          success: false,
          error: taskLookupError.message,
        });
      }

      if (!ownedTask) {
        return res.status(400).json({
          success: false,
          error: "task_id must reference a task you own",
        });
      }
    }

    const { data, error } = await supabase
      .from("schedules")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user_id)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Schedule update failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Could not update schedule.",
    });
  }
};

// =========================================================
// RESOLVE AND PERSIST SCHEDULE CONFLICT
// POST /api/schedules/resolve-conflict
// =========================================================
const resolveScheduleConflict = async (req, res) => {
  // CC6.3 remediation: user_id comes from the verified token, never
  // from the request body. Every schedule loaded below is already
  // scoped to this user (.eq("user_id", user_id)), so schedule_a_id/
  // schedule_b_id can only ever resolve to this user's own records -
  // a client can no longer act on another user's schedules by simply
  // supplying their id.
  const user_id = req.user.id;

  const {
    schedule_a_id,
    schedule_b_id,
    available_minutes = 60,
    increment_minutes = 30,
  } = req.body;

  if (
    !schedule_a_id ||
    !schedule_b_id
  ) {
    return res.status(400).json({
      success: false,
      error:
        "schedule_a_id and schedule_b_id are required",
    });
  }

  if (
    !isValidUuid(schedule_a_id) ||
    !isValidUuid(schedule_b_id)
  ) {
    return res.status(400).json({
      success: false,
      error: "All IDs must be valid UUIDs",
    });
  }

  try {
    // Load every schedule for this user so the adaptive
    // scheduler can avoid creating a new conflict.
    const {
      data: schedules,
      error: schedulesError,
    } = await supabase
      .from("schedules")
      .select(`
        *,
        tasks (
          id,
          title,
          due_date,
          priority,
          point_value,
          estimated_effort_minutes,
          completion_status
        )
      `)
      .eq("user_id", user_id)
      .order("start_time", {
        ascending: true,
      });

    if (schedulesError) {
      return res.status(500).json({
        success: false,
        error: schedulesError.message,
      });
    }

    const scheduleA = schedules.find(
      (schedule) =>
        schedule.id === schedule_a_id
    );

    const scheduleB = schedules.find(
      (schedule) =>
        schedule.id === schedule_b_id
    );

    if (!scheduleA || !scheduleB) {
      return res.status(404).json({
        success: false,
        error:
          "One or both schedule entries were not found",
      });
    }

    // Convert database schedule rows into the structure
    // expected by schedulingService.
    const toSchedulingTask = (schedule) => ({
      id: schedule.id,
      task_id: schedule.task_id,
      title:
        schedule.tasks?.title ||
        "Scheduled block",

      start_time: schedule.start_time,
      end_time: schedule.end_time,

      due_date:
        schedule.tasks?.due_date || null,

      priority:
        schedule.tasks?.priority || null,

      point_value:
        schedule.tasks?.point_value || null,

      estimated_effort_minutes:
        schedule.tasks
          ?.estimated_effort_minutes || null,
    });

    const taskA =
      toSchedulingTask(scheduleA);

    const taskB =
      toSchedulingTask(scheduleB);

    const scheduledTasks =
      schedules.map(toSchedulingTask);

    const result = resolveAndReschedule(
      taskA,
      taskB,
      scheduledTasks,
      Number(available_minutes),
      Number(increment_minutes)
    );

    if (!result.conflict) {
      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    if (!result.rescheduledTask) {
      return res.status(409).json({
        success: false,
        error:
          "Conflict detected but no available slot was found",
        data: result,
      });
    }

    // The scheduling-service id represents the schedule ID,
    // so update that schedule row in Supabase.
    const {
      data: updatedSchedule,
      error: updateError,
    } = await supabase
      .from("schedules")
      .update({
        start_time:
          result.rescheduledTask.start_time,
        end_time:
          result.rescheduledTask.end_time,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        result.originalMoveTask.id
      )
      .eq("user_id", user_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        updatedSchedule,
      },
    });
  } catch (error) {
    console.error(
      "Schedule conflict resolution failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Could not resolve schedule conflict.",
    });
  }
};

module.exports = {
  getSchedules,
  createSchedule,
  updateSchedule,
  resolveScheduleConflict,
};