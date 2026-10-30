
const { askAI } = require("../services/aiService");

describe("Sprint 4 - AI Service Failure Testing", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("handles Ollama HTTP 500 errors safely", async () => {
        // Simulate Ollama returning a server error.
        jest.spyOn(global, "fetch").mockResolvedValue({
            ok: false,
            status: 500,
        });

        // Verify that the AI service reports the error.
        await expect(
            askAI(
                "What should I study?",
                [],
                120,
                "text"
            )
        ).rejects.toThrow("Ollama request failed: 500");

        // Verify that an Ollama request was attempted.
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("handles Ollama connection failures safely", async () => {
        // Simulate Ollama being unavailable.
        jest.spyOn(global, "fetch").mockRejectedValue(
            new Error("fetch failed")
        );

        // Verify that the AI service reports the connection failure.
        await expect(
            askAI(
                "What should I study?",
                [],
                120,
                "text"
            )
        ).rejects.toThrow("fetch failed");

        // Verify that the request was attempted.
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("rejects empty responses from Ollama", async () => {
        // Simulate a successful request with an empty AI message.
        jest.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                message: {
                    content: "   ",
                },
            }),
        });

        // Verify that empty AI responses are rejected.
        await expect(
            askAI(
                "What should I study?",
                [],
                120,
                "text"
            )
        ).rejects.toThrow("Ollama returned an empty response.");

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("rejects invalid JSON schedules from Ollama", async () => {
        // Simulate Ollama returning malformed JSON.
        jest.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                message: {
                    content: '{ "message": "Study plan", "schedule": [',
                },
            }),
        });

        // Verify that malformed JSON is rejected.
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

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

});
