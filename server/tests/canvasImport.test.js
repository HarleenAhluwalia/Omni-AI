// Sprint 3 PR 2: Canvas assignment synchronization engine.
// Deterministic — real Express app + Supertest, mocked Supabase, no network.
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

// Known mock catalog fixtures (server/services/canvasService.js).
const UNLOCKED_ASSIGNMENT_ID = 101; // "Sprint 3 Report", course 1, due 2026-10-12, 100 pts
const UNLOCKED_ASSIGNMENT_ID_2 = 201; // "Marketing Homework", course 2
const LOCKED_ASSIGNMENT_ID = 401; // "Final Project (Locked)", course 3, null due/points
const UNKNOWN_ASSIGNMENT_ID = 999999;

const EXPECTED_DUE_DATE_101 = "2026-10-12T23:59:59.000Z";

const getCourses = (auth = authHeader()) =>
  request(app).get("/api/canvas/courses").set("Authorization", auth);

const importAssignments = (body, auth = authHeader()) =>
  request(app).post("/api/canvas/import").set("Authorization", auth).send(body);

// Directly seeds a "previously imported" Task row into the mock store, to
// exercise the update/unchanged paths without depending on the (static)
// mock catalog ever actually changing between calls.
const seedExistingCanvasTask = (overrides = {}) => {
  const row = {
    id: `seed-${Math.random().toString(36).slice(2)}`,
    user_id: USER_ID,
    title: "Seeded placeholder",
    description: null,
    due_date: null,
    point_value: null,
    estimated_effort_minutes: null,
    priority: null,
    completion_status: "not_started",
    canvas_assignment_id: null,
    canvas_course_id: null,
    canvas_locked: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  supabase.__store.tasks.push(row);
  return row;
};

beforeEach(() => {
  supabase.__reset();
});

describe("Canvas sync — authentication", () => {
  it("rejects GET /api/canvas/courses with no Authorization header", async () => {
    const res = await request(app).get("/api/canvas/courses");
    expect(res.status).toBe(401);
  });

  it("rejects POST /api/canvas/import with no Authorization header", async () => {
    const res = await request(app)
      .post("/api/canvas/import")
      .send({ assignment_ids: [UNLOCKED_ASSIGNMENT_ID] });
    expect(res.status).toBe(401);
  });
});

describe("Canvas sync — GET /api/canvas/courses", () => {
  it("reflects not-yet-imported assignments correctly", async () => {
    const res = await getCourses();

    expect(res.status).toBe(200);
    const course1 = res.body.data.courses.find((c) => c.id === 1);
    const assignment101 = course1.assignments.find(
      (a) => a.id === UNLOCKED_ASSIGNMENT_ID
    );

    expect(assignment101.imported).toBe(false);
    expect(assignment101.task_id).toBeNull();
    expect(assignment101.locked).toBe(false);
  });

  it("reflects locked assignment status", async () => {
    const res = await getCourses();

    const course3 = res.body.data.courses.find((c) => c.id === 3);
    const locked = course3.assignments.find(
      (a) => a.id === LOCKED_ASSIGNMENT_ID
    );

    expect(locked.locked).toBe(true);
    expect(locked.due_date).toBeNull();
    expect(locked.points).toBeNull();
  });

  it("reflects imported status and task_id after an import", async () => {
    const importRes = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });
    const taskId = importRes.body.data.imported[0].task.id;

    const res = await getCourses();
    const course1 = res.body.data.courses.find((c) => c.id === 1);
    const assignment101 = course1.assignments.find(
      (a) => a.id === UNLOCKED_ASSIGNMENT_ID
    );

    expect(assignment101.imported).toBe(true);
    expect(assignment101.task_id).toBe(taskId);
  });

  it("never exposes another user's imported status", async () => {
    await importAssignments(
      { assignment_ids: [UNLOCKED_ASSIGNMENT_ID] },
      authHeader(OTHER_USER_ID)
    );

    const res = await getCourses(authHeader(USER_ID));
    const course1 = res.body.data.courses.find((c) => c.id === 1);
    const assignment101 = course1.assignments.find(
      (a) => a.id === UNLOCKED_ASSIGNMENT_ID
    );

    expect(assignment101.imported).toBe(false);
    expect(assignment101.task_id).toBeNull();
  });
});

describe("Canvas sync — new assignment import", () => {
  it("creates a real Task and reports it as imported", async () => {
    const res = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.imported).toHaveLength(1);
    expect(res.body.data.imported[0].assignment_id).toBe(
      UNLOCKED_ASSIGNMENT_ID
    );
    expect(res.body.data.updated).toEqual([]);
    expect(res.body.data.skipped).toEqual([]);
    expect(res.body.data.failed).toEqual([]);

    // Genuinely persisted, not just reported.
    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("maps Canvas fields onto the correct Task columns", async () => {
    const res = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });
    const task = res.body.data.imported[0].task;

    expect(task.title).toBe("Sprint 3 Report");
    expect(task.due_date).toBe(EXPECTED_DUE_DATE_101);
    expect(task.point_value).toBe(100);
    expect(task.canvas_assignment_id).toBe(UNLOCKED_ASSIGNMENT_ID);
    expect(task.canvas_course_id).toBe(1);
    expect(task.canvas_locked).toBe(false);
    expect(task.user_id).toBe(USER_ID);
    expect(task.completion_status).toBe("not_started");
    // Schema-valid defaults for user-managed fields on a fresh import.
    expect(task.priority).toBeUndefined();
    expect(task.estimated_effort_minutes).toBeUndefined();
  });

  it("supports importing multiple assignments in one request", async () => {
    const res = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID, UNLOCKED_ASSIGNMENT_ID_2],
    });

    expect(res.body.data.imported).toHaveLength(2);
    expect(supabase.__store.tasks).toHaveLength(2);
  });
});

describe("Canvas sync — duplicate prevention", () => {
  it("does not create a duplicate Task on a repeated import", async () => {
    await importAssignments({ assignment_ids: [UNLOCKED_ASSIGNMENT_ID] });
    const second = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });

    expect(second.status).toBe(200);
    expect(second.body.data.imported).toEqual([]);
    expect(
      ["unchanged"].includes(second.body.data.skipped[0]?.reason)
    ).toBe(true);
    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("scopes duplicate detection by user_id, not globally", async () => {
    await importAssignments(
      { assignment_ids: [UNLOCKED_ASSIGNMENT_ID] },
      authHeader(USER_ID)
    );

    const otherUserImport = await importAssignments(
      { assignment_ids: [UNLOCKED_ASSIGNMENT_ID] },
      authHeader(OTHER_USER_ID)
    );

    // The same assignment is a fresh import for a different user.
    expect(otherUserImport.body.data.imported).toHaveLength(1);
    expect(supabase.__store.tasks).toHaveLength(2);
  });
});

describe("Canvas sync — updates to changed Canvas-owned fields", () => {
  it("updates stale Canvas-owned fields and reports the result as updated", async () => {
    seedExistingCanvasTask({
      title: "Old stale title",
      due_date: "2020-01-01T23:59:59.000Z",
      point_value: 1,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: 1,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });

    expect(res.body.data.updated).toHaveLength(1);
    expect(res.body.data.imported).toEqual([]);

    const task = res.body.data.updated[0].task;
    expect(task.title).toBe("Sprint 3 Report");
    expect(task.due_date).toBe(EXPECTED_DUE_DATE_101);
    expect(task.point_value).toBe(100);

    // No duplicate row was created.
    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("preserves user-managed fields while updating Canvas-owned fields", async () => {
    seedExistingCanvasTask({
      title: "Old stale title",
      due_date: "2020-01-01T23:59:59.000Z",
      point_value: 1,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: 1,
      canvas_locked: false,
      completion_status: "completed",
      priority: "high",
      estimated_effort_minutes: 45,
      description: "My own notes on this",
    });

    const res = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });

    const task = res.body.data.updated[0].task;
    expect(task.completion_status).toBe("completed");
    expect(task.priority).toBe("high");
    expect(task.estimated_effort_minutes).toBe(45);
    expect(task.description).toBe("My own notes on this");
  });

  it("skips an assignment whose Canvas-owned fields already match", async () => {
    seedExistingCanvasTask({
      title: "Sprint 3 Report",
      due_date: EXPECTED_DUE_DATE_101,
      point_value: 100,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: 1,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });

    expect(res.body.data.updated).toEqual([]);
    expect(res.body.data.imported).toEqual([]);
    expect(res.body.data.skipped).toHaveLength(1);
    expect(res.body.data.skipped[0].reason).toBe("unchanged");
    expect(supabase.__store.tasks).toHaveLength(1);
  });
});

describe("Canvas sync — locked assignment placeholders", () => {
  it("imports a locked assignment as a placeholder Task", async () => {
    const res = await importAssignments({
      assignment_ids: [LOCKED_ASSIGNMENT_ID],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toHaveLength(1);

    const task = res.body.data.imported[0].task;
    expect(task.title).toBe("Final Project (Locked)");
    expect(task.canvas_locked).toBe(true);
    expect(task.canvas_assignment_id).toBe(LOCKED_ASSIGNMENT_ID);
  });

  it("represents missing locked-assignment details as null, not invented defaults", async () => {
    const res = await importAssignments({
      assignment_ids: [LOCKED_ASSIGNMENT_ID],
    });

    const task = res.body.data.imported[0].task;
    expect(task.due_date).toBeNull();
    expect(task.point_value).toBeNull();
  });
});

describe("Canvas sync — unknown assignment ids", () => {
  it("reports an unknown assignment id as failed, not a crash", async () => {
    const res = await importAssignments({
      assignment_ids: [UNKNOWN_ASSIGNMENT_ID],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0].reason).toBe("assignment_not_found");
    expect(supabase.__store.tasks).toHaveLength(0);
  });
});

describe("Canvas sync — invalid request bodies", () => {
  it("rejects a missing assignment_ids field", async () => {
    const res = await importAssignments({});
    expect(res.status).toBe(400);
  });

  it("rejects an empty array", async () => {
    const res = await importAssignments({ assignment_ids: [] });
    expect(res.status).toBe(400);
  });

  it("rejects a non-array value", async () => {
    const res = await importAssignments({ assignment_ids: UNLOCKED_ASSIGNMENT_ID });
    expect(res.status).toBe(400);
  });

  it("rejects non-integer entries", async () => {
    const res = await importAssignments({ assignment_ids: ["101", 1.5, -3] });
    expect(res.status).toBe(400);
  });
});

describe("Canvas sync — mixed batch outcomes", () => {
  it("reports accurate per-assignment outcomes in one mixed-result request", async () => {
    // Pre-seed one "already correct" task (-> unchanged) and one stale
    // task (-> updated).
    seedExistingCanvasTask({
      title: "Marketing Homework",
      due_date: new Date("2026-10-18T23:59:59.000Z").toISOString(),
      point_value: 25,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID_2,
      canvas_course_id: 2,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignment_ids: [
        UNLOCKED_ASSIGNMENT_ID, // new -> imported
        UNLOCKED_ASSIGNMENT_ID_2, // already matches -> skipped/unchanged
        LOCKED_ASSIGNMENT_ID, // new, locked -> imported placeholder
        UNKNOWN_ASSIGNMENT_ID, // -> failed
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.imported.map((i) => i.assignment_id).sort()).toEqual(
      [LOCKED_ASSIGNMENT_ID, UNLOCKED_ASSIGNMENT_ID].sort()
    );
    expect(res.body.data.skipped.map((s) => s.assignment_id)).toEqual([
      UNLOCKED_ASSIGNMENT_ID_2,
    ]);
    expect(res.body.data.failed.map((f) => f.assignment_id)).toEqual([
      UNKNOWN_ASSIGNMENT_ID,
    ]);
    expect(res.body.data.updated).toEqual([]);
  });
});

describe("Canvas sync — database failures", () => {
  it("returns 500 and does not report success when the initial lookup query fails", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              error: { message: "simulated lookup failure" },
            }),
        }),
      };
    });

    try {
      const res = await importAssignments({
        assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    } finally {
      supabase.from = originalFrom;
    }

    expect(supabase.__store.tasks).toHaveLength(0);
  });

  it("reports a per-item failure (not a crash, not a false success) when an insert fails", async () => {
    const originalFrom = supabase.from;
    let selectCallCount = 0;

    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);

      const real = originalFrom(table);
      return {
        select: (...args) => {
          selectCallCount += 1;
          return real.select(...args);
        },
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: "simulated insert failure" },
              }),
          }),
        }),
      };
    });

    try {
      const res = await importAssignments({
        assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
      });

      expect(res.status).toBe(200);
      expect(res.body.data.imported).toEqual([]);
      expect(res.body.data.failed).toHaveLength(1);
      expect(res.body.data.failed[0].reason).toBe("import_failed");
    } finally {
      supabase.from = originalFrom;
    }

    // Confirms the pre-check lookup still ran exactly once (one efficient
    // query), and nothing was left behind by the failed insert.
    expect(selectCallCount).toBeGreaterThan(0);
    expect(supabase.__store.tasks).toHaveLength(0);
  });
});

describe("Canvas sync — concurrent duplicate-import attempts", () => {
  it("creates exactly one Task when the same new assignment is imported concurrently", async () => {
    const [first, second] = await Promise.all([
      importAssignments({ assignment_ids: [UNLOCKED_ASSIGNMENT_ID] }),
      importAssignments({ assignment_ids: [UNLOCKED_ASSIGNMENT_ID] }),
    ]);

    const outcomes = [first, second].map((res) => ({
      imported: res.body.data.imported.length,
      skippedOrFailed:
        res.body.data.skipped.length + res.body.data.failed.length,
    }));

    const totalImported = outcomes.reduce((sum, o) => sum + o.imported, 0);

    expect(totalImported).toBe(1);
    expect(supabase.__store.tasks).toHaveLength(1);
    // The loser of the race must not have reported a hard failure - it's
    // the same outcome as an ordinary duplicate.
    const loser = first.body.data.imported.length === 1 ? second : first;
    expect(loser.body.data.failed).toEqual([]);
  });
});

// =========================================================
// Course-aware request format: { assignments: [{ course_id, assignment_id }] }
//
// Jira: SCRUM-387 (new assignment), SCRUM-388 (updated assignment),
// SCRUM-389 (duplicate prevention and locked assignments).
//
// Real mock-catalog fixtures (server/services/canvasService.js) have no
// assignment id reused across two courses, so any scenario that needs two
// different courses sharing the same assignment_id uses an isolated
// fixture seeded directly into the store (seedExistingCanvasTask), never a
// changed catalog and never a real database.
// =========================================================

const COURSE_1 = 1; // "CPSC 491 - Computer Science"
const COURSE_2 = 2; // "Marketing 351"
const COURSE_3 = 3; // "ART 101"
const COURSE_1_ASSIGNMENT_2 = 102; // "Frontend Implementation", course 1
const EXPECTED_DUE_DATE_102 = "2026-10-15T23:59:59.000Z";

describe("Canvas sync — course-aware new assignment import (SCRUM-387)", () => {
  it("imports a new assignment using the course-aware request format", async () => {
    const res = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.imported).toHaveLength(1);
    expect(res.body.data.imported[0].assignment_id).toBe(UNLOCKED_ASSIGNMENT_ID);

    const task = res.body.data.imported[0].task;
    expect(task.title).toBe("Sprint 3 Report");
    expect(task.due_date).toBe(EXPECTED_DUE_DATE_101);
    expect(task.point_value).toBe(100);
    expect(task.canvas_assignment_id).toBe(UNLOCKED_ASSIGNMENT_ID);
    expect(task.canvas_course_id).toBe(COURSE_1);
    expect(task.canvas_locked).toBe(false);
    expect(task.user_id).toBe(USER_ID);
    expect(task.completion_status).toBe("not_started");

    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("supports importing multiple course-aware assignments from different courses in one request", async () => {
    const res = await importAssignments({
      assignments: [
        { course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID },
        { course_id: COURSE_2, assignment_id: UNLOCKED_ASSIGNMENT_ID_2 },
      ],
    });

    expect(res.body.data.imported).toHaveLength(2);

    const byAssignmentId = Object.fromEntries(
      res.body.data.imported.map((item) => [item.assignment_id, item.task])
    );

    expect(byAssignmentId[UNLOCKED_ASSIGNMENT_ID].canvas_course_id).toBe(COURSE_1);
    expect(byAssignmentId[UNLOCKED_ASSIGNMENT_ID_2].canvas_course_id).toBe(COURSE_2);
    expect(supabase.__store.tasks).toHaveLength(2);
  });

  it("scopes course-aware imports to the authenticated user, same as the legacy format", async () => {
    const userImport = await importAssignments(
      { assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }] },
      authHeader(USER_ID)
    );
    const otherUserImport = await importAssignments(
      { assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }] },
      authHeader(OTHER_USER_ID)
    );

    expect(userImport.body.data.imported).toHaveLength(1);
    expect(otherUserImport.body.data.imported).toHaveLength(1);
    expect(userImport.body.data.imported[0].task.user_id).toBe(USER_ID);
    expect(otherUserImport.body.data.imported[0].task.user_id).toBe(OTHER_USER_ID);
    expect(supabase.__store.tasks).toHaveLength(2);
  });

  it("rejects an invalid course-aware request body", async () => {
    const missingField = await importAssignments({
      assignments: [{ course_id: COURSE_1 }],
    });
    const nonInteger = await importAssignments({
      assignments: [{ course_id: "1", assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });
    const emptyArray = await importAssignments({ assignments: [] });
    const nonArray = await importAssignments({
      assignments: { course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID },
    });

    expect(missingField.status).toBe(400);
    expect(nonInteger.status).toBe(400);
    expect(emptyArray.status).toBe(400);
    expect(nonArray.status).toBe(400);
    expect(supabase.__store.tasks).toHaveLength(0);
  });

  it("reports an unknown course/assignment reference as failed, not a crash", async () => {
    const unknownCourse = await importAssignments({
      assignments: [{ course_id: 999, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });
    const unknownAssignmentInKnownCourse = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNKNOWN_ASSIGNMENT_ID }],
    });

    expect(unknownCourse.status).toBe(200);
    expect(unknownCourse.body.data.failed).toHaveLength(1);
    expect(unknownCourse.body.data.failed[0].reason).toBe("assignment_not_found");

    expect(unknownAssignmentInKnownCourse.status).toBe(200);
    expect(unknownAssignmentInKnownCourse.body.data.failed).toHaveLength(1);
    expect(unknownAssignmentInKnownCourse.body.data.failed[0].reason).toBe(
      "assignment_not_found"
    );
    expect(supabase.__store.tasks).toHaveLength(0);
  });
});

describe("Canvas sync — course-aware updates to changed fields (SCRUM-388)", () => {
  it("updates stale Canvas-owned fields via a course-aware re-sync", async () => {
    seedExistingCanvasTask({
      title: "Old stale title",
      due_date: "2020-01-01T23:59:59.000Z",
      point_value: 1,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: COURSE_1,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

    expect(res.body.data.updated).toHaveLength(1);
    expect(res.body.data.imported).toEqual([]);

    const task = res.body.data.updated[0].task;
    expect(task.title).toBe("Sprint 3 Report");
    expect(task.due_date).toBe(EXPECTED_DUE_DATE_101);
    expect(task.point_value).toBe(100);
    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("preserves user-managed fields during a course-aware update", async () => {
    seedExistingCanvasTask({
      title: "Old stale title",
      due_date: "2020-01-01T23:59:59.000Z",
      point_value: 1,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: COURSE_1,
      canvas_locked: false,
      completion_status: "completed",
      priority: "high",
      estimated_effort_minutes: 45,
      description: "My own notes on this",
    });

    const res = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

    const task = res.body.data.updated[0].task;
    expect(task.completion_status).toBe("completed");
    expect(task.priority).toBe("high");
    expect(task.estimated_effort_minutes).toBe(45);
    expect(task.description).toBe("My own notes on this");
  });

  it("skips a course-aware re-sync when Canvas-owned fields already match", async () => {
    seedExistingCanvasTask({
      title: "Sprint 3 Report",
      due_date: EXPECTED_DUE_DATE_101,
      point_value: 100,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: COURSE_1,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

    expect(res.body.data.updated).toEqual([]);
    expect(res.body.data.imported).toEqual([]);
    expect(res.body.data.skipped).toHaveLength(1);
    expect(res.body.data.skipped[0].reason).toBe("unchanged");
    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("stays correct across repeated course-aware requests: create, then update, then settle unchanged", async () => {
    const first = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });
    expect(first.body.data.imported).toHaveLength(1);

    // Simulate the Canvas assignment's point value changing before the next sync.
    const taskId = first.body.data.imported[0].task.id;
    const idx = supabase.__store.tasks.findIndex((row) => row.id === taskId);
    supabase.__store.tasks[idx] = {
      ...supabase.__store.tasks[idx],
      point_value: 1,
    };

    const second = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });
    expect(second.body.data.updated).toHaveLength(1);
    expect(second.body.data.updated[0].task.point_value).toBe(100);

    const third = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });
    expect(third.body.data.skipped).toHaveLength(1);
    expect(third.body.data.skipped[0].reason).toBe("unchanged");

    expect(supabase.__store.tasks).toHaveLength(1);
  });
});

describe("Canvas sync — course-aware duplicate prevention and locked assignments (SCRUM-389)", () => {
  it("does not create a duplicate Task on a repeated course-aware import", async () => {
    await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });
    const second = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

    expect(second.status).toBe(200);
    expect(second.body.data.imported).toEqual([]);
    expect(second.body.data.skipped[0]?.reason).toBe("unchanged");
    expect(supabase.__store.tasks).toHaveLength(1);
  });

  it("treats the same assignment id from two different courses as distinct Tasks (isolated fixture)", async () => {
    // Fixture: two previously-imported Tasks that happen to share
    // canvas_assignment_id but belong to different courses - the real
    // mock catalog has no such collision, so this is seeded directly
    // rather than driven through a real import.
    const course1Task = seedExistingCanvasTask({
      title: "Old stale title for course 1",
      due_date: "2020-01-01T23:59:59.000Z",
      point_value: 1,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: COURSE_1,
      canvas_locked: false,
    });
    const course2FixtureTask = seedExistingCanvasTask({
      title: "Unrelated task from a different course, same assignment id",
      due_date: "2021-06-01T23:59:59.000Z",
      point_value: 77,
      canvas_assignment_id: UNLOCKED_ASSIGNMENT_ID,
      canvas_course_id: COURSE_2,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

    expect(res.body.data.updated).toHaveLength(1);
    expect(res.body.data.updated[0].task.id).toBe(course1Task.id);
    expect(res.body.data.updated[0].task.title).toBe("Sprint 3 Report");

    // The other course's fixture Task, which happens to share the same
    // assignment id, must be completely untouched.
    const untouched = supabase.__store.tasks.find(
      (row) => row.id === course2FixtureTask.id
    );
    expect(untouched.title).toBe(
      "Unrelated task from a different course, same assignment id"
    );
    expect(untouched.point_value).toBe(77);
    expect(supabase.__store.tasks).toHaveLength(2);
  });

  it("does not falsely reject a new course-aware import as a duplicate when a different course already used the same assignment id (isolated fixture)", async () => {
    // Fixture: assignment id 102 was already imported from course 2 (a
    // state the real catalog can't produce, since course 2 has no
    // assignment 102 - this isolates the uniqueness check itself).
    seedExistingCanvasTask({
      title: "Already imported from a different course",
      canvas_assignment_id: COURSE_1_ASSIGNMENT_2,
      canvas_course_id: COURSE_2,
      canvas_locked: false,
    });

    const res = await importAssignments({
      assignments: [{ course_id: COURSE_1, assignment_id: COURSE_1_ASSIGNMENT_2 }],
    });

    expect(res.body.data.imported).toHaveLength(1);
    expect(res.body.data.imported[0].task.canvas_course_id).toBe(COURSE_1);
    expect(res.body.data.imported[0].task.due_date).toBe(EXPECTED_DUE_DATE_102);
    expect(res.body.data.failed).toEqual([]);
    expect(res.body.data.skipped).toEqual([]);
    expect(supabase.__store.tasks).toHaveLength(2);
  });

  it("imports a locked assignment as a placeholder Task using the course-aware format", async () => {
    const res = await importAssignments({
      assignments: [{ course_id: COURSE_3, assignment_id: LOCKED_ASSIGNMENT_ID }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toHaveLength(1);

    const task = res.body.data.imported[0].task;
    expect(task.title).toBe("Final Project (Locked)");
    expect(task.canvas_locked).toBe(true);
    expect(task.canvas_course_id).toBe(COURSE_3);
    expect(task.due_date).toBeNull();
    expect(task.point_value).toBeNull();
  });

  it("reports duplicate_lookup_failed (not a crash) when the race-winner re-fetch itself fails", async () => {
    const originalFrom = supabase.from;
    let tasksCallCount = 0;

    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);

      tasksCallCount += 1;
      const callIndex = tasksCallCount;

      // Call 1: the controller's initial existingTasks lookup - let it run
      // for real, so it correctly finds no existing Task.
      if (callIndex === 1) {
        return originalFrom(table);
      }

      // Call 2: the insert - force a unique-violation shape regardless of
      // real row state, to drive the controller into its race-winner path.
      if (callIndex === 2) {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: {
                    code: "23505",
                    message:
                      'duplicate key value violates unique constraint "tasks_user_canvas_assignment_unique"',
                  },
                }),
            }),
          }),
        };
      }

      // Call 3: the race-winner re-fetch - force this one to fail too.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: "simulated race-winner lookup failure" },
                  }),
              }),
            }),
          }),
        }),
      };
    });

    try {
      const res = await importAssignments({
        assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
      });

      expect(res.status).toBe(200);
      expect(res.body.data.imported).toEqual([]);
      expect(res.body.data.failed).toHaveLength(1);
      expect(res.body.data.failed[0].reason).toBe("duplicate_lookup_failed");
    } finally {
      supabase.from = originalFrom;
    }

    expect(supabase.__store.tasks).toHaveLength(0);
  });

  it("creates exactly one Task when the same course-aware assignment is imported concurrently", async () => {
    const body = {
      assignments: [{ course_id: COURSE_1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    };

    const [first, second] = await Promise.all([
      importAssignments(body),
      importAssignments(body),
    ]);

    const totalImported =
      first.body.data.imported.length + second.body.data.imported.length;

    expect(totalImported).toBe(1);
    expect(supabase.__store.tasks).toHaveLength(1);

    const loser = first.body.data.imported.length === 1 ? second : first;
    expect(loser.body.data.failed).toEqual([]);
  });

  it("confirms the legacy assignment_ids request format still works alongside the course-aware format", async () => {
    const legacy = await importAssignments({
      assignment_ids: [UNLOCKED_ASSIGNMENT_ID],
    });
    const courseAware = await importAssignments({
      assignments: [{ course_id: COURSE_2, assignment_id: UNLOCKED_ASSIGNMENT_ID_2 }],
    });

    expect(legacy.status).toBe(200);
    expect(legacy.body.data.imported).toHaveLength(1);
    expect(legacy.body.data.imported[0].task.canvas_course_id).toBe(COURSE_1);

    expect(courseAware.status).toBe(200);
    expect(courseAware.body.data.imported).toHaveLength(1);
    expect(courseAware.body.data.imported[0].task.canvas_course_id).toBe(COURSE_2);

    expect(supabase.__store.tasks).toHaveLength(2);
  });
});
