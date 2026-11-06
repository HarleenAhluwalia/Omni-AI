
const {
    analyzeWorkload,
    generateWorkloadRecommendations,
} = require("../services/workloadService");

describe("Sprint 4 - Time-Aware Workload Analysis", () => {
    const now = new Date("2026-11-05T12:00:00Z");

    const makeTask = (due_date, has_due_time = true) => ({
        due_date,
        has_due_time,
        estimated_effort_minutes: 60,
        completion_status: "not_started",
    });

    test("detects a timed task overdue earlier today", () => {
        const tasks = [makeTask("2026-11-05T11:00:00Z")];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.overdueCount).toBe(1);
        expect(result.dueSoonCount).toBe(0);
        expect(result.dueWithin6HoursCount).toBe(0);
        expect(result.dueWithin24HoursCount).toBe(0);
    });

    test("detects a task due within 6 hours", () => {
        const tasks = [makeTask("2026-11-05T16:00:00Z")];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.dueWithin6HoursCount).toBe(1);
        expect(result.dueWithin24HoursCount).toBe(1);
        expect(result.overdueCount).toBe(0);
    });

    test("detects a task due within 24 hours but not 6", () => {
        const tasks = [makeTask("2026-11-06T10:00:00Z")];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.dueWithin6HoursCount).toBe(0);
        expect(result.dueWithin24HoursCount).toBe(1);
    });

    test("does not flag tasks due beyond 24 hours", () => {
        const tasks = [makeTask("2026-11-07T12:00:00Z")];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.dueWithin6HoursCount).toBe(0);
        expect(result.dueWithin24HoursCount).toBe(0);
        expect(result.dueSoonCount).toBe(1);
    });

    test("preserves date-only deadline behavior", () => {
        const tasks = [
            makeTask("2026-11-05T09:00:00Z", false),
        ];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.overdueCount).toBe(0);
        expect(result.dueSoonCount).toBe(1);
        expect(result.dueWithin6HoursCount).toBe(0);
        expect(result.dueWithin24HoursCount).toBe(0);
    });

    test("ignores completed and locked tasks", () => {
        const tasks = [
            {
                ...makeTask("2026-11-05T14:00:00Z"),
                completion_status: "completed",
            },
            {
                ...makeTask("2026-11-05T15:00:00Z"),
                canvas_locked: true,
            },
        ];

        const result = analyzeWorkload(tasks, 240, now);

        expect(result.activeTaskCount).toBe(0);
        expect(result.dueWithin6HoursCount).toBe(0);
        expect(result.dueWithin24HoursCount).toBe(0);
    });

    test("respects timestamp offsets", () => {
        const localNow = new Date("2026-11-05T12:00:00-08:00");
        const tasks = [
            makeTask("2026-11-05T15:00:00-08:00"),
        ];

        const result = analyzeWorkload(
            tasks,
            240,
            localNow,
            "America/Los_Angeles"
        );

        expect(result.dueWithin6HoursCount).toBe(1);
        expect(result.dueWithin24HoursCount).toBe(1);
        expect(result.overdueCount).toBe(0);
    });

    test("generates a 6-hour deadline warning", () => {
        const tasks = [
            makeTask("2026-11-05T16:00:00Z"),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now
        );

        const warningTypes = result.warnings.map(
            (warning) => warning.type
        );

        expect(warningTypes).toContain("deadline_6_hours");
        expect(warningTypes).not.toContain("deadline_24_hours");
    });

    test("generates a 24-hour deadline warning", () => {
        const tasks = [
            makeTask("2026-11-06T10:00:00Z"),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now
        );

        const warningTypes = result.warnings.map(
            (warning) => warning.type
        );

        expect(warningTypes).toContain("deadline_24_hours");
        expect(warningTypes).not.toContain("deadline_6_hours");
    });

    test("does not generate time warnings for date-only tasks", () => {
        const tasks = [
            makeTask("2026-11-05T16:00:00Z", false),
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now
        );

        const warningTypes = result.warnings.map(
            (warning) => warning.type
        );

        expect(warningTypes).not.toContain("deadline_6_hours");
        expect(warningTypes).not.toContain("deadline_24_hours");
    });

    test("detects insufficient time before an exact deadline", () => {
        const tasks = [{
            id: "urgent-task",
            title: "Urgent Assignment",
            due_date: "2026-11-05T14:00:00Z",
            has_due_time: true,
            estimated_effort_minutes: 180,
            completion_status: "not_started",
            priority: "high",
        }];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            now
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-05T14:00:00.000Z",
            requiredMinutes: 180,
            availableMinutes: 120,
            shortfallMinutes: 60,
        });

        expect(
            result.warnings.map((warning) => warning.type)
        ).toContain("deadline_time_capacity");
    });

    test("detects cumulative workload across multiple deadlines", () => {
        const tasks = [
            makeTask("2026-11-05T14:00:00Z"),
            {
                ...makeTask("2026-11-05T15:00:00Z"),
                estimated_effort_minutes: 180,
            },
        ];

        const result = generateWorkloadRecommendations(
            tasks, 240, now
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-05T15:00:00.000Z",
            requiredMinutes: 240,
            availableMinutes: 180,
            shortfallMinutes: 60,
        });
    });

    test("does not flag sufficient study capacity", () => {
        const tasks = [{
            ...makeTask("2026-11-05T14:00:00Z"),
            estimated_effort_minutes: 90,
        }];

        const result = generateWorkloadRecommendations(
            tasks, 240, now
        );

        expect(result.timeAwareCapacityRisk).toBeNull();

        expect(
            result.warnings.map((warning) => warning.type)
        ).not.toContain("deadline_time_capacity");
    });

    test("calculates capacity across local midnight", () => {
        const localNow = new Date(
            "2026-11-05T23:30:00-08:00"
        );

        const tasks = [{
            ...makeTask("2026-11-06T00:30:00-08:00"),
            estimated_effort_minutes: 90,
        }];

        const result = generateWorkloadRecommendations(
            tasks,
            240,
            localNow,
            "America/Los_Angeles"
        );

        expect(result.timeAwareCapacityRisk).toEqual({
            deadlineAt: "2026-11-06T08:30:00.000Z",
            requiredMinutes: 90,
            availableMinutes: 60,
            shortfallMinutes: 30,
        });
    });

});
