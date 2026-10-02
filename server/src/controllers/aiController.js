const { askAI } = require("../../services/aiService");
const supabase = require("../../config/supabase");
const {
  calculateTaskPriority,
} = require("../../services/priorityService");

const chat = async (req, res) => {
  const { message } = req.body;
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

  try {
    const {
      data: tasks,
      error: taskError,
    } = await supabase
      .from("tasks")
      .select(`
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

      try {
        const response = await askAI(
          message.trim(),
          prioritizedTasks,
          availableMinutes
        );

        console.timeEnd("AI response time");

        return res.status(200).json({
          success: true,
          data: {
            response,
          },
        });
      } catch (error) {
        console.timeEnd("AI response time");
        throw error;
      }

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