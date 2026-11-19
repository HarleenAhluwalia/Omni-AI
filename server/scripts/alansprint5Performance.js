
const { performance } = require("node:perf_hooks");

const {
  calculateTaskPriority,
} = require("../services/priorityService");

const {
  detectConflicts,
} = require("../services/schedulingService");

const {
  analyzeWorkload,
  generateWorkloadRecommendations,
} = require("../services/workloadService");

// Sprint 5 performance test configuration
const TASK_COUNTS = [10, 50, 100, 200];
const WARMUP_RUNS = 3;
const MEASURED_RUNS = 20;

// Generate consistent sample tasks without using a database.
function generateTasks(count, now) {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  return Array.from({ length: count }, (_, i) => {
    const start = now.getTime() +
      Math.floor(i / 2) * hourMs;

    return {
      id: `test-task-${i + 1}`,
      title: `Performance Test Task ${i + 1}`,
      priority: ["high", "medium", "low"][i % 3],
      point_value: 10 + (i % 40),
      estimated_effort_minutes: 30 + (i % 4) * 30,
      completion_status: "pending",
      canvas_locked: false,
      has_due_time: i % 3 === 0,

      due_date: new Date(
        now.getTime() + (1 + i % 6) * dayMs
      ).toISOString(),

      start_time: new Date(start).toISOString(),
      end_time: new Date(start + hourMs).toISOString(),
    };
  });
}

// Measure a function multiple times.
function benchmark(name, taskCount, operation) {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    operation();
  }

  const measurements = [];

  for (let i = 0; i < MEASURED_RUNS; i++) {
    const start = performance.now();

    operation();

    const duration = performance.now() - start;
    measurements.push(duration);
  }

  const sorted = [...measurements].sort((a, b) => a - b);
  const average =
    measurements.reduce((sum, value) => sum + value, 0) /
    measurements.length;

  const median =
    (sorted[9] + sorted[10]) / 2;

  const p95 =
    sorted[Math.ceil(sorted.length * 0.95) - 1];

  return {
    Feature: name,
    Tasks: taskCount,
    "Average (ms)": average.toFixed(3),
    "Median (ms)": median.toFixed(3),
    "P95 (ms)": p95.toFixed(3),
  };
}

// Run all Sprint 5 benchmarks.
function runBenchmarks() {
  console.log("Omni-AI Sprint 5 Performance Baseline");
  console.log("Local service execution only - no external API calls");

  const results = [];
  const now = new Date();

  for (const count of TASK_COUNTS) {
    const tasks = generateTasks(count, now);

    results.push(
      benchmark("Task Prioritization", count, () => {
        tasks.forEach((task) =>
          calculateTaskPriority(task, 240)
        );
      })
    );

    results.push(
      benchmark("Conflict Detection", count, () => {
        detectConflicts(tasks);
      })
    );

    results.push(
      benchmark("Workload Analysis", count, () => {
        analyzeWorkload(tasks, 240, now, "UTC");
      })
    );

    results.push(
      benchmark("Workload Recommendations", count, () => {
        generateWorkloadRecommendations(
          tasks, 240, now, "UTC"
        );
      })
    );
  }

  console.table(results);
}

runBenchmarks();
