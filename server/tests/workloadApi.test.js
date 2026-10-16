
const request = require("supertest");
const express = require("express");

jest.mock("../config/supabase", () => ({
  from: jest.fn(),
}));

// Simulate an authenticated user for route testing.
jest.mock("../src/middleware/auth", () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: "test-user" };
    next();
  },
}));

const supabase = require("../config/supabase");
const taskRoutes = require("../routes/taskRoutes");

const app = express();
app.use(express.json());
app.use("/api/tasks", taskRoutes);

function mockDatabase(tasks, preferences) {
  supabase.from.mockImplementation((table) => {
    if (table === "tasks") {
      return {
        select: () => ({
          eq: async () => ({
            data: tasks,
            error: null,
          }),
        }),
      };
    }

    if (table === "preferences") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: preferences,
              error: null,
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("UC-14 Workload API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns workload predictions and warnings", async () => {
    const dueDate = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    mockDatabase(
      [
        {
          id: "task-1",
          title: "Sprint Assignment",
          due_date: dueDate,
          estimated_effort_minutes: 200,
          priority: "high",
          completion_status: "not_started",
        },
      ],
      {
        daily_workload_limit_minutes: 20,
      }
    );

    const response = await request(app)
      .get("/api/tasks/workload");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.requiredMinutes).toBe(200);
    expect(response.body.data.availableMinutes).toBe(140);
    expect(response.body.data.overloadMinutes).toBe(60);
    expect(response.body.data.isOverloaded).toBe(true);

    expect(
      response.body.data.warnings.map((w) => w.type)
    ).toContain("overload");

    expect(
      response.body.data.recommendedTasks[0].id
    ).toBe("task-1");
  });

  test("uses default study limit when preferences are missing", async () => {
    mockDatabase([], null);

    const response = await request(app)
      .get("/api/tasks/workload");

    expect(response.status).toBe(200);
    expect(response.body.data.dailyLimitMinutes).toBe(240);
    expect(response.body.data.availableMinutes).toBe(1680);
    expect(response.body.data.isOverloaded).toBe(false);
  });
});
