const {
    evaluateNotificationTrigger,
} = require("../services/notificationService");

describe("SCRUM-430: Test Smart Notification Trigger Events", () => {

    test("triggers a notification for an approaching deadline", () => {
        const task = {
            id: "task-123",
            user_id: "user-123",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(true);
        expect(result.type).toBe("upcoming_deadline");
        expect(result.taskId).toBe("task-123");
    });

    test("triggers a notification for an overdue task", () => {
        const task = {
            id: "task-456",
            user_id: "user-123",
            title: "Programming Assignment",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-05T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T12:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(true);
        expect(result.type).toBe("overdue");
        expect(result.taskId).toBe("task-456");
    });

    test("triggers a notification exactly at the reminder lead time", () => {
        const task = {
            id: "task-789",
            user_id: "user-123",
            title: "Database Assignment",
            completion_status: "not_started",
            priority: "medium",
            due_date: "2026-11-07T12:00:00Z",
            point_value: 50,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "medium",
        };

        const now = new Date("2026-11-06T12:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(true);
        expect(result.type).toBe("upcoming_deadline");
        expect(result.taskId).toBe("task-789");
    });

    test("does not trigger a notification for a completed task", () => {
        const task = {
            id: "task-999",
            user_id: "user-123",
            title: "Completed Programming Assignment",
            completion_status: "completed",
            priority: "high",
            due_date: "2026-11-05T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T12:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("task_completed");
    });

    test("does not trigger a notification when notifications are disabled", () => {
        const task = {
            id: "task-555",
            user_id: "user-123",
            title: "Software Engineering Assignment",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: false,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("notifications_disabled");
    });

    test("does not trigger a notification below the priority threshold", () => {
        const task = {
            id: "task-666",
            user_id: "user-123",
            title: "Optional Reading Assignment",
            completion_status: "not_started",
            priority: "low",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 10,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "medium",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("below_priority_threshold");
    });

    test("does not trigger a notification for a task without a deadline", () => {
        const task = {
            id: "task-777",
            user_id: "user-123",
            title: "Review Lecture Notes",
            completion_status: "not_started",
            priority: "high",
            due_date: null,
            point_value: 50,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("missing_deadline");
    });

    test("does not trigger a notification for an invalid deadline", () => {
        const task = {
            id: "task-888",
            user_id: "user-123",
            title: "Database Assignment",
            completion_status: "not_started",
            priority: "high",
            due_date: "not-a-valid-date",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("invalid_date");
    });

    test("does not trigger a notification that was already delivered", () => {
        const task = {
            id: "task-999",
            user_id: "user-123",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        // First evaluation: the task qualifies for a notification.
        const firstResult = evaluateNotificationTrigger(task, settings, now);

        expect(firstResult.eligible).toBe(true);

        // Simulate a notification having already been delivered.
        const deliveredKeys = new Set([
            firstResult.deduplicationKey,
        ]);

        // Second evaluation: the same event should be suppressed.
        const secondResult = evaluateNotificationTrigger(
            task,
            settings,
            now,
            deliveredKeys
        );

        expect(secondResult.eligible).toBe(false);
        expect(secondResult.reason).toBe("already_delivered");
    });

    test("does not trigger a notification when the deadline is too far away", () => {
        const task = {
            id: "task-1010",
            user_id: "user-123",
            title: "Research Paper",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-09T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T12:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("deadline_not_approaching");
    });

    test("does not trigger a notification when the task ID is missing", () => {
        const task = {
            user_id: "user-123",
            title: "Software Engineering Assignment",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("invalid_task");
    });

    test("does not trigger a notification when the user ID is missing", () => {
        const task = {
            id: "task-1212",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("invalid_task");
    });

    test("does not trigger a notification with a negative reminder lead time", () => {
        const task = {
            id: "task-1313",
            user_id: "user-123",
            title: "Software Engineering Assignment",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: -60,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("invalid_reminder_settings");
    });

    test("does not trigger a notification with an invalid priority threshold", () => {
        const task = {
            id: "task-1414",
            user_id: "user-123",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "urgent",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const result = evaluateNotificationTrigger(task, settings, now);

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe("below_priority_threshold");
    });

    test("does not duplicate an upcoming reminder after notification preferences change", () => {
        const task = {
            id: "task-regression-1",
            user_id: "user-123",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const now = new Date("2026-11-06T06:00:00Z");

        const originalSettings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const firstResult = evaluateNotificationTrigger(
            task,
            originalSettings,
            now
        );

        expect(firstResult.eligible).toBe(true);

        const deliveredKeys = new Set([
            firstResult.deduplicationKey,
        ]);

        const updatedSettings = {
            ...originalSettings,
            reminder_lead_minutes: 720,
        };

        const secondResult = evaluateNotificationTrigger(
            task,
            updatedSettings,
            now,
            deliveredKeys
        );

        expect(secondResult.eligible).toBe(false);
        expect(secondResult.reason).toBe("already_delivered");
    });

    test("allows a new reminder when a task deadline changes", () => {
        const task = {
            id: "task-regression-2",
            user_id: "user-123",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const originalNow = new Date("2026-11-06T00:00:00Z");

        const firstResult = evaluateNotificationTrigger(
            task,
            settings,
            originalNow
        );

        expect(firstResult.eligible).toBe(true);

        const deliveredKeys = new Set([
            firstResult.deduplicationKey,
        ]);

        // Simulate a professor extending the deadline.
        const updatedTask = {
            ...task,
            due_date: "2026-11-09T12:00:00Z",
        };

        // Evaluate when the new deadline is approaching.
        const updatedNow = new Date("2026-11-09T00:00:00Z");

        const secondResult = evaluateNotificationTrigger(
            updatedTask,
            settings,
            updatedNow,
            deliveredKeys
        );

        expect(secondResult.eligible).toBe(true);
        expect(secondResult.type).toBe("upcoming_deadline");
        expect(secondResult.deduplicationKey).not.toBe(
            firstResult.deduplicationKey
        );
    });

    test("generates separate notification keys for different users", () => {
        const task = {
            id: "task-regression-3",
            user_id: "user-123",
            title: "Software Engineering Project",
            completion_status: "not_started",
            priority: "high",
            due_date: "2026-11-06T12:00:00Z",
            point_value: 100,
        };

        const settings = {
            enabled: true,
            reminder_lead_minutes: 1440,
            priority_threshold: "low",
        };

        const now = new Date("2026-11-06T00:00:00Z");

        const firstResult = evaluateNotificationTrigger(
            task,
            settings,
            now
        );

        expect(firstResult.eligible).toBe(true);

        const deliveredKeys = new Set([
            firstResult.deduplicationKey,
        ]);

        // Simulate the same task identifier associated with another user.
        const otherUserTask = {
            ...task,
            user_id: "user-456",
        };

        const secondResult = evaluateNotificationTrigger(
            otherUserTask,
            settings,
            now,
            deliveredKeys
        );

        expect(secondResult.eligible).toBe(true);
        expect(secondResult.userId).toBe("user-456");
        expect(secondResult.deduplicationKey).not.toBe(
            firstResult.deduplicationKey
        );
    });
});