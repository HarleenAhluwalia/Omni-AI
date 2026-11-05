
const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }))
);

const { askAI } = require("../services/aiService");

describe("Sprint 4 - AI Service Failure Testing", () => {
    afterEach(() => {
        jest.restoreAllMocks();
        mockCreate.mockReset();
    });


    test("handles Claude API HTTP 500 errors safely", async () => {
        // Simulate Claude returning an internal server error.
        const error = new Error("Internal Server Error");
        error.status = 500;

        mockCreate.mockRejectedValue(error);

        // Verify that the AI service propagates the API error.
        await expect(
            askAI(
                "What should I study?",
                [],
                120,
                "text"
            )
        ).rejects.toMatchObject({
            status: 500,
            message: "Internal Server Error",
        });

        // Verify that the Claude API method was called exactly once.
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });



    test("handles Claude connection failures safely", async () => {
        // Simulate a network failure when contacting Claude.
        const error = new Error("Connection error");

        mockCreate.mockRejectedValue(error);

        // Verify that the AI service propagates the connection failure.
        await expect(
            askAI(
                "What should I study?",
                [],
                120,
                "text"
            )
        ).rejects.toThrow("Connection error");

        // Verify that the Claude API method was called exactly once.
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });


    test("rejects empty responses from Claude", async () => {
        // Simulate Claude returning an empty text response.
        mockCreate.mockResolvedValue({
            content: [
                {
                    type: "text",
                    text: "   ",
                },
            ],
        });

        // Verify that the AI service rejects the empty response.
        await expect(
            askAI(
                "What should I study?",
                [],
                120,
                "text"
            )
        ).rejects.toThrow("Claude returned an empty response.");

        // Verify that the Claude API method was called exactly once.
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });



    test("rejects invalid JSON schedules from Claude", async () => {
        // Simulate Claude returning a malformed JSON schedule.
        mockCreate.mockResolvedValue({
            content: [
                {
                    type: "text",
                    text: '{ "message": "Study plan", "schedule": [',
                },
            ],
        });

        // Verify that the AI service rejects the invalid JSON.
        await expect(
            askAI(
                "Generate a study schedule.",
                [],
                120,
                "schedule"
            )
        ).rejects.toThrow(
            "AI returned an invalid JSON schedule."
        );

        // Verify that the Claude API method was called exactly once.
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    
    test("returns a successful Claude AI Chat response", async () => {
        // Simulate Claude returning a valid text response.
        mockCreate.mockResolvedValue({
            content: [
                {
                    type: "text",
                    text: "Start with your highest-priority task.",
                },
            ],
        });

        // Verify that the AI service returns Claude's message.
        const result = await askAI(
            "What should I study?",
            [],
            120,
            "text"
        );

        expect(result).toBe(
            "Start with your highest-priority task."
        );

        // Verify that Claude was called in text mode.
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                max_tokens: 1024,
                messages: [
                    {
                        role: "user",
                        content: "What should I study?",
                    },
                ],
            })
        );

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    
    test("returns a successful Claude study schedule", async () => {
        // Simulate Claude returning a valid JSON study schedule.
        const taskId = "11111111-1111-4111-8111-111111111111";

        mockCreate.mockResolvedValue({
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        message: "Focus on your upcoming assignment.",
                        schedule: [
                            {
                                task_id: taskId,
                                allocated_minutes: 60,
                            },
                        ],
                    }),
                },
            ],
        });

        // Supply a fictional incomplete task.
        const tasks = [
            {
                id: taskId,
                title: "Complete programming assignment",
                priority: "high",
                estimated_effort_minutes: 90,
                completion_status: "not_started",
            },
        ];

        // Request a study schedule with 60 available minutes.
        const result = await askAI(
            "Generate a study schedule.",
            tasks,
            60,
            "schedule"
        );

        // Verify that the JSON response was parsed correctly.
        expect(result).toEqual({
            message: "Focus on your upcoming assignment.",
            schedule: [
                {
                    task_id: taskId,
                    allocated_minutes: 60,
                },
            ],
        });

        // Verify that Claude was called in schedule mode.
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                max_tokens: 2048,
                messages: [
                    {
                        role: "user",
                        content: "Generate a study schedule.",
                    },
                ],
            })
        );

        // Verify that the Claude API method was called once.
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

});
