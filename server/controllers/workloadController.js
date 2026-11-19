const supabase = require("../config/supabase");
const { performance } = require("node:perf_hooks");

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


    // Sprint 5 optimization:
    // Retrieve independent database records concurrently.
    const databaseStart = performance.now();

    const [
      taskResult,
      scheduleResult,
      preferenceResult,
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId),

      supabase
        .from("schedules")
        .select(`
                task_id,
                start_time,
                end_time,
                schedule_type,
                status
            `)
        .eq("user_id", userId),

      supabase
        .from("preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const databaseMs =
      performance.now() - databaseStart;

    const {
      data: tasks,
      error: taskError,
    } = taskResult;

    const {
      data: schedules,
      error: schedulesError,
    } = scheduleResult;

    const {
      data: preferences,
      error: preferencesError,
    } = preferenceResult;

    // Preserve existing database error handling.
    if (taskError) {
      throw taskError;
    }

    if (schedulesError) {
      throw schedulesError;
    }

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

    const analysisStart = performance.now();
    const analysis = generateWorkloadRecommendations(
      tasks || [],
      dailyLimitMinutes,
      new Date(),
      timeZone,
      schedules || []
    );
    const analysisMs = performance.now() - analysisStart;



    if (process.env.PERF_LOGS === "true") {
        console.info("[Sprint 5 Workload Performance]", {
            databaseMs: Number(databaseMs.toFixed(3)),
            analysisMs: Number(analysisMs.toFixed(3)),
            totalMeasuredMs: Number((
                databaseMs + analysisMs
            ).toFixed(3)),
            taskCount: tasks?.length ?? 0,
            scheduleCount: schedules?.length ?? 0,
        });
    }


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
