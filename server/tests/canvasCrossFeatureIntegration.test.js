// Sprint 3: SCRUM-422 (Canvas integration with Calendar/To-Do/AI
// reprioritization) and SCRUM-426 (Weekly Summary reflects manual edits and
// Canvas imports). A Canvas-imported Task is just an ordinary row in the
// `tasks` table (tagged with canvas_assignment_id/canvas_course_id/
// canvas_locked) - these tests prove that claim end-to-end through the
// real HTTP endpoints each feature actually uses, rather than assuming it
// from reading the source.
//
// Deterministic - real Express app + Supertest, mocked Supabase, no network.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

jest.mock("../services/aiService", () => ({
  askAI: jest.fn(),
}));

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { askAI } = require("../services/aiService");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const authHeader = `Bearer ${signToken({ id: USER_ID, email: "user@test.com" })}`;

const UNLOCKED_ASSIGNMENT_ID = 101; // "Sprint 3 Report", course 1

const importCanvasAssignment = () =>
  request(app)
    .post("/api/canvas/import")
    .set("Authorization", authHeader)
    .send({
      assignments: [{ course_id: 1, assignment_id: UNLOCKED_ASSIGNMENT_ID }],
    });

beforeEach(() => {
  supabase.__reset();
  askAI.mockReset();
});

describe("Canvas integration — appears in the Task list (Calendar / To-Do source) (SCRUM-422)", () => {
  it("a Canvas-imported Task appears in GET /api/tasks, the same endpoint Calendar and the To-Do list read from", async () => {
    const importRes = await importCanvasAssignment();
    const importedTaskId = importRes.body.data.imported[0].task.id;

    const listRes = await request(app)
      .get("/api/tasks")
      .set("Authorization", authHeader);

    expect(listRes.status).toBe(200);
    const task = listRes.body.data.find((t) => t.id === importedTaskId);

    expect(task).toBeDefined();
    expect(task.title).toBe("Sprint 3 Report");
    expect(task.canvas_assignment_id).toBe(UNLOCKED_ASSIGNMENT_ID);
  });
});

describe("Canvas integration — included in AI reprioritization (SCRUM-422)", () => {
  it("a Canvas-imported Task is included in the task list sent to AI prioritization via POST /api/ai/chat", async () => {
    await importCanvasAssignment();

    askAI.mockResolvedValue("Work on the Sprint 3 Report first.");

    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
        message: "What should I work on?",
        available_minutes: 120,
      });

    expect(res.status).toBe(200);
    expect(askAI).toHaveBeenCalledTimes(1);
    expect(askAI).toHaveBeenCalledWith(
      "What should I work on?",
      expect.arrayContaining([
        expect.objectContaining({
          title: "Sprint 3 Report",
        }),
      ]),
      120,
      "text"
    );
  });
});

describe("Weekly Summary reflects a Canvas import (SCRUM-426)", () => {
  it("a Canvas-imported Task due this week is counted by GET /api/tasks/summary/weekly", async () => {
    const importRes = await importCanvasAssignment();
    const importedTaskId = importRes.body.data.imported[0].task.id;

    // The mock Canvas catalog's due dates are fixed calendar dates, so this
    // directly sets the imported row's due_date to "today" (mutating the
    // mock store directly, not re-importing or editing through an API) to
    // make the scenario deterministic regardless of which real day the
    // suite runs on - the point under test is that Weekly Summary counts a
    // Canvas-tagged row the same as any other, not the exact calendar math
    // (already covered by weeklySummary.test.js).
    const idx = supabase.__store.tasks.findIndex(
      (row) => row.id === importedTaskId
    );
    supabase.__store.tasks[idx] = {
      ...supabase.__store.tasks[idx],
      due_date: new Date().toISOString(),
    };

    const summaryRes = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.counts.total).toBe(1);
    expect(
      summaryRes.body.data.tasks.some((t) => t.id === importedTaskId)
    ).toBe(true);
  });
});

describe("Weekly Summary reflects a manual Task edit (SCRUM-426)", () => {
  it("marking a Task complete via PUT /api/tasks/:id is reflected in the next GET /api/tasks/summary/weekly call", async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Authorization", authHeader)
      .send({
        title: "Manually created task",
        due_date: new Date().toISOString(),
        completion_status: "not_started",
      });
    const taskId = createRes.body.data.id;

    const before = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader);
    expect(before.body.data.counts.completed).toBe(0);

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader)
      .send({ completion_status: "completed" });

    const after = await request(app)
      .get("/api/tasks/summary/weekly")
      .set("Authorization", authHeader);

    expect(after.body.data.counts.completed).toBe(1);
    expect(after.body.data.completionPercentage).toBe(100);
  });
});
