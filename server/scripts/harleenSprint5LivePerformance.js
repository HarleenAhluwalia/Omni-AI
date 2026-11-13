
/**
 * Sprint 5 — Harleen AI Performance Measurement
 *
 * SCRUM-135: Measure AI response speed
 * SCRUM-136: Execute and record response times
 * SCRUM-137: Repeat measurements
 *
 * LIVE measurements — actual configured AI provider.
 * Requires valid ANTHROPIC_API_KEY.
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { askAI } = require("../services/aiService");

const TRIALS = 10;
const AVAILABLE_MINUTES = 120;

const PROMPT =
  "Which of my incomplete tasks should I prioritize?";

const tasks = [
  {
    id: "sprint5-task-1",
    title: "Complete software engineering report",
    due_date: "2026-11-13T23:59:00Z",
    priority: "High",
    point_value: 100,
    estimated_effort_minutes: 90,
    completion_status: "incomplete",
    calculated_priority_score: 85,
  },
  {
    id: "sprint5-task-2",
    title: "Review authentication test results",
    due_date: "2026-11-16T23:59:00Z",
    priority: "Medium",
    point_value: 50,
    estimated_effort_minutes: 45,
    completion_status: "incomplete",
    calculated_priority_score: 60,
  },
];

function round(value) {
  return Number(value.toFixed(2));
}

function percentile(sorted, p) {
  return sorted[Math.ceil(sorted.length * p) - 1];
}

function calculateStatistics(times) {
  if (!times.length) return null;

  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((sum, value) => sum + value, 0);

  return {
    averageMs: round(total / times.length),
    medianMs: round(
      (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) / 2
    ),
    minMs: round(sorted[0]),
    maxMs: round(sorted[sorted.length - 1]),
    p95Ms: round(percentile(sorted, 0.95)),
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Load your local environment before running."
    );
  }

  const results = [];

  console.log("Starting 10 LIVE AI performance trials...");

  for (let i = 1; i <= TRIALS; i++) {
    const start = performance.now();

    try {
      const response = await askAI(
        PROMPT,
        tasks,
        AVAILABLE_MINUTES,
        "text"
      );

      const durationMs = round(performance.now() - start);

      const success =
        typeof response === "string" &&
        response.trim().length > 0;

      results.push({
        trial: i,
        durationMs,
        success,
        responseLength: response.length,
      });

      console.log(
        `Trial ${i}: ${durationMs} ms — ${
          success ? "PASS" : "FAIL"
        }`
      );
    } catch (error) {
      const durationMs = round(performance.now() - start);

      results.push({
        trial: i,
        durationMs,
        success: false,
        errorType: error.name || "Error",
      });

      console.log(
        `Trial ${i}: ${durationMs} ms — FAIL (${error.name})`
      );
    }
  }

  const successfulTimes = results
    .filter((result) => result.success)
    .map((result) => result.durationMs);

  const report = {
    testName: "Sprint 5 Live AI Performance",
    timestamp: new Date().toISOString(),
    provider: "Configured Anthropic Claude service",
    trials: TRIALS,
    successful: successfulTimes.length,
    failed: TRIALS - successfulTimes.length,
    statistics: calculateStatistics(successfulTimes),
    results,
  };

  const outputDir = path.join(
    __dirname,
    "../test-results"
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(
    outputDir,
    "harleen-sprint5-ai-performance.json"
  );

  fs.writeFileSync(
    outputFile,
    JSON.stringify(report, null, 2)
  );

  console.log("\nFinal performance report:");
  console.log(JSON.stringify(report, null, 2));

  console.log("\nSaved to:", outputFile);
}

main().catch((error) => {
  console.error("Performance test failed:", error.message);
  process.exitCode = 1;
});
