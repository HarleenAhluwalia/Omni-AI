
const {
    generateWorkloadRecommendations,
} = require("../services/workloadService");

describe("Workload and Scheduling Integration", () => {
    const now = new Date("2026-11-12T12:00:00Z");

    const makeTask = (effort = 180) => ({
        id: "task-1",
        title: "Test Assignment",
        due_date: "2026-11-12T16:00:00Z",
        has_due_time: true,
        estimated_effort_minutes: effort,
        completion_status: "not_started",
    });

    const makeSchedule = (
        taskId,
        start,
        end
    ) => ({
        task_id: taskId,
        start_time: start,
        end_time: end,
        schedule_type: "study_block",
        status: "scheduled",
    });

    test("subtracts study time reserved for other tasks", () => {
        const tasks = [makeTask(200)];

        const schedules = [
            makeSchedule(
                "another-task",
                "2026-11-12T13:00:00Z",
                "2026-11-12T14:00:00Z"
            ),
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            now,
            "UTC",
            schedules
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-12T16:00:00.000Z",
            requiredMinutes: 200,
            availableMinutes: 180,
            shortfallMinutes: 20,
        });
    });

    test("does not double-count overlapping schedule blocks", () => {
        const tasks = [makeTask(180)];

        const schedules = [
            makeSchedule(
                "task-2",
                "2026-11-12T13:00:00Z",
                "2026-11-12T14:00:00Z"
            ),
            makeSchedule(
                "task-3",
                "2026-11-12T13:30:00Z",
                "2026-11-12T14:30:00Z"
            ),
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            now,
            "UTC",
            schedules
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-12T16:00:00.000Z",
            requiredMinutes: 180,
            availableMinutes: 150,
            shortfallMinutes: 30,
        });
    });

    test("does not subtract study blocks for the same task", () => {
        const tasks = [makeTask(200)];

        const schedules = [
            makeSchedule(
                "task-1",
                "2026-11-12T13:00:00Z",
                "2026-11-12T15:00:00Z"
            ),
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            now,
            "UTC",
            schedules
        );

        expect(result.timeAwareCapacityRisk).toBeNull();
    });

    test("respects daily capacity for study blocks crossing midnight", () => {
        const nearMidnight = new Date(
            "2026-11-12T23:30:00Z"
        );

        const tasks = [{
            ...makeTask(60),
            due_date: "2026-11-13T01:30:00Z",
        }];

        const schedules = [
            makeSchedule(
                "other-task",
                "2026-11-12T23:45:00Z",
                "2026-11-13T00:45:00Z"
            ),
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            60,
            nearMidnight,
            "UTC",
            schedules
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-13T01:30:00.000Z",
            requiredMinutes: 60,
            availableMinutes: 30,
            shortfallMinutes: 30,
        });
    });

});
