
/**
 * Omni AI — AI Controller
 *
 * Sprint 5 Updates — Harleen
 *
 * SCRUM-141:
 * Improve backend AI response handling.
 *
 * SCRUM-142:
 * Support regression testing after improvements.
 *
 * Improvements:
 * - Detect AI provider timeouts.
 * - Return HTTP 504 for timeout errors.
 * - Return HTTP 500 for other backend failures.
 * - Avoid exposing raw error details to clients.
 * - Preserve existing scheduling and validation logic.
 */

const { askAI } = require("../../services/aiService");
const supabase = require("../../config/supabase");

const {
  calculateTaskPriority,
} = require("../../services/priorityService");

/**
 * Determine whether a task is completed.
 */
function isCompletedTask(task) {
  const status = String(
    task.completion_status ?? ""
  )
    .trim()
    .toLowerCase();

  return ["completed", "complete", "done"].includes(status);
}

/**
 * Validate a date string.
 */
function isValidDate(value) {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(new Date(value).getTime())
  );
}

/**
 * Retrieve the authenticated user ID.
 */
function getAuthenticatedUserId(req) {
  return (
    req.user?.id ||
    req.user?.user_id ||
    req.auth?.userId ||
    req.auth?.user_id ||
    null
  );
}

/**
 * SCRUM-141
 *
 * Identify known AI provider timeout errors.
 *
 * Anthropic SDK and network timeout errors
 * can have different names or error codes.
 */
function isAiTimeout(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = String(
    error.code || ""
  ).toUpperCase();

  const name = String(
    error.name || ""
  ).toLowerCase();

  const status = Number(error.status);

  return (
    name === "apitimeouterror" ||
    name === "timeouterror" ||
    name === "aborterror" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    status === 408 ||
    status === 504
  );
}

/**
 * AI Chat Controller
 */
const chat = async (req, res) => {
  const {
    message,
    response_mode = "text",
    schedule_start_time,
    available_minutes = 120,
  } = req.body || {};

  const userId = getAuthenticatedUserId(req);

  /**
   * Authentication validation
   */
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Authentication required.",
    });
  }

  /**
   * Message validation
   */
  if (
    typeof message !== "string" ||
    !message.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "message is required",
    });
  }

  /**
   * Response mode validation
   */
  if (!["text", "schedule"].includes(response_mode)) {
    return res.status(400).json({
      success: false,
      error: "response_mode must be text or schedule",
    });
  }

  /**
   * Available study time validation
   */
  const availableMinutes = Number(available_minutes);

  if (
    !Number.isSafeInteger(availableMinutes) ||
    availableMinutes < 0
  ) {
    return res.status(400).json({
      success: false,
      error:
        "available_minutes must be a nonnegative integer",
    });
  }

  let scheduleStartDate = null;

  /**
   * Schedule start time validation
   */
  if (response_mode === "schedule") {
    if (!isValidDate(schedule_start_time)) {
      return res.status(400).json({
        success: false,
        error:
          "A valid schedule_start_time is required.",
      });
    }

    scheduleStartDate = new Date(schedule_start_time);
  }

  try {
    /**
     * Load the authenticated user's tasks.
     */
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

    /**
     * Exclude completed tasks.
     */
    const incompleteTasks = allTasks.filter(
      (task) => !isCompletedTask(task)
    );

    /**
     * Calculate priority scores.
     */
    const prioritizedTasks = incompleteTasks.map(
      (task) => {
        const result = calculateTaskPriority(
          task,
          availableMinutes
        );

        return {
          ...task,
          calculated_priority_score: result.score,
          priority_breakdown: result.breakdown,
        };
      }
    );

    /**
     * Handle empty schedules.
     */
    if (
      response_mode === "schedule" &&
      (
        prioritizedTasks.length === 0 ||
        availableMinutes === 0
      )
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

    /**
     * Generate AI response.
     */
    const response = await askAI(
      message.trim(),
      prioritizedTasks,
      availableMinutes,
      response_mode
    );

    /**
     * Text response handling.
     */
    if (response_mode === "text") {
      return res.status(200).json({
        success: true,
        data: {
          response,
          schedules: [],
        },
      });
    }

    /**
     * Validate AI schedule structure.
     */
    if (
      !response ||
      typeof response !== "object" ||
      !Array.isArray(response.schedule)
    ) {
      throw new Error(
        "AI returned an invalid schedule."
      );
    }

    const taskMap = new Map(
      prioritizedTasks.map((task) => [
        String(task.id),
        task,
      ])
    );

    const usedTaskIds = new Set();

    let totalAllocatedMinutes = 0;

    /**
     * Validate every AI-generated schedule entry.
     */
    for (const item of response.schedule) {
      if (!item || typeof item !== "object") {
        throw new Error(
          "Invalid schedule item."
        );
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
        !Number.isSafeInteger(
          item.allocated_minutes
        ) ||
        item.allocated_minutes <= 0
      ) {
        throw new Error(
          "AI returned an invalid allocated_minutes value."
        );
      }

      const estimatedEffort =
        task.estimated_effort_minutes == null
          ? null
          : Number(
              task.estimated_effort_minutes
            );

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

      totalAllocatedMinutes +=
        item.allocated_minutes;
    }

    /**
     * Prevent schedules exceeding available time.
     */
    if (
      totalAllocatedMinutes > availableMinutes
    ) {
      throw new Error(
        "AI schedule exceeds the available study time."
      );
    }

    /**
     * Build schedule rows.
     */
    const scheduleRows = [];

    let currentStart = new Date(
      scheduleStartDate
    );

    for (const item of response.schedule) {
      const startTime = new Date(
        currentStart
      );

      const endTime = new Date(
        startTime.getTime() +
          item.allocated_minutes *
            60 *
            1000
      );

      const task = taskMap.get(
        String(item.task_id)
      );

      scheduleRows.push({
        user_id: userId,
        task_id: task.id,
        start_time:
          startTime.toISOString(),
        end_time:
          endTime.toISOString(),
        schedule_type: "study_block",
        status: "scheduled",
      });

      currentStart = endTime;
    }

    let savedSchedules = [];

    /**
     * Save generated schedules to Supabase.
     */
    if (scheduleRows.length > 0) {
      const {
        data: insertedSchedules,
        error: scheduleError,
      } = await supabase
        .from("schedules")
        .insert(scheduleRows)
        .select();

      if (scheduleError) {
        throw new Error(
          scheduleError.message
        );
      }

      savedSchedules =
        insertedSchedules || [];
    }

    /**
     * Prepare frontend-friendly schedule data.
     */
    const displaySchedules =
      savedSchedules.map((row) => {
        const task = taskMap.get(
          String(row.task_id)
        );

        return {
          ...row,
          task_title:
            task?.title ||
            "Untitled Task",
          allocated_minutes: Math.round(
            (
              new Date(
                row.end_time
              ).getTime() -
              new Date(
                row.start_time
              ).getTime()
            ) / 60000
          ),
        };
      });

    /**
     * Return successful schedule response.
     */
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
    /**
     * SCRUM-141:
     * Return HTTP 504 for AI provider timeouts.
     */
    if (isAiTimeout(error)) {
      console.error(
        "AI provider timeout:",
        {
          name: error?.name,
          code: error?.code,
          status: error?.status,
        }
      );

      return res.status(504).json({
        success: false,
        error:
          "The AI service took too long to respond. Please try again.",
      });
    }

    /**
     * Preserve generic HTTP 500 handling
     * for other backend failures.
     */
    console.error(
      "AI request failed:",
      {
        name: error?.name,
        code: error?.code,
        status: error?.status,
      }
    );

    return res.status(500).json({
      success: false,
      error:
        "Could not generate AI response.",
    });
  }
};

module.exports = {
  chat,
};
