const {
    analyzeWorkload,
    generateWorkloadRecommendations,
} = require("../services/workloadService");

describe("UC-14 Predictive Workload Analysis", () => {
    const now = new Date("2026-10-15T12:00:00Z");

    test("calculates workload and detects overload", () => {
        const tasks = [
            {
                due_date: "2026-10-14T23:59:00Z",
                estimated_effort_minutes: 60,
                completion_status: "not_started",
            },
            {
                due_date: "2026-10-15T23:59:00Z",
                estimated_effort_minutes: 90,
                completion_status: "in_progress",
            },
            {
                due_date: "2026-10-17T23:59:00Z",
                estimated_effort_minutes: 80,
                completion_status: "not_started",
            },
        ];

        const result = analyzeWorkload(tasks, 30, now);

        expect(result.requiredMinutes).toBe(230);
        expect(result.availableMinutes).toBe(210);
        expect(result.overloadMinutes).toBe(20);
        expect(result.isOverloaded).toBe(true);
        expect(result.overdueCount).toBe(1);
        expect(result.dueSoonCount).toBe(2);
    });

    test("excludes completed and locked tasks", () => {
        const tasks = [
            {
                due_date: "2026-10-16T23:59:00Z",
                estimated_effort_minutes: 500,
                completion_status: "completed",
            },
            {
                due_date: "2026-10-16T23:59:00Z",
                estimated_effort_minutes: 300,
                canvas_locked: true,
                completion_status: "not_started",
            },
        ];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.activeTaskCount).toBe(0);
        expect(result.requiredMinutes).toBe(0);
        expect(result.isOverloaded).toBe(false);
    });

    test("tracks missing effort estimates", () => {
        const tasks = [
            {
                due_date: "2026-10-17T23:59:00Z",
                estimated_effort_minutes: null,
                completion_status: "not_started",
            },
        ];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.missingEstimateCount).toBe(1);
        expect(result.requiredMinutes).toBe(0);
        expect(result.dueSoonCount).toBe(1);
    });

    test("excludes tasks beyond the 7-day window", () => {
        const tasks = [
            {
                due_date: "2026-10-30T23:59:00Z",
                estimated_effort_minutes: 300,
                completion_status: "not_started",
            },
        ];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.requiredMinutes).toBe(0);
        expect(result.dueSoonCount).toBe(0);
    });

    test("handles an empty task list", () => {
        const result = analyzeWorkload([], 240, now);

        expect(result.activeTaskCount).toBe(0);
        expect(result.overloadMinutes).toBe(0);
        expect(result.isOverloaded).toBe(false);
    });

    test("generates workload warnings", () => {
        const tasks = [
            {
                id: "task-1",
                title: "Overdue assignment",
                due_date: "2026-10-14T23:59:00Z",
                estimated_effort_minutes: 200,
                priority: "high",
                completion_status: "not_started",
            },
            {
                id: "task-2",
                title: "Assignment without estimate",
                due_date: "2026-10-17T23:59:00Z",
                estimated_effort_minutes: null,
                priority: "low",
                completion_status: "not_started",
            },
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            20,
            now
        );

        const warningTypes = result.warnings.map(
            (warning) => warning.type
        );

        expect(warningTypes).toContain("overload");
        expect(warningTypes).toContain("overdue");
        expect(warningTypes).toContain("missing_estimates");
    });

    test("recommends higher priority tasks first", () => {
        const tasks = [
            {
                id: "low-task",
                title: "Low priority assignment",
                due_date: "2026-10-17T23:59:00Z",
                estimated_effort_minutes: 60,
                priority: "low",
                point_value: 10,
                completion_status: "not_started",
            },
            {
                id: "high-task",
                title: "High priority assignment",
                due_date: "2026-10-17T23:59:00Z",
                estimated_effort_minutes: 60,
                priority: "high",
                point_value: 10,
                completion_status: "not_started",
            },
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            now
        );

        expect(result.recommendedTasks).toHaveLength(2);
        expect(result.recommendedTasks[0].id).toBe("high-task");
        expect(result.recommendedTasks[1].id).toBe("low-task");
    });

    test("detects deadline overload without weekly overload", () => {
        const tasks = [
            {
                id: "urgent-task",
                title: "Urgent Assignment",
                due_date: "2026-10-15T23:59:00Z",
                estimated_effort_minutes: 300,
                priority: "high",
                completion_status: "not_started",
            },
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            now
        );

        // 300 minutes fits within the total weekly capacity.
        expect(result.isOverloaded).toBe(false);

        // But it exceeds today's 240-minute capacity.
        expect(result.deadlineCapacityRisk).toEqual({
            deadlineDate: "2026-10-15",
            requiredMinutes: 300,
            availableMinutes: 240,
            shortfallMinutes: 60,
        });

        expect(
            result.warnings.map((warning) => warning.type)
        ).toContain("deadline_capacity");
    });

    test("uses local timezone for deadline capacity warnings", () => {
        const tasks = [
            {
                id: "timezone-task",
                title: "Deadline Risk Test",
                due_date: "2026-10-16T06:59:59+00:00",
                estimated_effort_minutes: 800,
                priority: "high",
                completion_status: "not_started",
            },
        ];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            new Date("2026-10-15T19:00:00Z"),
            "America/Los_Angeles"
        );

        expect(result.deadlineCapacityRisk).toEqual({
            deadlineDate: "2026-10-15",
            requiredMinutes: 800,
            availableMinutes: 240,
            shortfallMinutes: 560,
        });

        expect(result.dueSoonCount).toBe(1);
        expect(result.isOverloaded).toBe(false);
    });

    test("rejects invalid task input", () => {
        expect(() =>
            analyzeWorkload(null, 240, now)
        ).toThrow("tasks must be an array");
    });

    test.each([0, -30])(
        "rejects invalid daily workload limit: %p",
        (limit) => {
            expect(() =>
                analyzeWorkload([], limit, now)
            ).toThrow("dailyLimitMinutes must be positive");
        }
    );

});
