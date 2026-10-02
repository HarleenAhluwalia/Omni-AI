// Sprint 2 Task 5: dedicated, CI-focused Edit Task coverage.
// Deterministic — real Express app + Supertest, mocked Supabase, no network,
// no real credentials. Scoped to PUT /api/tasks/:id only.
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
  priority: "medium",
  completion_status: "not_started",
};

const createAsUser = (userId = USER_ID, overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", authHeader(userId))
    .send({ ...baseTask, ...overrides });

const putTask = (id, body, { auth = authHeader(), skipAuth = false } = {}) => {
  const req = request(app).put(`/api/tasks/${id}`);
  if (!skipAuth) req.set("Authorization", auth);
  return req.send(body);
};

beforeEach(() => {
  supabase.__reset();
});

describe("Edit Task — successful update", () => {
  it("updates a representative set of editable fields and returns the updated task", async () => {
    const created = await createAsUser();

    const update = {
      title: "Updated title",
      description: "Updated description",
      due_date: "2026-12-15T00:00:00.000Z",
      point_value: 10,
      estimated_effort_minutes: 45,
      priority: "high",
      completion_status: "in_progress",
    };

    const res = await putTask(created.body.data.id, update);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject(update);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.user_id).toBe(USER_ID);
  });

  it("persists the expected update payload to the database", async () => {
    const created = await createAsUser();

    await putTask(created.body.data.id, {
      title: "Persisted update",
      priority: "low",
    });

    const stored = supabase.__store.tasks.find(
      (t) => t.id === created.body.data.id
    );
    expect(stored.title).toBe("Persisted update");
    expect(stored.priority).toBe("low");
  });

  it("targets only the specified task id, leaving others untouched", async () => {
    const target = await createAsUser(USER_ID, { title: "Target" });
    const other = await createAsUser(USER_ID, { title: "Other" });

    await putTask(target.body.data.id, { title: "Renamed" });

    const untouched = supabase.__store.tasks.find(
      (t) => t.id === other.body.data.id
    );
    expect(untouched.title).toBe("Other");
  });
});

describe("Edit Task — ownership/security", () => {
  it("filters the update by both task id and authenticated user id", async () => {
    const created = await createAsUser(USER_ID);

    const res = await putTask(created.body.data.id, { title: "Hijacked" }, {
      auth: authHeader(OTHER_USER_ID),
    });

    expect(res.status).toBe(404);

    const stored = supabase.__store.tasks.find(
      (t) => t.id === created.body.data.id
    );
    expect(stored.title).toBe(baseTask.title);
  });

  it("returns 404 for a task id that doesn't exist", async () => {
    const res = await putTask(
      "99999999-9999-4999-8999-999999999999",
      { title: "Nope" }
    );
    expect(res.status).toBe(404);
  });
});

describe("Edit Task — protected fields", () => {
  it("ignores an attempt to reassign user_id via the body", async () => {
    const created = await createAsUser();

    const res = await putTask(created.body.data.id, {
      title: "Still mine",
      user_id: OTHER_USER_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user_id).toBe(USER_ID);
  });

  it("ignores client-supplied id/created_at/updated_at", async () => {
    const created = await createAsUser();
    const originalCreatedAt = created.body.data.created_at;

    const res = await putTask(created.body.data.id, {
      title: "Still mine",
      id: "00000000-0000-4000-8000-000000000999",
      created_at: "2000-01-01T00:00:00.000Z",
      updated_at: "2000-01-01T00:00:00.000Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.created_at).toBe(originalCreatedAt);
    // updated_at is legitimately refreshed by the update itself — it should
    // have moved on from the client's attempted value, not been pinned to it.
    expect(res.body.data.updated_at).not.toBe("2000-01-01T00:00:00.000Z");
  });
});

describe("Edit Task — validation", () => {
  it("rejects an update with no fields", async () => {
    const created = await createAsUser();
    const res = await putTask(created.body.data.id, {});
    expect(res.status).toBe(400);
  });

  it("rejects clearing the title to blank", async () => {
    const created = await createAsUser();
    const res = await putTask(created.body.data.id, { title: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid priority", async () => {
    const created = await createAsUser();
    const res = await putTask(created.body.data.id, { priority: "urgent" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });

  it("rejects an invalid completion_status", async () => {
    const created = await createAsUser();
    const res = await putTask(created.body.data.id, {
      completion_status: "done",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/completion_status/i);
  });

  it("rejects a negative point_value", async () => {
    const created = await createAsUser();
    const res = await putTask(created.body.data.id, { point_value: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/point_value/i);
  });

  it("rejects a non-integer estimated_effort_minutes", async () => {
    const created = await createAsUser();
    const res = await putTask(created.body.data.id, {
      estimated_effort_minutes: 12.5,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estimated_effort_minutes/i);
  });
});

describe("Edit Task — authentication", () => {
  it("rejects an update with no Authorization header", async () => {
    const created = await createAsUser();
    const res = await putTask(
      created.body.data.id,
      { title: "Nope" },
      { skipAuth: true }
    );
    expect(res.status).toBe(401);
  });

  it("rejects an update with a malformed token", async () => {
    const created = await createAsUser();
    const res = await putTask(
      created.body.data.id,
      { title: "Nope" },
      { auth: "Bearer not-a-real-token" }
    );
    expect(res.status).toBe(401);
  });
});

describe("Edit Task — failure handling", () => {
  it("returns a 500 and does not report success when the database update fails", async () => {
    const created = await createAsUser();

    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: "simulated update failure" },
                  }),
              }),
            }),
          }),
        }),
      };
    });

    try {
      const res = await putTask(created.body.data.id, { title: "Nope" });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/simulated update failure/i);
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }
  });
});
