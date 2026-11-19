/**
 * Sprint 5 - Jerry
 * UC-9 / UC-16 Study Preferences - backend API tests
 *
 * Covers GET /api/preferences and PUT /api/preferences:
 *   - authentication is required (401 without / with a bad token)
 *   - defaults are returned for a user who has never saved anything
 *   - a valid PUT saves, and a later GET returns the saved values
 *     (the "preferences persist after refresh" demo step)
 *   - validation rejects out-of-range values, weights that do not total 100,
 *     and unknown style options
 *   - one user can never read or overwrite another user's preferences
 *   - database failures surface as a clean 500 without leaking details
 *
 * Jest + Supertest + in-memory Supabase stand-in (no network, no secrets).
 */

jest.mock("../config/supabase", () => {
  // The shared helper in tests/helpers/supabaseMock.js does not support
  // upsert().select().single(), which preferencesController uses, so this
  // file carries a minimal stand-in scoped to the "preferences" table.
  const rows = [];
  const state = { failWith: null };

  const from = () => {
    const filters = {};
    let upsertRow = null;

    const matches = (row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value);

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        filters[column] = value;
        return builder;
      },
      upsert(row) {
        upsertRow = row;
        return builder;
      },
      maybeSingle() {
        if (state.failWith) {
          return Promise.resolve({ data: null, error: state.failWith });
        }
        const row = rows.find(matches);
        return Promise.resolve({ data: row ? { ...row } : null, error: null });
      },
      single() {
        if (state.failWith) {
          return Promise.resolve({ data: null, error: state.failWith });
        }
        const idx = rows.findIndex((r) => r.user_id === upsertRow.user_id);
        if (idx === -1) {
          rows.push({ ...upsertRow });
        } else {
          rows[idx] = { ...rows[idx], ...upsertRow };
        }
        const saved = rows.find((r) => r.user_id === upsertRow.user_id);
        return Promise.resolve({ data: { ...saved }, error: null });
      },
    };

    return builder;
  };

  return { from, __rows: rows, __state: state };
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken, JWT_SECRET } = require("../src/middleware/auth");
const { validate } = require("../src/controllers/preferencesController");

const app = createApp();

const USER_A = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "usera@example.com",
};

const USER_B = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "userb@example.com",
};

const authHeader = (user) => `Bearer ${signToken(user)}`;

const validPrefs = {
  studySessionMinutes: 45,
  breakMinutes: 10,
  dailyWorkloadMinutes: 240,
  schedulingStyle: "balanced",
  communicationStyle: "balanced",
  deadlineWeight: 40,
  priorityWeight: 35,
  effortWeight: 25,
};

const putPrefs = (user, body) =>
  request(app)
    .put("/api/preferences")
    .set("Authorization", authHeader(user))
    .send(body);

const getPrefs = (user) =>
  request(app).get("/api/preferences").set("Authorization", authHeader(user));

let consoleErrorSpy;

beforeAll(() => {
  // The controller logs caught database errors; keep test output clean.
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  supabase.__rows.length = 0;
  supabase.__state.failWith = null;
});

describe("Preferences API - authentication (UC-9 / UC-5)", () => {
  test("GET without an Authorization header returns 401", async () => {
    const res = await request(app).get("/api/preferences");
    expect(res.status).toBe(401);
  });

  test("PUT without an Authorization header returns 401 and saves nothing", async () => {
    const res = await request(app).put("/api/preferences").send(validPrefs);
    expect(res.status).toBe(401);
    expect(supabase.__rows).toHaveLength(0);
  });

  test("a token signed with the wrong secret is rejected", async () => {
    const forged = jwt.sign(
      { sub: USER_A.id, email: USER_A.email },
      "not-the-real-secret"
    );
    const res = await request(app)
      .get("/api/preferences")
      .set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test("an expired token is rejected", async () => {
    const expired = jwt.sign(
      { sub: USER_A.id, email: USER_A.email },
      JWT_SECRET,
      { expiresIn: -10 }
    );
    const res = await request(app)
      .get("/api/preferences")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe("Preferences API - read and save (UC-9 / UC-16)", () => {
  test("a user with nothing saved receives the default preferences", async () => {
    const res = await getPrefs(USER_A);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(validPrefs);
  });

  test("a valid PUT saves and echoes the preferences", async () => {
    const body = { ...validPrefs, studySessionMinutes: 60, breakMinutes: 15 };
    const res = await putPrefs(USER_A, body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(body);
  });

  test("saved preferences are returned by a later GET (persist after refresh)", async () => {
    const body = {
      studySessionMinutes: 45,
      breakMinutes: 5,
      dailyWorkloadMinutes: 180,
      schedulingStyle: "deadline",
      communicationStyle: "concise",
      deadlineWeight: 50,
      priorityWeight: 30,
      effortWeight: 20,
    };

    await putPrefs(USER_A, body).expect(200);

    const res = await getPrefs(USER_A);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(body);
  });

  test("saving twice updates the single row instead of creating a second", async () => {
    await putPrefs(USER_A, validPrefs).expect(200);
    await putPrefs(USER_A, { ...validPrefs, studySessionMinutes: 90 }).expect(200);

    expect(supabase.__rows).toHaveLength(1);

    const res = await getPrefs(USER_A);
    expect(res.body.data.studySessionMinutes).toBe(90);
  });

  test("the stored row is keyed by the token's user id, not the request body", async () => {
    await putPrefs(USER_A, { ...validPrefs, user_id: USER_B.id }).expect(200);

    expect(supabase.__rows).toHaveLength(1);
    expect(supabase.__rows[0].user_id).toBe(USER_A.id);
  });
});

describe("Preferences API - validation", () => {
  const rejects = async (overrides, expectedMessage) => {
    const res = await putPrefs(USER_A, { ...validPrefs, ...overrides });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    if (expectedMessage) {
      expect(res.body.error).toMatch(expectedMessage);
    }
    expect(supabase.__rows).toHaveLength(0);
  };

  test("study session of 0 minutes is rejected", () =>
    rejects({ studySessionMinutes: 0 }, /studySessionMinutes/));

  test("study session above 240 minutes is rejected", () =>
    rejects({ studySessionMinutes: 241 }, /studySessionMinutes/));

  test("negative break interval is rejected", () =>
    rejects({ breakMinutes: -1 }, /breakMinutes/));

  test("break interval above 120 minutes is rejected", () =>
    rejects({ breakMinutes: 121 }, /breakMinutes/));

  test("daily workload limit above 1440 minutes is rejected", () =>
    rejects({ dailyWorkloadMinutes: 1441 }, /dailyWorkloadMinutes/));

  test("non-integer values are rejected", () =>
    rejects({ studySessionMinutes: 45.5 }, /studySessionMinutes/));

  test("numbers sent as strings are rejected", () =>
    rejects({ studySessionMinutes: "45" }, /studySessionMinutes/));

  test("weights that do not total 100 are rejected", () =>
    rejects({ deadlineWeight: 50, priorityWeight: 35, effortWeight: 25 }, /total 100/));

  test("an unknown scheduling style is rejected", () =>
    rejects({ schedulingStyle: "chaotic" }, /Invalid preference option/));

  test("an unknown communication style is rejected", () =>
    rejects({ communicationStyle: "shouty" }, /Invalid preference option/));

  test("an empty body is rejected", async () => {
    const res = await putPrefs(USER_A, {});
    expect(res.status).toBe(400);
    expect(supabase.__rows).toHaveLength(0);
  });

  test("validate() accepts boundary values", () => {
    expect(
      validate({
        ...validPrefs,
        studySessionMinutes: 1,
        breakMinutes: 0,
        dailyWorkloadMinutes: 1440,
      })
    ).toBeNull();
    expect(validate({ ...validPrefs, studySessionMinutes: 240, breakMinutes: 120 })).toBeNull();
  });
});

describe("Preferences API - user isolation", () => {
  test("user B does not see user A's saved preferences", async () => {
    await putPrefs(USER_A, { ...validPrefs, studySessionMinutes: 120 }).expect(200);

    const res = await getPrefs(USER_B);
    expect(res.status).toBe(200);
    expect(res.body.data.studySessionMinutes).toBe(validPrefs.studySessionMinutes);
  });

  test("user B saving preferences does not overwrite user A's", async () => {
    await putPrefs(USER_A, { ...validPrefs, studySessionMinutes: 120 }).expect(200);
    await putPrefs(USER_B, { ...validPrefs, studySessionMinutes: 30 }).expect(200);

    expect(supabase.__rows).toHaveLength(2);

    const a = await getPrefs(USER_A);
    const b = await getPrefs(USER_B);
    expect(a.body.data.studySessionMinutes).toBe(120);
    expect(b.body.data.studySessionMinutes).toBe(30);
  });
});

describe("Preferences API - database failures", () => {
  test("GET returns a clean 500 when the database errors", async () => {
    supabase.__state.failWith = { message: "connection refused to db.internal:5432" };

    const res = await getPrefs(USER_A);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: "Could not load preferences" });
    expect(JSON.stringify(res.body)).not.toMatch(/db\.internal/);
  });

  test("PUT returns a clean 500 when the database errors", async () => {
    supabase.__state.failWith = { message: "connection refused to db.internal:5432" };

    const res = await putPrefs(USER_A, validPrefs);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: "Could not save preferences" });
    expect(JSON.stringify(res.body)).not.toMatch(/db\.internal/);
  });
});
