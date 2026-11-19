
const {
    generateWorkloadRecommendations,
} = require("../services/workloadService");

describe("Sprint 5 - Workload Optimization Regression", () => {
    const now = new Date("2026-11-05T12:00:00Z");

    const createTask = (id, dueDate, effort) => ({
        id,
        title: `Test Task ${id}`,
        due_date: dueDate,
        has_due_time: true,
        estimated_effort_minutes: effort,
        completion_status: "not_started",
        canvas_locked: false,
        priority: "high",
    });

    const createSchedule = (taskId) => ({
        task_id: taskId,
        status: "scheduled",
        schedule_type: "study_block",
        start_time: "2026-11-05T12:30:00Z",
        end_time: "2026-11-05T13:30:00Z",
    });

    test("correctly handles tasks with identical deadlines", () => {
        const tasks = [
            createTask("task1", "2026-11-05T14:00:00Z", 150),
            createTask("task2", "2026-11-05T14:00:00Z", 50),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now, "UTC",
            [createSchedule("task2")]
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-05T14:00:00.000Z",
            requiredMinutes: 150,
            availableMinutes: 120,
            shortfallMinutes: 30,
        });
    });

    test("does not subtract already included task schedules twice", () => {
        const tasks = [
            createTask("task1", "2026-11-05T14:00:00Z", 60),
            createTask("task2", "2026-11-05T15:00:00Z", 180),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now, "UTC",
            [createSchedule("task1")]
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-05T15:00:00.000Z",
            requiredMinutes: 240,
            availableMinutes: 180,
            shortfallMinutes: 60,
        });
    });

    test("subtracts schedules belonging to unrelated tasks", () => {
        const tasks = [
            createTask("task1", "2026-11-05T14:00:00Z", 60),
            createTask("task2", "2026-11-05T15:00:00Z", 180),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now, "UTC",
            [createSchedule("unrelated-task")]
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-05T15:00:00.000Z",
            requiredMinutes: 240,
            availableMinutes: 120,
            shortfallMinutes: 120,
        });
    });

    test("handles tasks with missing IDs without excluding unrelated blocks", () => {
        const tasks = [
            createTask(null, "2026-11-05T14:00:00Z", 150),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now, "UTC",
            [createSchedule(null)]
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-05T14:00:00.000Z",
            requiredMinutes: 150,
            availableMinutes: 60,
            shortfallMinutes: 90,
        });
    });
});