
jest.mock("../config/supabase", () => {
    const { createMockSupabase } = require("./helpers/supabaseMock");
    return createMockSupabase();
});

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

});