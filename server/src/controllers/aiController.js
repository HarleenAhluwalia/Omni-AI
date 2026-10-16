const { askAI } = require("../../services/aiService");
const supabase = require("../../config/supabase");

const {
  calculateTaskPriority,
} = require("../../services/priorityService");

// Adjust these statuses if your Task Management backend
// uses a different value for completed tasks.
function isCompletedTask(task) {
  const status = String(
    task.completion_status ?? ""
  ).trim().toLowerCase();

  return ["completed", "complete", "done"].includes(status);
}

function isValidDate(value) {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function getAuthenticatedUserId(req) {
  return (
    req.user?.id ||
    req.user?.user_id ||
    req.auth?.userId ||
    req.auth?.user_id ||
    null
  );
}

const chat = async (req, res) => {
  const {
    message,
    response_mode = "text",
    schedule_start_time,
    available_minutes = 120,
  } = req.body || {};

  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Authentication required.",
    });
  }

  if (
    typeof message !== "string" ||
    !message.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "message is required",
    });
  }

  if (!["text", "schedule"].includes(response_mode)) {
    return res.status(400).json({
      success: false,
      error: "response_mode must be text or schedule",
    });
  }

  const availableMinutes = Number(available_minutes);

  if (
    !Number.isSafeInteger(availableMinutes) ||
    availableMinutes < 0
  ) {
    return res.status(400).json({
      success: false,
      error: "available_minutes must be a nonnegative integer",
    });
  }

  let scheduleStartDate = null;

  if (response_mode === "schedule") {
    if (!isValidDate(schedule_start_time)) {
      return res.status(400).json({
        success: false,
        error: "A valid schedule_start_time is required.",
      });
    }

    scheduleStartDate = new Date(schedule_start_time);
  }

  try {
    const {
      data: tasks,
      error: taskError,
    } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        due_date,
        priority,
        point_value,
        estimated_effort_minutes,
        completion_status
      `)
      .eq("user_id", userId);

    if (taskError) {
      throw new Error(taskError.message);
    }

    const allTasks = tasks || [];

    // Only incomplete tasks may be scheduled.
    const incompleteTasks = allTasks.filter(
      (task) => !isCompletedTask(task)
    );

    const prioritizedTasks = incompleteTasks.map((task) => {
      const result = calculateTaskPriority(
        task,
        availableMinutes
      );

      return {
        ...task,
        calculated_priority_score: result.score,
        priority_breakdown: result.breakdown,
      };
    });

    // Return a usable result without calling the AI when
    // there is nothing that can be scheduled.
    if (
      response_mode === "schedule" &&
      (prioritizedTasks.length === 0 || availableMinutes === 0)
    ) {
      return res.status(200).json({
        success: true,
        data: {
          response: {
            message:
              prioritizedTasks.length === 0
                ? "You have no incomplete tasks to schedule."
                : "No study time is available.",
            schedule: [],
          },
          schedules: [],
        },
      });
    }

    const response = await askAI(
      message.trim(),
      prioritizedTasks,
      availableMinutes,
      response_mode
    );

    if (response_mode === "text") {
      return res.status(200).json({
        success: true,
        data: {
          response,
          schedules: [],
        },
      });
    }

    if (
      !response ||
      typeof response !== "object" ||
      !Array.isArray(response.schedule)
    ) {
      throw new Error("AI returned an invalid schedule.");
    }

    const taskMap = new Map(
      prioritizedTasks.map((task) => [
        String(task.id),
        task,
      ])
    );

    const usedTaskIds = new Set();
    let totalAllocatedMinutes = 0;

    for (const item of response.schedule) {
      if (!item || typeof item !== "object") {
        throw new Error("Invalid schedule item.");
      }

      const taskId = String(item.task_id);
      const task = taskMap.get(taskId);

      if (!task) {
        throw new Error(
          "AI returned a task ID that does not belong to an incomplete task."
        );
      }

      if (usedTaskIds.has(taskId)) {
        throw new Error(
          "AI returned duplicate schedule entries for a task."
        );
      }

      usedTaskIds.add(taskId);

      if (
        !Number.isSafeInteger(item.allocated_minutes) ||
        item.allocated_minutes <= 0
      ) {
        throw new Error(
          "AI returned an invalid allocated_minutes value."
        );
      }

      const estimatedEffort =
        task.estimated_effort_minutes == null
          ? null
          : Number(task.estimated_effort_minutes);

      if (
        estimatedEffort !== null &&
        Number.isFinite(estimatedEffort) &&
        estimatedEffort >= 0 &&
        item.allocated_minutes > estimatedEffort
      ) {
        throw new Error(
          `AI allocated more time than estimated for ${task.title}.`
        );
      }

      totalAllocatedMinutes += item.allocated_minutes;
    }

    if (totalAllocatedMinutes > availableMinutes) {
      throw new Error(
        "AI schedule exceeds the available study time."
      );
    }

    const scheduleRows = [];
    let currentStart = new Date(scheduleStartDate);

    for (const item of response.schedule) {
      const startTime = new Date(currentStart);

      const endTime = new Date(
        startTime.getTime() +
          item.allocated_minutes * 60 * 1000
      );

      const task = taskMap.get(String(item.task_id));

      scheduleRows.push({
        user_id: userId,
        task_id: task.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        schedule_type: "study_block",
        status: "scheduled",
      });

      currentStart = endTime;
    }

    let savedSchedules = [];

    if (scheduleRows.length > 0) {
      const {
        data: insertedSchedules,
        error: scheduleError,
      } = await supabase
        .from("schedules")
        .insert(scheduleRows)
        .select();

      if (scheduleError) {
        throw new Error(scheduleError.message);
      }

      savedSchedules = insertedSchedules || [];
    }

    // Include the task title and allocation in the response
    // so the frontend can show an understandable schedule.
    const displaySchedules = savedSchedules.map((row) => {
      const task = taskMap.get(String(row.task_id));

      return {
        ...row,
        task_title: task?.title || "Untitled Task",
        allocated_minutes: Math.round(
          (
            new Date(row.end_time).getTime() -
            new Date(row.start_time).getTime()
          ) / 60000
        ),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        response: {
          message:
            typeof response.message === "string"
              ? response.message
              : "Your study schedule has been generated.",
          schedule: response.schedule,
        },
        schedules: displaySchedules,
      },
    });
  } catch (error) {
    console.error("AI request failed:", error);

    return res.status(500).json({
      success: false,
      error: "Could not generate AI response.",
    });
  }
};

module.exports = {
  chat,
};
