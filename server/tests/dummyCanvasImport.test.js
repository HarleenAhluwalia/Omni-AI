
const {
    getAssignments,
    getAssignmentById,
} = require("../services/dummyCanvasService");

const {
    convertCanvasAssignmentToTask,
    convertCanvasAssignmentToUpdates,
} = require("../services/dummyCanvasImportService");

describe("Dummy Canvas Assignment Processing", () => {

    test("converts Canvas assignment to Omni-AI task", () => {
        const assignment = getAssignmentById(101);
        const result = convertCanvasAssignmentToTask(assignment);

        expect(result.task.title).toBe("Sprint 3 Report");
        expect(result.task.point_value).toBe(100);
        expect(result.task.due_date).toBe(
            "2026-10-12T23:59:59.999Z"
        );
        expect(result.task.priority).toBe("medium");
        expect(result.task.completion_status).toBe("not_started");
    });

    test("preserves original assignment and course IDs", () => {
        const assignment = getAssignmentById(101);
        const result = convertCanvasAssignmentToTask(assignment);

        expect(result.source.assignmentId).toBe(101);
        expect(result.source.courseId).toBe(1);
    });

    test("processes all simulated assignments", () => {
        const assignments = getAssignments();

        const converted = assignments.map(
            convertCanvasAssignmentToTask
        );

        expect(converted).toHaveLength(5);

        converted.forEach((result) => {
            expect(result.task.title).toBeDefined();
            expect(result.task.due_date).toBeDefined();
            expect(result.source.courseId).toBeDefined();
        });
    });

    test("rejects assignments with missing titles", () => {
        const assignment = {
            id: 999,
            courseId: 1,
            title: "",
            dueDate: "2026-10-20",
            points: 50,
        };

        expect(() =>
            convertCanvasAssignmentToTask(assignment)
        ).toThrow("Assignment title is required");
    });

    test("rejects assignments with invalid points", () => {
        const assignment = {
            id: 999,
            courseId: 1,
            title: "Invalid Assignment",
            dueDate: "2026-10-20",
            points: -10,
        };

        expect(() =>
            convertCanvasAssignmentToTask(assignment)
        ).toThrow("Valid assignment points are required");
    });

    test("processes updated Canvas assignment values", () => {
        const original = getAssignmentById(101);

        const updated = {
            ...original,
            dueDate: "2026-10-15",
            points: 150,
        };

        const result = convertCanvasAssignmentToUpdates(updated);

        expect(result.source).toEqual({
            assignmentId: 101,
            courseId: 1,
        });

        expect(result.updates).toMatchObject({
            title: "Sprint 3 Report",
            due_date: "2026-10-15T23:59:59.999Z",
            point_value: 150,
        });
    });

    test("updates do not overwrite user task progress", () => {
        const assignment = getAssignmentById(101);

        const result = convertCanvasAssignmentToUpdates(assignment);

        expect(result.updates).not.toHaveProperty("priority");
        expect(result.updates).not.toHaveProperty("completion_status");
        expect(result.updates).not.toHaveProperty(
            "estimated_effort_minutes"
        );
    });
});