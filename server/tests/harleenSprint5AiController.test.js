
/**
 * Sprint 5 — Harleen
 *
 * SCRUM-138: Backend AI response handling
 * SCRUM-140: Identify response-handling problems
 *
 * Controller-level tests using mocked dependencies.
 */

jest.mock("../services/aiService", () => ({
  askAI: jest.fn(),
}));

jest.mock("../services/priorityService", () => ({
  calculateTaskPriority: jest.fn(() => ({
    score: 80,
    breakdown: {},
  })),
}));

jest.mock("../config/supabase", () => ({
  from: jest.fn(),
}));

const { chat } = require("../src/controllers/aiController");
const { askAI } = require("../services/aiService");
const supabase = require("../config/supabase");

const userId = "harleen-test-user";

const incompleteTask = {
  id: "task-1",
  title: "Complete assignment",
  due_date: "2026-11-15",
  priority: "High",
  point_value: 100,
  estimated_effort_minutes: 90,
  completion_status: "incomplete",
};

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function createRequest(body = {}, authenticated = true) {
  return {
    body,
    user: authenticated ? { id: userId } : null,
  };
}

function mockTasks(tasks = [incompleteTask]) {
  const eq = jest.fn().mockResolvedValue({
    data: tasks,
    error: null,
  });

  const select = jest.fn().mockReturnValue({ eq });

  supabase.from.mockReturnValue({ select });

  return { select, eq };
}

describe("Sprint 5 — AI Controller Response Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTasks();
  });

  test("rejects unauthenticated AI requests", async () => {
    const req = createRequest(
      { message: "Prioritize my tasks" },
      false
    );

    const res = createResponse();

    await chat(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(askAI).not.toHaveBeenCalled();
  });

  test("rejects an empty AI message", async () => {
    const req = createRequest({ message: " " });
    const res = createResponse();

    await chat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(askAI).not.toHaveBeenCalled();
  });

  test("rejects an invalid response mode", async () => {
    const req = createRequest({
      message: "Prioritize my tasks",
      response_mode: "invalid",
    });

    const res = createResponse();

    await chat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(askAI).not.toHaveBeenCalled();
  });

  test("rejects negative available study time", async () => {
    const req = createRequest({
      message: "Generate a schedule",
      available_minutes: -10,
    });

    const res = createResponse();

    await chat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("returns a successful AI text response", async () => {
    askAI.mockResolvedValueOnce(
      "Complete the assignment due first."
    );

    const req = createRequest({
      message: "Which task should I prioritize?",
      response_mode: "text",
    });

    const res = createResponse();

    await chat(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        response: "Complete the assignment due first.",
        schedules: [],
      },
    });
  });

  test("rejects an unknown AI-generated task ID", async () => {
    askAI.mockResolvedValueOnce({
      message: "Study plan",
      schedule: [
        {
          task_id: "unknown-task",
          allocated_minutes: 30,
        },
      ],
    });

    const req = createRequest({
      message: "Generate a schedule",
      response_mode: "schedule",
      schedule_start_time: "2026-11-15T10:00:00Z",
      available_minutes: 120,
    });

    const res = createResponse();

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await chat(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Could not generate AI response.",
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test("rejects duplicate scheduled tasks", async () => {
    askAI.mockResolvedValueOnce({
      message: "Study plan",
      schedule: [
        { task_id: "task-1", allocated_minutes: 30 },
        { task_id: "task-1", allocated_minutes: 30 },
      ],
    });

    const req = createRequest({
      message: "Generate a schedule",
      response_mode: "schedule",
      schedule_start_time: "2026-11-15T10:00:00Z",
      available_minutes: 120,
    });

    const res = createResponse();

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await chat(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test("rejects schedules exceeding available time", async () => {
    askAI.mockResolvedValueOnce({
      message: "Study plan",
      schedule: [
        { task_id: "task-1", allocated_minutes: 90 },
      ],
    });

    const req = createRequest({
      message: "Generate a schedule",
      response_mode: "schedule",
      schedule_start_time: "2026-11-15T10:00:00Z",
      available_minutes: 30,
    });

    const res = createResponse();

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await chat(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test("handles AI provider failure without exposing details", async () => {
    askAI.mockRejectedValueOnce(
      new Error("Simulated provider secret failure")
    );

    const req = createRequest({
      message: "Prioritize my tasks",
      response_mode: "text",
    });

    const res = createResponse();

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await chat(req, res);

      expect(res.status).toHaveBeenCalledWith(500);

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Could not generate AI response.",
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
