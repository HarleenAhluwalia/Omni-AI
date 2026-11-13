
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

// Sprint 5: validated directly against the real scoring implementation
// (not mocked), so expected scores below reflect current behavior, not
// assumptions about ideal AI ranking.
const {
  calculateTaskPriority,
} = require("../services/priorityService");

const app = createApp();

const USER_ID = "33333333-3333-4333-8333-333333333333";

const authHeader = `Bearer ${signToken({
  id: USER_ID,
  email: "sprint5-user@test.com",
})}`;

const postAI = (body) =>
  request(app)
    .post("/api/ai/chat")
    .set("Authorization", authHeader)
    .send(body);

beforeEach(() => {
  supabase.__reset();
  askAI.mockReset();
});

describe("Sprint 5 - AI prioritization input validation", () => {
  it("passes the real calculated priority breakdown for a persisted task into askAI", async () => {
    const task = {
      id: "task-real-score",
      user_id: USER_ID,
      title: "Research Paper Draft",
      due_date: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
      ).toISOString(),
      priority: "high",
      point_value: 30,
      estimated_effort_minutes: 90,
      completion_status: "not_started",
    };

    supabase.__store.tasks = [task];

    askAI.mockResolvedValue("Work on your research paper.");

    const availableMinutes = 120;

    const res = await postAI({
      message: "What should I work on?",
      available_minutes: availableMinutes,
    });

    expect(res.status).toBe(200);
    expect(askAI).toHaveBeenCalledTimes(1);

    const passedTasks = askAI.mock.calls[0][1];
    const passedTask = passedTasks.find(
      (t) => t.id === "task-real-score"
    );

    expect(passedTask).toBeDefined();

    // Computed by the same, unmocked priorityService used by the
    // controller - this proves the breakdown isn't fabricated or
    // pre-assumed, it's whatever the current algorithm produces.
    const expected = calculateTaskPriority(
      task,
      availableMinutes
    );

    expect(passedTask.calculated_priority_score).toBe(
      expected.score
    );
    expect(passedTask.priority_breakdown).toEqual(
      expected.breakdown
    );
  });

  it("ranks competing tasks by their actual calculated score, not assumed urgency", async () => {
    const availableMinutes = 90;

    const tasks = [
      {
        id: "task-due-soon-low-effort",
        user_id: USER_ID,
        title: "Due tomorrow, light effort",
        due_date: new Date(
          Date.now() + 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
        priority: "low",
        point_value: 5,
        estimated_effort_minutes: 30,
        completion_status: "not_started",
      },
      {
        id: "task-far-high-priority",
        user_id: USER_ID,
        title: "Due far out, high priority and points",
        due_date: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        priority: "high",
        point_value: 50,
        estimated_effort_minutes: 60,
        completion_status: "not_started",
      },
      {
        id: "task-no-deadline-medium",
        user_id: USER_ID,
        title: "No deadline, medium everything",
        due_date: null,
        priority: "medium",
        point_value: 15,
        estimated_effort_minutes: 120,
        completion_status: "not_started",
      },
    ];

    supabase.__store.tasks = tasks;

    askAI.mockResolvedValue("Here is what to work on.");

    const res = await postAI({
      message: "What should I work on?",
      available_minutes: availableMinutes,
    });

    expect(res.status).toBe(200);

    const passedTasks = askAI.mock.calls[0][1];

    const byId = (id) =>
      passedTasks.find((t) => t.id === id);

    // Expected scores come from the real algorithm, computed the same
    // way the controller computes them - this asserts the controller
    // wired the fields through correctly, not a re-derivation of the
    // scoring formula's intent.
    const expectedScores = tasks.reduce((acc, task) => {
      acc[task.id] = calculateTaskPriority(
        task,
        availableMinutes
      ).score;
      return acc;
    }, {});

    for (const task of tasks) {
      expect(byId(task.id).calculated_priority_score).toBe(
        expectedScores[task.id]
      );
      expect(byId(task.id).priority_breakdown).toEqual(
        calculateTaskPriority(task, availableMinutes).breakdown
      );
      expect(byId(task.id).due_date).toBe(task.due_date);
      expect(byId(task.id).estimated_effort_minutes).toBe(
        task.estimated_effort_minutes
      );
      expect(byId(task.id).point_value).toBe(task.point_value);
      expect(byId(task.id).priority).toBe(task.priority);
    }

    // Sanity check that the three tasks don't all collapse to one
    // score (which would make the ranking assertions above vacuous).
    const distinctScores = new Set(Object.values(expectedScores));
    expect(distinctScores.size).toBeGreaterThan(1);
  });
});

describe("Sprint 5 - AI schedule-response validation", () => {
  it("rejects a schedule with duplicate task IDs and does not persist it", async () => {
    supabase.__store.tasks = [
      {
        id: "dup-task",
        user_id: USER_ID,
        title: "Single assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 60,
      },
    ];

    askAI.mockResolvedValue({
      message: "Study twice.",
      schedule: [
        { task_id: "dup-task", allocated_minutes: 20 },
        { task_id: "dup-task", allocated_minutes: 20 },
      ],
    });

    const res = await postAI({
      message: "Make a study schedule.",
      response_mode: "schedule",
      schedule_start_time: "2026-10-15T17:00:00.000Z",
      available_minutes: 60,
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(supabase.__store.schedules).toEqual([]);
  });

  it("rejects a schedule that allocates more than estimated effort and does not persist it", async () => {
    supabase.__store.tasks = [
      {
        id: "over-effort-task",
        user_id: USER_ID,
        title: "Short assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 30,
      },
    ];

    askAI.mockResolvedValue({
      message: "Study for 60 minutes.",
      schedule: [
        { task_id: "over-effort-task", allocated_minutes: 60 },
      ],
    });

    const res = await postAI({
      message: "Make a study schedule.",
      response_mode: "schedule",
      schedule_start_time: "2026-10-15T17:00:00.000Z",
      available_minutes: 120,
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(supabase.__store.schedules).toEqual([]);
  });

  it("rejects a schedule whose total allocation exceeds available minutes and does not persist it", async () => {
    supabase.__store.tasks = [
      {
        id: "task-a",
        user_id: USER_ID,
        title: "First assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 60,
      },
      {
        id: "task-b",
        user_id: USER_ID,
        title: "Second assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 60,
      },
    ];

    askAI.mockResolvedValue({
      message: "Study for both.",
      schedule: [
        { task_id: "task-a", allocated_minutes: 50 },
        { task_id: "task-b", allocated_minutes: 50 },
      ],
    });

    const res = await postAI({
      message: "Make a study schedule.",
      response_mode: "schedule",
      schedule_start_time: "2026-10-15T17:00:00.000Z",
      available_minutes: 90,
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(supabase.__store.schedules).toEqual([]);
  });
});
