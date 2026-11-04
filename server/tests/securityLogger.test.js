/**
 * SOC 2 CC7.2 — AC-04 log-schema consistency, plus unit tests for the logger
 * and request-id middleware that every other CC7.2 test relies on.
 */

// The real app is loaded by the last test; keep its Supabase client mocked.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const express = require("express");
const {
  EVENTS,
  REASONS,
  LEVELS,
  logSecurityEvent,
  logLoginFailed,
  logDatabaseFailure,
  logBackendError,
  subjectFor,
  normalizeRoute,
  validateEvent,
  setSink,
  resetSink,
} = require("../src/utils/securityLogger");
const { failedAuthDetector } = require("../src/utils/failedAuthDetector");
const { requestId } = require("../src/middleware/requestId");
const { startLogCapture, schemaProblems } = require("./helpers/logCapture");

const fakeReq = (overrides = {}) => ({
  method: "GET",
  originalUrl: "/api/tasks",
  requestId: "req-example-001",
  headers: { authorization: "Bearer DUMMY-HEADER-TOKEN" },
  body: { password: "DUMMY-BODY-PASSWORD" },
  ...overrides,
});

let capture;

beforeEach(() => {
  failedAuthDetector.reset();
  capture = startLogCapture();
});

afterEach(() => {
  capture.stop();
  delete process.env.SECURITY_LOG_STDOUT;
  delete process.env.SECURITY_LOG_SALT;
});

describe("AC-04: every event matches the documented schema", () => {
  test.each(Object.values(EVENTS))("%s produces a schema-valid record", (event) => {
    const record = logSecurityEvent({
      event,
      reason: "unspecified",
      req: fakeReq(),
      status: 401,
    });

    expect(validateEvent(record)).toEqual([]);
    expect(validateEvent(JSON.parse(capture.lines[0]))).toEqual([]);
  });

  test("the proposed example record from the Sprint 4 plan is reproducible", () => {
    logSecurityEvent({
      event: EVENTS.AUTH_TOKEN_INVALID,
      reason: "invalid_signature",
      req: fakeReq(),
      status: 401,
    });

    expect(JSON.parse(capture.lines[0])).toEqual({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      level: "warn",
      event: "AUTH_TOKEN_INVALID",
      reason: "invalid_signature",
      method: "GET",
      route: "/api/tasks",
      status: 401,
      requestId: "req-example-001",
    });
  });

  test("required field types: ISO UTC timestamp, level, string ids, numeric status", () => {
    const record = logSecurityEvent({
      event: EVENTS.AUTH_ACCESS_DENIED,
      reason: "task_not_owned",
      req: fakeReq({ method: "put" }),
      status: 404,
    });

    expect(typeof record.timestamp).toBe("string");
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
    expect(LEVELS).toContain(record.level);
    expect(record.method).toBe("PUT");
    expect(Number.isInteger(record.status)).toBe(true);
    expect(typeof record.requestId).toBe("string");
  });

  test("severity matches the documented table", () => {
    const expectedLevel = {
      AUTH_LOGIN_FAILED: "warn",
      AUTH_TOKEN_MISSING: "warn",
      AUTH_TOKEN_INVALID: "warn",
      AUTH_TOKEN_EXPIRED: "warn",
      AUTH_ACCESS_DENIED: "warn",
      BACKEND_SECURITY_ERROR: "error",
      DATABASE_OPERATION_FAILED: "error",
      AUTH_FAILURE_THRESHOLD_EXCEEDED: "error",
    };

    for (const [event, level] of Object.entries(expectedLevel)) {
      expect(logSecurityEvent({ event, reason: "unspecified", req: fakeReq(), status: 500 }).level).toBe(level);
    }
  });

  test("every predefined reason code is accepted as-is", () => {
    for (const reason of REASONS) {
      const record = logSecurityEvent({
        event: EVENTS.BACKEND_SECURITY_ERROR,
        reason,
        req: fakeReq(),
        status: 500,
      });
      expect(record.reason).toBe(reason);
    }
  });

  test("each output line is single-line JSON", () => {
    logSecurityEvent({
      event: EVENTS.AUTH_TOKEN_INVALID,
      reason: "invalid_token",
      req: fakeReq({ originalUrl: "/api/tasks/%0Aforged-line?x=1\nINJECT" }),
      status: 401,
    });

    expect(capture.lines).toHaveLength(1);
    expect(capture.lines[0]).not.toMatch(/[\r\n]/);
    expect(() => JSON.parse(capture.lines[0])).not.toThrow();
  });

  describe("validateEvent rejects malformed records", () => {
    const good = () => ({
      timestamp: "2026-11-02T20:00:00.000Z",
      level: "warn",
      event: "AUTH_TOKEN_INVALID",
      reason: "invalid_signature",
      method: "GET",
      route: "/api/tasks",
      status: 401,
      requestId: "req-1",
    });

    test("a good record has no problems", () => {
      expect(validateEvent(good())).toEqual([]);
    });

    test.each([
      ["timestamp", { timestamp: "yesterday" }],
      ["timestamp (no ms / not UTC)", { timestamp: "2026-11-02T20:00:00+01:00" }],
      ["level", { level: "debug" }],
      ["event", { event: "SOMETHING_ELSE" }],
      ["reason", { reason: "password=hunter2" }],
      ["method", { method: "" }],
      ["route", { route: "api/tasks" }],
      ["status", { status: "401" }],
      ["status range", { status: 42 }],
      ["requestId", { requestId: "" }],
    ])("flags a bad %s", (_label, override) => {
      expect(validateEvent({ ...good(), ...override }).length).toBeGreaterThan(0);
    });

    test("flags a missing required field and an unexpected extra field", () => {
      const { requestId: _omit, ...withoutId } = good();
      expect(validateEvent(withoutId).length).toBeGreaterThan(0);
      expect(validateEvent({ ...good(), password: "x" })).toContain("unexpected field: password");
      expect(validateEvent(null).length).toBeGreaterThan(0);
    });
  });
});

describe("allowlist: nothing outside the schema can be written", () => {
  test("request headers, body and extra arguments are never serialized", () => {
    logSecurityEvent({
      event: EVENTS.AUTH_TOKEN_INVALID,
      reason: "invalid_signature",
      req: fakeReq(),
      status: 401,
      password: "DUMMY-EXTRA-PASSWORD",
      token: "DUMMY-EXTRA-TOKEN",
      headers: { cookie: "DUMMY-EXTRA-COOKIE" },
    });

    const text = capture.text();
    expect(text).not.toContain("DUMMY-HEADER-TOKEN");
    expect(text).not.toContain("DUMMY-BODY-PASSWORD");
    expect(text).not.toContain("DUMMY-EXTRA");
    expect(schemaProblems(capture.events())).toEqual([]);
  });

  test("free-text or unknown reasons are replaced with `unspecified`", () => {
    const record = logSecurityEvent({
      event: EVENTS.AUTH_LOGIN_FAILED,
      reason: "wrong password: DUMMY-FREE-TEXT-SECRET",
      req: fakeReq(),
      status: 401,
    });

    expect(record.reason).toBe("unspecified");
    expect(capture.text()).not.toContain("DUMMY-FREE-TEXT-SECRET");
  });

  test("an unknown event name writes nothing", () => {
    expect(logSecurityEvent({ event: "MADE_UP", reason: "unspecified", req: fakeReq() })).toBeNull();
    expect(logSecurityEvent()).toBeNull();
    expect(capture.lines).toHaveLength(0);
  });

  test("error objects contribute only a safe name and code, never the message or stack", () => {
    const error = Object.assign(new Error("postgres://u:DUMMY-ERR-PASSWORD@h/db"), {
      code: "23505",
    });

    logDatabaseFailure(fakeReq(), "task_create_failed", error);

    const [event] = capture.events();
    expect(event).toEqual(
      expect.objectContaining({
        event: EVENTS.DATABASE_OPERATION_FAILED,
        reason: "task_create_failed",
        errorName: "Error",
        errorCode: "23505",
        status: 500,
      })
    );
    expect(capture.text()).not.toContain("DUMMY-ERR-PASSWORD");
    expect(capture.text()).not.toContain("postgres://");
    expect(capture.text()).not.toContain("stack");
  });

  test("error names/codes that are not identifier-shaped are dropped", () => {
    logBackendError(
      fakeReq(),
      "unhandled_exception",
      { name: "Bad Name\nINJECT", code: "has spaces and DUMMY-SECRET" }
    );

    const [event] = capture.events();
    expect(event.errorName).toBeUndefined();
    expect(event.errorCode).toBeUndefined();
    expect(capture.text()).not.toContain("DUMMY-SECRET");
  });

  test("non-hash `subject` values are dropped", () => {
    const record = logSecurityEvent({
      event: EVENTS.AUTH_LOGIN_FAILED,
      reason: "password_mismatch",
      req: fakeReq(),
      status: 401,
      subject: "someone@example.com",
    });

    expect(record.subject).toBeUndefined();
    expect(capture.text()).not.toContain("someone@example.com");
  });
});

describe("normalizeRoute", () => {
  test.each([
    ["/api/tasks", "/api/tasks"],
    ["/api/tasks?token=DUMMY", "/api/tasks"],
    ["/api/tasks#frag", "/api/tasks"],
    ["/api/tasks/9f1c2b3a-1111-4222-8333-444455556666", "/api/tasks/:id"],
    ["/api/tasks/12345", "/api/tasks/:id"],
    ["/api/tasks/prioritized", "/api/tasks/prioritized"],
    ["/api/tasks/resolve-schedule", "/api/tasks/resolve-schedule"],
    ["/api/tasks/summary/daily", "/api/tasks/summary/daily"],
    ["/api/tasks/eyJhbGciOi.eyJzdWIi.sig", "/api/tasks/:param"],
    ["/api/tasks/DUMMY-SECRET-123", "/api/tasks/:param"],
    ["/api/tasks/%0AINJECT", "/api/tasks/:param"],
    ["//api///tasks//", "/api/tasks"],
    ["/", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeRoute({ originalUrl: input })).toBe(expected);
  });

  test("falls back safely when there is no request or URL", () => {
    expect(normalizeRoute(undefined)).toBe("/");
    expect(normalizeRoute({})).toBe("/");
  });

  test("route length is capped", () => {
    const long = `/${"a".repeat(30)}`.repeat(40);
    expect(normalizeRoute({ originalUrl: long }).length).toBeLessThanOrEqual(200);
  });
});

describe("subjectFor", () => {
  test("is stable, case/space-insensitive and 16 hex characters", () => {
    const a = subjectFor("Person@Example.com");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(subjectFor("  person@example.com ")).toBe(a);
    expect(subjectFor("other@example.com")).not.toBe(a);
  });

  test("does not contain the address", () => {
    expect(subjectFor("person@example.com")).not.toContain("person");
  });

  test("returns undefined for missing or non-string input", () => {
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      expect(subjectFor(bad)).toBeUndefined();
    }
  });

  test("changes when SECURITY_LOG_SALT changes", () => {
    const before = subjectFor("person@example.com");
    process.env.SECURITY_LOG_SALT = "a-different-deployment-salt";
    expect(subjectFor("person@example.com")).not.toBe(before);
  });

  test("logLoginFailed without an email logs the failure but no subject and no detection", () => {
    logLoginFailed(fakeReq(), "oauth_invalid_session");

    const [event] = capture.events();
    expect(event.event).toBe(EVENTS.AUTH_LOGIN_FAILED);
    expect(event.subject).toBeUndefined();
    expect(failedAuthDetector.size()).toBe(0);
  });
});

describe("logging never breaks request handling", () => {
  test("a throwing sink is swallowed", () => {
    setSink(() => {
      throw new Error("disk full");
    });

    expect(() =>
      logSecurityEvent({ event: EVENTS.AUTH_LOGIN_FAILED, reason: "password_mismatch", req: fakeReq(), status: 401 })
    ).not.toThrow();
    expect(() => logLoginFailed(fakeReq(), "password_mismatch", "a@b.c")).not.toThrow();
  });

  test("hostile request objects are tolerated", () => {
    const hostile = {
      get method() {
        throw new Error("boom");
      },
    };

    expect(() =>
      logSecurityEvent({ event: EVENTS.AUTH_LOGIN_FAILED, reason: "password_mismatch", req: hostile, status: 401 })
    ).not.toThrow();
  });

  test("missing req still yields a schema-valid record", () => {
    const record = logSecurityEvent({
      event: EVENTS.BACKEND_SECURITY_ERROR,
      reason: "unhandled_exception",
      status: 500,
    });

    expect(validateEvent(record)).toEqual([]);
    expect(record.requestId).toBe("unknown");
  });
});

describe("default sink", () => {
  let writeSpy;

  beforeEach(() => {
    capture.stop(); // restore the default sink
    writeSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    resetSink();
  });

  test("is silent under NODE_ENV=test so Jest output stays readable", () => {
    logSecurityEvent({ event: EVENTS.AUTH_LOGIN_FAILED, reason: "password_mismatch", req: fakeReq(), status: 401 });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  test("writes one JSON line to stdout when SECURITY_LOG_STDOUT=1", () => {
    process.env.SECURITY_LOG_STDOUT = "1";

    logSecurityEvent({ event: EVENTS.AUTH_LOGIN_FAILED, reason: "password_mismatch", req: fakeReq(), status: 401 });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0][0];
    expect(written.endsWith("\n")).toBe(true);
    expect(JSON.parse(written).event).toBe("AUTH_LOGIN_FAILED");
  });

  test("writes outside the test environment", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      logBackendError(fakeReq(), "unhandled_exception", new Error("x"));
      expect(writeSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("requestId middleware", () => {
  const makeApp = () => {
    const app = express();
    app.use(requestId);
    app.get("/echo", (req, res) => res.json({ id: req.requestId }));
    return app;
  };

  test("assigns a UUID, exposes it on req and returns it in X-Request-Id", async () => {
    const res = await request(makeApp()).get("/echo");

    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(res.body.id).toBe(res.headers["x-request-id"]);
  });

  test("every request gets a different id", async () => {
    const app = makeApp();
    const ids = new Set();

    for (let i = 0; i < 20; i++) {
      ids.add((await request(app).get("/echo")).headers["x-request-id"]);
    }

    expect(ids.size).toBe(20);
  });

  test("ignores a client-supplied X-Request-Id", async () => {
    const res = await request(makeApp())
      .get("/echo")
      .set("X-Request-Id", "forged-id-INJECT");

    expect(res.headers["x-request-id"]).not.toContain("forged");
    expect(res.body.id).not.toContain("forged");
  });

  test("the real app sets X-Request-Id on every response, including 404s and /health", async () => {
    const { createApp } = require("../src/app");
    const app = createApp();

    const health = await request(app).get("/health");
    const missing = await request(app).get("/no-such-route");

    expect(health.headers["x-request-id"]).toBeTruthy();
    expect(missing.headers["x-request-id"]).toBeTruthy();
    expect(missing.headers["x-request-id"]).not.toBe(health.headers["x-request-id"]);
  });
});
