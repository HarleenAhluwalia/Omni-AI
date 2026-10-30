const {
    findNextAvailableSlot,
    resolveConflict,
} = require("../services/schedulingService");

describe("Sprint 4 - Scheduling Testing", () => {
    test("returns null when no available slot is found within the search limit", () => {
        const taskToMove = {
            id: 2,
            title: "Study for Exam",
            start_time: "2026-11-01T09:00:00Z",
            end_time: "2026-11-01T10:00:00Z",
        };

        const scheduledTasks = [
            {
                id: 1,
                title: "Fully Booked Schedule",
                start_time: "2026-11-01T09:00:00Z",
                end_time: "2026-11-04T09:00:00Z",
            },
        ];

        const result = findNextAvailableSlot(
            taskToMove,
            scheduledTasks,
            "2026-11-01T09:00:00Z",
            30
        );

        expect(result).toBeNull();
    });

    test("changes scheduling conflict resolution when task priority changes", () => {
        const taskA = {
            id: 1,
            title: "Study for Exam",
            start_time: "2026-11-01T14:00:00Z",
            end_time: "2026-11-01T15:00:00Z",
            due_date: null,
            priority: "high",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const taskB = {
            id: 2,
            title: "Complete Homework",
            start_time: "2026-11-01T14:30:00Z",
            end_time: "2026-11-01T15:30:00Z",
            due_date: null,
            priority: "low",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        // Initially, Task A has higher priority.
        const initialResult = resolveConflict(taskA, taskB, 120);

        expect(initialResult.conflict).toBe(true);
        expect(initialResult.keepTask.id).toBe(1);
        expect(initialResult.moveTask.id).toBe(2);

        // Change Task A to low and Task B to high.
        const updatedTaskA = { ...taskA, priority: "low" };
        const updatedTaskB = { ...taskB, priority: "high" };

        const updatedResult = resolveConflict(
            updatedTaskA,
            updatedTaskB,
            120
        );

        expect(updatedResult.conflict).toBe(true);
        expect(updatedResult.keepTask.id).toBe(2);
        expect(updatedResult.moveTask.id).toBe(1);
    });

    test("handles invalid scheduling dates safely", () => {
        const invalidTask = {
            id: 3,
            title: "Invalid Study Task",
            start_time: "invalid-date",
            end_time: "2026-11-01T11:00:00Z",
        };

        const scheduledTasks = [];

        const result = findNextAvailableSlot(
            invalidTask,
            scheduledTasks,
            null,
            30
        );

        expect(result).toBeNull();
    });

    test("finds the next available slot after multiple scheduling conflicts", () => {
        const taskToMove = {
            id: 4,
            title: "Study for Exam",
            start_time: "2026-11-01T14:30:00Z",
            end_time: "2026-11-01T15:30:00Z",
        };

        const scheduledTasks = [
            {
                id: 1,
                title: "Team Meeting",
                start_time: "2026-11-01T14:00:00Z",
                end_time: "2026-11-01T15:00:00Z",
            },
            {
                id: 2,
                title: "Homework",
                start_time: "2026-11-01T15:00:00Z",
                end_time: "2026-11-01T16:00:00Z",
            },
            {
                id: 3,
                title: "Project Work",
                start_time: "2026-11-01T16:00:00Z",
                end_time: "2026-11-01T17:00:00Z",
            },
        ];

        const result = findNextAvailableSlot(
            taskToMove,
            scheduledTasks,
            "2026-11-01T14:30:00Z",
            30
        );

        expect(result).not.toBeNull();

        expect(result.start_time).toBe(
            "2026-11-01T17:00:00.000Z"
        );

        expect(result.end_time).toBe(
            "2026-11-01T18:00:00.000Z"
        );
    });

    test("prioritizes the earlier deadline when scheduled tasks conflict", () => {
        const taskA = {
            id: 1,
            title: "Assignment Due Tomorrow",
            start_time: "2026-11-01T14:00:00Z",
            end_time: "2026-11-01T15:00:00Z",
            due_date: new Date(
                Date.now() + 24 * 60 * 60 * 1000
            ).toISOString(),
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const taskB = {
            id: 2,
            title: "Assignment Due Later",
            start_time: "2026-11-01T14:30:00Z",
            end_time: "2026-11-01T15:30:00Z",
            due_date: new Date(
                Date.now() + 10 * 24 * 60 * 60 * 1000
            ).toISOString(),
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const result = resolveConflict(taskA, taskB, 120);

        expect(result.conflict).toBe(true);

        // The earlier deadline should receive higher priority.
        expect(result.keepTask.id).toBe(1);
        expect(result.moveTask.id).toBe(2);

        expect(result.keepTaskScore).toBeGreaterThan(
            result.moveTaskScore
        );
    });

    test("rejects tasks with negative scheduling durations", () => {
        const invalidTask = {
            id: 5,
            title: "Invalid Duration Task",
            start_time: "2026-11-01T15:00:00Z",
            end_time: "2026-11-01T14:00:00Z",
        };

        const result = findNextAvailableSlot(
            invalidTask,
            [],
            null,
            30
        );

        expect(result).toBeNull();
    });

});
