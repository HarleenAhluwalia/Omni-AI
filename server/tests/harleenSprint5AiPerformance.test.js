
/**
 * Harleen — Sprint 5 AI Performance Testing
 *
 * Jira:
 * SCRUM-135 — Measure AI task-generation speed
 * SCRUM-136 — Record response times
 * SCRUM-137 — Repeat measurements
 *
 * Mocked provider tests measure application overhead,
 * NOT real Claude or Ollama generation speed.
 */


jest.mock("@anthropic-ai/sdk", () => {
  const mockCreate = jest.fn();

  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));

  MockAnthropic.__mockCreate = mockCreate;

  return MockAnthropic;
});


const Anthropic = require("@anthropic-ai/sdk");
const { askAI } = require("../services/aiService");

const mockCreate = Anthropic.__mockCreate;

const TRIALS = 10;

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    trials: values.length,
    averageMs: Number((sum / values.length).toFixed(2)),
    medianMs: Number(
      (
        (sorted[Math.floor((sorted.length - 1) / 2)] +
          sorted[Math.floor(sorted.length / 2)]) / 2
      ).toFixed(2)
    ),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    p95Ms: Number(
      sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)
    ),
  };
}

describe("Sprint 5 — AI Performance", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Start with the highest-priority assignment.",
        },
      ],
      usage: {
        input_tokens: 50,
        output_tokens: 20,
      },
    });
  });

  test("SCRUM-135: measures AI service response time", async () => {
    const start = performance.now();

    const response = await askAI(
      "Which task should I complete first?",
      [],
      120,
      "text"
    );

    const durationMs = performance.now() - start;

    expect(response).toContain("highest-priority");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    console.log(
      "Mocked AI service response:",
      durationMs.toFixed(2),
      "ms"
    );
  });

  test("SCRUM-136/137: repeats 10 measurements", async () => {
    const times = [];

    for (let i = 0; i < TRIALS; i++) {
      const start = performance.now();

      const response = await askAI(
        "Help prioritize my assignments.",
        [],
        120,
        "text"
      );

      const durationMs = performance.now() - start;

      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);

      times.push(durationMs);
    }

    expect(times).toHaveLength(TRIALS);
    expect(mockCreate).toHaveBeenCalledTimes(TRIALS);

    console.log(
      "Mocked AI performance summary:",
      JSON.stringify(summarize(times), null, 2)
    );
  });

  test("SCRUM-138: handles an empty AI response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "" }],
      usage: {},
    });

    await expect(
      askAI("Prioritize my tasks", [], 120, "text")
    ).rejects.toThrow("Claude returned an empty response.");
  });

  test("SCRUM-138: handles provider failure", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Simulated provider outage")
    );

    await expect(
      askAI("Prioritize my tasks", [], 120, "text")
    ).rejects.toThrow("Simulated provider outage");
  });

  test("SCRUM-138: rejects invalid response modes", async () => {
    await expect(
      askAI("Prioritize my tasks", [], 120, "invalid")
    ).rejects.toThrow("Invalid response mode.");
  });
});


test("SCRUM-138: accepts a valid AI schedule response", async () => {
  const schedule = {
    message: "Prioritize the assignment due first.",
    schedule: [
      {
        task_id: "task-1",
        allocated_minutes: 60,
      },
    ],
  };

  mockCreate.mockResolvedValueOnce({
    content: [
      {
        type: "text",
        text: JSON.stringify(schedule),
      },
    ],
    usage: {},
  });

  const response = await askAI(
    "Generate a study schedule",
    [
      {
        id: "task-1",
        title: "Complete assignment",
        completion_status: "incomplete",
        estimated_effort_minutes: 90,
        calculated_priority_score: 85,
      },
    ],
    120,
    "schedule"
  );

  expect(response).toEqual(schedule);
});

test("SCRUM-138: rejects malformed schedule JSON", async () => {
  mockCreate.mockResolvedValueOnce({
    content: [
      {
        type: "text",
        text: "{ invalid JSON",
      },
    ],
    usage: {},
  });

  await expect(
    askAI("Generate a schedule", [], 120, "schedule")
  ).rejects.toThrow("AI returned an invalid JSON schedule.");
});

test("SCRUM-138: rejects invalid schedule structure", async () => {
  mockCreate.mockResolvedValueOnce({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          message: "Schedule generated",
          schedule: "invalid",
        }),
      },
    ],
    usage: {},
  });

  await expect(
    askAI("Generate a schedule", [], 120, "schedule")
  ).rejects.toThrow("AI returned an invalid schedule structure.");
});
