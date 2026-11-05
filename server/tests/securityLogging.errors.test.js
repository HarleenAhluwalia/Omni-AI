/**
 * SOC 2 CC7.2 — TC-04 / AC-06 (SOC2-S4-05)
 * Backend and database error logging, using controlled fault injection.
 *
 * For every defined failure the test checks that:
 *   - the client still receives a controlled 500/503 (no crash, no success),
 *   - an identifiable DATABASE_OPERATION_FAILED / BACKEND_SECURITY_ERROR
 *     event is written with the right reason, status and requestId,
 *   - nothing from the injected error (message text, connection string,
 *     password, key) appears in the log.
 *
 * KNOWN DEFECT SOC2-DEF-01 (see docs/testing-evidence/sprint-4/): several
 * Task endpoints still copy the database error message into the HTTP
 * response body. That is a response-side disclosure, not a logging gap, and
 * existing Sprint 2/3 tests assert the current behaviour, so it is recorded
 * with test.failing below rather than changed here.
 */

process.env.JWT_SECRET = "cc72-test-only-signing-key";
process.env.SUPABASE_URL = "https://example.supabase.test";
process.env.SUPABASE_ANON_KEY = "dummy-anon-key-for-tests";

jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

// Lets one test make the (database-free) scheduling handler throw.
jest.mock("../services/schedulingService", () => ({
  ...jest.requireActual("../services/schedulingService"),
  resolveAndReschedule: jest.fn(() => {
    throw new Error(
      "connection to postgres://svc:DUMMY-DB-PASSWORD-cc72@db.internal:5432/omni failed"
    );
  }),
}));

const request = require("supertest");
const { createClient } = require("@supabase/supabase-js");
const { createApp } = require("../src/app");
const { UserRepository } = require("../src/config/db");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");
const { EVENTS } = require("../src/utils/securityLogger");
const { startLogCapture, schemaProblems } = require("./helpers/logCapture");

const app = createApp();

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "usera@example.com" };
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Recognizable dummy secrets embedded in the injected errors.
const DB_PASSWORD = "DUMMY-DB-PASSWORD-cc72";
const SERVICE_KEY = "DUMMY-SERVICE-ROLE-KEY-cc72";
const DB_ERROR_MESSAGE = `connection to postgres://svc:${DB_PASSWORD}@db.internal:5432/omni failed (key=${SERVICE_KEY})`;

const bearer = () => `Bearer ${signToken(USER)}`;

/**
 * A stand-in for a Supabase query builder in which every chained call
 * returns the builder and awaiting it (or calling a terminal method) yields
 * a database error.
 */
function failingBuilder(error) {
  const outcome = Promise.resolve({ data: null, error });
  const builder = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (res, rej) => outcome.then(res, rej);
        return () => builder;
      },
    }
  );
  return builder;
}

let capture;
let realFrom;

beforeEach(() => {
  supabase.__reset();
  UserRepository._reset();
  createClient.mockReset();
  capture = startLogCapture();
  realFrom = supabase.from;
});

afterEach(() => {
  supabase.from = realFrom;
  capture.stop();
});

const failDatabase = (behaviour) => {
  supabase.from = jest.fn(behaviour);
};

// ---------------------------------------------------------------------------
// Database failures on every Task operation
// ---------------------------------------------------------------------------

const authed = (req) => req.set("Authorization", bearer());

const validTask = {
  title: "Fault injection",
  due_date: "2026-11-10T00:00:00.000Z",
  point_value: 3,
  estimated_effort_minutes: 30,
  priority: "medium",
};

// [operation, request factory, expected reason]
const operations = [
  ["list tasks", () => authed(request(app).get("/api/tasks")), "task_list_failed"],
  ["read a task", () => authed(request(app).get(`/api/tasks/${TASK_ID}`)), "task_read_failed"],
  ["create a task", () => authed(request(app).post("/api/tasks")).send(validTask), "task_create_failed"],
  ["update a task", () => authed(request(app).put(`/api/tasks/${TASK_ID}`)).send({ title: "x" }), "task_update_failed"],
  ["delete a task", () => authed(request(app).delete(`/api/tasks/${TASK_ID}`)), "task_delete_failed"],
  ["prioritized list", () => authed(request(app).get("/api/tasks/prioritized")), "task_prioritized_failed"],
  ["daily summary", () => authed(request(app).get("/api/tasks/summary/daily")), "task_daily_summary_failed"],
  ["weekly summary", () => authed(request(app).get("/api/tasks/summary/weekly")), "task_weekly_summary_failed"],
];

describe("TC-04 / AC-06: database errors returned by Supabase", () => {
  test.each(operations)(
    "%s: error result -> 500 and DATABASE_OPERATION_FAILED, no secrets logged",
    async (_name, makeRequest, reason) => {
      failDatabase(() => failingBuilder({ message: DB_ERROR_MESSAGE, code: "08006" }));

      const res = await makeRequest();

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();

      const events = capture.events();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          level: "error",
          event: EVENTS.DATABASE_OPERATION_FAILED,
          reason,
          status: 500,
          requestId: res.headers["x-request-id"],
        })
      );
      expect(schemaProblems(events)).toEqual([]);

      expect(capture.text()).not.toContain(DB_PASSWORD);
      expect(capture.text()).not.toContain(SERVICE_KEY);
      expect(capture.text()).not.toContain("postgres://");
      expect(capture.text()).not.toContain("connection to");
    }
  );

  test("the database error code is kept as diagnostic context", async () => {
    failDatabase(() => failingBuilder({ message: DB_ERROR_MESSAGE, code: "08006" }));

    await operations[0][1]();

    expect(capture.events()[0].errorCode).toBe("08006");
  });
});

describe("TC-04 / AC-06: exceptions thrown by the database layer", () => {
  // Operations whose handlers wrap the query in try/catch.
  const guarded = operations.filter(([, , reason]) =>
    [
      "task_list_failed",
      "task_read_failed",
      "task_create_failed",
      "task_update_failed",
      "task_delete_failed",
      "task_prioritized_failed",
    ].includes(reason)
  );

  test.each(guarded)(
    "%s: thrown error -> 500 and DATABASE_OPERATION_FAILED, message not logged",
    async (_name, makeRequest, reason) => {
      failDatabase(() => {
        throw new Error(DB_ERROR_MESSAGE);
      });

      const res = await makeRequest();

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);

      const events = capture.events();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          event: EVENTS.DATABASE_OPERATION_FAILED,
          reason,
          status: 500,
          errorName: "Error",
        })
      );
      expect(schemaProblems(events)).toEqual([]);

      expect(capture.text()).not.toContain(DB_PASSWORD);
      expect(capture.text()).not.toContain(SERVICE_KEY);
      expect(capture.text()).not.toContain("connection to");
    }
  );

  test("the schedule-resolution handler logs BACKEND_SECURITY_ERROR when it throws", async () => {
    const res = await authed(request(app).post("/api/tasks/resolve-schedule")).send({
      taskA: { start_time: "2026-11-10T09:00:00.000Z", end_time: "2026-11-10T10:00:00.000Z" },
      taskB: { start_time: "2026-11-10T09:30:00.000Z", end_time: "2026-11-10T10:30:00.000Z" },
      scheduledTasks: [],
    });

    expect(res.status).toBe(500);

    const events = capture.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        level: "error",
        event: EVENTS.BACKEND_SECURITY_ERROR,
        reason: "schedule_resolve_failed",
        route: "/api/tasks/resolve-schedule",
        status: 500,
        errorName: "Error",
      })
    );
    expect(schemaProblems(events)).toEqual([]);
    expect(capture.text()).not.toContain(DB_PASSWORD);
    expect(capture.text()).not.toContain("postgres://");
  });
});

// ---------------------------------------------------------------------------
// Authentication-service and unhandled failures
// ---------------------------------------------------------------------------

describe("TC-04 / AC-06: authentication service and unhandled errors", () => {
  test("Supabase outage during login -> 503 and BACKEND_SECURITY_ERROR (auth_service_unavailable)", async () => {
    createClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { status: 500, code: "unexpected_failure", message: DB_ERROR_MESSAGE },
        }),
      },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "DUMMY-PASSWORD-cc72" });

    expect(res.status).toBe(503);

    const events = capture.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        level: "error",
        event: EVENTS.BACKEND_SECURITY_ERROR,
        reason: "auth_service_unavailable",
        route: "/api/auth/login",
        status: 503,
        errorCode: "unexpected_failure",
        requestId: res.headers["x-request-id"],
      })
    );
    expect(schemaProblems(events)).toEqual([]);

    // An outage is not a failed credential check.
    expect(capture.byEvent(EVENTS.AUTH_LOGIN_FAILED)).toHaveLength(0);
    expect(capture.text()).not.toContain(DB_PASSWORD);
    expect(capture.text()).not.toContain("DUMMY-PASSWORD-cc72");
  });

  test("unexpected exception during login recovery -> 500 and BACKEND_SECURITY_ERROR (login_recovery_failed)", async () => {
    createClient.mockImplementation(() => {
      throw new Error(DB_ERROR_MESSAGE);
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "DUMMY-PASSWORD-cc72" });

    expect(res.status).toBe(500);

    const [event] = capture.byEvent(EVENTS.BACKEND_SECURITY_ERROR);
    expect(event).toEqual(
      expect.objectContaining({ reason: "login_recovery_failed", status: 500, errorName: "Error" })
    );
    expect(capture.text()).not.toContain(DB_PASSWORD);
  });

  test("registration setup failure -> 500 and BACKEND_SECURITY_ERROR (registration_setup_failed)", async () => {
    // Profile upsert fails after the auth user was created.
    const realFromFn = supabase.from;
    supabase.from = jest.fn((table) =>
      table === "profiles"
        ? failingBuilder({ message: DB_ERROR_MESSAGE })
        : realFromFn(table)
    );

    const res = await request(app).post("/api/auth/register").send({
      name: "Fault Injection",
      email: "fault@example.com",
      password: "Correct-Horse-Battery-1",
    });

    expect(res.status).toBe(500);

    const [event] = capture.byEvent(EVENTS.BACKEND_SECURITY_ERROR);
    expect(event).toEqual(
      expect.objectContaining({ reason: "registration_setup_failed", status: 500 })
    );
    expect(capture.text()).not.toContain(DB_PASSWORD);
    expect(capture.text()).not.toContain("Correct-Horse-Battery-1");
  });

  test("failure to create the Supabase auth user -> BACKEND_SECURITY_ERROR (auth_user_create_failed)", async () => {
    supabase.auth.admin.createUser.mockResolvedValueOnce({
      data: null,
      error: { name: "AuthApiError", code: "unexpected_failure", message: DB_ERROR_MESSAGE },
    });

    const res = await request(app).post("/api/auth/register").send({
      name: "Fault Injection",
      email: "fault2@example.com",
      password: "Correct-Horse-Battery-1",
    });

    expect(res.status).toBe(500);

    const [event] = capture.byEvent(EVENTS.BACKEND_SECURITY_ERROR);
    expect(event).toEqual(
      expect.objectContaining({
        reason: "auth_user_create_failed",
        errorName: "AuthApiError",
        errorCode: "unexpected_failure",
      })
    );
    expect(capture.text()).not.toContain(DB_PASSWORD);
  });

  test("unhandled exception reaches the global handler -> 500 and BACKEND_SECURITY_ERROR (unhandled_exception)", async () => {
    // Malformed JSON makes body-parser throw before any route runs.
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(`{"email":"a@b.c","password":"DUMMY-BODY-SECRET-cc72"`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error." });

    const events = capture.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        level: "error",
        event: EVENTS.BACKEND_SECURITY_ERROR,
        reason: "unhandled_exception",
        errorName: "SyntaxError",
        status: 500,
        requestId: res.headers["x-request-id"],
      })
    );
    expect(schemaProblems(events)).toEqual([]);
    expect(capture.text()).not.toContain("DUMMY-BODY-SECRET-cc72");
  });
});

// ---------------------------------------------------------------------------
// Known defect (response-side disclosure)
// ---------------------------------------------------------------------------

describe("KNOWN DEFECT SOC2-DEF-01: database error text is returned to API clients", () => {
  // test.failing passes while the assertion fails (today's behaviour) and
  // starts FAILING once the leak is fixed — the cue to change it to test().
  test.failing(
    "a failed Task query should not echo the database error message in the HTTP response",
    async () => {
      failDatabase(() => failingBuilder({ message: DB_ERROR_MESSAGE }));

      const res = await authed(request(app).get("/api/tasks"));

      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain(DB_PASSWORD);
      expect(JSON.stringify(res.body)).not.toContain("postgres://");
    }
  );
});
