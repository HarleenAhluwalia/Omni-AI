
jest.mock("../config/supabase", () => {
    const { createMockSupabase } = require("./helpers/supabaseMock");
    return createMockSupabase();
});

jest.mock("../services/dummyCanvasSyncService", () => ({
    ...jest.requireActual("../services/dummyCanvasSyncService"),
    importCanvasAssignment: jest.fn(),
    updateImportedTask: jest.fn(),
}));

const {
    importCanvasAssignment,
    updateImportedTask,
} = require("../services/dummyCanvasSyncService");

const request = require("supertest");
const { createApp } = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const authHeader = () =>
    `Bearer ${signToken({
        id: "11111111-1111-4111-8111-111111111111",
        email: "user@test.com",
    })}`;

describe("Dummy Canvas API", () => {

    test("rejects requests without authentication", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/courses");

        expect(res.status).toBe(401);
    });

    test("rejects invalid authentication tokens", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/courses")
            .set("Authorization", "Bearer invalid-token");

        expect(res.status).toBe(401);
    });

    test("returns all simulated courses", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/courses")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(3);
    });

    test("returns all simulated assignments", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(5);
    });

    test("filters assignments by course", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments?courseId=1")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
    });

    test("retrieves an individual assignment", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments/101")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.data.title).toBe("Sprint 3 Report");
        expect(res.body.data.points).toBe(100);
    });

    test("returns 404 for nonexistent assignments", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments/999")
            .set("Authorization", authHeader());

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe("Assignment not found");
    });


    test("processes a valid imported assignment", async () => {
        const res = await request(app)
            .post("/api/dummy-canvas/process-assignment")
            .set("Authorization", authHeader())
            .send({
                assignment: {
                    id: 101,
                    courseId: 1,
                    title: "Sprint 3 Report",
                    dueDate: "2026-10-12",
                    points: 100,
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        expect(res.body.data.source).toEqual({
            assignmentId: 101,
            courseId: 1,
        });

        expect(res.body.data.task).toMatchObject({
            title: "Sprint 3 Report",
            due_date: "2026-10-12T23:59:59.999Z",
            point_value: 100,
            priority: "medium",
            completion_status: "not_started",
        });
    });

    test("rejects imported assignments with missing titles", async () => {
        const res = await request(app)
            .post("/api/dummy-canvas/process-assignment")
            .set("Authorization", authHeader())
            .send({
                assignment: {
                    id: 101,
                    courseId: 1,
                    title: "",
                    dueDate: "2026-10-12",
                    points: 100,
                },
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe(
            "Assignment title is required"
        );
    });

    test("rejects requests without assignment data", async () => {
        const res = await request(app)
            .post("/api/dummy-canvas/process-assignment")
            .set("Authorization", authHeader())
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
            "Assignment data is required"
        );
    });

    test("requires authentication for assignment processing", async () => {
        const res = await request(app)
            .post("/api/dummy-canvas/process-assignment")
            .send({
                assignment: {
                    id: 101,
                    courseId: 1,
                    title: "Sprint 3 Report",
                    dueDate: "2026-10-12",
                    points: 100,
                },
            });

        expect(res.status).toBe(401);
    });

    test("rejects locked Canvas assignments", async () => {
        const res = await request(app)
            .post("/api/dummy-canvas/process-assignment")
            .set("Authorization", authHeader())
            .send({
                assignment: {
                    id: 301,
                    courseId: 3,
                    title: "Art Homework",
                    dueDate: "2026-10-20",
                    points: 20,
                    locked: false,
                },
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe(
            "This Canvas assignment is locked"
        );
    });

    test("allows processing unlocked Canvas assignments", async () => {
        const res = await request(app)
            .post("/api/dummy-canvas/process-assignment")
            .set("Authorization", authHeader())
            .send({
                assignment: {
                    id: 101,
                    courseId: 1,
                    title: "Sprint 3 Report",
                    dueDate: "2026-10-12",
                    points: 100,
                    locked: false,
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.source.assignmentId).toBe(101);
    });

    test.each([
        ["unavailable", 503, "CANVAS_UNAVAILABLE"],
        ["timeout", 504, "CANVAS_TIMEOUT"],
        ["rate_limit", 429, "CANVAS_RATE_LIMIT"],
    ])(
        "simulates Canvas %s error correctly",
        async (errorType, expectedStatus, expectedCode) => {
            const res = await request(app)
                .get(
                    `/api/dummy-canvas/courses?simulateError=${errorType}`
                )
                .set("Authorization", authHeader());

            expect(res.status).toBe(expectedStatus);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe(expectedCode);
            expect(typeof res.body.error).toBe("string");
        }
    );

    test.each([
        ["unavailable", 503, "CANVAS_UNAVAILABLE"],
        ["timeout", 504, "CANVAS_TIMEOUT"],
        ["rate_limit", 429, "CANVAS_RATE_LIMIT"],
    ])(
        "simulates assignment retrieval %s error",
        async (errorType, expectedStatus, expectedCode) => {
            const res = await request(app)
                .get(
                    `/api/dummy-canvas/assignments?simulateError=${errorType}`
                )
                .set("Authorization", authHeader());

            expect(res.status).toBe(expectedStatus);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe(expectedCode);
            expect(typeof res.body.error).toBe("string");
        }
    );

    test("disables error simulation in production", async () => {
        const originalEnv = process.env.NODE_ENV;

        try {
            // Temporarily simulate production mode.
            process.env.NODE_ENV = "production";

            const res = await request(app)
                .get(
                    "/api/dummy-canvas/courses?simulateError=timeout"
                )
                .set("Authorization", authHeader());

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe(
                "SIMULATION_DISABLED"
            );
            expect(res.body.error).toBe(
                "Error simulation is disabled in production"
            );
        } finally {
            // Restore the original environment.
            if (originalEnv === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = originalEnv;
            }
        }
    });

    describe("Dummy Canvas Import API", () => {

        beforeEach(() => {
            importCanvasAssignment.mockReset();
        });

        test("imports a new Canvas assignment", async () => {
            const createdTask = {
                id: "task-uuid-123",
                user_id: "11111111-1111-4111-8111-111111111111",
                title: "Sprint 3 Report",
                canvas_course_id: 1,
                canvas_assignment_id: 101,
                point_value: 100,
            };

            importCanvasAssignment.mockResolvedValue({
                created: true,
                task: createdTask,
            });

            const res = await request(app)
                .post("/api/dummy-canvas/import-assignment")
                .set("Authorization", authHeader())
                .send({ assignmentId: 101 });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.created).toBe(true);
            expect(res.body.data).toEqual(createdTask);

            expect(importCanvasAssignment).toHaveBeenCalledWith(
                "11111111-1111-4111-8111-111111111111",
                101
            );
        });

        test("prevents duplicate assignment imports", async () => {
            const existingTask = {
                id: "task-uuid-123",
                title: "Sprint 3 Report",
                canvas_assignment_id: 101,
            };

            importCanvasAssignment.mockResolvedValue({
                created: false,
                task: existingTask,
            });

            const res = await request(app)
                .post("/api/dummy-canvas/import-assignment")
                .set("Authorization", authHeader())
                .send({ assignmentId: 101 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.created).toBe(false);
            expect(res.body.data).toEqual(existingTask);
        });

        test("rejects missing assignment IDs", async () => {
            const res = await request(app)
                .post("/api/dummy-canvas/import-assignment")
                .set("Authorization", authHeader())
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(importCanvasAssignment).not.toHaveBeenCalled();
        });

        test("rejects locked Canvas assignments", async () => {
            importCanvasAssignment.mockRejectedValue(
                new Error("This Canvas assignment is locked")
            );

            const res = await request(app)
                .post("/api/dummy-canvas/import-assignment")
                .set("Authorization", authHeader())
                .send({ assignmentId: 301 });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe(
                "This Canvas assignment is locked"
            );
        });

        test("rejects nonexistent Canvas assignments", async () => {
            importCanvasAssignment.mockRejectedValue(
                new Error("Canvas assignment not found")
            );

            const res = await request(app)
                .post("/api/dummy-canvas/import-assignment")
                .set("Authorization", authHeader())
                .send({ assignmentId: 999 });

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe(
                "Canvas assignment not found"
            );
        });

        test("synchronizes an existing imported assignment", async () => {
            const updatedTask = {
                id: "task-uuid-123",
                title: "Sprint 3 Report",
                due_date: "2026-10-15T23:59:59.999Z",
                point_value: 150,
                priority: "medium",
                completion_status: "not_started",
            };

            updateImportedTask.mockResolvedValue(updatedTask);

            const assignment = {
                id: 101,
                courseId: 1,
                title: "Sprint 3 Report",
                dueDate: "2026-10-15",
                points: 150,
            };

            const res = await request(app)
                .put("/api/dummy-canvas/sync-assignment")
                .set("Authorization", authHeader())
                .send({ assignment });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual(updatedTask);

            expect(updateImportedTask).toHaveBeenCalledWith(
                "11111111-1111-4111-8111-111111111111",
                assignment
            );
        });

        test("rejects synchronization of locked assignments", async () => {
            updateImportedTask.mockRejectedValue(
                new Error("This Canvas assignment is locked")
            );

            const res = await request(app)
                .put("/api/dummy-canvas/sync-assignment")
                .set("Authorization", authHeader())
                .send({
                    assignment: {
                        id: 301,
                        courseId: 3,
                        title: "Art Homework",
                        dueDate: "2026-10-20",
                        points: 20,
                    },
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe(
                "This Canvas assignment is locked"
            );
        });

        test("returns 404 when imported assignment does not exist", async () => {
            updateImportedTask.mockResolvedValue(null);

            const res = await request(app)
                .put("/api/dummy-canvas/sync-assignment")
                .set("Authorization", authHeader())
                .send({
                    assignment: {
                        id: 102,
                        courseId: 1,
                        title: "Frontend Implementation",
                        dueDate: "2026-10-15",
                        points: 50,
                    },
                });

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe(
                "Imported assignment not found"
            );
        });

        test("rejects synchronization without assignment data", async () => {
            const res = await request(app)
                .put("/api/dummy-canvas/sync-assignment")
                .set("Authorization", authHeader())
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

    });

    test("returns courses with required fields", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/courses")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        for (const course of res.body.data) {
            expect(course).toEqual(
                expect.objectContaining({
                    id: expect.any(Number),
                    name: expect.any(String),
                })
            );

            expect(course.id).toBeGreaterThan(0);
            expect(course.name.trim().length).toBeGreaterThan(0);
        }
    });

    test("returns assignments with required fields", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        for (const assignment of res.body.data) {
            expect(assignment).toEqual(
                expect.objectContaining({
                    id: expect.any(Number),
                    courseId: expect.any(Number),
                    title: expect.any(String),
                    points: expect.any(Number),
                    locked: expect.any(Boolean),
                })
            );

            expect(assignment.title.trim().length).toBeGreaterThan(0);
            expect(assignment.points).toBeGreaterThanOrEqual(0);

            if (assignment.dueDate !== null) {
                expect(typeof assignment.dueDate).toBe("string");
                expect(
                    Number.isNaN(Date.parse(assignment.dueDate))
                ).toBe(false);
            }
        }
    });

    test("returns all assignments when courseId is omitted", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(5);
    });

    test("returns empty assignments for a nonexistent course", async () => {
        const res = await request(app)
            .get("/api/dummy-canvas/assignments?courseId=999")
            .set("Authorization", authHeader());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
    });

    test.each([
        "abc",
        "",
        "0",
        "-2",
        "1.5",
    ])(
        "rejects malformed courseId: %p",
        async (courseId) => {
            const res = await request(app)
                .get(
                    `/api/dummy-canvas/assignments?courseId=${encodeURIComponent(courseId)}`
                )
                .set("Authorization", authHeader());

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe(
                "Valid courseId is required"
            );
        }
    );

    test("rejects multiple courseId parameters", async () => {
        const res = await request(app)
            .get(
                "/api/dummy-canvas/assignments?courseId=1&courseId=2"
            )
            .set("Authorization", authHeader());

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

});