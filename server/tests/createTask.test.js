// Sprint 2 Task 4: dedicated, CI-focused Create Task coverage.
// Deterministic — real Express app + Supertest, mocked Supabase, no network,
// no real credentials. Scoped to POST /api/tasks only.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const authHeader = (userId = USER_ID) =>
  `Bearer ${signToken({ id: userId, email: "user@test.com" })}`;

const baseTask = {
  title: "Write Sprint 2 report",
  description: "Summarize velocity and blockers",
  due_date: "2026-11-01T00:00:00.000Z",
  point_value: 3,
  estimated_effort_minutes: 90,
  priority: "high",
  completion_status: "not_started",
};

const postTask = (body, { auth = authHeader(), skipAuth = false } = {}) => {
  const req = request(app).post("/api/tasks");
  if (!skipAuth) req.set("Authorization", auth);
  return req.send(body);
};

beforeEach(() => {
  supabase.__reset();
});

describe("Create Task — successful creation", () => {
  it("creates a task and returns all expected fields, owned by the authenticated user", async () => {
    const res = await postTask(baseTask);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const task = res.body.data;
    expect(task.title).toBe(baseTask.title);
    expect(task.description).toBe(baseTask.description);
    expect(task.due_date).toBe(baseTask.due_date);
    expect(task.point_value).toBe(baseTask.point_value);
    expect(task.estimated_effort_minutes).toBe(baseTask.estimated_effort_minutes);
    expect(task.priority).toBe(baseTask.priority);
    expect(task.completion_status).toBe("not_started");
    expect(task.user_id).toBe(USER_ID);
    expect(task.id).toBeDefined();
    expect(task.created_at).toBeDefined();
    expect(task.updated_at).toBeDefined();
  });

  it("persists exactly the expected fields to the database", async () => {
    await postTask(baseTask);

    const [stored] = supabase.__store.tasks;
    expect(stored.title).toBe(baseTask.title);
    expect(stored.description).toBe(baseTask.description);
    expect(stored.due_date).toBe(baseTask.due_date);
    expect(stored.point_value).toBe(baseTask.point_value);
    expect(stored.estimated_effort_minutes).toBe(baseTask.estimated_effort_minutes);
    expect(stored.priority).toBe(baseTask.priority);
    expect(stored.completion_status).toBe("not_started");
    expect(stored.user_id).toBe(USER_ID);
  });

  it("ignores a client-supplied user_id in favor of the authenticated user's id", async () => {
    const res = await postTask({ ...baseTask, user_id: OTHER_USER_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.user_id).toBe(USER_ID);
    expect(supabase.__store.tasks[0].user_id).toBe(USER_ID);
  });
});

describe("Create Task — field validation", () => {
  it("rejects a missing title", async () => {
    const res = await postTask({ ...baseTask, title: undefined });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects a blank/whitespace-only title", async () => {
    const res = await postTask({ ...baseTask, title: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid priority", async () => {
    const res = await postTask({ ...baseTask, priority: "urgent" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });

  it("rejects an invalid completion_status", async () => {
    const res = await postTask({ ...baseTask, completion_status: "done" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/completion_status/i);
  });

  it("rejects an invalid due_date", async () => {
    const res = await postTask({ ...baseTask, due_date: "not-a-real-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/due_date/i);
  });

  it("rejects a non-string description", async () => {
    const res = await postTask({ ...baseTask, description: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/description/i);
  });

  it("rejects a non-numeric point_value", async () => {
    const res = await postTask({ ...baseTask, point_value: "not-a-number" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/point_value/i);
  });

  it("rejects a negative point_value", async () => {
    const res = await postTask({ ...baseTask, point_value: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/point_value/i);
  });

  it("rejects a non-integer estimated_effort_minutes", async () => {
    const res = await postTask({ ...baseTask, estimated_effort_minutes: 12.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estimated_effort_minutes/i);
  });

  it("rejects a negative estimated_effort_minutes", async () => {
    const res = await postTask({ ...baseTask, estimated_effort_minutes: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estimated_effort_minutes/i);
  });

  it("accepts zero as a valid point_value and estimated_effort_minutes", async () => {
    const res = await postTask({
      ...baseTask,
      point_value: 0,
      estimated_effort_minutes: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.point_value).toBe(0);
    expect(res.body.data.estimated_effort_minutes).toBe(0);
  });
});

describe("Create Task — authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await postTask(baseTask, { skipAuth: true });
    expect(res.status).toBe(401);
    expect(supabase.__store.tasks ?? []).toHaveLength(0);
  });

  it("rejects a request with a malformed token", async () => {
    const res = await postTask(baseTask, { auth: "Bearer not-a-real-token" });
    expect(res.status).toBe(401);
    expect(supabase.__store.tasks ?? []).toHaveLength(0);
  });
});

describe("Create Task — failure handling", () => {
  it("returns a 500 and does not report success when the database insert fails", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: "simulated insert failure" },
              }),
          }),
        }),
      };
    });

    try {
      const res = await postTask(baseTask);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/simulated insert failure/i);
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }
  });
});
