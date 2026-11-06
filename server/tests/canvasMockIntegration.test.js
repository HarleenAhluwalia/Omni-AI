// Sprint 4: Mock Canvas Data Integration tests (Jira: F05 - Develop Mock
// Canvas Data Integration Tests).
//
// Deterministic - real Express app + Supertest, mocked Supabase, no
// network, no real Canvas LMS connection (the Dummy Canvas catalog in
// services/dummyCanvasService.js is a static in-memory fixture).
//
// This file deliberately does NOT duplicate the extensive existing unit
// coverage in dummyCanvasImport.test.js (pure conversion/validation
// functions), dummyCanvasSync.test.js (service functions against a
// hand-rolled supabase.from mock asserting call arguments), or
// dummyCanvasApi.test.js (controller wiring with the service itself
// mocked out). None of those exercise the Dummy Canvas system against
// the REAL in-memory Supabase store (helpers/supabaseMock.js) through
// real HTTP requests - only crossComponentSync.test.js's SYNC-AUTO-006
// does that, for a single update-propagation scenario. Every test here
// targets a genuine end-to-end gap: what actually happens to a real
// stored row, through the real routes, that none of those files prove.
//
// IMPORTANT: a mocked Supabase client proves that Omni-AI's own
// controllers/services behave consistently with each other against the
// same in-memory row. It does not prove real Postgres constraint
// enforcement (the actual tasks_user_canvas_assignment_unique index) or
// a live Canvas LMS connection - neither is claimed here.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");
const { findImportedTask } = require("../services/dummyCanvasSyncService");

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const authHeader = (userId = USER_ID) =>
  `Bearer ${signToken({ id: userId, email: "user@test.com" })}`;

// Known Dummy Canvas catalog fixtures (services/dummyCanvasService.js).
const UNLOCKED_ASSIGNMENT = { id: 101, courseId: 1, title: "Sprint 3 Report" };
const SECOND_UNLOCKED_ASSIGNMENT = {
  id: 102,
  courseId: 1,
  title: "Frontend Implementation",
};
const LOCKED_ASSIGNMENT = { id: 301, courseId: 3, title: "Art Homework" };
const NONEXISTENT_ASSIGNMENT_ID = 999;

const importAssignment = (assignmentId, userId = USER_ID) =>
  request(app)
    .post("/api/dummy-canvas/import-assignment")
    .set("Authorization", authHeader(userId))
    .send({ assignmentId });

const syncAssignment = (assignment, userId = USER_ID) =>
  request(app)
    .put("/api/dummy-canvas/sync-assignment")
    .set("Authorization", authHeader(userId))
    .send({ assignment });

beforeEach(() => {
  supabase.__reset();
});

// =========================================================
// 1. Importing a new Canvas assignment into Omni-AI Tasks
// =========================================================
describe("1. Import creates a Task with the correct fields", () => {
  it("CANVAS4-AUTO-001: a real import request creates a fully-fielded Task, persisted in the store and visible via GET /api/tasks", async () => {
    const res = await importAssignment(UNLOCKED_ASSIGNMENT.id);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(true);
    expect(res.body.data.title).toBe("Sprint 3 Report");
    expect(res.body.data.canvas_course_id).toBe(1);
    expect(res.body.data.canvas_assignment_id).toBe(101);
    expect(res.body.data.point_value).toBe(100);
    expect(res.body.data.completion_status).toBe("not_started");
    expect(res.body.data.priority).toBe("medium");
    expect(res.body.data.due_date).toBe("2026-10-12T23:59:59.999Z");

    const listRes = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader());
    const matches = listRes.body.data.filter((t) => t.id === res.body.data.id);
    expect(matches).toHaveLength(1);
  });
});

// =========================================================
// 2. Updating an already-imported assignment
// =========================================================
describe("2. Sync updates the same Task row in place", () => {
  it("CANVAS4-AUTO-002: syncing a new due date/points/title updates the SAME task id, with no duplicate row created", async () => {
    const importRes = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    const taskId = importRes.body.data.id;

    const syncRes = await syncAssignment({
      id: UNLOCKED_ASSIGNMENT.id,
      courseId: UNLOCKED_ASSIGNMENT.courseId,
      title: "Sprint 3 Report (revised)",
      dueDate: "2026-10-20",
      points: 150,
    });

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.id).toBe(taskId);
    expect(syncRes.body.data.title).toBe("Sprint 3 Report (revised)");
    expect(syncRes.body.data.point_value).toBe(150);
    expect(syncRes.body.data.due_date).toBe("2026-10-20T23:59:59.999Z");

    const tasksForAssignment = supabase.__store.tasks.filter(
      (t) => t.canvas_course_id === 1 && t.canvas_assignment_id === 101
    );
    expect(tasksForAssignment).toHaveLength(1);
  });
});

// =========================================================
// 3. Preserving user-managed Task fields during synchronization
// =========================================================
describe("3. Sync preserves user-managed progress", () => {
  it("CANVAS4-AUTO-003: a completed, re-prioritized Task keeps its completion status and priority after a Canvas sync changes its due date", async () => {
    const importRes = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    const taskId = importRes.body.data.id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader())
      .send({ completion_status: "completed", priority: "high" });

    const syncRes = await syncAssignment({
      id: UNLOCKED_ASSIGNMENT.id,
      courseId: UNLOCKED_ASSIGNMENT.courseId,
      title: "Sprint 3 Report",
      dueDate: "2026-10-25",
      points: 100,
    });

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.due_date).toBe("2026-10-25T23:59:59.999Z");
    // The fields the user themselves changed are not in updateImportedTask's
    // updates object and must survive the sync untouched.
    expect(syncRes.body.data.completion_status).toBe("completed");
    expect(syncRes.body.data.priority).toBe("high");
  });
});

// =========================================================
// 4. Preventing duplicates across repeated imports
// =========================================================
describe("4. Repeated imports do not duplicate", () => {
  it("CANVAS4-AUTO-004: importing the same assignment twice returns the existing Task both times, with only one row ever stored", async () => {
    const first = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);

    const second = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.data.id).toBe(first.body.data.id);

    const stored = supabase.__store.tasks.filter(
      (t) => t.canvas_course_id === 1 && t.canvas_assignment_id === 101
    );
    expect(stored).toHaveLength(1);
  });
});

// =========================================================
// 5. Distinguishing matching assignment IDs across different courses
// =========================================================
describe("5. Cross-course assignment id collisions are isolated", () => {
  it("CANVAS4-AUTO-005: two Tasks sharing an assignment id but belonging to different courses are never confused with each other", async () => {
    // The real Dummy Canvas catalog's assignment ids happen to be globally
    // unique, so this scenario (realistic for a real Canvas LMS, where
    // assignment numbering is only unique within a course) is exercised
    // directly against the store and the service's own course-scoped
    // lookup, the way a real cross-course id reuse would actually land.
    const courseOneRow = {
      id: "task-course-1-999",
      user_id: USER_ID,
      canvas_course_id: 1,
      canvas_assignment_id: 999,
      title: "Course 1's assignment 999",
      completion_status: "not_started",
    };
    const courseTwoRow = {
      id: "task-course-2-999",
      user_id: USER_ID,
      canvas_course_id: 2,
      canvas_assignment_id: 999,
      title: "Course 2's assignment 999",
      completion_status: "not_started",
    };
    supabase.__store.tasks.push(courseOneRow, courseTwoRow);

    const foundInCourseOne = await findImportedTask(USER_ID, 1, 999);
    const foundInCourseTwo = await findImportedTask(USER_ID, 2, 999);

    expect(foundInCourseOne.id).toBe("task-course-1-999");
    expect(foundInCourseTwo.id).toBe("task-course-2-999");

    // The composite uniqueness simulation in supabaseMock.js is keyed on
    // (user_id, canvas_course_id, canvas_assignment_id) together - a
    // fresh insert reusing assignment_id 999 under a DIFFERENT course for
    // the same user must succeed, not be rejected as a duplicate. This
    // was previously only asserted in a code comment, never a test.
    const insertRes = await supabase
      .from("tasks")
      .insert([
        {
          user_id: USER_ID,
          canvas_course_id: 3,
          canvas_assignment_id: 999,
          title: "Course 3's assignment 999",
        },
      ])
      .select()
      .single();

    expect(insertRes.error).toBeNull();
    expect(insertRes.data.canvas_course_id).toBe(3);
  });
});

// =========================================================
// 6. Handling locked assignments
// =========================================================
describe("6. Locked assignments are rejected end-to-end", () => {
  it("CANVAS4-AUTO-006: importing a locked assignment is rejected with 403 and nothing is persisted to the store", async () => {
    const res = await importAssignment(LOCKED_ASSIGNMENT.id);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("This Canvas assignment is locked");

    const stored = supabase.__store.tasks.filter(
      (t) => t.canvas_assignment_id === LOCKED_ASSIGNMENT.id
    );
    expect(stored).toHaveLength(0);
  });

  // Missing/invalid assignment fields (title, due date, points) are
  // already thoroughly covered at the pure conversion-function level in
  // dummyCanvasImport.test.js ("rejects assignments with missing
  // titles", "rejects assignments with invalid points") - not repeated
  // here to avoid duplicating adequately-tested coverage.
});

// =========================================================
// 7. Handling invalid assignment references
// =========================================================
describe("7. Nonexistent assignment references are rejected end-to-end", () => {
  it("CANVAS4-AUTO-007: both import and sync reject a nonexistent assignment id with 404, and sync of a never-imported assignment finds nothing to update", async () => {
    const importRes = await importAssignment(NONEXISTENT_ASSIGNMENT_ID);
    expect(importRes.status).toBe(404);
    expect(importRes.body.error).toBe("Canvas assignment not found");

    const syncRes = await syncAssignment({
      id: NONEXISTENT_ASSIGNMENT_ID,
      courseId: 1,
      title: "Does not exist",
      dueDate: "2026-10-12",
      points: 10,
    });
    expect(syncRes.status).toBe(404);
    expect(syncRes.body.error).toBe("Canvas assignment not found");

    // A real catalog assignment that simply was never imported by this
    // user syncs to "not found" for a different reason (no matching
    // Task row), exercised separately from the catalog-lookup 404 above.
    const neverImportedSync = await syncAssignment({
      id: SECOND_UNLOCKED_ASSIGNMENT.id,
      courseId: SECOND_UNLOCKED_ASSIGNMENT.courseId,
      title: "Frontend Implementation",
      dueDate: "2026-10-15",
      points: 50,
    });
    expect(neverImportedSync.status).toBe(404);
    expect(neverImportedSync.body.error).toBe("Imported assignment not found");
  });
});

// =========================================================
// 8. Handling database failures and partial synchronization results
// =========================================================
describe("8. Database failures do not leave a partial synchronization result", () => {
  it("CANVAS4-AUTO-008: a rejected database call during import returns a clean 500 and leaves no task row behind", async () => {
    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.reject(new Error("simulated connection failure")),
              }),
            }),
          }),
        }),
      };
    });

    let res;
    try {
      res = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    } finally {
      supabase.from = originalFrom;
    }

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Could not import Canvas assignment");
    expect(supabase.__store.tasks).toHaveLength(0);
  });

  it("CANVAS4-AUTO-008b: a rejected database call during sync returns a clean 500 and leaves the existing Task completely unchanged", async () => {
    const importRes = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    const snapshot = { ...importRes.body.data };

    const originalFrom = supabase.from;
    supabase.from = jest.fn((table) => {
      if (table !== "tasks") return originalFrom(table);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.reject(new Error("simulated connection failure")),
              }),
            }),
          }),
        }),
      };
    });

    let res;
    try {
      res = await syncAssignment({
        id: UNLOCKED_ASSIGNMENT.id,
        courseId: UNLOCKED_ASSIGNMENT.courseId,
        title: "Should never apply",
        dueDate: "2026-11-01",
        points: 999,
      });
    } finally {
      supabase.from = originalFrom;
    }

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Could not synchronize Canvas assignment");

    const stored = supabase.__store.tasks.find((t) => t.id === snapshot.id);
    expect(stored).toEqual(snapshot);
  });
});

// =========================================================
// 9. Imported Tasks are available to downstream Task/Summary processing
// =========================================================
describe("9. Downstream availability of an imported Task", () => {
  it("CANVAS4-AUTO-009: a freshly imported Task is immediately visible in the prioritized view and counted by the weekly summary", async () => {
    const importRes = await importAssignment(UNLOCKED_ASSIGNMENT.id);
    const taskId = importRes.body.data.id;

    const prioritizedRes = await request(app)
      .get("/api/tasks/prioritized")
      .set("Authorization", authHeader());
    expect(prioritizedRes.body.data.map((t) => t.id)).toContain(taskId);

    // Move its due date into the current UTC week so weekly summary
    // membership is deterministic regardless of which day this runs.
    const idx = supabase.__store.tasks.findIndex((t) => t.id === taskId);
    supabase.__store.tasks[idx] = {
      ...supabase.__store.tasks[idx],
      due_date: new Date().toISOString(),
    };

    const weeklyRes = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader());
    expect(weeklyRes.body.data.tasks.some((t) => t.id === taskId)).toBe(true);
  });
});

// =========================================================
// 10. Ownership-related behavior
// =========================================================
describe("10. Canvas import/sync respects user ownership", () => {
  it("CANVAS4-AUTO-010: two users importing the same assignment each get their own Task row, and one user cannot sync the other's imported Task", async () => {
    const userAImport = await importAssignment(UNLOCKED_ASSIGNMENT.id, USER_ID);
    const userBImport = await importAssignment(
      UNLOCKED_ASSIGNMENT.id,
      OTHER_USER_ID
    );

    expect(userAImport.body.created).toBe(true);
    expect(userBImport.body.created).toBe(true);
    expect(userAImport.body.data.id).not.toBe(userBImport.body.data.id);

    // User B completes their own copy; User A's remains untouched.
    await request(app)
      .put(`/api/tasks/${userBImport.body.data.id}`)
      .set("Authorization", authHeader(OTHER_USER_ID))
      .send({ completion_status: "completed" });

    const userATask = supabase.__store.tasks.find(
      (t) => t.id === userAImport.body.data.id
    );
    expect(userATask.completion_status).toBe("not_started");

    // A brand-new user (never imported this assignment) syncing it finds
    // nothing of their own to update, regardless of User A/B's rows.
    const strangerSync = await syncAssignment(
      {
        id: UNLOCKED_ASSIGNMENT.id,
        courseId: UNLOCKED_ASSIGNMENT.courseId,
        title: "Sprint 3 Report",
        dueDate: "2026-10-30",
        points: 100,
      },
      "33333333-3333-4333-8333-333333333333"
    );
    expect(strangerSync.status).toBe(404);
    expect(strangerSync.body.error).toBe("Imported assignment not found");
  });
});
