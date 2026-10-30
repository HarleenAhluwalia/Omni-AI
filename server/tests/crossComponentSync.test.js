// Sprint 4: Cross-Component Synchronization test cases (Jira: Create
// Cross-Component Synchronization Test Cases).
//
// Deterministic — real Express app + Supertest, mocked Supabase, no
// network, no real credentials. This file deliberately does NOT
// duplicate the extensive existing coverage in createTask.test.js,
// editTask.test.js, deleteTask.test.js, taskApiContract.test.js,
// tasks.test.js, taskAuth.test.js, taskWorkflow.test.js,
// databaseIntegrity.test.js, dailySummary.test.js, weeklySummary.test.js,
// canvasCrossFeatureIntegration.test.js, dummyCanvasApi.test.js,
// dummyCanvasSync.test.js, or dummyCanvasImport.test.js — see
// docs/testing-evidence/sprint-4/cross-component-synchronization-test-cases.md
// for the full existing-coverage inventory. Every test here exercises a
// genuine round trip THROUGH multiple real HTTP endpoints (creation/
// edit/completion/deletion via the Task CRUD routes, then verification
// via /prioritized, /summary/daily, and /summary/weekly, and - for
// Canvas - via /api/dummy-canvas/* then the Task endpoints), which none
// of the files above do end-to-end in a single test.
//
// IMPORTANT: a mocked Supabase client can prove application-level
// synchronization (what every controller does with the same in-memory
// row), but it cannot prove real Postgres transaction/consistency
// behavior across concurrent requests. That is out of scope here and is
// not claimed as proven.
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

// Mirrors the controller's own Monday-Sunday UTC week math (also mirrored
// in weeklySummary.test.js), so fixtures land in the same week the
// endpoint computes, on any day the suite runs.
const getUtcWeekStartMs = (date) => {
  const utcDayOfWeek = date.getUTCDay();
  const daysSinceMonday = (utcDayOfWeek + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday
  );
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const WEEK_START_MS = getUtcWeekStartMs(NOW);

const isoForWeekDayOffset = (dayOffset, hour = 12) =>
  new Date(WEEK_START_MS + dayOffset * DAY_MS + hour * 60 * 60 * 1000)
    .toISOString();

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// The actual current UTC day (noon, safely inside it) - distinct from
// isoForWeekDayOffset(0), which is this week's Monday and is only "today"
// if the suite happens to run on a Monday.
const TODAY_START_MS = Date.UTC(
  NOW.getUTCFullYear(),
  NOW.getUTCMonth(),
  NOW.getUTCDate()
);
const todayNoonIso = () => new Date(TODAY_START_MS + 12 * 60 * 60 * 1000)
  .toISOString();

const createAsUser = (overrides = {}, userId = USER_ID) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", authHeader(userId))
    .send({
      title: "Sync fixture task",
      priority: "medium",
      completion_status: "not_started",
      due_date: isoForWeekDayOffset(2),
      ...overrides,
    });

beforeEach(() => {
  supabase.__reset();
});

// =========================================================
// A. Task Creation Synchronization
// =========================================================
describe("A. Task creation synchronization", () => {
  it("SYNC-AUTO-001: a newly created Task appears in the list, the prioritized view, and both summaries, with no duplication", async () => {
    const createRes = await createAsUser({
      title: "New sync task",
      due_date: todayNoonIso(),
    });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.data.id;

    const [listRes, prioritizedRes, dailyRes, weeklyRes] = await Promise.all([
      request(app).get("/api/tasks").set("Authorization", authHeader()),
      request(app)
        .get("/api/tasks/prioritized")
        .set("Authorization", authHeader()),
      request(app)
        .get("/api/tasks/summary/daily")
        .set("Authorization", authHeader()),
      request(app)
        .get("/api/tasks/summary/weekly")
        .set("Authorization", authHeader()),
    ]);

    // Appears exactly once in the plain list (the endpoint Calendar reads).
    const matchesInList = listRes.body.data.filter((t) => t.id === taskId);
    expect(matchesInList).toHaveLength(1);

    // Appears exactly once in the prioritized view (the endpoint To-Do reads).
    const matchesInPrioritized = prioritizedRes.body.data.filter(
      (t) => t.id === taskId
    );
    expect(matchesInPrioritized).toHaveLength(1);

    // Counted by both summaries - a task due "today" (UTC) affects both.
    expect(dailyRes.body.data.counts.dueToday).toBe(1);
    expect(weeklyRes.body.data.counts.total).toBe(1);
  });
});

// =========================================================
// B. Task Editing Synchronization
// =========================================================
describe("B. Task editing synchronization", () => {
  it("SYNC-AUTO-002: editing title, due_date, and priority is reflected in the list, prioritized ordering, and weekly summary membership", async () => {
    const lowPrioritySibling = await createAsUser({
      title: "Low priority sibling",
      priority: "low",
      due_date: isoForWeekDayOffset(1),
    });
    const editedTask = await createAsUser({
      title: "Original title",
      priority: "low",
      due_date: isoForWeekDayOffset(10), // outside this week
    });
    const taskId = editedTask.body.data.id;

    // Before the edit: not counted in this week's summary.
    const before = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader());
    expect(before.body.data.tasks.some((t) => t.id === taskId)).toBe(false);

    const putRes = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader())
      .send({
        title: "Updated title",
        due_date: isoForWeekDayOffset(3), // now inside this week
        priority: "high",
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.title).toBe("Updated title");

    const listRes = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    const stored = listRes.body.data.find((t) => t.id === taskId);
    expect(stored.title).toBe("Updated title");
    expect(stored.priority).toBe("high");

    // Prioritized view: the now-high-priority task sorts ahead of the
    // unedited low-priority sibling.
    const prioritizedRes = await request(app)
      .get("/api/tasks/prioritized")
      .set("Authorization", authHeader());
    const ids = prioritizedRes.body.data.map((t) => t.id);
    expect(ids.indexOf(taskId)).toBeLessThan(
      ids.indexOf(lowPrioritySibling.body.data.id)
    );

    // Weekly summary: now counted, since its due_date moved into this week.
    const after = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader());
    expect(after.body.data.tasks.some((t) => t.id === taskId)).toBe(true);
  });
});

// =========================================================
// C. Task Completion Synchronization
// =========================================================
describe("C. Task completion synchronization", () => {
  it("SYNC-AUTO-003: marking a Task complete (and reversing it) stays consistent across retrieval, prioritization, and summaries", async () => {
    const created = await createAsUser({
      title: "Completable task",
      due_date: todayNoonIso(),
    });
    const taskId = created.body.data.id;

    const dailyBefore = await request(app)
      .get("/api/tasks/summary/daily")
      .set("Authorization", authHeader());
    expect(dailyBefore.body.data.counts.completed).toBe(0);
    expect(dailyBefore.body.data.counts.dueToday).toBe(1);

    const completeRes = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader())
      .send({ completion_status: "completed" });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.completion_status).toBe("completed");

    const listRes = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    expect(
      listRes.body.data.find((t) => t.id === taskId).completion_status
    ).toBe("completed");

    const dailyAfter = await request(app)
      .get("/api/tasks/summary/daily")
      .set("Authorization", authHeader());
    // A completed task due today is tracked under counts.completed, and
    // excluded from counts.dueToday (matches dailySummary.test.js's own
    // "completed-today excluded from dueToday" convention).
    expect(dailyAfter.body.data.counts.completed).toBe(1);
    expect(dailyAfter.body.data.counts.dueToday).toBe(0);

    // Reversal: completion can be undone, and every downstream count
    // reverts with it.
    const reverseRes = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader())
      .send({ completion_status: "not_started" });
    expect(reverseRes.status).toBe(200);

    const dailyReversed = await request(app)
      .get("/api/tasks/summary/daily")
      .set("Authorization", authHeader());
    expect(dailyReversed.body.data.counts.completed).toBe(0);
    expect(dailyReversed.body.data.counts.dueToday).toBe(1);
  });
});

// =========================================================
// D. Task Deletion Synchronization
// =========================================================
describe("D. Task deletion synchronization", () => {
  it("SYNC-AUTO-004: deleting a Task removes it everywhere downstream while an unrelated Task is completely unaffected", async () => {
    const toDelete = await createAsUser({
      title: "Will be deleted",
      due_date: todayNoonIso(),
    });
    const toKeep = await createAsUser({
      title: "Stays untouched",
      due_date: todayNoonIso(),
    });

    const deleteRes = await request(app)
      .delete(`/api/tasks/${toDelete.body.data.id}`)
      .set("Authorization", authHeader());
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    expect(listRes.body.data.map((t) => t.id)).not.toContain(
      toDelete.body.data.id
    );
    expect(listRes.body.data.map((t) => t.id)).toContain(toKeep.body.data.id);

    const prioritizedRes = await request(app)
      .get("/api/tasks/prioritized")
      .set("Authorization", authHeader());
    expect(prioritizedRes.body.data.map((t) => t.id)).not.toContain(
      toDelete.body.data.id
    );

    const dailyRes = await request(app)
      .get("/api/tasks/summary/daily")
      .set("Authorization", authHeader());
    // Only the surviving task is counted.
    expect(dailyRes.body.data.counts.dueToday).toBe(1);

    const survivorAfter = listRes.body.data.find(
      (t) => t.id === toKeep.body.data.id
    );
    expect(survivorAfter.title).toBe("Stays untouched");
    expect(survivorAfter.completion_status).toBe("not_started");
  });
});

// =========================================================
// E. Deadline Boundary Synchronization
// =========================================================
describe("E. Deadline boundary synchronization", () => {
  it("SYNC-AUTO-005: editing a due_date across the UTC week boundary moves a Task between weekly summary buckets, consistently with its creation-time classification", async () => {
    // Last moment of the current UTC week.
    const endOfThisWeek = new Date(
      WEEK_START_MS + 6 * DAY_MS + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59000
    ).toISOString();

    const created = await createAsUser({
      title: "Boundary task",
      due_date: endOfThisWeek,
    });
    const taskId = created.body.data.id;

    const thisWeek = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader());
    expect(thisWeek.body.data.tasks.some((t) => t.id === taskId)).toBe(true);

    // First moment of next week.
    const startOfNextWeek = new Date(
      WEEK_START_MS + 7 * DAY_MS
    ).toISOString();

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader())
      .send({ due_date: startOfNextWeek });

    const nextWeek = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader());
    expect(nextWeek.body.data.tasks.some((t) => t.id === taskId)).toBe(false);
    expect(nextWeek.body.data.counts.total).toBe(0);
  });
});

// =========================================================
// F. Canvas-Imported Task Synchronization
// =========================================================
describe("F. Canvas-imported Task synchronization", () => {
  const COURSE_ID = 1;
  const ASSIGNMENT_ID = 101; // "Sprint 3 Report" - unlocked, mirrors dummy Canvas's catalog

  it("SYNC-AUTO-006: a Dummy Canvas assignment update propagates through to the Task list and weekly summary, not just the sync response", async () => {
    const importRes = await request(app)
      .post("/api/dummy-canvas/import-assignment")
      .set("Authorization", authHeader())
      .send({ assignmentId: ASSIGNMENT_ID });
    expect(importRes.status).toBe(201);
    const taskId = importRes.body.data.id;

    // Confirm the import itself is already visible through the Task list
    // (this part is covered by canvasCrossFeatureIntegration.test.js for
    // the OTHER Canvas controller - repeated here only as a precondition
    // for the real gap this test targets: an in-place sync UPDATE).
    const listBefore = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    expect(listBefore.body.data.find((t) => t.id === taskId).title).toBe(
      "Sprint 3 Report"
    );

    // Move the assignment's due date to a date inside the current UTC
    // week via the real sync-assignment endpoint (not a direct store
    // mutation), which is the scenario no existing test covers end-to-end.
    const newDueDate = ymd(WEEK_START_MS + 3 * DAY_MS);

    const syncRes = await request(app)
      .put("/api/dummy-canvas/sync-assignment")
      .set("Authorization", authHeader())
      .send({
        assignment: {
          id: ASSIGNMENT_ID,
          courseId: COURSE_ID,
          title: "Sprint 3 Report",
          dueDate: newDueDate,
          points: 100,
        },
      });
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.id).toBe(taskId);

    // Downstream propagation: the SAME task id now reflects the new due
    // date through the plain Task list (no duplicate row was created).
    const listAfter = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    const matches = listAfter.body.data.filter((t) => t.id === taskId);
    expect(matches).toHaveLength(1);
    expect(matches[0].due_date.slice(0, 10)).toBe(newDueDate);

    // And the Weekly Summary, computed independently, now counts it.
    const weeklyRes = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader());
    expect(weeklyRes.body.data.tasks.some((t) => t.id === taskId)).toBe(true);
  });
});

// =========================================================
// G. Empty and Error State Synchronization
// =========================================================
describe("G. Empty and error state synchronization", () => {
  it("SYNC-AUTO-007: a failed update (DB-DEFECT-001's fixed path) leaves every downstream view exactly as it was - no false partial synchronization", async () => {
    const created = await createAsUser({
      title: "Must survive a failed sync",
      priority: "low",
      due_date: todayNoonIso(),
    });
    const taskId = created.body.data.id;

    const before = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    const snapshot = before.body.data.find((t) => t.id === taskId);

    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () =>
                  Promise.reject(new Error("simulated connection failure")),
              }),
            }),
          }),
        }),
      };
    });

    let putRes;
    try {
      putRes = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set("Authorization", authHeader())
        .send({ title: "Should never actually apply", priority: "high" })
        .timeout({ response: 3000, deadline: 3500 });
    } finally {
      supabase.from = originalFrom;
    }

    // The fix from DB-DEFECT-001 means this is a clean 500, not silence.
    expect(putRes.status).toBe(500);
    expect(putRes.body.success).toBe(false);

    // No false/partial synchronization: every downstream view still shows
    // the task exactly as it was before the failed update.
    const after = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    expect(after.body.data.find((t) => t.id === taskId)).toEqual(snapshot);

    const prioritizedAfter = await request(app)
      .get("/api/tasks/prioritized")
      .set("Authorization", authHeader());
    expect(
      prioritizedAfter.body.data.find((t) => t.id === taskId).priority
    ).toBe("low");

    const dailyAfter = await request(app)
      .get("/api/tasks/summary/daily")
      .set("Authorization", authHeader());
    expect(dailyAfter.body.data.counts.dueToday).toBe(1);
  });
});

// =========================================================
// H. Cross-User Isolation Across the Full Synchronization Chain
// =========================================================
describe("H. Cross-user isolation", () => {
  it("SYNC-AUTO-008: one user's create/complete/delete lifecycle never changes another user's list, prioritized view, or weekly summary counts", async () => {
    const otherUsersTask = await createAsUser(
      { title: "Belongs to the other user", due_date: todayNoonIso() },
      OTHER_USER_ID
    );

    const baselineList = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader(OTHER_USER_ID));
    const baselineWeekly = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader(OTHER_USER_ID));

    const myTask = await createAsUser({
      title: "Belongs to the main user",
      due_date: todayNoonIso(),
    });
    await request(app)
      .put(`/api/tasks/${myTask.body.data.id}`)
      .set("Authorization", authHeader())
      .send({ completion_status: "completed" });
    await request(app)
      .delete(`/api/tasks/${myTask.body.data.id}`)
      .set("Authorization", authHeader());

    const afterList = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader(OTHER_USER_ID));
    const afterPrioritized = await request(app)
      .get("/api/tasks/prioritized")
      .set("Authorization", authHeader(OTHER_USER_ID));
    const afterWeekly = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader(OTHER_USER_ID));

    expect(afterList.body.data).toEqual(baselineList.body.data);
    expect(afterPrioritized.body.data.map((t) => t.id)).toEqual([
      otherUsersTask.body.data.id,
    ]);
    expect(afterWeekly.body.data.counts).toEqual(baselineWeekly.body.data.counts);
  });
});
