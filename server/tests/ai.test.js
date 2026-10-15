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

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  supabase.__reset();
  askAI.mockReset();
});

describe("POST /api/ai/chat - error handling", () => {
  it("rejects a missing message", async () => {
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({});

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "message is required",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects a missing user_id", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .send({
        message: "What should I work on?",
      });

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "user_id is required",
    });

    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects negative available_minutes", async () => {
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
        message: "What should I work on?",
        available_minutes: -30,
      });

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "available_minutes must be a nonnegative number",
    });

    expect(askAI).not.toHaveBeenCalled();
  });

  it("returns 500 when the AI service fails", async () => {
    askAI.mockRejectedValue(
      new Error("AI service unavailable")
    );

    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
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
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
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
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
        message: 123,
      });

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "message is required",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects non-numeric available_minutes", async () => {
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
        message: "What should I work on?",
        available_minutes: "abc",
      });

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "available_minutes must be a nonnegative number",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects an invalid response_mode", async () => {
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
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
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
        message: "Make me a schedule",
        response_mode: "schedule",
      });

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "schedule_start_time is required for schedule mode",
    });
    expect(askAI).not.toHaveBeenCalled();
  });

  it("rejects an invalid schedule_start_time", async () => {
    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
        message: "Make me a schedule",
        response_mode: "schedule",
        schedule_start_time: "not-a-date",
      });

    expect(res.status).toBe(400);

    expect(res.body).toEqual({
      success: false,
      error: "schedule_start_time must be a valid date",
    });
    expect(askAI).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/chat - boundary validation", () => {
  it("accepts zero available_minutes", async () => {
    askAI.mockResolvedValue("No study time is available.");

    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
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
});

describe("POST /api/ai/chat - successful request", () => {
  it("returns a successful AI response for a valid chat request", async () => {
    supabase.__store.tasks = [
      {
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

    const res = await request(app)
      .post(`/api/ai/chat?user_id=${USER_ID}`)
      .send({
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
});
