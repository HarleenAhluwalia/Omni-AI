const {
    hasConflict,
    detectConflicts,
    resolveConflict,
    findNextAvailableSlot,
    resolveAndReschedule,
} = require("../services/schedulingService");

describe("Scheduling Service - UC-17 Conflict Detection", () => {
    test("detects overlapping tasks", () => {
        const taskA = {
            id: 1,
            title: "Study for exam",
            start_time: "2026-10-01T14:00:00",
            end_time: "2026-10-01T15:00:00",
        };

        const taskB = {
            id: 2,
            title: "Team meeting",
            start_time: "2026-10-01T14:30:00",
            end_time: "2026-10-01T15:30:00",
        };

        expect(hasConflict(taskA, taskB)).toBe(true);
    });

    test("does not report conflict when tasks do not overlap", () => {
        const taskA = {
            id: 1,
            title: "Study for exam",
            start_time: "2026-10-01T14:00:00",
            end_time: "2026-10-01T15:00:00",
        };

        const taskB = {
            id: 2,
            title: "Team meeting",
            start_time: "2026-10-01T16:00:00",
            end_time: "2026-10-01T17:00:00",
        };

        expect(hasConflict(taskA, taskB)).toBe(false);
    });

    test("allows one task to begin exactly when another ends", () => {
        const taskA = {
            id: 1,
            title: "Study",
            start_time: "2026-10-01T14:00:00",
            end_time: "2026-10-01T15:00:00",
        };

        const taskB = {
            id: 2,
            title: "Meeting",
            start_time: "2026-10-01T15:00:00",
            end_time: "2026-10-01T16:00:00",
        };

        expect(hasConflict(taskA, taskB)).toBe(false);
    });

    test("returns all conflicts from a task list", () => {
        const tasks = [
            {
                id: 1,
                title: "Task A",
                start_time: "2026-10-01T10:00:00",
                end_time: "2026-10-01T11:00:00",
            },
            {
                id: 2,
                title: "Task B",
                start_time: "2026-10-01T10:30:00",
                end_time: "2026-10-01T11:30:00",
            },
            {
                id: 3,
                title: "Task C",
                start_time: "2026-10-01T13:00:00",
                end_time: "2026-10-01T14:00:00",
            },
        ];

        const conflicts = detectConflicts(tasks);

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].taskA.id).toBe(1);
        expect(conflicts[0].taskB.id).toBe(2);
    });

    test("keeps the higher-priority task during a conflict", () => {
        const taskA = {
            id: 1,
            title: "Final Exam",
            start_time: "2026-10-01T14:00:00",
            end_time: "2026-10-01T15:00:00",
            due_date: "2026-10-01",
            priority: "high",
            point_value: 100,
            estimated_effort_minutes: 60,
        };

        const taskB = {
            id: 2,
            title: "Read Chapter",
            start_time: "2026-10-01T14:30:00",
            end_time: "2026-10-01T15:30:00",
            due_date: "2026-10-20",
            priority: "low",
            point_value: 5,
            estimated_effort_minutes: 60,
        };

        const result = resolveConflict(taskA, taskB, 60);

        expect(result.conflict).toBe(true);
        expect(result.keepTask.id).toBe(1);
        expect(result.moveTask.id).toBe(2);
        expect(result.keepTaskScore).toBeGreaterThan(
            result.moveTaskScore
        );
    });

    test("returns no resolution when tasks do not conflict", () => {
        const taskA = {
            id: 1,
            title: "Task A",
            start_time: "2026-10-01T10:00:00",
            end_time: "2026-10-01T11:00:00",
        };

        const taskB = {
            id: 2,
            title: "Task B",
            start_time: "2026-10-01T12:00:00",
            end_time: "2026-10-01T13:00:00",
        };

        const result = resolveConflict(taskA, taskB);

        expect(result.conflict).toBe(false);
        expect(result.keepTask).toBeNull();
        expect(result.moveTask).toBeNull();
    });
    test("moves a conflicting task to the next available slot", () => {
        const taskToMove = {
            id: 2,
            title: "Read Chapter",
            start_time: "2026-10-01T14:30:00",
            end_time: "2026-10-01T15:30:00",
        };

        const scheduledTasks = [
            {
                id: 1,
                title: "Final Exam",
                start_time: "2026-10-01T14:00:00",
                end_time: "2026-10-01T15:00:00",
            },
            {
                id: 3,
                title: "Team Meeting",
                start_time: "2026-10-01T15:00:00",
                end_time: "2026-10-01T16:00:00",
            },
        ];

        const result = findNextAvailableSlot(
            taskToMove,
            scheduledTasks,
            "2026-10-01T14:30:00",
            30
        );

        expect(result).not.toBeNull();

        expect(
            new Date(result.start_time).toISOString()
        ).toBe(
            new Date("2026-10-01T16:00:00").toISOString()
        );

        expect(
            new Date(result.end_time).toISOString()
        ).toBe(
            new Date("2026-10-01T17:00:00").toISOString()
        );
    });
    test("resolves a conflict and reschedules the lower-priority task", () => {
        const taskA = {
            id: 1,
            title: "Final Exam",
            start_time: "2026-10-01T14:00:00",
            end_time: "2026-10-01T15:00:00",
            due_date: "2026-10-01",
            priority: "high",
            point_value: 100,
            estimated_effort_minutes: 60,
        };

        const taskB = {
            id: 2,
            title: "Read Chapter",
            start_time: "2026-10-01T14:30:00",
            end_time: "2026-10-01T15:30:00",
            due_date: "2026-10-20",
            priority: "low",
            point_value: 5,
            estimated_effort_minutes: 60,
        };

        const scheduledTasks = [
            taskA,
            taskB,
            {
                id: 3,
                title: "Team Meeting",
                start_time: "2026-10-01T15:00:00",
                end_time: "2026-10-01T16:00:00",
            },
        ];

        const result = resolveAndReschedule(
            taskA,
            taskB,
            scheduledTasks,
            60,
            30
        );

        expect(result.conflict).toBe(true);

        expect(result.keepTask.id).toBe(1);
        expect(result.originalMoveTask.id).toBe(2);

        expect(result.rescheduledTask).not.toBeNull();

        expect(
            new Date(result.rescheduledTask.start_time).toISOString()
        ).toBe(
            new Date("2026-10-01T16:00:00").toISOString()
        );

        expect(
            new Date(result.rescheduledTask.end_time).toISOString()
        ).toBe(
            new Date("2026-10-01T17:00:00").toISOString()
        );
    });
});