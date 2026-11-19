
const {
    hasConflict,
    detectConflicts,
} = require("../services/schedulingService");

describe("Sprint 5 - Optimized Conflict Detection", () => {
    const createTask = (id, start, end) => ({
        id,
        title: `Test Task ${id}`,
        start_time: start,
        end_time: end,
    });

    test("detects overlapping scheduled tasks", () => {
        const tasks = [
            createTask(
                1,
                "2026-11-20T09:00:00Z",
                "2026-11-20T10:00:00Z"
            ),
            createTask(
                2,
                "2026-11-20T09:30:00Z",
                "2026-11-20T10:30:00Z"
            ),
        ];

        const conflicts = detectConflicts(tasks);

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].taskA).toBe(tasks[0]);
        expect(conflicts[0].taskB).toBe(tasks[1]);
    });

    test("does not flag tasks that touch at boundaries", () => {
        const tasks = [
            createTask(
                1,
                "2026-11-20T09:00:00Z",
                "2026-11-20T10:00:00Z"
            ),
            createTask(
                2,
                "2026-11-20T10:00:00Z",
                "2026-11-20T11:00:00Z"
            ),
        ];

        expect(detectConflicts(tasks)).toHaveLength(0);
    });

    test("handles missing timestamps safely", () => {
        const tasks = [
            createTask(1, null, null),
            createTask(
                2,
                "2026-11-20T09:00:00Z",
                "2026-11-20T10:00:00Z"
            ),
        ];

        expect(detectConflicts(tasks)).toEqual([]);
    });

    test("handles invalid timestamps without false conflicts", () => {
        const tasks = [
            createTask(1, "invalid-date", "invalid-date"),
            createTask(
                2,
                "2026-11-20T09:00:00Z",
                "2026-11-20T10:00:00Z"
            ),
        ];

        expect(detectConflicts(tasks)).toEqual([]);
    });

    test("preserves task references and conflict ordering", () => {
        const tasks = [
            createTask(
                1,
                "2026-11-20T09:00:00Z",
                "2026-11-20T10:00:00Z"
            ),
            createTask(
                2,
                "2026-11-20T09:30:00Z",
                "2026-11-20T10:30:00Z"
            ),
            createTask(
                3,
                "2026-11-20T10:15:00Z",
                "2026-11-20T11:15:00Z"
            ),
        ];

        const conflicts = detectConflicts(tasks);

        expect(conflicts).toEqual([
            { taskA: tasks[0], taskB: tasks[1] },
            { taskA: tasks[1], taskB: tasks[2] },
        ]);
    });

    test("matches original pairwise conflict behavior", () => {
        const tasks = [];

        for (let i = 0; i < 50; i++) {
            const start = Date.UTC(2026, 10, 20, 9, 0)
                + i * 15 * 60 * 1000;

            const end = start + 60 * 60 * 1000;

            tasks.push(
                createTask(
                    i,
                    new Date(start).toISOString(),
                    new Date(end).toISOString()
                )
            );
        }

        const expected = [];

        for (let i = 0; i < tasks.length; i++) {
            for (let j = i + 1; j < tasks.length; j++) {
                if (hasConflict(tasks[i], tasks[j])) {
                    expected.push({
                        taskA: tasks[i],
                        taskB: tasks[j],
                    });
                }
            }
        }

        expect(detectConflicts(tasks)).toEqual(expected);
    });
});
