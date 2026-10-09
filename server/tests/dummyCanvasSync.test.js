
jest.mock("../config/supabase", () => ({
    from: jest.fn(),
}));

const supabase = require("../config/supabase");

const {
    findImportedTask,
    updateImportedTask,
} = require("../services/dummyCanvasSyncService");

describe("Dummy Canvas Assignment Synchronization", () => {
    let query;

    beforeEach(() => {
        jest.clearAllMocks();

        query = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
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
        // Simulate an assignment that does not exist in Omni-AI.
        query.maybeSingle.mockResolvedValue({
            data: null,
            error: null,
        });

        const assignment = {
            id: 999,
            courseId: 1,
            title: "New Canvas Assignment",
            dueDate: "2026-10-20",
            points: 50,
        };

        const result = await updateImportedTask(
            "user-123",
            assignment
        );

        // No existing task was found.
        expect(result).toBeNull();

        // No existing task should be updated.
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

});