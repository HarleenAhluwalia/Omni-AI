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
  });

