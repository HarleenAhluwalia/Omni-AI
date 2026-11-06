// Sprint 4: SOC 2 CC6.3 Access Management — S02 authorization review.
//
// Deterministic — real Express app + Supertest, mocked Supabase, no
// network, no real credentials.
//
// CONFIRMED GAP (not a regression test for a fix — no fix is applied in
// this batch; see docs/security/sprint-4/cc63-authorization-review.md).
// Unlike every other data route in this codebase (taskRoutes.js,
// dummyCanvasRoutes.js, src/routes/canvasRoutes.js,
// notificationSettingsRoutes.js, src/routes/preferencesRoutes.js — all
// apply requireAuth), routes/scheduleRoutes.js applies NO authentication
// middleware at all, and controllers/scheduleController.js derives
// "whose schedule" entirely from a client-supplied user_id (a query
// parameter on GET/PUT, a body field on POST), never from req.user.
//
// These tests document the CURRENT, confirmed-insecure behavior exactly
// as it exists today - they intentionally assert what currently happens
// (an unauthenticated caller succeeds), not what should happen, to serve
// as reproducible evidence for the security review. They are not claimed
// as a passing security control.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");

const app = createApp();

const VICTIM_USER_ID = "11111111-1111-4111-8111-111111111111";
const ATTACKER_SUPPLIED_USER_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  supabase.__reset();
});

describe("CC6.3 — confirmed gap: /api/schedules has no authentication", () => {
  it("CC63-T08: GET /api/schedules?user_id=<victim> returns that user's data with NO Authorization header at all", async () => {
    supabase.__store.schedules.push({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: VICTIM_USER_ID,
      task_id: null,
      start_time: "2026-10-20T09:00:00.000Z",
      end_time: "2026-10-20T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app).get(
      `/api/schedules?user_id=${VICTIM_USER_ID}`
    );
    // No .set("Authorization", ...) at all.

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].user_id).toBe(VICTIM_USER_ID);
  });

  it("CC63-T09: POST /api/schedules creates a schedule for an arbitrary client-supplied user_id, with NO Authorization header at all", async () => {
    const res = await request(app).post("/api/schedules").send({
      user_id: ATTACKER_SUPPLIED_USER_ID,
      start_time: "2026-10-21T09:00:00.000Z",
      end_time: "2026-10-21T10:00:00.000Z",
    });
    // No .set("Authorization", ...) at all.

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user_id).toBe(ATTACKER_SUPPLIED_USER_ID);

    const stored = supabase.__store.schedules.find(
      (s) => s.id === res.body.data.id
    );
    expect(stored.user_id).toBe(ATTACKER_SUPPLIED_USER_ID);
  });

  it("CC63-T10: PUT /api/schedules/:id?user_id=<victim> modifies that user's schedule, with NO Authorization header at all", async () => {
    const scheduleId = "44444444-4444-4444-8444-444444444444";
    supabase.__store.schedules.push({
      id: scheduleId,
      user_id: VICTIM_USER_ID,
      task_id: null,
      start_time: "2026-10-20T09:00:00.000Z",
      end_time: "2026-10-20T10:00:00.000Z",
      schedule_type: "study_block",
      status: "scheduled",
    });

    const res = await request(app)
      .put(`/api/schedules/${scheduleId}?user_id=${VICTIM_USER_ID}`)
      .send({ status: "completed" });
    // No .set("Authorization", ...) at all.

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("completed");
  });
});
