const supabase = require("../config/supabase");

// Sprint 3 (Jerry): notification preferences.
// Ownership always comes from req.user.id (set by requireAuth); a user_id in
// the body or query string is never read.

// Defaults mirror docs/database-contract.md (notification_settings).
const DEFAULTS = {
  enabled: true,
  reminder_lead_minutes: 1440,
  frequency: "normal",
  priority_threshold: "low",
  delivery_method: "in_app",
};

// ASSUMPTION: only 'normal', 'low' and 'in_app' are observed in the database.
// The other values are proposed — confirm with Medrian (notification
// triggering) before finalizing, and keep in sync with the tests.
const ALLOWED = {
  frequency: ["low", "normal", "high"],
  priority_threshold: ["low", "medium", "high"],
  delivery_method: ["in_app", "email", "push"],
};

const SETTINGS_FIELDS = Object.keys(DEFAULTS);
const WRITABLE_FIELDS = [...SETTINGS_FIELDS, "onboarding_completed"];

function validate(body) {
  const errors = [];

  for (const key of ["enabled", "onboarding_completed"]) {
    if (key in body && typeof body[key] !== "boolean") {
      errors.push(`${key} must be a boolean`);
    }
  }

  if ("reminder_lead_minutes" in body) {
    const v = body.reminder_lead_minutes;
    if (!Number.isInteger(v) || v < 0) {
      errors.push("reminder_lead_minutes must be a non-negative integer");
    }
  }

  for (const [key, values] of Object.entries(ALLOWED)) {
    if (key in body && !values.includes(body[key])) {
      errors.push(`${key} must be one of: ${values.join(", ")}`);
    }
  }

  return errors;
}

function shape(row, onboardingCompleted) {
  const out = {};
  for (const key of SETTINGS_FIELDS) {
    out[key] = row && row[key] !== undefined ? row[key] : DEFAULTS[key];
  }
  out.onboarding_completed = Boolean(onboardingCompleted);
  return out;
}

async function loadSettings(userId) {
  const { data: row, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { error: profileError };

  return { row, profile };
}

// GET /api/notification-settings
const getNotificationSettings = async (req, res) => {
  const { row, profile, error } = await loadSettings(req.user.id);
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({
    success: true,
    data: shape(row, profile && profile.onboarding_completed),
  });
};

// PUT /api/notification-settings  (partial update)
const updateNotificationSettings = async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const userId = req.user.id;

  const provided = Object.keys(body).filter((k) => WRITABLE_FIELDS.includes(k));
  if (provided.length === 0) {
    return res.status(400).json({
      success: false,
      error: `No updatable fields provided. Allowed: ${WRITABLE_FIELDS.join(", ")}`,
    });
  }

  const errors = validate(body);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: errors.join("; ") });
  }

  const settingsUpdate = {};
  for (const key of SETTINGS_FIELDS) {
    if (key in body) settingsUpdate[key] = body[key];
  }

  const current = await loadSettings(userId);
  if (current.error) {
    return res.status(500).json({ success: false, error: current.error.message });
  }

  if (Object.keys(settingsUpdate).length > 0) {
    let result;
    if (current.row) {
      result = await supabase
        .from("notification_settings")
        .update(settingsUpdate)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
    } else {
      result = await supabase
        .from("notification_settings")
        .insert([{ ...DEFAULTS, ...settingsUpdate, user_id: userId }])
        .select()
        .single();
    }
    if (result.error) {
      return res.status(500).json({ success: false, error: result.error.message });
    }
  }

  if ("onboarding_completed" in body) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: body.onboarding_completed })
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }
  }

  const fresh = await loadSettings(userId);
  if (fresh.error) {
    return res.status(500).json({ success: false, error: fresh.error.message });
  }
  return res.status(200).json({
    success: true,
    data: shape(fresh.row, fresh.profile && fresh.profile.onboarding_completed),
  });
};

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  DEFAULTS,
  ALLOWED,
};
