
const supabase = require("../config/supabase");

const {
  generateWorkloadRecommendations,
} = require("../services/workloadService");

const getWorkloadAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;

    const timeZone = req.query.time_zone ?? "UTC";

    if (typeof timeZone !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid time_zone.",
      });
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid time_zone.",
      });
    }

    // Retrieve tasks belonging to the logged-in user.
    const { data: tasks, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId);

    if (taskError) {
      throw taskError;
    }

    // Retrieve scheduled study blocks for workload analysis.
    // Only retrieve schedules belonging to the authenticated user.
    const {
      data: schedules,
      error: schedulesError,
    } = await supabase
      .from("schedules")
      .select(`
        task_id,
        start_time,
        end_time,
        schedule_type,
        status
      `)
      .eq("user_id", userId);

    if (schedulesError) {
      throw schedulesError;
    }

    // Retrieve the user's study preferences.
    const {
      data: preferences,
      error: preferencesError,
    } = await supabase
      .from("preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (preferencesError) {
      throw preferencesError;
    }

    // Use 4 hours per day when no valid limit is saved.
    const savedLimit = Number(
      preferences?.daily_workload_limit_minutes
    );

    const dailyLimitMinutes =
      Number.isFinite(savedLimit) && savedLimit > 0
        ? savedLimit
        : 240;

    const analysis = generateWorkloadRecommendations(
      tasks || [],
      dailyLimitMinutes,
      new Date(),
      timeZone,
      schedules || []
    );

    return res.status(200).json({
      success: true,
      data: {
        ...analysis,
        dailyLimitMinutes,
      },
    });
  } catch (error) {
    console.error("Workload analysis failed:", error);

    return res.status(500).json({
      success: false,
      error: "Could not analyze workload.",
    });
  }
};

module.exports = {
  getWorkloadAnalysis,
};
