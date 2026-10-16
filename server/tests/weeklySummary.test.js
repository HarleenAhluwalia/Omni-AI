// Sprint 2 Task 12: Weekly Summary backend logic.
// Deterministic — real Express app + Supertest, mocked Supabase, no network.
// Due dates are built from the actual current UTC week (Monday-Sunday) so
// classification is correct regardless of which day the suite runs on.
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

// Mirrors the controller's own Monday-Sunday UTC week math, so the test
// fixtures land in the same week the endpoint will compute, on any day.
const getUtcWeekStartMs = (date) => {
  const utcDayOfWeek = date.getUTCDay();
  const daysSinceMonday = (utcDayOfWeek + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday
  );
};

const NOW = new Date();
const WEEK_START_MS = getUtcWeekStartMs(NOW);
const DAY_MS = 24 * 60 * 60 * 1000;

// noon UTC on (week start + dayOffset) — safely inside that UTC day.
const isoForWeekDayOffset = (dayOffset) =>
  new Date(WEEK_START_MS + dayOffset * DAY_MS + 12 * 60 * 60 * 1000).toISOString();

const MONDAY_THIS_WEEK = isoForWeekDayOffset(0);
const WEDNESDAY_THIS_WEEK = isoForWeekDayOffset(2);
const SUNDAY_THIS_WEEK = isoForWeekDayOffset(6);
const LAST_WEEK = isoForWeekDayOffset(-3);
const NEXT_WEEK = isoForWeekDayOffset(9);

// "Today" by the controller's own UTC-day definition, used to build a task
// that's overdue (due before today) but still falls within this week.
const TODAY_UTC_MS = Date.UTC(
  NOW.getUTCFullYear(),
  NOW.getUTCMonth(),
  NOW.getUTCDate()
);
const isBeforeTodayWithinThisWeek = TODAY_UTC_MS > WEEK_START_MS;
const EARLIER_THIS_WEEK_BUT_PAST = isBeforeTodayWithinThisWeek
  ? new Date(WEEK_START_MS + 12 * 60 * 60 * 1000).toISOString()
  : null;

// Symmetric to the above, for a task that's due later this week and not
// yet overdue ("upcoming"). Guarded the same way - skipped only on the one
// day (Sunday) where "later this week" doesn't exist.
const isAfterTodayWithinThisWeek = TODAY_UTC_MS < WEEK_START_MS + 6 * DAY_MS;
const LATER_THIS_WEEK_BUT_FUTURE = isAfterTodayWithinThisWeek
  ? new Date(WEEK_START_MS + 6 * DAY_MS + 12 * 60 * 60 * 1000).toISOString()
  : null;

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
    .get("/api/tasks/summary/weekly")
    .set("Authorization", auth);

beforeEach(() => {
  supabase.__reset();
});

describe("Weekly Summary — authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/tasks/summary/weekly");
    expect(res.status).toBe(401);
  });
});

describe("Weekly Summary — empty state", () => {
  it("returns a valid, zeroed-out summary for a user with no tasks", async () => {
    const res = await getSummary();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.counts).toEqual({
      total: 0,
      completed: 0,
      remaining: 0,
      overdue: 0,
      upcoming: 0,
    });
    expect(res.body.data.workload).toEqual({
      totalEffortMinutes: 0,
      completedEffortMinutes: 0,
      remainingEffortMinutes: 0,
      totalPoints: 0,
      completedPoints: 0,
      remainingPoints: 0,
    });
    expect(res.body.data.completionPercentage).toBe(0);
    expect(res.body.data.tasks).toEqual([]);
    expect(res.body.data.overdue).toEqual([]);
    expect(res.body.data.upcoming).toEqual([]);
    expect(res.body.data.week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.data.week.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Weekly Summary — inclusion/exclusion by week", () => {
  it("includes tasks due within this week (Monday, mid-week, and Sunday)", async () => {
    const monday = await createAsUser(USER_ID, {
      title: "Monday",
      due_date: MONDAY_THIS_WEEK,
    });
    const wednesday = await createAsUser(USER_ID, {
      title: "Wednesday",
      due_date: WEDNESDAY_THIS_WEEK,
    });
    const sunday = await createAsUser(USER_ID, {
      title: "Sunday",
      due_date: SUNDAY_THIS_WEEK,
    });

    const res = await getSummary();

    const ids = res.body.data.tasks.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        monday.body.data.id,
        wednesday.body.data.id,
        sunday.body.data.id,
      ])
    );
    expect(res.body.data.counts.total).toBe(3);
  });

  it("excludes tasks due last week or next week from the this-week list", async () => {
    await createAsUser(USER_ID, { title: "Last week", due_date: LAST_WEEK });
    await createAsUser(USER_ID, { title: "Next week", due_date: NEXT_WEEK });

    const res = await getSummary();

    expect(res.body.data.tasks).toEqual([]);
    expect(res.body.data.counts.total).toBe(0);
  });

  it("ignores tasks with no due_date entirely", async () => {
    await createAsUser(USER_ID, { title: "No date", due_date: null });

    const res = await getSummary();

    expect(res.body.data.counts.total).toBe(0);
    expect(res.body.data.tasks).toEqual([]);
  });
});

describe("Weekly Summary — completion and overdue", () => {
  it("counts completed vs incomplete tasks due this week correctly", async () => {
    await createAsUser(USER_ID, {
      title: "Done",
      due_date: MONDAY_THIS_WEEK,
      completion_status: "completed",
    });
    await createAsUser(USER_ID, {
      title: "Not done",
      due_date: WEDNESDAY_THIS_WEEK,
      completion_status: "not_started",
    });

    const res = await getSummary();

    expect(res.body.data.counts.total).toBe(2);
    expect(res.body.data.counts.completed).toBe(1);
    expect(res.body.data.counts.remaining).toBe(1);
    expect(res.body.data.completionPercentage).toBe(50);
  });

  it("classifies an incomplete task due last week as overdue", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Overdue from last week",
      due_date: LAST_WEEK,
    });

    const res = await getSummary();

    expect(res.body.data.counts.overdue).toBe(1);
    expect(res.body.data.overdue.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
    // It's from last week, so it must not appear in this week's task list.
    expect(res.body.data.tasks).toEqual([]);
  });

  it("does not count a completed task from last week as overdue", async () => {
    await createAsUser(USER_ID, {
      title: "Completed late",
      due_date: LAST_WEEK,
      completion_status: "completed",
    });

    const res = await getSummary();

    expect(res.body.data.counts.overdue).toBe(0);
  });

  (isBeforeTodayWithinThisWeek ? it : it.skip)(
    "also flags an incomplete task due earlier this week (already past) as overdue",
    async () => {
      const created = await createAsUser(USER_ID, {
        title: "Earlier this week, still open",
        due_date: EARLIER_THIS_WEEK_BUT_PAST,
      });

      const res = await getSummary();

      // Belongs to both: it's due this week AND already overdue.
      expect(res.body.data.tasks.map((t) => t.id)).toContain(
        created.body.data.id
      );
      expect(res.body.data.overdue.map((t) => t.id)).toContain(
        created.body.data.id
      );
    }
  );
});

describe("Weekly Summary — upcoming tasks", () => {
  (isAfterTodayWithinThisWeek ? it : it.skip)(
    "classifies an incomplete task due later this week as upcoming, not overdue",
    async () => {
      const created = await createAsUser(USER_ID, {
        title: "Later this week, still open",
        due_date: LATER_THIS_WEEK_BUT_FUTURE,
      });

      const res = await getSummary();

      expect(res.body.data.counts.upcoming).toBe(1);
      expect(res.body.data.upcoming.map((t) => t.id)).toEqual([
        created.body.data.id,
      ]);
      expect(res.body.data.overdue.map((t) => t.id)).not.toContain(
        created.body.data.id
      );
    }
  );

  (isAfterTodayWithinThisWeek ? it : it.skip)(
    "does not count a completed task due later this week as upcoming",
    async () => {
      await createAsUser(USER_ID, {
        title: "Already done, due later this week",
        due_date: LATER_THIS_WEEK_BUT_FUTURE,
        completion_status: "completed",
      });

      const res = await getSummary();

      expect(res.body.data.counts.upcoming).toBe(0);
      expect(res.body.data.upcoming).toEqual([]);
    }
  );

  (isBeforeTodayWithinThisWeek ? it : it.skip)(
    "does not count an overdue task (due earlier this week) as upcoming",
    async () => {
      const created = await createAsUser(USER_ID, {
        title: "Earlier this week, still open",
        due_date: EARLIER_THIS_WEEK_BUT_PAST,
      });

      const res = await getSummary();

      expect(res.body.data.upcoming.map((t) => t.id)).not.toContain(
        created.body.data.id
      );
    }
  );
});

describe("Weekly Summary — no completed work", () => {
  it("reports 0% completion when the week has tasks but none are completed", async () => {
    await createAsUser(USER_ID, {
      title: "Not done 1",
      due_date: MONDAY_THIS_WEEK,
      completion_status: "not_started",
    });
    await createAsUser(USER_ID, {
      title: "Not done 2",
      due_date: WEDNESDAY_THIS_WEEK,
      completion_status: "in_progress",
    });

    const res = await getSummary();

    expect(res.body.data.counts.total).toBe(2);
    expect(res.body.data.counts.completed).toBe(0);
    expect(res.body.data.counts.remaining).toBe(2);
    expect(res.body.data.completionPercentage).toBe(0);
    expect(res.body.data.workload.completedEffortMinutes).toBe(0);
    expect(res.body.data.workload.completedPoints).toBe(0);
  });
});

describe("Weekly Summary — workload totals", () => {
  it("calculates total, completed, and remaining effort/points correctly", async () => {
    await createAsUser(USER_ID, {
      title: "Done",
      due_date: MONDAY_THIS_WEEK,
      completion_status: "completed",
      estimated_effort_minutes: 30,
      point_value: 5,
    });
    await createAsUser(USER_ID, {
      title: "Not done",
      due_date: WEDNESDAY_THIS_WEEK,
      completion_status: "not_started",
      estimated_effort_minutes: 90,
      point_value: 10,
    });

    const res = await getSummary();

    expect(res.body.data.workload).toEqual({
      totalEffortMinutes: 120,
      completedEffortMinutes: 30,
      remainingEffortMinutes: 90,
      totalPoints: 15,
      completedPoints: 5,
      remainingPoints: 10,
    });
  });

  it("treats missing effort/points as zero without erroring", async () => {
    await createAsUser(USER_ID, {
      title: "No effort or points set",
      due_date: MONDAY_THIS_WEEK,
      estimated_effort_minutes: null,
      point_value: null,
    });

    const res = await getSummary();

    expect(res.body.data.workload.totalEffortMinutes).toBe(0);
    expect(res.body.data.workload.totalPoints).toBe(0);
  });
});

describe("Weekly Summary — ownership", () => {
  it("only summarizes the authenticated user's own tasks", async () => {
    await createAsUser(USER_ID, { title: "Mine", due_date: MONDAY_THIS_WEEK });
    await createAsUser(OTHER_USER_ID, {
      title: "Not mine",
      due_date: MONDAY_THIS_WEEK,
    });

    const res = await getSummary(authHeader(USER_ID));

    expect(res.body.data.counts.total).toBe(1);
    expect(res.body.data.tasks[0].title).toBe("Mine");
  });
});

describe("Weekly Summary — failure handling", () => {
  it("returns a 500 and does not report success when the database query fails", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              error: { message: "simulated weekly summary query failure" },
            }),
        }),
      };
    });

    try {
      const res = await getSummary();

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(
        /simulated weekly summary query failure/i
      );
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }
  });
});
