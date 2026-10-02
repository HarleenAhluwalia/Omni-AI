// Sprint 2 Task 6: dedicated, CI-focused Delete Task coverage.
// Deterministic — real Express app + Supertest, mocked Supabase, no network,
// no real credentials. Scoped to DELETE /api/tasks/:id only.
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

const createAsUser = (userId = USER_ID, overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", authHeader(userId))
    .send({ title: "Task to delete", priority: "medium", ...overrides });

const deleteTask = (id, { auth = authHeader(), skipAuth = false } = {}) => {
  const req = request(app).delete(`/api/tasks/${id}`);
  if (!skipAuth) req.set("Authorization", auth);
  return req;
};

beforeEach(() => {
  supabase.__reset();
});

describe("Delete Task — successful deletion", () => {
  it("deletes an existing task and returns it in the response", async () => {
    const created = await createAsUser();

    const res = await deleteTask(created.body.data.id);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  it("removes the task from the database, not just the API response", async () => {
    const created = await createAsUser();

    await deleteTask(created.body.data.id);

    const stillStored = supabase.__store.tasks.find(
      (t) => t.id === created.body.data.id
    );
    expect(stillStored).toBeUndefined();
  });

  it("deletes only the targeted task id, leaving others intact", async () => {
    const keep = await createAsUser(USER_ID, { title: "Keep" });
    const remove = await createAsUser(USER_ID, { title: "Remove" });

    await deleteTask(remove.body.data.id);

    expect(supabase.__store.tasks).toHaveLength(1);
    expect(supabase.__store.tasks[0].id).toBe(keep.body.data.id);
  });
});

describe("Delete Task — ownership/security", () => {
  it("filters the delete by both task id and authenticated user id", async () => {
    const created = await createAsUser(USER_ID);

    const res = await deleteTask(created.body.data.id, {
      auth: authHeader(OTHER_USER_ID),
    });

    expect(res.status).toBe(404);

    // Task must still exist — the other user's delete must not have gone through.
    const stillStored = supabase.__store.tasks.find(
      (t) => t.id === created.body.data.id
    );
    expect(stillStored).toBeDefined();
  });

  it("does not falsely report success for a non-owned task", async () => {
    const created = await createAsUser(USER_ID);

    const res = await deleteTask(created.body.data.id, {
      auth: authHeader(OTHER_USER_ID),
    });

    expect(res.body.success).toBe(false);
  });
});

describe("Delete Task — invalid/missing task", () => {
  it("rejects a malformed (non-UUID) task id", async () => {
    const res = await deleteTask("not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a well-formed id that doesn't exist", async () => {
    const res = await deleteTask("99999999-9999-4999-8999-999999999999");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 404 when the same task is deleted twice", async () => {
    const created = await createAsUser();

    const first = await deleteTask(created.body.data.id);
    expect(first.status).toBe(200);

    const second = await deleteTask(created.body.data.id);
    expect(second.status).toBe(404);
  });
});

describe("Delete Task — authentication", () => {
  it("rejects a delete with no Authorization header", async () => {
    const created = await createAsUser();

    const res = await deleteTask(created.body.data.id, { skipAuth: true });

    expect(res.status).toBe(401);
    expect(
      supabase.__store.tasks.find((t) => t.id === created.body.data.id)
    ).toBeDefined();
  });

  it("rejects a delete with a malformed token", async () => {
    const created = await createAsUser();

    const res = await deleteTask(created.body.data.id, {
      auth: "Bearer not-a-real-token",
    });

    expect(res.status).toBe(401);
    expect(
      supabase.__store.tasks.find((t) => t.id === created.body.data.id)
    ).toBeDefined();
  });
});

describe("Delete Task — failure handling", () => {
  it("returns a 500 and does not report success when the database delete fails", async () => {
    const created = await createAsUser();

    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: "simulated delete failure" },
                  }),
              }),
            }),
          }),
        }),
      };
    });

    try {
      const res = await deleteTask(created.body.data.id);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/simulated delete failure/i);
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }

    // Since the real delete never went through (we intercepted it), the
    // task must still be in the store — the failure wasn't silently applied.
    expect(
      supabase.__store.tasks.find((t) => t.id === created.body.data.id)
    ).toBeDefined();
  });
});
