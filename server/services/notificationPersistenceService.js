
const supabase = require("../config/supabase");
const {
  evaluateNotificationTrigger,
} = require("./notificationService");

// Retrieve stored notifications belonging to the authenticated student.
async function listNotificationsForUser(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,task_id,type,message,is_read,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Could not read notifications");
  }

  return data || [];
}

// Generate the message that will be saved in Supabase.
function notificationMessage(task, type) {
  const title = task.title || "Untitled task";

  return type === "overdue"
    ? `Your task "${title}" is overdue.`
    : `Your task "${title}" has an upcoming deadline.`;
}

// Evaluate the authenticated student's tasks and store eligible alerts.
async function evaluateAndStoreNotificationsForUser(
  userId,
  now = new Date()
) {
  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select(
      "id,user_id,title,due_date,priority,completion_status,point_value"
    )
    .eq("user_id", userId);

  if (taskError) {
    throw new Error("Could not read tasks for notifications");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("notification_settings")
    .select("enabled,reminder_lead_minutes,priority_threshold")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsError) {
    throw new Error("Could not read notification settings");
  }

  const result = {
    created: 0,
    already_existing: 0,
    ineligible: 0,
  };

  for (const task of tasks || []) {
    if (task.user_id !== userId) {
      throw new Error("Unexpected task ownership");
    }

    const trigger = evaluateNotificationTrigger(
      task,
      settings,
      now
    );

    if (!trigger.eligible) {
      result.ineligible += 1;
      continue;
    }

    const { error } = await supabase
      .from("notifications")
      .insert([
        {
          user_id: userId,
          task_id: trigger.taskId,
          type: trigger.type,
          message: notificationMessage(task, trigger.type),
          deduplication_key: trigger.deduplicationKey,
        },
      ]);

    if (!error) {
      result.created += 1;
      continue;
    }

    // The database unique constraint prevents repeated alerts.
    if (
      error.code === "23505" &&
      String(error.message || "").includes(
        "notifications_deduplication_key_key"
      )
    ) {
      result.already_existing += 1;
      continue;
    }

    throw new Error("Could not store notification");
  }

  return result;
}

module.exports = {
  listNotificationsForUser,
  evaluateAndStoreNotificationsForUser,
};
