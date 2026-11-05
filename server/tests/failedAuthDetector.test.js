/**
 * SOC 2 CC7.2 — TC-06 / AC-07 (SOC2-S4-05)
 * Repeated failed-login detection: unit tests for the rolling-window rule,
 * plus an end-to-end check through the real /api/auth/login route.
 */

// Needed by the password-login Supabase client factory (client is mocked).
process.env.SUPABASE_URL = "https://example.supabase.test";
process.env.SUPABASE_ANON_KEY = "dummy-anon-key-for-tests";

jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

const request = require("supertest");
const { createClient } = require("@supabase/supabase-js");
const { createApp } = require("../src/app");
const { UserRepository } = require("../src/config/db");
const {
  createFailedAuthDetector,
  failedAuthDetector,
} = require("../src/utils/failedAuthDetector");
const { EVENTS } = require("../src/utils/securityLogger");
const { startLogCapture, schemaProblems } = require("./helpers/logCapture");

const MINUTE = 60 * 1000;

describe("TC-06: failedAuthDetector rolling-window rule (unit)", () => {
  test("four failures in five minutes produce no alert; the fifth does", () => {
    const detector = createFailedAuthDetector();
    const t0 = 1_000_000;

    for (let i = 0; i < 4; i++) {
      const result = detector.record("acct-1", t0 + i * 30 * 1000);
      expect(result.alert).toBe(false);
      expect(result.count).toBe(i + 1);
    }

    const fifth = detector.record("acct-1", t0 + 4 * 30 * 1000);
    expect(fifth.alert).toBe(true);
    expect(fifth.count).toBe(5);
  });

  test("failures that fall outside the rolling window do not count", () => {
    const detector = createFailedAuthDetector();
    const t0 = 1_000_000;

    // Four failures, then a fifth just after the first has rolled out.
    detector.record("acct-1", t0);
    detector.record("acct-1", t0 + 1 * MINUTE);
    detector.record("acct-1", t0 + 2 * MINUTE);
    detector.record("acct-1", t0 + 3 * MINUTE);

    const late = detector.record("acct-1", t0 + 5 * MINUTE + 1);

    expect(late.alert).toBe(false);
    expect(late.count).toBe(4);
  });

  test("a failure exactly windowMs old is outside the window", () => {
    const detector = createFailedAuthDetector({ threshold: 2 });
    detector.record("acct-1", 0);

    const result = detector.record("acct-1", 5 * MINUTE);

    expect(result.alert).toBe(false);
    expect(result.count).toBe(1);
  });

  test("the window rolls: a slow trickle never alerts", () => {
    const detector = createFailedAuthDetector();

    // One failure every 2 minutes: at most 3 fit in any 5-minute window.
    for (let i = 0; i < 20; i++) {
      expect(detector.record("acct-1", i * 2 * MINUTE).alert).toBe(false);
    }
  });

  test("different accounts are counted independently", () => {
    const detector = createFailedAuthDetector();
    const t0 = 1_000_000;

    for (let i = 0; i < 4; i++) {
      detector.record("acct-1", t0 + i);
      detector.record("acct-2", t0 + i);
    }

    expect(detector.record("acct-1", t0 + 10).alert).toBe(true);
    expect(detector.record("acct-2", t0 + 10).alert).toBe(true);
    expect(detector.record("acct-3", t0 + 10).alert).toBe(false);
  });

  test("one alert per burst: history resets after alerting", () => {
    const detector = createFailedAuthDetector();
    const t0 = 1_000_000;

    for (let i = 0; i < 5; i++) detector.record("acct-1", t0 + i);

    // The sixth failure starts a fresh count rather than alerting again.
    const sixth = detector.record("acct-1", t0 + 5);
    expect(sixth.alert).toBe(false);
    expect(sixth.count).toBe(1);

    // Four more reach a second alert.
    let last;
    for (let i = 6; i < 10; i++) last = detector.record("acct-1", t0 + i);
    expect(last.alert).toBe(true);
  });

  test("threshold and window are configurable", () => {
    const detector = createFailedAuthDetector({
      threshold: 3,
      windowMs: 1000,
    });

    detector.record("a", 0);
    detector.record("a", 100);
    expect(detector.record("a", 200).alert).toBe(true);
    expect(detector.config).toEqual(
      expect.objectContaining({ threshold: 3, windowMs: 1000 })
    );
  });

  test("ignores empty or non-string keys", () => {
    const detector = createFailedAuthDetector();

    for (const key of [undefined, null, "", 42, {}]) {
      expect(detector.record(key, 1)).toEqual({ alert: false, count: 0 });
    }
    expect(detector.size()).toBe(0);
  });

  test("retention is bounded: tracked keys never exceed maxKeys", () => {
    const detector = createFailedAuthDetector({ maxKeys: 10 });

    for (let i = 0; i < 500; i++) detector.record(`acct-${i}`, i);

    expect(detector.size()).toBeLessThanOrEqual(10);
  });

  test("evicts the least recently touched key first", () => {
    const detector = createFailedAuthDetector({ maxKeys: 2, threshold: 3 });

    detector.record("old", 1);
    detector.record("mid", 2);
    detector.record("old", 3); // touches "old"; "mid" is now the oldest
    detector.record("new", 4); // evicts "mid"

    expect(detector.record("old", 5).alert).toBe(true); // 3 in window
    expect(detector.record("mid", 6).count).toBe(1); // history was evicted
  });

  test("stores no more than `threshold` timestamps per key", () => {
    const detector = createFailedAuthDetector({ threshold: 5 });

    // Failures spread out so none ever alert; memory per key stays bounded.
    for (let i = 0; i < 1000; i++) {
      detector.record("acct-1", i * 6 * MINUTE);
    }

    expect(detector.size()).toBe(1);
  });

  test("reset() clears all state", () => {
    const detector = createFailedAuthDetector();
    detector.record("acct-1", 1);
    detector.reset();
    expect(detector.size()).toBe(0);
  });
});

describe("TC-06 / AC-07: threshold alert through /api/auth/login (integration)", () => {
  const app = createApp();
  let capture;

  const attempt = (email) =>
    request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrong-Password-123" });

  beforeEach(() => {
    UserRepository._reset();
    failedAuthDetector.reset();

    // Unknown accounts fall through to Supabase, which rejects them.
    createClient.mockReset();
    createClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { status: 400, code: "invalid_credentials", message: "x" },
        }),
      },
    });

    capture = startLogCapture();
  });

  afterEach(() => {
    capture.stop();
  });

  test("five failed logins for one account within five minutes raise exactly one alert", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await attempt("target@example.com");
      expect(res.status).toBe(401);
    }

    expect(capture.byEvent(EVENTS.AUTH_FAILURE_THRESHOLD_EXCEEDED)).toHaveLength(0);
    expect(capture.byEvent(EVENTS.AUTH_LOGIN_FAILED)).toHaveLength(4);

    const fifth = await attempt("target@example.com");
    expect(fifth.status).toBe(401);

    const alerts = capture.byEvent(EVENTS.AUTH_FAILURE_THRESHOLD_EXCEEDED);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        level: "error",
        reason: "repeated_login_failures",
        route: "/api/auth/login",
        status: 401,
        failureCount: 5,
      })
    );
    expect(alerts[0].requestId).toBe(fifth.headers["x-request-id"]);
    expect(schemaProblems(capture.events())).toEqual([]);
  });

  test("failures spread across different accounts do not alert", async () => {
    for (let i = 0; i < 8; i++) {
      await attempt(`user${i}@example.com`);
    }

    expect(capture.byEvent(EVENTS.AUTH_LOGIN_FAILED)).toHaveLength(8);
    expect(capture.byEvent(EVENTS.AUTH_FAILURE_THRESHOLD_EXCEEDED)).toHaveLength(0);
  });

  test("the alert identifies the account only by hashed subject, not by email", async () => {
    for (let i = 0; i < 5; i++) await attempt("Target@Example.com");

    expect(capture.text()).not.toMatch(/target@example\.com/i);

    const [alert] = capture.byEvent(EVENTS.AUTH_FAILURE_THRESHOLD_EXCEEDED);
    expect(alert.subject).toMatch(/^[0-9a-f]{16}$/);

    // Case/whitespace variants of the same email map to the same subject.
    const subjects = new Set(
      capture.byEvent(EVENTS.AUTH_LOGIN_FAILED).map((e) => e.subject)
    );
    expect(subjects.size).toBe(1);
  });
});
