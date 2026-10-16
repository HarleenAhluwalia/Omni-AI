
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
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const authHeader = `Bearer ${signToken({
  id: USER_ID,
  email: "user@test.com",
})}`;

const otherAuthHeader = `Bearer ${signToken({
  id: OTHER_USER_ID,
  email: "other@test.com",
})}`;

const postAI = (body, authorization = authHeader) => {
  const req = request(app).post("/api/ai/chat");

  if (authorization) {
    req.set("Authorization", authorization);
  }

  return req.send(body);
};

beforeEach(() => {
  supabase.__reset();
  askAI.mockReset();
});

describe("POST /api/ai/chat - authentication", () => {
  it("rejects requests without authentication", async () => {
    const res = await postAI(
      { message: "What should I work on?" },
      null
    );

    expect(res.status).toBe(401);
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects an invalid authentication token", async () => {
    const res = await postAI(
      { message: "What should I work on?" },
      "Bearer invalid-token"
    );

    expect(res.status).toBe(401);
    expect(askAI).not.toHaveBeenCalled();
  });

  it("does not require user_id in the query string", async () => {
    askAI.mockResolvedValue("Here is your recommendation.");

    const res = await postAI({
      message: "What should I work on?",
      available_minutes: 120,
    });

    expect(res.status).toBe(200);
    expect(askAI).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated user rather than a query user_id", async () => {
    supabase.__store.tasks = [
      {
        id: "task-owned-by-user",
        user_id: USER_ID,
        title: "My assignment",
        due_date: null,
        priority: "high",
        point_value: 20,
        estimated_effort_minutes: 60,
        completion_status: "not_started",
      },
      {
        id: "task-owned-by-other",
        user_id: OTHER_USER_ID,
        title: "Other user's private assignment",
        due_date: null,
        priority: "high",
        point_value: 50,
        estimated_effort_minutes: 90,
        completion_status: "not_started",
      },
    ];

    askAI.mockResolvedValue("Work on your assignment.");

    const res = await request(app)
      .post(`/api/ai/chat?user_id=${OTHER_USER_ID}`)
      .set("Authorization", authHeader)
      .send({
        message: "What should I work on?",
        available_minutes: 120,
      });

    expect(res.status).toBe(200);
    expect(askAI).toHaveBeenCalledTimes(1);

    const passedTasks = askAI.mock.calls[0][1];

    expect(
      passedTasks.some((task) => task.title === "My assignment")
    ).toBe(true);

    expect(
      passedTasks.some(
        (task) =>
          task.title === "Other user's private assignment"
      )
    ).toBe(false);
  });

  it("separates tasks for different authenticated users", async () => {
    supabase.__store.tasks = [
      {
        id: "my-task",
        user_id: USER_ID,
        title: "My task",
        completion_status: "not_started",
      },
      {
        id: "other-task",
        user_id: OTHER_USER_ID,
        title: "Other task",
        completion_status: "not_started",
      },
    ];

    askAI.mockResolvedValue("Your tasks are ready.");

    const res = await postAI(
      { message: "Show my tasks." },
      otherAuthHeader
    );

    expect(res.status).toBe(200);

    const passedTasks = askAI.mock.calls[0][1];

    expect(passedTasks.map((task) => task.title)).toContain(
      "Other task"
    );

    expect(passedTasks.map((task) => task.title)).not.toContain(
      "My task"
    );
  });
});

describe("POST /api/ai/chat - error handling", () => {
  it("rejects a missing message", async () => {
    const res = await postAI({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "message is required",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects negative available_minutes", async () => {
    const res = await postAI({
      message: "What should I work on?",
      available_minutes: -30,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "available_minutes must be a nonnegative integer",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects non-numeric available_minutes", async () => {
    const res = await postAI({
      message: "What should I work on?",
      available_minutes: "abc",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "available_minutes must be a nonnegative integer",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects fractional available_minutes", async () => {
    const res = await postAI({
      message: "What should I work on?",
      available_minutes: 30.5,
    });

    expect(res.status).toBe(400);
    expect(askAI).not.toHaveBeenCalled();
  });

  it("returns 500 when the AI service fails", async () => {
    askAI.mockRejectedValue(
      new Error("AI service unavailable")
    );

    const res = await postAI({
      message: "What should I work on?",
      available_minutes: 60,
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Could not generate AI response.",
    });
  });

  it("rejects a whitespace-only message", async () => {
    const res = await postAI({
      message: "   ",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "message is required",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects a non-string message", async () => {
    const res = await postAI({
      message: 123,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "message is required",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects an invalid response_mode", async () => {
    const res = await postAI({
      message: "Make me a schedule",
      response_mode: "banana",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "response_mode must be text or schedule",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects schedule mode without schedule_start_time", async () => {
    const res = await postAI({
      message: "Make me a schedule",
      response_mode: "schedule",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "A valid schedule_start_time is required.",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects an invalid schedule_start_time", async () => {
    const res = await postAI({
      message: "Make me a schedule",
      response_mode: "schedule",
      schedule_start_time: "not-a-date",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "A valid schedule_start_time is required.",
    });
    expect(askAI).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/chat - boundary validation", () => {
  it("accepts zero available_minutes in text mode", async () => {
    askAI.mockResolvedValue("No study time is available.");

    const res = await postAI({
      message: "What should I work on?",
      available_minutes: 0,
    });

    expect(res.status).toBe(200);

    expect(askAI).toHaveBeenCalledWith(
      "What should I work on?",
      expect.any(Array),
      0,
      "text"
    );
  });

  it("returns an empty schedule with zero available time", async () => {
    const res = await postAI({
      message: "Generate a schedule.",
      response_mode: "schedule",
      schedule_start_time: "2026-10-15T17:00:00.000Z",
      available_minutes: 0,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response.schedule).toEqual([]);
    expect(res.body.data.schedules).toEqual([]);
    expect(askAI).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/chat - successful request", () => {
  it("returns a successful AI response for a valid chat request", async () => {
    supabase.__store.tasks = [
      {
        id: "task-1",
        user_id: USER_ID,
        title: "Software Engineering Project",
        due_date: null,
        priority: "high",
        point_value: 50,
        estimated_effort_minutes: 60,
        completion_status: "not_started",
      },
    ];

    askAI.mockResolvedValue(
      "Work on the Software Engineering Project first."
    );

    const res = await postAI({
      message: "What should I work on?",
      available_minutes: 120,
    });

    expect(res.status).toBe(200);

    expect(res.body).toEqual({
      success: true,
      data: {
        response:
          "Work on the Software Engineering Project first.",
        schedules: [],
      },
    });

    expect(askAI).toHaveBeenCalledTimes(1);

    expect(askAI).toHaveBeenCalledWith(
      "What should I work on?",
      expect.arrayContaining([
        expect.objectContaining({
          title: "Software Engineering Project",
          priority: "high",
          point_value: 50,
          completion_status: "not_started",
          calculated_priority_score: expect.any(Number),
          priority_breakdown: expect.any(Object),
        }),
      ]),
      120,
      "text"
    );
  });

  it("excludes completed tasks from AI schedule input", async () => {
    supabase.__store.tasks = [
      {
        id: "completed-task",
        user_id: USER_ID,
        title: "Finished homework",
        completion_status: "completed",
        estimated_effort_minutes: 30,
      },
      {
        id: "active-task",
        user_id: USER_ID,
        title: "Upcoming assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 60,
      },
    ];

    askAI.mockResolvedValue({
      message: "Your schedule is ready.",
      schedule: [],
    });

    const res = await postAI({
      message: "Make a study schedule.",
      response_mode: "schedule",
      schedule_start_time: "2026-10-15T17:00:00.000Z",
      available_minutes: 60,
    });

    expect(res.status).toBe(200);
    expect(askAI).toHaveBeenCalledTimes(1);

    const passedTasks = askAI.mock.calls[0][1];

    expect(
      passedTasks.map((task) => task.title)
    ).toContain("Upcoming assignment");

    expect(
      passedTasks.map((task) => task.title)
    ).not.toContain("Finished homework");
  });

  it("rejects a completed task returned by the AI", async () => {
    supabase.__store.tasks = [
      {
        id: "completed-task",
        user_id: USER_ID,
        title: "Finished homework",
        completion_status: "completed",
        estimated_effort_minutes: 30,
      },
      {
        id: "active-task",
        user_id: USER_ID,
        title: "Upcoming assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 60,
      },
    ];

    askAI.mockResolvedValue({
      message: "Your schedule is ready.",
      schedule: [
        {
          task_id: "completed-task",
          allocated_minutes: 30,
        },
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
  });

  it("rejects an allocation above estimated effort", async () => {
    supabase.__store.tasks = [
      {
        id: "active-task",
        user_id: USER_ID,
        title: "Short assignment",
        completion_status: "not_started",
        estimated_effort_minutes: 30,
      },
    ];

    askAI.mockResolvedValue({
      message: "Study for 60 minutes.",
      schedule: [
        {
          task_id: "active-task",
          allocated_minutes: 60,
        },
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
  });
});
