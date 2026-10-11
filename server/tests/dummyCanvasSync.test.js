
jest.mock("../config/supabase", () => ({
    from: jest.fn(),
}));

const supabase = require("../config/supabase");

const {
    findImportedTask,
    updateImportedTask,
    importCanvasAssignment,
} = require("../services/dummyCanvasSyncService");

describe("Dummy Canvas Assignment Synchronization", () => {
    let query;

    beforeEach(() => {
        jest.clearAllMocks();

        query = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            single: jest.fn(),
        };

        supabase.from.mockReturnValue(query);
    });

    test("finds a previously imported assignment", async () => {
        const existingTask = {
            id: "task-uuid-123",
            user_id: "user-123",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            title: "Sprint 3 Report",
        };

        query.maybeSingle.mockResolvedValue({
            data: existingTask,
            error: null,
        });

        const result = await findImportedTask(
            "user-123", 1, 101
        );

        expect(result).toEqual(existingTask);
        expect(supabase.from).toHaveBeenCalledWith("tasks");
        expect(query.eq).toHaveBeenCalledWith(
            "user_id", "user-123"
        );
        expect(query.eq).toHaveBeenCalledWith(
            "canvas_course_id", 1
        );
        expect(query.eq).toHaveBeenCalledWith(
            "canvas_assignment_id", 101
        );
    });

    test("returns null when assignment was not imported", async () => {
        query.maybeSingle.mockResolvedValue({
            data: null,
            error: null,
        });

        const result = await findImportedTask(
            "user-123", 1, 999
        );

        expect(result).toBeNull();
    });

    test("handles database errors", async () => {
        query.maybeSingle.mockResolvedValue({
            data: null,
            error: { message: "Database error" },
        });

        await expect(
            findImportedTask("user-123", 1, 101)
        ).rejects.toThrow("Database error");
    });

    test("rejects invalid Canvas identifiers", async () => {
        await expect(
            findImportedTask("user-123", null, 101)
        ).rejects.toThrow(
            "Valid user and Canvas IDs are required"
        );
    });

    test("updates an existing imported task without resetting progress", async () => {
        const existingTask = {
            id: "task-uuid-123",
            user_id: "user-123",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            title: "Sprint 3 Report",
            due_date: "2026-10-12T23:59:59.999Z",
            point_value: 100,
            priority: "high",
            completion_status: "in_progress",
            estimated_effort_minutes: 90,
        };

        const updatedTask = {
            ...existingTask,
            due_date: "2026-10-15T23:59:59.999Z",
            point_value: 150,
        };

        // First response: find existing task.
        // Second response: return updated task.
        query.maybeSingle
            .mockResolvedValueOnce({
                data: existingTask,
                error: null,
            })
            .mockResolvedValueOnce({
                data: updatedTask,
                error: null,
            });

        const assignment = {
            id: 101,
            courseId: 1,
            title: "Sprint 3 Report",
            dueDate: "2026-10-15",
            points: 150,
        };

        const result = await updateImportedTask(
            "user-123",
            assignment
        );

        // Verify updated values.
        expect(result.due_date).toBe(
            "2026-10-15T23:59:59.999Z"
        );
        expect(result.point_value).toBe(150);

        // Verify the existing task was updated.
        expect(result.id).toBe(existingTask.id);

        expect(query.update).toHaveBeenCalledWith({
            title: "Sprint 3 Report",
            due_date: "2026-10-15T23:59:59.999Z",
            point_value: 150,
        });

        expect(query.eq).toHaveBeenCalledWith(
            "id", existingTask.id
        );
        expect(query.eq).toHaveBeenCalledWith(
            "user_id", "user-123"
        );

        // Verify user-managed values are preserved.
        expect(result.priority).toBe("high");
        expect(result.completion_status).toBe("in_progress");
        expect(result.estimated_effort_minutes).toBe(90);
    });

    test("does not update assignments that were never imported", async () => {
        // Simulate a valid Canvas assignment that
        // has not been imported into Omni-AI.
        query.maybeSingle.mockResolvedValue({
            data: null,
            error: null,
        });

        const assignment = {
            id: 102,
            courseId: 1,
            title: "Frontend Implementation",
            dueDate: "2026-10-15",
            points: 50,
        };

        const result = await updateImportedTask(
            "user-123",
            assignment
        );

        // No existing Omni-AI task was found.
        expect(result).toBeNull();

        // No task should be updated.
        expect(query.update).not.toHaveBeenCalled();
    });

    test("handles database errors during assignment updates", async () => {
        const existingTask = {
            id: "task-uuid-123",
            user_id: "user-123",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            title: "Sprint 3 Report",
        };

        // First response: existing assignment found.
        // Second response: database update fails.
        query.maybeSingle
            .mockResolvedValueOnce({
                data: existingTask,
                error: null,
            })
            .mockResolvedValueOnce({
                data: null,
                error: { message: "Database update failed" },
            });

        const assignment = {
            id: 101,
            courseId: 1,
            title: "Sprint 3 Report",
            dueDate: "2026-10-15",
            points: 150,
        };

        await expect(
            updateImportedTask("user-123", assignment)
        ).rejects.toThrow("Database update failed");

        expect(query.update).toHaveBeenCalledTimes(1);
    });

    test("prevents locked Canvas assignments from synchronizing", async () => {
        const assignment = {
            id: 301,
            courseId: 3,
            title: "Art Homework",
            dueDate: "2026-10-20",
            points: 20,
            locked: false,
        };

        // Assignment 301 is locked in the Dummy Canvas service,
        // even though the incoming request claims otherwise.
        await expect(
            updateImportedTask("user-123", assignment)
        ).rejects.toThrow(
            "This Canvas assignment is locked"
        );

        // Locked assignments must not access or modify the database.
        expect(supabase.from).not.toHaveBeenCalled();
        expect(query.update).not.toHaveBeenCalled();
    });

    test("rejects Canvas assignments that do not exist", async () => {
        const assignment = {
            id: 999,
            courseId: 1,
            title: "Unknown Assignment",
            dueDate: "2026-10-20",
            points: 50,
        };

        await expect(
            updateImportedTask("user-123", assignment)
        ).rejects.toThrow("Canvas assignment not found");

        // No database operations should occur.
        expect(supabase.from).not.toHaveBeenCalled();
        expect(query.update).not.toHaveBeenCalled();
    });

    test("imports a new Canvas assignment into Omni-AI", async () => {
        // Simulate an assignment that has not been imported.
        query.maybeSingle.mockResolvedValue({
            data: null,
            error: null,
        });

        // Simulate the saved Supabase task.
        const createdTask = {
            id: "task-uuid-123",
            user_id: "user-123",
            title: "Sprint 3 Report",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            point_value: 100,
        };

        query.single.mockResolvedValue({
            data: createdTask,
            error: null,
        });

        const result = await importCanvasAssignment(
            "user-123",
            101
        );

        // Verify a new task was created.
        expect(result.created).toBe(true);
        expect(result.task).toEqual(createdTask);

        // Verify the correct assignment data was inserted.
        expect(query.insert).toHaveBeenCalledTimes(1);

        expect(query.insert.mock.calls[0][0][0]).toMatchObject({
            user_id: "user-123",
            title: "Sprint 3 Report",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            point_value: 100,
            priority: "medium",
            completion_status: "not_started",
        });
    });

    test("prevents duplicate Canvas assignment imports", async () => {
        // Simulate an assignment already stored in Omni-AI.
        const existingTask = {
            id: "task-uuid-123",
            user_id: "user-123",
            title: "Sprint 3 Report",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            point_value: 100,
        };

        query.maybeSingle.mockResolvedValue({
            data: existingTask,
            error: null,
        });

        // Attempt to import the same Canvas assignment.
        const result = await importCanvasAssignment(
            "user-123",
            101
        );

        // Existing task should be returned.
        expect(result.created).toBe(false);
        expect(result.task).toEqual(existingTask);

        // No new database record should be inserted.
        expect(query.insert).not.toHaveBeenCalled();
    });

    test("handles Supabase duplicate assignment errors", async () => {
        const existingTask = {
            id: "task-uuid-123",
            user_id: "user-123",
            canvas_course_id: 1,
            canvas_assignment_id: 101,
            title: "Sprint 3 Report",
        };

        // First lookup: assignment not found.
        // Second lookup: assignment exists after duplicate conflict.
        query.maybeSingle
            .mockResolvedValueOnce({
                data: null,
                error: null,
            })
            .mockResolvedValueOnce({
                data: existingTask,
                error: null,
            });

        // Simulate Supabase unique constraint violation.
        query.single.mockResolvedValue({
            data: null,
            error: {
                code: "23505",
                message: "Duplicate assignment",
            },
        });

        const result = await importCanvasAssignment(
            "user-123",
            101
        );

        expect(result.created).toBe(false);
        expect(result.task).toEqual(existingTask);
        expect(query.insert).toHaveBeenCalledTimes(1);
    });

});