
const request = require("supertest");
const express = require("express");
const { performance } = require("node:perf_hooks");

// Prevent real Supabase requests.
jest.mock("../config/supabase", () => ({
    from: jest.fn(),
}));

// Simulate authentication in this test only.
jest.mock("../src/middleware/auth", () => ({
    requireAuth: (req, res, next) => {
        req.user = { id: "performance-test-user" };
        next();
    },
}));

const supabase = require("../config/supabase");
const taskRoutes = require("../routes/taskRoutes");
const scheduleRoutes = require("../routes/scheduleRoutes");

const app = express();
app.use(express.json());
app.use("/api/tasks", taskRoutes);
app.use("/api/schedules", scheduleRoutes);

const TASK_COUNTS = [10, 50, 200];
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Build realistic synthetic task data.
function generateTasks(count) {
    const now = Date.now();

    return Array.from({ length: count }, (_, i) => ({
        id: `perf-task-${i + 1}`,
        title: `Performance Task ${i + 1}`,
        due_date: new Date(
            now + (1 + (i % 7)) * DAY_MS
        ).toISOString(),
        priority: ["high", "medium", "low"][i % 3],
        point_value: 10 + (i % 20),
        estimated_effort_minutes: 15,
        completion_status: "not_started",
        canvas_locked: false,
        has_due_time: i % 5 === 0,
    }));
}

function generateSchedules(tasks) {
    const now = Date.now();

    return tasks.map((task, i) => ({
        id: `perf-schedule-${i + 1}`,
        user_id: "performance-test-user",
        task_id: task.id,
        status: "scheduled",
        schedule_type: "study_block",
        start_time: new Date(
            now + i * 3600000
        ).toISOString(),
        end_time: new Date(
            now + (i + 1) * 3600000
        ).toISOString(),
        tasks: task,
    }));
}

// Simulate the Supabase query-chain methods
// used by the API controllers.
function mockQuery(data) {
    const response = { data, error: null };

    const query = {
        eq: () => query,
        order: () => query,
        maybeSingle: async () => response,
        then: (resolve, reject) =>
            Promise.resolve(response).then(resolve, reject),
    };

    return query;
}

function mockDatabase(tasks, schedules) {
    const tables = {
        tasks,
        schedules,
        preferences: {
            daily_workload_limit_minutes: 240,
        },
    };

    supabase.from.mockImplementation((table) => {
        if (!Object.prototype.hasOwnProperty.call(tables, table)) {
            throw new Error(`Unexpected table: ${table}`);
        }

        return {
            select: () => mockQuery(tables[table]),
        };
    });
}

// Measure actual local HTTP request handling,
// with database and authentication mocked.
async function measureEndpoint(endpoint, expectedCount) {
    const durations = [];

    for (let i = 0; i < WARMUP_RUNS + MEASURED_RUNS; i++) {
        const start = performance.now();

        const response = await request(app).get(endpoint);

        const elapsed = performance.now() - start;

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        if (endpoint.includes("/prioritized") ||
            endpoint.includes("/schedules")) {
            expect(response.body.data).toHaveLength(expectedCount);
        } else {
            expect(response.body.data).toHaveProperty("warnings");
        }

        if (i >= WARMUP_RUNS) {
            durations.push(elapsed);
        }
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;

    const average =
        durations.reduce((sum, value) => sum + value, 0) /
        count;

    const median =
        (sorted[Math.floor((count - 1) / 2)] +
         sorted[Math.floor(count / 2)]) / 2;

    const p95 = sorted[Math.ceil(count * 0.95) - 1];

    return {
        "Average (ms)": average.toFixed(3),
        "Median (ms)": median.toFixed(3),
        "P95 (ms)": p95.toFixed(3),
    };
}

// Run only when explicitly enabled.
// Normal CI runs will skip performance measurements.
const performanceTest =
    process.env.RUN_SPRINT5_PERF === "1" ? test : test.skip;

describe("Sprint 5 - Mocked API Performance", () => {
    performanceTest(
        "benchmarks prioritized tasks, workload, and schedules",
        async () => {
            const results = [];

            for (const count of TASK_COUNTS) {
                const tasks = generateTasks(count);
                const schedules = generateSchedules(tasks);

                mockDatabase(tasks, schedules);

                const endpoints = [
                    {
                        feature: "Task Prioritization API",
                        path: "/api/tasks/prioritized",
                    },
                    {
                        feature: "Workload Analysis API",
                        path: "/api/tasks/workload",
                    },
                    {
                        feature: "Schedule Retrieval API",
                        path: "/api/schedules",
                    },
                ];

                for (const endpoint of endpoints) {
                    const metrics = await measureEndpoint(
                        endpoint.path,
                        count
                    );

                    results.push({
                        Feature: endpoint.feature,
                        Tasks: count,
                        ...metrics,
                    });
                }
            }

            console.log(
                "\nOmni-AI Sprint 5 - Mocked API Performance"
            );
            console.log(
                "No real database or Claude requests."
            );
            console.table(results);
        },
        120000
    );
});
