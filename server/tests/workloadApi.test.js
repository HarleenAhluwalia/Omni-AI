
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


function mockDatabase(
  tasks,
  preferences,
  {
    taskError = null,
    preferencesError = null,
    schedules = [],
    schedulesError = null,
  } = {}
) {
  supabase.from.mockImplementation((table) => {
    if (table === "tasks") {
      return {
        select: () => ({
          eq: async () => ({
            data: tasks,
            error: taskError,
          }),
        }),
      };
    }

    if (table === "schedules") {
      return {
        select: () => ({
          eq: async () => ({
            data: schedules,
            error: schedulesError,
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
              error: preferencesError,
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

  test("rejects invalid timezone parameters", async () => {
    const response = await request(app)
      .get("/api/tasks/workload")
      .query({
        time_zone: "Invalid/Timezone",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Invalid time_zone.");

    // Invalid requests should fail before database access.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("returns 500 when task retrieval fails", async () => {
    mockDatabase([], null, {
      taskError: {
        message: "Database connection failed",
      },
    });

    const response = await request(app)
      .get("/api/tasks/workload");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(
      "Could not analyze workload."
    );
  });

  test("returns 500 when preferences retrieval fails", async () => {
    mockDatabase([], null, {
      preferencesError: {
        message: "Preferences query failed",
      },
    });

    const response = await request(app)
      .get("/api/tasks/workload");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(
      "Could not analyze workload."
    );
  });

  test("includes scheduled study blocks in workload predictions", async () => {
    const now = Date.now();

    // Assignment due approximately 2 hours from now.
    const dueDate = new Date(
      now + 120 * 60 * 1000
    ).toISOString();

    const tasks = [
      {
        id: "task-1",
        title: "Upcoming Assignment",
        due_date: dueDate,
        has_due_time: true,
        estimated_effort_minutes: 90,
        priority: "high",
        completion_status: "not_started",
      },
    ];

    // Another task occupies 60 minutes of the
    // available time before the deadline.
    const schedules = [
      {
        task_id: "other-task",
        start_time: new Date(
          now + 30 * 60 * 1000
        ).toISOString(),
        end_time: new Date(
          now + 90 * 60 * 1000
        ).toISOString(),
        schedule_type: "study_block",
        status: "scheduled",
      },
    ];

    mockDatabase(tasks, {
      daily_workload_limit_minutes: 240,
    }, {
      schedules,
    });

    const response = await request(app)
      .get("/api/tasks/workload");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify that the schedule query was executed.
    expect(supabase.from).toHaveBeenCalledWith(
      "schedules"
    );

    // The 90-minute assignment cannot fit into
    // approximately 60 minutes of unreserved time.
    const risk =
      response.body.data.timeAwareCapacityRisk;

    expect(risk).not.toBeNull();
    expect(risk.requiredMinutes).toBe(90);

    // Allow minor differences from request execution time.
    expect(risk.availableMinutes).toBeGreaterThanOrEqual(55);
    expect(risk.availableMinutes).toBeLessThanOrEqual(60);

    expect(risk.shortfallMinutes).toBeGreaterThanOrEqual(30);

    expect(
      response.body.data.warnings.map(
        (warning) => warning.type
      )
    ).toContain("deadline_time_capacity");
  });

});
