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

const getSummary = (auth = authHeader(), timeZone = null) => {
  const req = request(app)
    .get("/api/tasks/summary/daily")
    .set("Authorization", auth);

  return timeZone
    ? req.query({ time_zone: timeZone })
    : req;
};

// The has_due_time/timezone tests below pin "now" with
// jest.setSystemTime rather than using real wall-clock time, because
// the relationship between a UTC calendar day and a local calendar
// day (ahead or behind) itself depends on what time of day it
// happens to be when the suite runs - using real time here would
// make these specific tests intermittently flaky. A fixed, known
// instant removes that entirely. (The rest of this file's existing
// tests are untouched and keep using real time via isoForDayOffset,
// which has no such boundary-dependent ambiguity.)
//
// FIXED_NOW_ISO = 2026-06-15T18:00:00.000Z. At this instant:
//   - UTC's calendar day is Jun 15.
//   - America/Los_Angeles (UTC-7 in June, PDT) is 11:00 Jun 15 -
//     same calendar day as UTC, no pre-existing day-boundary gap.
// The LA-focused tests below use this fixed instant.
const FIXED_NOW_ISO = "2026-06-15T18:00:00.000Z";

// FIXED_NOW_TOKYO_ISO = 2026-06-15T12:00:00.000Z. At this instant,
// Asia/Tokyo (UTC+9, no DST) is 21:00 Jun 15 - same calendar day as
// UTC, no pre-existing day-boundary gap. A separate fixed instant
// from the LA tests, so each boundary case starts from its own
// no-gap baseline rather than compounding both zones' offsets.
const FIXED_NOW_TOKYO_ISO = "2026-06-15T12:00:00.000Z";

// LA 23:30 on its own June 15 "today" = UTC June 16 06:30 (+7h PDT).
// Its UTC calendar date (Jun 16) is tomorrow relative to UTC's actual
// today (Jun 15) - a naive UTC-only classification would wrongly call
// this "upcoming" when the user actually meant "due today."
const LA_TODAY_LATE_ISO = "2026-06-16T06:30:00.000Z";

// LA 23:30 on June 14 (LA's yesterday) = UTC June 15 06:30 (+7h PDT).
// Its UTC calendar date (Jun 15) equals UTC's actual today - a naive
// UTC-only classification would wrongly call this "due today" when
// the user actually meant "due yesterday" (overdue).
const LA_YESTERDAY_LATE_ISO = "2026-06-15T06:30:00.000Z";

// Relative to FIXED_NOW_TOKYO_ISO: UTC June 15 23:30 (today, late) =
// Tokyo June 16 08:30 (+9h, no DST) - already Tokyo's tomorrow. A
// naive UTC-only classification would wrongly call this "due today."
const TOKYO_TOMORROW_EARLY_ISO = "2026-06-15T23:30:00.000Z";

// A date-only Task due UTC-tomorrow (noon, safely inside the day),
// for the mixed has_due_time/date-only test - its classification must
// stay UTC-based and unaffected by the time_zone query param.
const DATE_ONLY_TOMORROW_ISO = "2026-06-16T12:00:00.000Z";

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

describe("Daily Summary — has_due_time timezone-aware classification", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("classifies a has_due_time Task near local midnight as dueToday in America/Los_Angeles, even though its UTC date is tomorrow", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Timed, due late tonight in LA",
      due_date: LA_TODAY_LATE_ISO,
      has_due_time: true,
    });

    const res = await getSummary(authHeader(), "America/Los_Angeles");

    expect(res.status).toBe(200);
    expect(res.body.data.counts.dueToday).toBe(1);
    expect(res.body.data.dueToday.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
    expect(res.body.data.upcoming).toEqual([]);
  });

  it("classifies a has_due_time Task as overdue in America/Los_Angeles when it's already past locally, even though its UTC date is still today", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Timed, due late last night in LA",
      due_date: LA_YESTERDAY_LATE_ISO,
      has_due_time: true,
    });

    const res = await getSummary(authHeader(), "America/Los_Angeles");

    expect(res.status).toBe(200);
    expect(res.body.data.counts.overdue).toBe(1);
    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.overdue.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
  });

  it("classifies a has_due_time Task as upcoming in Asia/Tokyo when it's already tomorrow locally, even though its UTC date is still today", async () => {
    jest.setSystemTime(new Date(FIXED_NOW_TOKYO_ISO));

    const created = await createAsUser(USER_ID, {
      title: "Timed, due just after midnight in Tokyo",
      due_date: TOKYO_TOMORROW_EARLY_ISO,
      has_due_time: true,
    });

    const res = await getSummary(authHeader(), "Asia/Tokyo");

    expect(res.status).toBe(200);
    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.upcoming.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
  });

  it("classifies a mixed has_due_time and date-only Task list correctly, each by its own rule, in a single request", async () => {
    const timed = await createAsUser(USER_ID, {
      title: "Timed, due late tonight in LA",
      due_date: LA_TODAY_LATE_ISO,
      has_due_time: true,
    });
    const dateOnly = await createAsUser(USER_ID, {
      title: "Date-only, due tomorrow UTC",
      due_date: DATE_ONLY_TOMORROW_ISO,
    });

    const res = await getSummary(authHeader(), "America/Los_Angeles");

    expect(res.status).toBe(200);
    expect(res.body.data.dueToday.map((t) => t.id)).toEqual([
      timed.body.data.id,
    ]);
    expect(res.body.data.upcoming.map((t) => t.id)).toEqual([
      dateOnly.body.data.id,
    ]);
  });

  it("falls back to UTC classification for a has_due_time Task when time_zone is omitted", async () => {
    const created = await createAsUser(USER_ID, {
      title: "Timed, no time_zone supplied",
      due_date: LA_TODAY_LATE_ISO,
      has_due_time: true,
    });

    // No time_zone query param at all - must behave exactly like a
    // date-only Task would for the same due_date (plain UTC
    // classification), not guess or silently assume a fixed offset.
    const res = await getSummary();

    expect(res.status).toBe(200);
    expect(res.body.data.counts.dueToday).toBe(0);
    expect(res.body.data.upcoming.map((t) => t.id)).toEqual([
      created.body.data.id,
    ]);
  });

  it("rejects an invalid time_zone with HTTP 400", async () => {
    const res = await getSummary(authHeader(), "Not/AZone");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Invalid time_zone.");
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
      expect(res.body.error).toBe("Could not load daily summary.");
      expect(res.body.error).not.toMatch(/simulated summary query failure/i);
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }
  });
});
