/**
 * SOC 2 CC7.2 — TC-01 and TC-02 (SOC2-S4-03)
 *
 *   TC-01 / AC-01  Failed login attempts produce AUTH_LOGIN_FAILED
 *   TC-02 / AC-02  Missing, malformed, invalid-signature and expired JWTs
 *                  produce the matching AUTH_TOKEN_* event
 *
 * Besides "was the event written", every case also checks that the API
 * response is unchanged (still 401), that the event passes the log schema
 * (AC-04), that it correlates to the response via X-Request-Id, and that no
 * credential or token value reached the log (AC-05).
 *
 * Jest + Supertest, mocked Supabase, captured logger output.
 */

// Fixed signing key for this file, set before the auth module is loaded.
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

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const { createApp } = require("../src/app");
const { UserRepository } = require("../src/config/db");
const supabase = require("../config/supabase");
const { signToken, JWT_SECRET } = require("../src/middleware/auth");
const { failedAuthDetector } = require("../src/utils/failedAuthDetector");
const { EVENTS } = require("../src/utils/securityLogger");
const { startLogCapture, schemaProblems } = require("./helpers/logCapture");

const app = createApp();

const USER = {
  name: "Monitor Test",
  email: "monitor@example.com",
  password: "Correct-Horse-Battery-1",
};

const WRONG_PASSWORD = "DUMMY-WRONG-PASSWORD-cc72";

let capture;

beforeEach(() => {
  supabase.__reset();
  UserRepository._reset();
  failedAuthDetector.reset();

  createClient.mockReset();
  capture = startLogCapture();
});

afterEach(() => {
  capture.stop();
});

/** Assertions every captured security event must satisfy. */
function expectWellFormedEvent(event, response, expected) {
  expect(event).toEqual(expect.objectContaining(expected));
  expect(event.requestId).toBe(response.headers["x-request-id"]);
  expect(event.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(Date.now() - Date.parse(event.timestamp)).toBeLessThan(60 * 1000);
}

// ---------------------------------------------------------------------------
// TC-01 — failed login event logging
// ---------------------------------------------------------------------------

describe("TC-01 / AC-01: failed login logging", () => {
  const login = (body) => request(app).post("/api/auth/login").send(body);

  test("existing local user + wrong password -> 401 and AUTH_LOGIN_FAILED (password_mismatch)", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .send(USER);
    expect(registered.status).toBe(201);
    capture.clear();

    const res = await login({ email: USER.email, password: WRONG_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ errors: ["Invalid email or password."] });

    const events = capture.byEvent(EVENTS.AUTH_LOGIN_FAILED);
    expect(events).toHaveLength(1);
    expectWellFormedEvent(events[0], res, {
      level: "warn",
      reason: "password_mismatch",
      method: "POST",
      route: "/api/auth/login",
      status: 401,
    });

    expect(schemaProblems(capture.events())).toEqual([]);
    expect(capture.text()).not.toContain(WRONG_PASSWORD);
    expect(capture.text()).not.toContain(USER.password);
  });

  test("local user without a stored password hash -> AUTH_LOGIN_FAILED (no_local_password_hash)", async () => {
    UserRepository.create({
      id: "11111111-1111-4111-8111-111111111111",
      name: "OAuth Only",
      email: "oauthonly@example.com",
    });

    const res = await login({
      email: "oauthonly@example.com",
      password: WRONG_PASSWORD,
    });

    expect(res.status).toBe(401);

    const [event] = capture.byEvent(EVENTS.AUTH_LOGIN_FAILED);
    expectWellFormedEvent(event, res, {
      reason: "no_local_password_hash",
      status: 401,
    });
  });

  test("unknown account rejected by Supabase -> AUTH_LOGIN_FAILED (supabase_invalid_credentials)", async () => {
    createClient.mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { status: 400, code: "invalid_credentials", message: "x" },
        }),
      },
    });

    const res = await login({
      email: "nobody@example.com",
      password: WRONG_PASSWORD,
    });

    expect(res.status).toBe(401);

    const events = capture.byEvent(EVENTS.AUTH_LOGIN_FAILED);
    expect(events).toHaveLength(1);
    expectWellFormedEvent(events[0], res, {
      reason: "supabase_invalid_credentials",
      status: 401,
    });
    expect(capture.text()).not.toContain(WRONG_PASSWORD);
  });

  test("Supabase returns no user -> AUTH_LOGIN_FAILED (no_user_returned)", async () => {
    createClient.mockReturnValue({
      auth: {
        signInWithPassword: jest
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const res = await login({
      email: "ghost@example.com",
      password: WRONG_PASSWORD,
    });

    expect(res.status).toBe(401);

    const [event] = capture.byEvent(EVENTS.AUTH_LOGIN_FAILED);
    expectWellFormedEvent(event, res, { reason: "no_user_returned" });
  });

  test("invalid OAuth session -> 401 and AUTH_LOGIN_FAILED (oauth_invalid_session)", async () => {
    supabase.auth.getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT: DUMMY-OAUTH-TOKEN" },
    });

    const res = await request(app)
      .post("/api/auth/oauth")
      .send({ access_token: "DUMMY-OAUTH-TOKEN" });

    expect(res.status).toBe(401);

    const [event] = capture.byEvent(EVENTS.AUTH_LOGIN_FAILED);
    expectWellFormedEvent(event, res, {
      reason: "oauth_invalid_session",
      route: "/api/auth/oauth",
      status: 401,
    });
    expect(capture.text()).not.toContain("DUMMY-OAUTH-TOKEN");
  });

  test("a successful login writes no AUTH_LOGIN_FAILED event", async () => {
    await request(app).post("/api/auth/register").send(USER);
    capture.clear();

    const res = await login({ email: USER.email, password: USER.password });

    expect(res.status).toBe(200);
    expect(capture.byEvent(EVENTS.AUTH_LOGIN_FAILED)).toHaveLength(0);
  });

  test("a request rejected by validation (400) is not an authentication failure event", async () => {
    const res = await login({ email: "" });

    expect(res.status).toBe(400);
    expect(capture.byEvent(EVENTS.AUTH_LOGIN_FAILED)).toHaveLength(0);
  });

  test("the failure is logged under a hashed subject, never the email address", async () => {
    await request(app).post("/api/auth/register").send(USER);
    capture.clear();

    await login({ email: USER.email, password: WRONG_PASSWORD });

    const [event] = capture.byEvent(EVENTS.AUTH_LOGIN_FAILED);
    expect(event.subject).toMatch(/^[0-9a-f]{16}$/);
    expect(capture.text()).not.toContain(USER.email);
  });
});

// ---------------------------------------------------------------------------
// TC-02 — missing / invalid / expired JWTs
// ---------------------------------------------------------------------------

describe("TC-02 / AC-02: JWT rejection logging on protected Task endpoints", () => {
  const goodPayload = {
    sub: "11111111-1111-4111-8111-111111111111",
    email: "usera@example.com",
  };

  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const wrongKeyToken = jwt.sign(goodPayload, "some-other-signing-key");
  const expiredToken = jwt.sign(goodPayload, JWT_SECRET, { expiresIn: -60 });
  const unsignedToken = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(
    goodPayload
  )}.`;
  const garbageToken = "DUMMY-NOT-A-JWT";
  const threePartGarbage = "invalid.jwt.token";

  // [description, Authorization header (undefined = omit), event, reason]
  const rejected = [
    ["no Authorization header", undefined, EVENTS.AUTH_TOKEN_MISSING, "no_authorization_header"],
    ["Bearer scheme with no token", "Bearer", EVENTS.AUTH_TOKEN_MISSING, "empty_token"],
    ["non-Bearer scheme", "Basic dXNlcjpwYXNz", EVENTS.AUTH_TOKEN_INVALID, "malformed_header"],
    ["malformed bearer token (not a JWT)", `Bearer ${garbageToken}`, EVENTS.AUTH_TOKEN_INVALID, "malformed_token"],
    ["malformed bearer token (three parts, not decodable)", `Bearer ${threePartGarbage}`, EVENTS.AUTH_TOKEN_INVALID, "malformed_token"],
    ["JWT signed with the wrong key", `Bearer ${wrongKeyToken}`, EVENTS.AUTH_TOKEN_INVALID, "invalid_signature"],
    ["unsigned JWT (alg: none)", `Bearer ${unsignedToken}`, EVENTS.AUTH_TOKEN_INVALID, "invalid_token"],
    ["expired but correctly signed JWT", `Bearer ${expiredToken}`, EVENTS.AUTH_TOKEN_EXPIRED, "token_expired"],
  ];

  test.each(rejected)(
    "%s -> 401 with the matching security event",
    async (_description, header, expectedEvent, expectedReason) => {
      let req = request(app).get("/api/tasks");
      if (header !== undefined) req = req.set("Authorization", header);

      const res = await req;

      expect(res.status).toBe(401);

      const events = capture.events();
      expect(events).toHaveLength(1);
      expectWellFormedEvent(events[0], res, {
        level: "warn",
        event: expectedEvent,
        reason: expectedReason,
        method: "GET",
        route: "/api/tasks",
        status: 401,
      });

      expect(schemaProblems(events)).toEqual([]);
    }
  );

  test("the expired-token case really uses a past exp claim and the controlled key", () => {
    const decoded = jwt.decode(expiredToken);
    expect(decoded.exp).toBeLessThan(Math.floor(Date.now() / 1000));
    expect(() => jwt.verify(expiredToken, JWT_SECRET)).toThrow(/expired/);
    expect(JWT_SECRET).toBe("cc72-test-only-signing-key");
  });

  test("no rejected token, header value or token fragment is written to the log", async () => {
    const secrets = [
      expiredToken,
      wrongKeyToken,
      unsignedToken,
      garbageToken,
      threePartGarbage,
      ...expiredToken.split("."),
      ...wrongKeyToken.split("."),
      "dXNlcjpwYXNz",
    ];

    for (const [, header] of rejected) {
      let req = request(app).get("/api/tasks");
      if (header !== undefined) req = req.set("Authorization", header);
      await req;
    }

    expect(capture.events()).toHaveLength(rejected.length);

    const text = capture.text();
    for (const secret of secrets) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/Bearer/i);
    expect(text).not.toMatch(/Basic /);
  });

  test("a valid JWT continues to the route and writes no token-rejection event", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set(
        "Authorization",
        `Bearer ${signToken({ id: goodPayload.sub, email: goodPayload.email })}`
      );

    expect(res.status).toBe(200);
    expect(capture.byEvent(EVENTS.AUTH_TOKEN_MISSING)).toHaveLength(0);
    expect(capture.byEvent(EVENTS.AUTH_TOKEN_INVALID)).toHaveLength(0);
    expect(capture.byEvent(EVENTS.AUTH_TOKEN_EXPIRED)).toHaveLength(0);
    expect(capture.lines).toHaveLength(0);
  });

  test("rejections are logged for every protected Task route, with ids normalized out of the route", async () => {
    const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const routes = [
      ["get", "/api/tasks", "/api/tasks"],
      ["get", "/api/tasks/prioritized", "/api/tasks/prioritized"],
      ["get", `/api/tasks/${taskId}`, "/api/tasks/:id"],
      ["post", "/api/tasks", "/api/tasks"],
      ["put", `/api/tasks/${taskId}`, "/api/tasks/:id"],
      ["delete", `/api/tasks/${taskId}`, "/api/tasks/:id"],
    ];

    for (const [method, path] of routes) {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    }

    const events = capture.events();
    expect(events).toHaveLength(routes.length);

    events.forEach((event, i) => {
      expect(event.event).toBe(EVENTS.AUTH_TOKEN_MISSING);
      expect(event.method).toBe(routes[i][0].toUpperCase());
      expect(event.route).toBe(routes[i][2]);
    });

    expect(capture.text()).not.toContain(taskId);
  });

  test("the rejected response body is unchanged by logging", async () => {
    const missing = await request(app).get("/api/tasks");
    expect(missing.body).toEqual({
      error: "Missing or malformed Authorization header.",
    });

    const expired = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(expired.body).toEqual({
      error: "Session expired. Please log in again.",
    });

    const invalid = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${wrongKeyToken}`);
    expect(invalid.body).toEqual({ error: "Invalid token." });
  });

  test("/api/auth/me also logs token rejections", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${wrongKeyToken}`);

    expect(res.status).toBe(401);

    const [event] = capture.events();
    expectWellFormedEvent(event, res, {
      event: EVENTS.AUTH_TOKEN_INVALID,
      reason: "invalid_signature",
      route: "/api/auth/me",
    });
  });
});
