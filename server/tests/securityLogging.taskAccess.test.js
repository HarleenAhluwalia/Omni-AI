/**
 * SOC 2 CC7.2 — TC-03 / AC-03 (SOC2-S4-03)
 * Cross-user Task authorization monitoring.
 *
 * User B attempts to read, update and delete User A's Task. Each attempt must
 * (1) still be rejected with the API's documented 404, (2) leave the Task
 * unchanged, and (3) produce an AUTH_ACCESS_DENIED event. The same 404 for a
 * Task that simply does not exist must NOT be reported as an access denial,
 * so reviewers can tell probing from ordinary mistakes — and the two
 * responses must stay indistinguishable to the caller.
 */

process.env.JWT_SECRET = "cc72-test-only-signing-key";

jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");
const { EVENTS } = require("../src/utils/securityLogger");
const { startLogCapture, schemaProblems } = require("./helpers/logCapture");

const app = createApp();

const USER_A = { id: "11111111-1111-4111-8111-111111111111", email: "usera@example.com" };
const USER_B = { id: "22222222-2222-4222-8222-222222222222", email: "userb@example.com" };
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

const baseTask = {
  title: "Owner's private task",
  description: "CC7.2 access-denial monitoring",
  due_date: "2026-11-10T00:00:00.000Z",
  point_value: 5,
  estimated_effort_minutes: 45,
  priority: "high",
};

const bearer = (user) => `Bearer ${signToken(user)}`;

let capture;
let taskId;

beforeEach(async () => {
  supabase.__reset();
  capture = startLogCapture();

  const created = await request(app)
    .post("/api/tasks")
    .set("Authorization", bearer(USER_A))
    .send(baseTask);

  expect(created.status).toBe(201);
  taskId = created.body.data.id;
  capture.clear();
});

afterEach(() => {
  capture.stop();
});

async function ownerView() {
  const res = await request(app)
    .get(`/api/tasks/${taskId}`)
    .set("Authorization", bearer(USER_A));
  capture.clear();
  return res;
}

describe("TC-03 / AC-03: cross-user Task access is rejected and monitored", () => {
  // The test matrix: every verb that addresses a single Task by id.
  const matrix = [
    ["GET", (id) => request(app).get(`/api/tasks/${id}`)],
    ["PUT", (id) => request(app).put(`/api/tasks/${id}`).send({ title: "Hijacked" })],
    ["DELETE", (id) => request(app).delete(`/api/tasks/${id}`)],
  ];

  test.each(matrix)(
    "%s on another user's task -> 404 and one AUTH_ACCESS_DENIED event",
    async (method, send) => {
      const res = await send(taskId).set("Authorization", bearer(USER_B));

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Task not found" });

      const events = capture.events();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          level: "warn",
          event: EVENTS.AUTH_ACCESS_DENIED,
          reason: "task_not_owned",
          method,
          route: "/api/tasks/:id",
          status: 404,
          requestId: res.headers["x-request-id"],
        })
      );
      expect(schemaProblems(events)).toEqual([]);

      // The log must not disclose the id the attacker probed.
      expect(capture.text()).not.toContain(taskId);
    }
  );

  test("the task is unchanged after all three unauthorized attempts", async () => {
    const before = await ownerView();

    for (const [, send] of matrix) {
      const res = await send(taskId).set("Authorization", bearer(USER_B));
      expect(res.status).toBe(404);
    }

    expect(capture.byEvent(EVENTS.AUTH_ACCESS_DENIED)).toHaveLength(3);

    const after = await ownerView();
    expect(after.status).toBe(200);
    expect(after.body.data).toEqual(before.body.data);
    expect(after.body.data.title).toBe(baseTask.title);
  });

  test("owner access succeeds and writes no access-denial event", async () => {
    const res = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", bearer(USER_A));

    expect(res.status).toBe(200);
    expect(capture.lines).toHaveLength(0);

    const upd = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", bearer(USER_A))
      .send({ title: "Renamed by owner" });

    expect(upd.status).toBe(200);
    expect(capture.lines).toHaveLength(0);
  });

  test.each(matrix)(
    "%s on a task that does not exist -> 404 but NO access-denial event",
    async (_method, send) => {
      const res = await send(MISSING_ID).set("Authorization", bearer(USER_B));

      expect(res.status).toBe(404);
      expect(capture.byEvent(EVENTS.AUTH_ACCESS_DENIED)).toHaveLength(0);
    }
  );

  test.each(matrix)(
    "%s: the response for a foreign task is identical to the response for a missing task (no ownership disclosure)",
    async (_method, send) => {
      const foreign = await send(taskId).set("Authorization", bearer(USER_B));
      const missing = await send(MISSING_ID).set("Authorization", bearer(USER_B));

      expect(foreign.status).toBe(missing.status);
      expect(foreign.body).toEqual(missing.body);
    }
  );

  test("a malformed (non-UUID) id is a validation error, not an access-denial event", async () => {
    const res = await request(app)
      .get("/api/tasks/not-a-uuid")
      .set("Authorization", bearer(USER_B));

    expect(res.status).toBe(400);
    expect(capture.byEvent(EVENTS.AUTH_ACCESS_DENIED)).toHaveLength(0);
  });

  test("repeated probing produces one event per attempt, each with its own requestId", async () => {
    const ids = new Set();

    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set("Authorization", bearer(USER_B));
      ids.add(res.headers["x-request-id"]);
    }

    const events = capture.byEvent(EVENTS.AUTH_ACCESS_DENIED);
    expect(events).toHaveLength(4);
    expect(new Set(events.map((e) => e.requestId))).toEqual(ids);
    expect(ids.size).toBe(4);
  });

  test("if the monitoring lookup itself fails, the response is unchanged and the request does not crash", async () => {
    const realFrom = supabase.from;
    let calls = 0;

    // First call (the ownership-scoped query) behaves normally; the second
    // (the monitoring lookup) throws.
    supabase.from = jest.fn((table) => {
      calls += 1;
      if (calls === 2) throw new Error("monitoring lookup exploded");
      return realFrom(table);
    });

    try {
      const res = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set("Authorization", bearer(USER_B));

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "Task not found" });
      expect(calls).toBe(2);
    } finally {
      supabase.from = realFrom;
    }
  });
});
