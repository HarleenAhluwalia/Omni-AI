// Sprint 2 Task 7: cross-cutting Task API/database contract verification.
// Ties together Create/Edit/Delete rather than duplicating them — focuses on
// (a) the exact Supabase filter/payload arguments used per operation, and
// (b) a single lifecycle proving field consistency across every step.
// Deterministic — real Express app + Supertest, mocked Supabase, no network.
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

const EXPECTED_RESPONSE_KEYS = [
  "completion_status",
  "created_at",
  "description",
  "due_date",
  "estimated_effort_minutes",
  "id",
  "point_value",
  "priority",
  "title",
  "updated_at",
  "user_id",
].sort();

// Wraps supabase.from("tasks") so a test can inspect the exact arguments
// passed to .eq()/.insert()/.update(), while still delegating to the real
// mock underneath so behavior (data, errors) is unaffected. Every chain
// method in the mock returns the same builder instance, so it's safe for
// this wrapper to always hand back itself to keep the chain intact.
function spyOnTasksFrom() {
  const originalFrom = supabase.from;
  const calls = { eq: [], insert: null, update: null, deleted: false };

  supabase.from = jest.fn((table) => {
    const real = originalFrom(table);
    if (table !== "tasks") {
      return real;
    }

    const wrapper = {
      select(...args) {
        real.select(...args);
        return wrapper;
      },
      eq(...args) {
        calls.eq.push(args);
        real.eq(...args);
        return wrapper;
      },
      insert(rows) {
        calls.insert = rows;
        real.insert(rows);
        return wrapper;
      },
      update(fields) {
        calls.update = fields;
        real.update(fields);
        return wrapper;
      },
      delete(...args) {
        calls.deleted = true;
        real.delete(...args);
        return wrapper;
      },
      order(...args) {
        return real.order(...args);
      },
      single(...args) {
        return real.single(...args);
      },
      maybeSingle(...args) {
        return real.maybeSingle(...args);
      },
    };
    return wrapper;
  });

  return {
    calls,
    restore: () => {
      supabase.from = originalFrom;
    },
  };
}

beforeEach(() => {
  supabase.__reset();
});

describe("Task API contract — response shape", () => {
  it("returns exactly the documented fields, no more and no fewer", async () => {
    // Matches what AddTask.jsx actually sends: every field present, blank
    // optional ones explicit as null rather than omitted. The mock (unlike
    // real Postgres) doesn't backfill omitted columns as null, so this is
    // the realistic request shape, not a relaxed one.
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader())
      .send({
        title: "Shape check",
        description: null,
        due_date: null,
        point_value: null,
        estimated_effort_minutes: null,
        priority: "medium",
        completion_status: "not_started",
      });

    expect(Object.keys(res.body.data).sort()).toEqual(EXPECTED_RESPONSE_KEYS);
  });
});

describe("Task API contract — database query filters", () => {
  it("GET /tasks filters by authenticated user_id", async () => {
    const spy = spyOnTasksFrom();
    try {
      await request(app).get("/api/tasks").set("Authorization", authHeader());
      expect(spy.calls.eq).toContainEqual(["user_id", USER_ID]);
    } finally {
      spy.restore();
    }
  });

  it("GET /tasks/:id filters by id and authenticated user_id", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader())
      .send({ title: "Read filter check" });

    const spy = spyOnTasksFrom();
    try {
      await request(app)
        .get(`/api/tasks/${created.body.data.id}`)
        .set("Authorization", authHeader());

      expect(spy.calls.eq).toContainEqual(["id", created.body.data.id]);
      expect(spy.calls.eq).toContainEqual(["user_id", USER_ID]);
    } finally {
      spy.restore();
    }
  });

  it("PUT /tasks/:id filters by id and authenticated user_id, and never sends protected fields in the update payload", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader())
      .send({ title: "Update filter check" });

    const spy = spyOnTasksFrom();
    try {
      await request(app)
        .put(`/api/tasks/${created.body.data.id}`)
        .set("Authorization", authHeader())
        .send({
          title: "Renamed",
          id: "00000000-0000-4000-8000-000000000999",
          user_id: OTHER_USER_ID,
          created_at: "2000-01-01T00:00:00.000Z",
          updated_at: "2000-01-01T00:00:00.000Z",
        });

      expect(spy.calls.eq).toContainEqual(["id", created.body.data.id]);
      expect(spy.calls.eq).toContainEqual(["user_id", USER_ID]);

      expect(spy.calls.update).not.toHaveProperty("id");
      expect(spy.calls.update).not.toHaveProperty("user_id");
      expect(spy.calls.update).not.toHaveProperty("created_at");
      expect(spy.calls.update).not.toHaveProperty("updated_at");
    } finally {
      spy.restore();
    }
  });

  it("DELETE /tasks/:id filters by id and authenticated user_id", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader())
      .send({ title: "Delete filter check" });

    const spy = spyOnTasksFrom();
    try {
      await request(app)
        .delete(`/api/tasks/${created.body.data.id}`)
        .set("Authorization", authHeader());

      expect(spy.calls.deleted).toBe(true);
      expect(spy.calls.eq).toContainEqual(["id", created.body.data.id]);
      expect(spy.calls.eq).toContainEqual(["user_id", USER_ID]);
    } finally {
      spy.restore();
    }
  });

  it("POST /tasks inserts with the authenticated user's id, ignoring client-supplied id/user_id/created_at/updated_at", async () => {
    const spy = spyOnTasksFrom();
    try {
      await request(app)
        .post("/api/tasks")
        .set("Authorization", authHeader())
        .send({
          title: "Insert payload check",
          id: "00000000-0000-4000-8000-000000000999",
          user_id: OTHER_USER_ID,
          created_at: "2000-01-01T00:00:00.000Z",
          updated_at: "2000-01-01T00:00:00.000Z",
        });

      const [insertedRow] = spy.calls.insert;
      expect(insertedRow.user_id).toBe(USER_ID);
      expect(insertedRow.id).toBeUndefined();
      expect(insertedRow.created_at).toBeUndefined();
      expect(insertedRow.updated_at).toBeUndefined();
    } finally {
      spy.restore();
    }
  });
});

describe("Task API contract — full lifecycle consistency", () => {
  it("keeps fields, types, and ownership consistent through create -> read -> update -> read -> delete -> read", async () => {
    // Create
    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader())
      .send({
        title: "Lifecycle task",
        description: "Initial description",
        due_date: "2026-11-20T00:00:00.000Z",
        point_value: 5,
        estimated_effort_minutes: 60,
        priority: "medium",
        completion_status: "not_started",
      });
    expect(created.status).toBe(201);
    const taskId = created.body.data.id;

    expect(typeof created.body.data.point_value).toBe("number");
    expect(typeof created.body.data.estimated_effort_minutes).toBe("number");
    expect(Number.isInteger(created.body.data.estimated_effort_minutes)).toBe(true);
    expect(created.body.data.user_id).toBe(USER_ID);

    // Read (single) reflects exactly what was created
    const readAfterCreate = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader());
    expect(readAfterCreate.body.data).toMatchObject({
      title: "Lifecycle task",
      description: "Initial description",
      point_value: 5,
      estimated_effort_minutes: 60,
      priority: "medium",
      completion_status: "not_started",
    });

    // Read (list) includes it for the owner, and is invisible to another user
    const listForOwner = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    expect(listForOwner.body.data.map((t) => t.id)).toContain(taskId);

    const listForOtherUser = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader(OTHER_USER_ID));
    expect(listForOtherUser.body.data.map((t) => t.id)).not.toContain(taskId);

    // Update changes exactly the submitted fields, types stay numeric
    const updated = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader())
      .send({
        point_value: 8,
        estimated_effort_minutes: 30,
        completion_status: "completed",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.point_value).toBe(8);
    expect(typeof updated.body.data.point_value).toBe("number");
    expect(updated.body.data.estimated_effort_minutes).toBe(30);
    expect(updated.body.data.completion_status).toBe("completed");
    // Fields not touched by the update are unchanged
    expect(updated.body.data.title).toBe("Lifecycle task");
    expect(updated.body.data.user_id).toBe(USER_ID);

    // Read again reflects the update, not the original values
    const readAfterUpdate = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader());
    expect(readAfterUpdate.body.data.point_value).toBe(8);
    expect(readAfterUpdate.body.data.completion_status).toBe("completed");

    // Delete removes it
    const deleted = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader());
    expect(deleted.status).toBe(200);

    // Read again confirms it's gone, not silently still present
    const readAfterDelete = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader());
    expect(readAfterDelete.status).toBe(404);

    const listAfterDelete = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    expect(listAfterDelete.body.data.map((t) => t.id)).not.toContain(taskId);
  });
});
