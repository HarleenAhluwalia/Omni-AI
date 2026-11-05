
const PRIORITY_RANK = {
    low: 1,
    medium: 2,
    high: 3,
};

// Determine whether a task qualifies for a notification.
function evaluateNotificationTrigger(
    task,
    settings,
    now = new Date(),
    deliveredKeys = new Set()
) {
    // Require a task belonging to a specific user.
    if (!task?.id || !task?.user_id) {
        return { eligible: false, reason: "invalid_task" };
    }

    // Respect the user's notification preference.
    if (settings?.enabled === false) {
        return { eligible: false, reason: "notifications_disabled" };
    }

    // Completed tasks should not generate reminders.
    if (task.completion_status === "completed") {
        return { eligible: false, reason: "task_completed" };
    }

    // A deadline reminder requires a valid due date.
    if (!task.due_date) {
        return { eligible: false, reason: "missing_deadline" };
    }

    const dueDate = new Date(task.due_date);
    const currentTime = new Date(now);

    if (
        Number.isNaN(dueDate.getTime()) ||
        Number.isNaN(currentTime.getTime())
    ) {
        return { eligible: false, reason: "invalid_date" };
    }

    // Apply the student's minimum task-priority setting.
    const taskPriority = PRIORITY_RANK[task.priority] ?? 0;
    const threshold = PRIORITY_RANK[
        settings?.priority_threshold ?? "low"
    ];

    if (!threshold || taskPriority < threshold) {
        return { eligible: false, reason: "below_priority_threshold" };
    }

    // Determine how close the task is to its deadline.
    const leadMinutes = settings?.reminder_lead_minutes ?? 1440;

    if (!Number.isInteger(leadMinutes) || leadMinutes < 0) {
        return { eligible: false, reason: "invalid_reminder_settings" };
    }

    const minutesUntilDue =
        (dueDate.getTime() - currentTime.getTime()) / 60000;

    let type;

    if (minutesUntilDue < 0) {
        type = "overdue";
    } else if (minutesUntilDue <= leadMinutes) {
        type = "upcoming_deadline";
    } else {
        return { eligible: false, reason: "deadline_not_approaching" };
    }

    // Identify this exact notification event.
    const deduplicationKey = [
        task.user_id,
        task.id,
        type,
        dueDate.toISOString(),
    ].join(":");

    // Suppress an event that has already been delivered.
    if (deliveredKeys.has(deduplicationKey)) {
        return { eligible: false, reason: "already_delivered" };
    }

    return {
        eligible: true,
        type,
        taskId: task.id,
        userId: task.user_id,
        deduplicationKey,
        pointValue: task.point_value ?? null,
        priorityScore: task.calculated_priority_score ?? null,
    };
}

module.exports = {
    evaluateNotificationTrigger,
};
