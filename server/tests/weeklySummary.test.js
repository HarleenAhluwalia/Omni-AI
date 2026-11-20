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

const getSummary = (auth = authHeader(), timeZone = null) => {
  const req = request(app)
    .get("/api/tasks/summary/weekly")
    .set("Authorization", auth);

  return timeZone
    ? req.query({ time_zone: timeZone })
    : req;
};

// The has_due_time/timezone tests below pin "now" with
// jest.setSystemTime rather than using real wall-clock time, for the
// same reason as dailySummary.test.js: the relationship between a
// UTC week/day and a local week/day depends on what time of day (and
// day of week) it happens to be when the suite runs, which would make
// boundary-straddling fixtures intermittently flaky with real time.
//
// FIXED_NOW_ISO = 2026-06-15T18:00:00.000Z, a Monday. At this instant:
//   - UTC's week starts Monday June 15 (this instant is early in it).
//   - America/Los_Angeles (UTC-7 in June, PDT) is 11:00 Monday June 15 -
//     same calendar day and week as UTC, no pre-existing boundary gap.
const FIXED_NOW_ISO = "2026-06-15T18:00:00.000Z";

// LA Sunday June 14 (last week, LA-local) 23:30 = UTC Monday June 15
// 06:30 (+7h PDT). Its UTC calendar date (Jun 15, Monday) is already
// inside the UTC week that just started - a naive UTC-only
// classification would wrongly include this in "this week" (and as
// due-today-ish), when the user's own local day is still Sunday of
// last week.
const LA_LAST_WEEK_SUNDAY_LATE_ISO = "2026-06-15T06:30:00.000Z";

// A has_due_time Task safely inside both the UTC and LA calendar/week
// definitions of "this week" (Wednesday local, nowhere near either
// boundary), used to prove the completed/remaining/percentage counts
// still compute correctly once has_due_time Tasks are classified
// locally rather than breaking that arithmetic.
const LA_THIS_WEEK_WEDNESDAY_ISO = "2026-06-17T20:00:00.000Z";

// A date-only Task due this UTC week (Monday, noon) - must stay
// classified by UTC regardless of the time_zone query param.
const DATE_ONLY_THIS_WEEK_ISO = "2026-06-15T12:00:00.000Z";

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

describe("Weekly Summary — has_due_time timezone-aware classification", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("excludes a has_due_time Task from this week in America/Los_Angeles when it's actually last week locally, even though its UTC date already falls in this week", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Timed, due Sunday night last week in LA",
      due_date: LA_LAST_WEEK_SUNDAY_LATE_ISO,
      has_due_time: true,
    });

    const res = await getSummary(authHeader(), "America/Los_Angeles");

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toEqual([]);
    expect(res.body.data.counts.total).toBe(0);
    expect(res.body.data.overdue.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
  });

  it("includes the same has_due_time Task in this week when classified by UTC (time_zone omitted), proving the local/UTC week boundary actually differs", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Timed, due Sunday night last week in LA",
      due_date: LA_LAST_WEEK_SUNDAY_LATE_ISO,
      has_due_time: true,
    });

    const res = await getSummary();

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
    expect(res.body.data.counts.total).toBe(1);
  });

  it("classifies a mixed has_due_time and date-only Task list correctly for week membership, each by its own rule", async () => {
    const dateOnly = await createAsUser(USER_ID, {
      title: "Date-only, due this UTC week",
      due_date: DATE_ONLY_THIS_WEEK_ISO,
    });
    const timedLastWeekLocally = await createAsUser(USER_ID, {
      title: "Timed, due Sunday night last week in LA",
      due_date: LA_LAST_WEEK_SUNDAY_LATE_ISO,
      has_due_time: true,
    });

    const res = await getSummary(authHeader(), "America/Los_Angeles");

    expect(res.status).toBe(200);
    const taskIds = res.body.data.tasks.map((t) => t.id);
    expect(taskIds).toEqual([dateOnly.body.data.id]);
    expect(taskIds).not.toContain(timedLastWeekLocally.body.data.id);
  });

  it("keeps completed/remaining/completionPercentage counts correct once a has_due_time Task is included in this week", async () => {
    await createAsUser(USER_ID, {
      title: "Timed, completed, this week",
      due_date: LA_THIS_WEEK_WEDNESDAY_ISO,
      has_due_time: true,
      completion_status: "completed",
      estimated_effort_minutes: 30,
      point_value: 5,
    });
    await createAsUser(USER_ID, {
      title: "Date-only, not done, this week",
      due_date: DATE_ONLY_THIS_WEEK_ISO,
      estimated_effort_minutes: 90,
      point_value: 10,
    });

    const res = await getSummary(authHeader(), "America/Los_Angeles");

    expect(res.status).toBe(200);
    expect(res.body.data.counts.total).toBe(2);
    expect(res.body.data.counts.completed).toBe(1);
    expect(res.body.data.counts.remaining).toBe(1);
    expect(res.body.data.completionPercentage).toBe(50);
    expect(res.body.data.workload).toEqual({
      totalEffortMinutes: 120,
      completedEffortMinutes: 30,
      remainingEffortMinutes: 90,
      totalPoints: 15,
      completedPoints: 5,
      remainingPoints: 10,
    });
  });

  it("rejects an invalid time_zone with HTTP 400", async () => {
    const res = await getSummary(authHeader(), "Not/AZone");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Invalid time_zone.");
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
      expect(res.body.error).toBe("Could not load weekly summary.");
      expect(res.body.error).not.toMatch(
        /simulated weekly summary query failure/i
      );
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }
  });
});
