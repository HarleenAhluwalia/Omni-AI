
/**
 * SCRUM-375 - UC-1 Workflow Automated Tests
 *
 * Tests the AI workflow using mocked Supabase data
 * and mocked AI responses.
 *
 * No live Supabase or Ollama connection is required.
 */

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

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const TOKEN_A = signToken({
  id: USER_A,
  email: "usera@example.com",
});

const TOKEN_B = signToken({
  id: USER_B,
  email: "userb@example.com",
});

const TASK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const makeTask = (id, userId, title) => ({
  id,
  user_id: userId,
  title,
  due_date: null,
  priority: "high",
  point_value: 50,
  estimated_effort_minutes: 60,
  completion_status: "not_started",
});

beforeEach(() => {
  supabase.__reset();
  askAI.mockReset();
  jest.restoreAllMocks();
});

describe("SCRUM-375 - UC-1 AI Workflow", () => {

  // TEST 1: Retrieve tasks and pass them to AI
  test("retrieves user tasks and sends prioritized data to AI", async () => {
    supabase.__store.tasks = [
      makeTask(TASK_A, USER_A, "Software Engineering Project"),
    ];

    askAI.mockResolvedValue("Work on your project first.");

    const response = await request(app)
    .post("/api/ai/chat")
    .set("Authorization", `Bearer ${TOKEN_A}`)
    .send({
        message: "What should I work on first?",
        available_minutes: 120,
    });

    expect(response.status).toBe(200);
    expect(askAI).toHaveBeenCalledTimes(1);

    expect(askAI).toHaveBeenCalledWith(
      "What should I work on first?",
      expect.arrayContaining([
        expect.objectContaining({
          id: TASK_A,
          title: "Software Engineering Project",
          calculated_priority_score: expect.any(Number),
          priority_breakdown: expect.any(Object),
        }),
      ]),
      120,
      "text"
    );
  });

  // TEST 2: AI prioritization response
  test("returns an AI prioritization response", async () => {
    supabase.__store.tasks = [
      makeTask(TASK_A, USER_A, "Study for Exam"),
    ];

    askAI.mockResolvedValue("Study for Exam first.");

    const response = await request(app)
        .post("/api/ai/chat")
        .set("Authorization", `Bearer ${TOKEN_A}`)
        .send({
        message: "What should I work on first?",
        available_minutes: 60,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.response)
      .toBe("Study for Exam first.");
    expect(response.body.data.schedules).toEqual([]);
  });

  // TEST 3: Generate and save an AI study schedule
  test("generates and saves a valid AI study schedule", async () => {
    supabase.__store.tasks = [
      makeTask(TASK_A, USER_A, "Study for Exam"),
    ];

    const generatedSchedule = {
      schedule: [
        {
          task_id: TASK_A,
          allocated_minutes: 60,
        },
      ],
    };

    askAI.mockResolvedValue(generatedSchedule);

    // The existing Supabase mock does not implement
    // insert().select() for multiple schedule rows.
    // Mock that operation specifically for this test.
    const originalFrom = supabase.from.bind(supabase);

    jest.spyOn(supabase, "from").mockImplementation((table) => {
      if (table === "schedules") {
        return {
          insert: jest.fn((rows) => ({
            select: jest.fn(async () => {
              supabase.__store.schedules = rows;
              return { data: rows, error: null };
            }),
          })),
        };
      }

      return originalFrom(table);
    });

    const response = await request(app)
        .post("/api/ai/chat")
        .set("Authorization", `Bearer ${TOKEN_A}`)
        .send({
        message: "Generate a study schedule",
        available_minutes: 120,
        response_mode: "schedule",
        schedule_start_time: "2026-10-16T09:00:00Z",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(askAI).toHaveBeenCalledWith(
      "Generate a study schedule",
      expect.arrayContaining([
        expect.objectContaining({ id: TASK_A }),
      ]),
      120,
      "schedule"
    );

    expect(response.body.data.schedules).toEqual([
      expect.objectContaining({
        user_id: USER_A,
        task_id: TASK_A,
        start_time: "2026-10-16T09:00:00.000Z",
        end_time: "2026-10-16T10:00:00.000Z",
        schedule_type: "study_block",
        status: "scheduled",
      }),
    ]);
  });

  // TEST 4: Reject a schedule containing another user's task
  test("rejects AI schedules containing unauthorized task IDs", async () => {
    supabase.__store.tasks = [
      makeTask(TASK_A, USER_A, "User A Project"),
      makeTask(TASK_B, USER_B, "User B Project"),
    ];

    askAI.mockResolvedValue({
      schedule: [
        {
          task_id: TASK_B,
          allocated_minutes: 30,
        },
      ],
    });

    const response = await request(app)
        .post("/api/ai/chat")
        .set("Authorization", `Bearer ${TOKEN_A}`)
        .send({
        message: "Generate a study schedule",
        available_minutes: 60,
        response_mode: "schedule",
        schedule_start_time: "2026-10-16T09:00:00Z",
      });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error)
      .toBe("Could not generate AI response.");
  });

  // TEST 5: Handle AI service failure
  test("handles AI service failures appropriately", async () => {
    askAI.mockRejectedValue(
      new Error("AI service unavailable")
    );

    const response = await request(app)
        .post("/api/ai/chat")
        .set("Authorization", `Bearer ${TOKEN_A}`)
        .send({
        message: "What should I work on first?",
        available_minutes: 60,
      });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error)
      .toBe("Could not generate AI response.");
  });

  // TEST 6: Keep task data separated by user ID
  test("passes only the requested user's tasks to AI", async () => {
    supabase.__store.tasks = [
      makeTask(TASK_A, USER_A, "User A Project"),
      makeTask(TASK_B, USER_B, "User B Project"),
    ];

    askAI.mockResolvedValue("Here is your recommendation.");

    const response = await request(app)
    .post(`/api/ai/chat?user_id=${USER_B}`)
    .set("Authorization", `Bearer ${TOKEN_A}`)
    .send({
        message: "What should I work on first?",
        available_minutes: 60,
    });

    expect(response.status).toBe(200);

    const aiTasks = askAI.mock.calls[0][1];

    expect(aiTasks).toHaveLength(1);
    expect(aiTasks[0].id).toBe(TASK_A);
    expect(aiTasks[0].title).toBe("User A Project");

    expect(aiTasks.some(task => task.id === TASK_B))
      .toBe(false);
  });

});
