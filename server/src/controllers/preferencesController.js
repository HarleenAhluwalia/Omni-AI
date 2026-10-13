
const supabase = require("../../config/supabase");

const VALID_STYLES = [
  "balanced",
  "deadline",
  "flexible",
];

const VALID_COMMUNICATION = [
  "balanced",
  "concise",
  "detailed",
  "encouraging",
];

const defaults = {
  study_session_minutes: 45,
  break_interval_minutes: 10,
  daily_workload_limit_minutes: 240,
  scheduling_style: "balanced",
  communication_style: "balanced",
  deadline_weight: 40,
  priority_weight: 35,
  effort_weight: 25,
};

const toClient = (row) => ({
  studySessionMinutes: row.study_session_minutes,
  breakMinutes: row.break_interval_minutes,
  dailyWorkloadMinutes: row.daily_workload_limit_minutes,
  schedulingStyle: row.scheduling_style,
  communicationStyle: row.communication_style,
  deadlineWeight: row.deadline_weight,
  priorityWeight: row.priority_weight,
  effortWeight: row.effort_weight,
});

const validate = (v) => {
  for (const [key, min, max] of [
    ["studySessionMinutes", 1, 240],
    ["breakMinutes", 0, 120],
    ["dailyWorkloadMinutes", 1, 1440],
    ["deadlineWeight", 0, 100],
    ["priorityWeight", 0, 100],
    ["effortWeight", 0, 100],
  ]) {
    if (
      !Number.isInteger(v[key]) ||
      v[key] < min ||
      v[key] > max
    ) {
      return `${key} must be an integer from ${min} to ${max}`;
    }
  }

  if (
    v.deadlineWeight +
      v.priorityWeight +
      v.effortWeight !==
    100
  ) {
    return "Priority weights must total 100";
  }

  if (
    !VALID_STYLES.includes(v.schedulingStyle) ||
    !VALID_COMMUNICATION.includes(v.communicationStyle)
  ) {
    return "Invalid preference option";
  }

  return null;
};

const fromClient = (v) => ({
  study_session_minutes: v.studySessionMinutes,
  break_interval_minutes: v.breakMinutes,
  daily_workload_limit_minutes: v.dailyWorkloadMinutes,
  scheduling_style: v.schedulingStyle,
  communication_style: v.communicationStyle,
  deadline_weight: v.deadlineWeight,
  priority_weight: v.priorityWeight,
  effort_weight: v.effortWeight,
});

async function getPreferences(req, res) {
  try {
    const { data, error } = await supabase
      .from("preferences")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) throw error;

    return res.json({
      success: true,
      data: toClient({ ...defaults, ...data }),
    });
  } catch (error) {
    console.error("Preferences load failed", error);

    return res.status(500).json({
      success: false,
      error: "Could not load preferences",
    });
  }
}

async function savePreferences(req, res) {
  const errorMessage = validate(req.body || {});

  if (errorMessage) {
    return res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }

  try {
    const row = {
      ...fromClient(req.body),
      user_id: req.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("preferences")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      data: toClient(data),
    });
  } catch (error) {
    console.error("Preferences save failed", error);

    return res.status(500).json({
      success: false,
      error: "Could not save preferences",
    });
  }
}

module.exports = {
  getPreferences,
  savePreferences,
  validate,
};
