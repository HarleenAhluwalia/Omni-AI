
/* SCRUM-331: deterministic CI evidence, no live AI/API calls. */

const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(__dirname, "../test-results");
fs.mkdirSync(dir, { recursive: true });

const read = file => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(dir, file), "utf8")
    );
  } catch {
    return null;
  }
};

const tests = read("sprint5-jest.json");
const baseline = read("harleen-sprint5-ai-performance.json");

const sha = process.env.BUILD_SHA || "local";
const run = process.env.BUILD_RUN || "local";

const buildId = `omni-ai-build-${run}-${sha.slice(0, 7)}`;

const report = {
  buildId,
  commitSha: sha,
  runNumber: run,
  runUrl: process.env.BUILD_URL || null,
  createdAt: new Date().toISOString(),

  regression: {
    outcome:
      process.env.TEST_OUTCOME ||
      (tests?.success ? "success" : "unknown"),

    passed: tests?.numPassedTests ?? null,
    failed: tests?.numFailedTests ?? null,
    pending: tests?.numPendingTests ?? null,
    suites: tests?.numTotalTestSuites ?? null,

    failures: (tests?.testResults || [])
      .filter(x => x.status === "failed")
      .map(x => ({
        file: x.name,
        message: (x.message || "").slice(0, 2000)
      }))
  },

  aiPerformance: baseline
    ? {
        source:
          "historical live measurement; NOT remeasured for this CI build",
        measuredAt: baseline.timestamp,
        trials: baseline.trials,
        successful: baseline.successful,
        failed: baseline.failed,
        statistics: baseline.statistics
      }
    : {
        source: "No historical performance baseline available"
      }
};

fs.writeFileSync(
  path.join(dir, "sprint5-build-report.json"),
  JSON.stringify(report, null, 2) + "\n"
);

const s = report.regression;

const md = `## SCRUM-331 - ${buildId}

- Commit: ${sha}
- CI run: ${report.runUrl || "local"}
- Regression: ${s.outcome}
- Passed: ${s.passed ?? "unknown"}
- Failed: ${s.failed ?? "unknown"}
- Skipped: ${s.pending ?? "unknown"}
- AI performance: ${
  baseline
    ? `Historical baseline ${baseline.statistics.averageMs} ms average, ${baseline.trials} trials; not a measurement of this build`
    : "Baseline unavailable"
}
- Compare builds using downloaded sprint5-build-report.json artifacts.
`;

fs.writeFileSync(
  path.join(dir, "sprint5-summary.md"),
  md
);

console.log(md);
