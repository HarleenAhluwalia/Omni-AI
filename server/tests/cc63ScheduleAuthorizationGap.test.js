// Sprint 4: SOC 2 CC6.3 Access Management — S10 remediation of the
// confirmed Schedules API authorization gap found in PR Batch 4.
//
// ORIGINAL FINDING (preserved here for the record; see
// docs/security/sprint-4/cc63-authorization-review.md for the full
// writeup): routes/scheduleRoutes.js applied no authentication
// middleware at all, and every scheduleController.js handler derived
// "whose data" from a client-supplied user_id (a query parameter on
// GET/PUT, a body field on POST/resolve-conflict) instead of the
// verified JWT identity. CC63-T08/T09/T10 originally asserted the
// CURRENT (vulnerable) behavior - an unauthenticated caller succeeding
// - as reproducible evidence that the gap was real, not a passing
// security control.
//
// THIS FILE NOW CONTAINS THE REGRESSION VERSION of those same three
// tests, asserting the FIXED behavior (401, ownership enforced via
// req.user.id), plus new positive tests (CC63-T11-T16) confirming a
// legitimate authenticated user can still fully manage their own
// schedules after the fix. If T08/T09/T10 below ever fail again, the
// original vulnerability has been reintroduced.
//
// CC63-T17/T18/T19 cover a residual finding from the same review:
// createSchedule/updateSchedule accepted a task_id with no check that
// it belonged to the authenticated user. Since GET /api/schedules
// embeds (joins) the linked Task's title/description/due_date/
// priority/effort/completion_status into its response, an unchecked
// task_id would let a caller read another user's Task fields through
// their own schedule list. The mocked Supabase client doesn't
// implement PostgREST's embedded-resource join syntax (confirmed by
// reading helpers/supabaseMock.js - select() ignores its argument
// entirely), so the full leak-through-the-join cannot be reproduced
// end-to-end against the mock; what IS confirmed and fixed here is the
// underlying data-model gap that made the join dangerous in the first
// place - a schedule can no longer be linked to a task_id the caller
// doesn't own, full stop. Live verification of the join itself remains
// a follow-up item (see docs/security/sprint-4/cc63-authorization-review.md).
//
// Deterministic — real Express app + Supertest, mocked Supabase, no
// network, no real credentials.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";
const ATTACKER_USER_ID = "22222222-2222-4222-8222-222222222222";

const authHeader = (userId) =>
  `Bearer ${signToken({ id: userId, email: `${userId}@example.com` })}`;

beforeEach(() => {
  supabase.__reset();
});

describe("CC6.3 regression — /api/schedules now requires authentication and enforces ownership", () => {
  it("CC63-T08 (fixed): GET /api/schedules with no Authorization header is rejected with 401, not another user's data", async () => {
    supabase.__store.schedules.push({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-20T09:00:00.000Z",
      end_time: "2026-10-20T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app).get("/api/schedules");
    // No .set("Authorization", ...) at all.

    expect(res.status).toBe(401);
    expect(res.body.success).not.toBe(true);
    // The response must not leak the owner's schedule data.
    expect(JSON.stringify(res.body)).not.toContain(OWNER_USER_ID);
  });

  it("CC63-T09 (fixed): POST /api/schedules ignores any client-supplied user_id and attributes the row to the authenticated caller", async () => {
    const unauthenticated = await request(app).post("/api/schedules").send({
      user_id: ATTACKER_USER_ID,
      start_time: "2026-10-21T09:00:00.000Z",
      end_time: "2026-10-21T10:00:00.000Z",
    });
    expect(unauthenticated.status).toBe(401);

    const authenticated = await request(app)
      .post("/api/schedules")
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({
        user_id: ATTACKER_USER_ID, // attempted override - must be ignored
        start_time: "2026-10-21T09:00:00.000Z",
        end_time: "2026-10-21T10:00:00.000Z",
      });

    expect(authenticated.status).toBe(201);
    expect(authenticated.body.data.user_id).toBe(OWNER_USER_ID);
    expect(authenticated.body.data.user_id).not.toBe(ATTACKER_USER_ID);
  });

  it("CC63-T10 (fixed): PUT /api/schedules/:id is rejected with 401 when unauthenticated, and with 404 (not another user's data) when authenticated as a different user", async () => {
    const scheduleId = "44444444-4444-4444-8444-444444444444";
    supabase.__store.schedules.push({
      id: scheduleId,
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-20T09:00:00.000Z",
      end_time: "2026-10-20T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const unauthenticated = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .send({ status: "completed" });
    expect(unauthenticated.status).toBe(401);

    const asAttacker = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set("Authorization", authHeader(ATTACKER_USER_ID))
      .send({ status: "completed" });

    // 404, not 403 - never confirms the record exists under someone
    // else's account, and never echoes the owner's data.
    expect(asAttacker.status).toBe(404);
    expect(JSON.stringify(asAttacker.body)).not.toContain(OWNER_USER_ID);

    const stillOwned = supabase.__store.schedules.find(
      (s) => s.id === scheduleId
    );
    expect(stillOwned.user_id).toBe(OWNER_USER_ID);
    expect(stillOwned.status).toBe("scheduled"); // unchanged by the attacker's attempt
  });
});

describe("CC6.3 regression — legitimate authenticated users can still fully manage their own schedules", () => {
  it("CC63-T11: an authenticated user lists their own schedules via GET /api/schedules", async () => {
    supabase.__store.schedules.push({
      id: "55555555-5555-4555-8555-555555555555",
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-22T09:00:00.000Z",
      end_time: "2026-10-22T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app)
      .get("/api/schedules")
      .set("Authorization", authHeader(OWNER_USER_ID));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].user_id).toBe(OWNER_USER_ID);
  });

  it("CC63-T12: an authenticated user creates a schedule for themselves via POST /api/schedules", async () => {
    const res = await request(app)
      .post("/api/schedules")
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({
        start_time: "2026-10-23T09:00:00.000Z",
        end_time: "2026-10-23T10:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user_id).toBe(OWNER_USER_ID);
  });

  it("CC63-T13: an authenticated user updates their own schedule via PUT /api/schedules/:id", async () => {
    const scheduleId = "66666666-6666-4666-8666-666666666666";
    supabase.__store.schedules.push({
      id: scheduleId,
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-24T09:00:00.000Z",
      end_time: "2026-10-24T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("completed");
  });

  it("CC63-T14: resolve-conflict still works for the authenticated user's own two schedules", async () => {
    const scheduleA = {
      id: "77777777-7777-4777-8777-777777777777",
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-25T09:00:00.000Z",
      end_time: "2026-10-25T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    };
    const scheduleB = {
      id: "88888888-8888-4888-8888-888888888888",
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-25T09:30:00.000Z",
      end_time: "2026-10-25T10:30:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    };
    supabase.__store.schedules.push(scheduleA, scheduleB);

    const res = await request(app)
      .post("/api/schedules/resolve-conflict")
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({
        schedule_a_id: scheduleA.id,
        schedule_b_id: scheduleB.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("CC63-T15: resolve-conflict cannot be used to act on another user's schedule id", async () => {
    supabase.__store.schedules.push({
      id: "99999999-9999-4999-8999-999999999999",
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-26T09:00:00.000Z",
      end_time: "2026-10-26T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app)
      .post("/api/schedules/resolve-conflict")
      .set("Authorization", authHeader(ATTACKER_USER_ID))
      .send({
        schedule_a_id: "99999999-9999-4999-8999-999999999999",
        schedule_b_id: "11111111-aaaa-4aaa-8aaa-111111111111",
      });

    // The attacker's own schedule list never contains the owner's
    // schedule, so it resolves to "not found", not a cross-user action.
    expect(res.status).toBe(404);
  });

  it("CC63-T16 (S07): two authenticated users' schedule lists never mix, exactly the isolation Calendar/To-Do depend on", async () => {
    supabase.__store.schedules.push(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        user_id: OWNER_USER_ID,
        task_id: null,
        start_time: "2026-10-27T09:00:00.000Z",
        end_time: "2026-10-27T10:00:00.000Z",
        schedule_type: "study_block",
        status: "scheduled",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        user_id: ATTACKER_USER_ID,
        task_id: null,
        start_time: "2026-10-27T09:00:00.000Z",
        end_time: "2026-10-27T10:00:00.000Z",
        schedule_type: "study_block",
        status: "scheduled",
      }
    );

    const ownerList = await request(app)
      .get("/api/schedules")
      .set("Authorization", authHeader(OWNER_USER_ID));
    const otherList = await request(app)
      .get("/api/schedules")
      .set("Authorization", authHeader(ATTACKER_USER_ID));

    expect(ownerList.body.data).toHaveLength(1);
    expect(ownerList.body.data[0].user_id).toBe(OWNER_USER_ID);
    expect(otherList.body.data).toHaveLength(1);
    expect(otherList.body.data[0].user_id).toBe(ATTACKER_USER_ID);
  });
});

describe("CC6.3 regression — a schedule's task_id must belong to the authenticated user", () => {
  const ATTACKERS_TASK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    supabase.__store.tasks.push({
      id: ATTACKERS_TASK_ID,
      user_id: ATTACKER_USER_ID,
      title: "Attacker's private task",
      description: "Should never be readable by another user",
      due_date: "2026-10-28T23:59:59.000Z",
      priority: "high",
      completion_status: "not_started",
    });
  });

  it("CC63-T17: POST /api/schedules rejects a task_id belonging to another user", async () => {
    const res = await request(app)
      .post("/api/schedules")
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({
        task_id: ATTACKERS_TASK_ID,
        start_time: "2026-10-28T09:00:00.000Z",
        end_time: "2026-10-28T10:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("task_id must reference a task you own");
    expect(supabase.__store.schedules).toHaveLength(0);
  });

  it("CC63-T18: PUT /api/schedules/:id rejects re-pointing an existing schedule at another user's task_id", async () => {
    const scheduleId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    supabase.__store.schedules.push({
      id: scheduleId,
      user_id: OWNER_USER_ID,
      task_id: null,
      start_time: "2026-10-29T09:00:00.000Z",
      end_time: "2026-10-29T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}`)
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({ task_id: ATTACKERS_TASK_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("task_id must reference a task you own");

    const stored = supabase.__store.schedules.find((s) => s.id === scheduleId);
    expect(stored.task_id).toBeNull(); // unchanged
  });

  it("CC63-T19: a task_id the caller actually owns still works (no regression)", async () => {
    const ownedTaskId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    supabase.__store.tasks.push({
      id: ownedTaskId,
      user_id: OWNER_USER_ID,
      title: "My own task",
      completion_status: "not_started",
    });

    const createRes = await request(app)
      .post("/api/schedules")
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({
        task_id: ownedTaskId,
        start_time: "2026-10-30T09:00:00.000Z",
        end_time: "2026-10-30T10:00:00.000Z",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.task_id).toBe(ownedTaskId);

    const updateRes = await request(app)
      .put(`/api/schedules/${createRes.body.data.id}`)
      .set("Authorization", authHeader(OWNER_USER_ID))
      .send({ status: "completed" });
    expect(updateRes.status).toBe(200);
  });
});
