const { askAI } = require("../../services/aiService");
const supabase = require("../../config/supabase");
const {
  calculateTaskPriority,
} = require("../../services/priorityService");

const chat = async (req, res) => {
  const {
    message,
    response_mode = "text",
    schedule_start_time,
  } = req.body;

  const responseMode = response_mode;
  const userId = req.query.user_id;

  if (
    typeof message !== "string" ||
    !message.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "message is required",
    });
  }

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "user_id is required",
    });
  }

  if (!["text", "schedule"].includes(responseMode)) {
  return res.status(400).json({
    success: false,
    error: "response_mode must be text or schedule",
    });
  }

  if (responseMode === "schedule" && !schedule_start_time) {
    return res.status(400).json({
      success: false,
      error: "schedule_start_time is required for schedule mode",
    });
  }

  let scheduleStartDate = null;

  if (responseMode === "schedule") {
    scheduleStartDate = new Date(schedule_start_time);

    if (Number.isNaN(scheduleStartDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: "schedule_start_time must be a valid date",
      });
    }
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

    const availableMinutes = Number(
        req.body.available_minutes ?? 120
    );
    
    console.log(
      "Available minutes in controller:",
      availableMinutes
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

    const prioritizedTasks = (tasks || []).map((task) => {
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

      console.log("Tasks from Supabase:", tasks);
      console.log("Prioritized tasks:", prioritizedTasks);

      console.time("AI response time");

      let response;

      try {
        response = await askAI(
          message.trim(),
          prioritizedTasks,
          availableMinutes,
          responseMode
        );
      } finally {
        console.timeEnd("AI response time");
      }

        let savedSchedules = [];

        if (responseMode === "schedule") {
          if (!Array.isArray(response.schedule)) {
            throw new Error("AI returned an invalid schedule.");
          }

          const validTaskIds = new Set(
            prioritizedTasks.map((task) => task.id)
          );

          for (const item of response.schedule) {
            if (!validTaskIds.has(item.task_id)) {
              throw new Error(
                "AI returned a task ID that does not belong to this user."
              );
            }

            if (
              !Number.isFinite(item.allocated_minutes) ||
              item.allocated_minutes <= 0
            ) {
              throw new Error(
                "AI returned an invalid allocated_minutes value."
              );
            }
          }

          const totalAllocatedMinutes = response.schedule.reduce(
            (sum, item) => sum + item.allocated_minutes,
            0
          );

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

            scheduleRows.push({
              user_id: userId,
              task_id: item.task_id,
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              schedule_type: "study_block",
              status: "scheduled",
            });

            currentStart = endTime;
          }

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

        return res.status(200).json({
          success: true,
          data: {
            response,
            schedules: savedSchedules,
          },
        });

      } catch (error) {
        console.error(
          "AI request failed:",
          error
        );

    return res.status(500).json({
      success: false,
      error: "Could not generate AI response.",
    });
  }
};

module.exports = {
  chat,
};