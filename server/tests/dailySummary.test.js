// Sprint 2 Task 11: Daily Summary backend logic.
// Deterministic — real Express app + Supertest, mocked Supabase, no network.
// Due dates are built from UTC day offsets so classification is correct
// regardless of the machine/CI runner's local timezone.
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

// Builds an ISO timestamp at noon UTC on (today + dayOffset), safely inside
// that UTC calendar day regardless of what time it is when the test runs.
const isoForDayOffset = (dayOffset) => {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + dayOffset,
      12,
      0,
      0
    )
  ).toISOString();
};

const TODAY_ISO = isoForDayOffset(0);
const YESTERDAY_ISO = isoForDayOffset(-1);
const TOMORROW_ISO = isoForDayOffset(1);
const NEXT_WEEK_ISO = isoForDayOffset(7);

const createAsUser = (userId, overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", authHeader(userId))
    .send({
      title: "Task",
      priority: "medium",
      completion_status: "not_started",
      ...overrides,
    });

const getSummary = (auth = authHeader()) =>
  request(app)
    .get("/api/tasks/summary/daily")
    .set("Authorization", auth);

beforeEach(() => {
  supabase.__reset();
});

describe("Daily Summary — authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/tasks/summary/daily");
    expect(res.status).toBe(401);
  });
});

describe("Daily Summary — empty state", () => {
  it("returns a valid, empty summary for a user with no tasks", async () => {
    const res = await getSummary();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.counts).toEqual({
      dueToday: 0,
      overdue: 0,
      completed: 0,
      highPriority: 0,
      total: 0,
    });
    expect(res.body.data.dueToday).toEqual([]);
    expect(res.body.data.overdue).toEqual([]);
    expect(res.body.data.upcoming).toEqual([]);
    expect(res.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Daily Summary — classification", () => {
  it("classifies an incomplete task due today as dueToday, not overdue or upcoming", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Due today",
      due_date: TODAY_ISO,
    });

    const res = await getSummary();

    expect(res.body.data.counts.dueToday).toBe(1);
    expect(res.body.data.counts.overdue).toBe(0);
    expect(res.body.data.dueToday.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
    expect(res.body.data.upcoming).toEqual([]);
  });

  it("classifies an incomplete task due yesterday as overdue", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Due yesterday",
      due_date: YESTERDAY_ISO,
    });

    const res = await getSummary();

    expect(res.body.data.counts.overdue).toBe(1);
    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.overdue.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
  });

  it("classifies an incomplete task due in the future as upcoming, not dueToday or overdue", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Due next week",
      due_date: NEXT_WEEK_ISO,
    });

    const res = await getSummary();

    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.counts.overdue).toBe(0);
    expect(res.body.data.upcoming.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
  });

  it("does not count a completed task (even one overdue) as overdue", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Completed late",
      due_date: YESTERDAY_ISO,
      completion_status: "completed",
    });

    const res = await getSummary();

    expect(res.body.data.counts.overdue).toBe(0);
    expect(res.body.data.counts.completed).toBe(1);
    expect(
      res.body.data.overdue.find((t) => t.id === created.body.data.id)
    ).toBeUndefined();
  });

  it("does not count a completed task due today as dueToday", async () => {
    await createAsUser(USER_ID, {
      title: "Already done today",
      due_date: TODAY_ISO,
      completion_status: "completed",
    });

    const res = await getSummary();

    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.counts.completed).toBe(1);
  });

  it("counts incomplete high-priority tasks in counts.highPriority", async () => {
    await createAsUser(USER_ID, { priority: "high", due_date: TOMORROW_ISO });
    await createAsUser(USER_ID, { priority: "low", due_date: TOMORROW_ISO });
    await createAsUser(USER_ID, {
      priority: "high",
      completion_status: "completed",
      due_date: TOMORROW_ISO,
    });

    const res = await getSummary();

    // Only the one incomplete high-priority task counts.
    expect(res.body.data.counts.highPriority).toBe(1);
  });

  it("sorts overdue tasks with the earliest (most overdue) due date first", async () => {
    const lessOverdue = await createAsUser(USER_ID, {
      title: "Less overdue",
      due_date: YESTERDAY_ISO,
    });
    const moreOverdue = await createAsUser(USER_ID, {
      title: "More overdue",
      due_date: isoForDayOffset(-5),
    });

    const res = await getSummary();

    expect(res.body.data.overdue.map((t) => t.id)).toEqual([
      moreOverdue.body.data.id,
      lessOverdue.body.data.id,
    ]);
  });

  it("ignores tasks with no due_date entirely", async () => {
    await createAsUser(USER_ID, { title: "No date", due_date: null });

    const res = await getSummary();

    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.counts.overdue).toBe(0);
    expect(res.body.data.upcoming).toEqual([]);
    expect(res.body.data.counts.total).toBe(1);
  });
});

describe("Daily Summary — ownership", () => {
  it("only summarizes the authenticated user's own tasks", async () => {
    await createAsUser(USER_ID, { title: "Mine", due_date: TODAY_ISO });
    await createAsUser(OTHER_USER_ID, {
      title: "Not mine",
      due_date: TODAY_ISO,
    });

    const res = await getSummary(authHeader(USER_ID));

    expect(res.body.data.counts.total).toBe(1);
    expect(res.body.data.dueToday).toHaveLength(1);
    expect(res.body.data.dueToday[0].title).toBe("Mine");
  });
});

describe("Daily Summary — failure handling", () => {
  it("returns a 500 and does not report success when the database query fails", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              error: { message: "simulated summary query failure" },
            }),
        }),
      };
    });

    try {
      const res = await getSummary();

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/simulated summary query failure/i);
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }
  });
});
