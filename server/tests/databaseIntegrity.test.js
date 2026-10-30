// Sprint 4: Database integrity test cases (Jira: Develop Database
// Integrity Test Cases).
//
// Deterministic — real Express app + Supertest, mocked Supabase, no
// network, no real credentials. This file deliberately does NOT
// duplicate the extensive existing coverage in createTask.test.js,
// editTask.test.js, deleteTask.test.js, taskApiContract.test.js,
// tasks.test.js, taskAuth.test.js, or taskWorkflow.test.js — see
// docs/testing-evidence/sprint-4/database-integrity-test-cases.md for
// the full existing-coverage inventory. Every test here targets a
// genuine gap identified during that review.
//
// IMPORTANT: a mocked Supabase client can prove application-level
// behavior (what the controller does with whatever the client returns),
// but it cannot prove real Postgres constraints (foreign keys, column
// type limits, cascade behavior, concurrent-transaction semantics).
// Anything that needs a live database to actually verify is documented
// as a DB-LIVE-* case in the test documentation, not asserted here.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");
const { createTask } = require("../controllers/taskController");

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";

const authHeader = (userId = USER_ID) =>
  `Bearer ${signToken({ id: userId, email: "user@test.com" })}`;

const createAsUser = (overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", authHeader())
    .send({
      title: "Database integrity fixture task",
      priority: "medium",
      completion_status: "not_started",
      ...overrides,
    });

beforeEach(() => {
  supabase.__reset();
});

// =========================================================
// DB-AUTO-001: Task Updates — repeated updates do not corrupt data
// =========================================================
describe("Database integrity — repeated updates (Section B)", () => {
  it("DB-AUTO-001: three sequential updates leave the task in exactly the last-written state, with no drift", async () => {
    const created = await createAsUser({ title: "Original title", priority: "low" });
    const id = created.body.data.id;

    await request(app)
      .put(`/api/tasks/${id}`)
      .set("Authorization", authHeader())
      .send({ title: "Second title" });

    await request(app)
      .put(`/api/tasks/${id}`)
      .set("Authorization", authHeader())
      .send({ priority: "high" });

    const third = await request(app)
      .put(`/api/tasks/${id}`)
      .set("Authorization", authHeader())
      .send({ completion_status: "completed" });

    expect(third.status).toBe(200);
    expect(third.body.data.title).toBe("Second title");
    expect(third.body.data.priority).toBe("high");
    expect(third.body.data.completion_status).toBe("completed");

    const fetched = await request(app)
      .get(`/api/tasks/${id}`)
      .set("Authorization", authHeader());

    expect(fetched.body.data).toEqual(third.body.data);
  });
});

// =========================================================
// DB-AUTO-002/003: Invalid Task identifiers — GET and PUT
// (DELETE's equivalent is already covered by deleteTask.test.js)
// =========================================================
describe("Database integrity — invalid Task identifiers (Section E)", () => {
  it("DB-AUTO-002: GET /api/tasks/:id rejects a malformed (non-UUID) id", async () => {
    const res = await request(app)
      .get("/api/tasks/not-a-real-uuid")
      .set("Authorization", authHeader());

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("DB-AUTO-003: PUT /api/tasks/:id rejects a malformed (non-UUID) id", async () => {
    const res = await request(app)
      .put("/api/tasks/not-a-real-uuid")
      .set("Authorization", authHeader())
      .send({ title: "Should not apply" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// =========================================================
// DB-AUTO-004: Task Deletion — relationship behavior per the mock
// =========================================================
describe("Database integrity — deletion and related records (Section C)", () => {
  it("DB-AUTO-004: deleting a Task does not automatically remove an associated schedule row (mock has no FK/cascade awareness)", async () => {
    const created = await createAsUser({ title: "Task with a schedule" });
    const taskId = created.body.data.id;

    // Seed a schedule row referencing this task directly, mirroring how
    // aiController.js's schedule-row creation shapes it - the mock store
    // has no foreign-key or cascade logic at all, so this is purely
    // documenting what the MOCK does, not what real Postgres would do.
    supabase.__store.schedules.push({
      id: "sched-1",
      user_id: USER_ID,
      task_id: taskId,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 1800000).toISOString(),
      schedule_type: "study_block",
      status: "scheduled",
    });

    const del = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader());

    expect(del.status).toBe(200);

    const orphanedSchedule = supabase.__store.schedules.find(
      (s) => s.id === "sched-1"
    );

    expect(orphanedSchedule).toBeDefined();
    expect(orphanedSchedule.task_id).toBe(taskId);
    // DOCUMENTED, NOT ASSERTED AS CORRECT: whether a real Postgres
    // foreign key (if one exists on schedules.task_id) would cascade,
    // restrict, or set null on delete is unconfirmed - see
    // DB-LIVE-001 in the test documentation. This test only proves
    // what the current mock/application layer actually does: nothing.
  });
});

// =========================================================
// DB-AUTO-005 (DB-DEFECT-001): Database Failure Handling — a genuinely
// thrown/rejected Supabase call, not an {error}-shaped response
//
// FIXED: createTask, updateTask, deleteTask, getTasks, and getTaskById
// now each wrap their database call in try/catch, matching the
// pre-existing pattern already used by getPrioritizedTasks and
// resolveSchedule. A rejected/thrown Supabase call is caught and turned
// into a controlled 500 with a generic message (never error.message or
// a stack trace), instead of propagating as an unhandled rejection that
// left the client with no response at all.
//
// Before the fix, these could only be tested by calling the handler
// directly (bypassing Express) - a real HTTP request's unhandled
// rejection was reported by Jest's own test-runner as a hard failure
// regardless of any assertion in this file, so it could not be
// expressed as a controlled, passing test. Now that the handlers catch
// their own errors, a real HTTP request behaves correctly and can be
// asserted on directly, which is what these tests now do.
// =========================================================
describe("Database integrity — simulated connection failures (Section F)", () => {
  it("DB-AUTO-005 (DB-DEFECT-001, fixed): createTask returns a controlled 500 when the database call rejects, instead of no response at all", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.reject(new Error("simulated connection failure with sensitive detail")),
          }),
        }),
      };
    });

    let res;
    try {
      res = await request(app)
        .post("/api/tasks")
        .set("Authorization", authHeader())
        .send({ title: "Should get a clean 500 now" })
        .timeout({ response: 3000, deadline: 3500 });
    } finally {
      supabase.from = originalFrom;
    }

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // Generic message only - never the raw error, which could leak
    // internal database details to a client.
    expect(res.body.error).toBe("Could not create task.");
    expect(res.body.error).not.toMatch(/sensitive detail/);
    expect(supabase.__store.tasks).toHaveLength(0);
  });

  it("DB-AUTO-008: getTasks returns a controlled 500 when the database call rejects", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.reject(new Error("simulated connection failure")),
          }),
        }),
      };
    });

    let res;
    try {
      res = await request(app)
        .get("/api/tasks")
        .set("Authorization", authHeader())
        .timeout({ response: 3000, deadline: 3500 });
    } finally {
      supabase.from = originalFrom;
    }

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Could not load tasks.");
  });

  it("DB-AUTO-009: deleteTask returns a controlled 500 when the database call rejects, and the task is not removed", async () => {
    const created = await createAsUser({ title: "Must survive a failed delete" });
    const taskId = created.body.data.id;

    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () =>
                  Promise.reject(new Error("simulated connection failure")),
              }),
            }),
          }),
        }),
      };
    });

    let res;
    try {
      res = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set("Authorization", authHeader())
        .timeout({ response: 3000, deadline: 3500 });
    } finally {
      supabase.from = originalFrom;
    }

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Could not delete task.");

    const stillThere = supabase.__store.tasks.find((t) => t.id === taskId);
    expect(stillThere).toBeDefined();
  });

  it("DB-AUTO-010: existing 400/404/success responses are unaffected by the fix (no double-response, no behavior change)", async () => {
    // 400: validation still short-circuits before the try block.
    const badCreate = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader())
      .send({ title: "" });
    expect(badCreate.status).toBe(400);

    // 404: a well-formed but nonexistent id still reaches the try
    // block, resolves normally (no error, no throw), and returns 404
    // exactly as before - the try/catch does not interfere.
    const missing = await request(app)
      .get("/api/tasks/99999999-9999-4999-8999-999999999999")
      .set("Authorization", authHeader());
    expect(missing.status).toBe(404);

    // 201: a normal successful create is unaffected.
    const ok = await createAsUser({ title: "Still works normally" });
    expect(ok.status).toBe(201);
    expect(ok.body.success).toBe(true);
  });
});

// =========================================================
// DB-AUTO-006: Database Failure Handling — unrelated data integrity
// =========================================================
describe("Database integrity — unrelated data survives a failure (Section F)", () => {
  it("DB-AUTO-006: an update failure on one task leaves a different, pre-existing task completely unchanged", async () => {
    const safeTask = await createAsUser({ title: "Must survive untouched" });
    const targetTask = await createAsUser({ title: "Update will fail" });
    const safeTaskBefore = safeTask.body.data;

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
      const res = await request(app)
        .put(`/api/tasks/${targetTask.body.data.id}`)
        .set("Authorization", authHeader())
        .send({ title: "Attempted change" });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    } finally {
      supabase.from = originalFrom;
    }

    const safeTaskAfter = supabase.__store.tasks.find(
      (t) => t.id === safeTaskBefore.id
    );
    expect(safeTaskAfter).toEqual(safeTaskBefore);
  });
});

// =========================================================
// DB-AUTO-007: Boundary values — upper bounds are not application-
// enforced (documents actual behavior, pairs with DB-LIVE-002)
// =========================================================
describe("Database integrity — boundary values (Section E)", () => {
  it("DB-AUTO-007: a very large (but JS-safe) point_value and estimated_effort_minutes are accepted - no application-level upper bound exists", async () => {
    const res = await createAsUser({
      title: "Boundary value task",
      point_value: 999999999,
      estimated_effort_minutes: 999999999,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.point_value).toBe(999999999);
    expect(res.body.data.estimated_effort_minutes).toBe(999999999);
    // NOT TESTED HERE: estimated_effort_minutes is a Postgres `integer`
    // column (max 2,147,483,647 per 001_initial_schema.sql). A value
    // like 999999999 above is still within int4 range and would be
    // accepted by a real database too. A value beyond int4 range would
    // be rejected by Postgres but is NOT rejected by validateFields()
    // or by this mock, since neither enforces column-level numeric
    // limits - see DB-LIVE-002.
  });
});
