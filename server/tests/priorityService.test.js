const {
    calculateTaskPriority,
} = require("../services/priorityService");

describe("AI task prioritization", () => {
    test("gives a higher deadline score to a task due sooner", () => {
        const soonTask = {
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const laterTask = {
            due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const availableMinutes = 120;

        const soonResult = calculateTaskPriority(
            soonTask,
            availableMinutes
        );

        const laterResult = calculateTaskPriority(
            laterTask,
            availableMinutes
        );

        expect(
            soonResult.breakdown.deadline
        ).toBeGreaterThan(
            laterResult.breakdown.deadline
        );

        expect(
            soonResult.score
        ).toBeGreaterThan(
            laterResult.score
        );
    });

    test("calculates the expected priority score for a known task", () => {
        const task = {
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            priority: "high",
            point_value: 50,
            estimated_effort_minutes: 60,
        };

        const availableMinutes = 120;

        const result = calculateTaskPriority(
            task,
            availableMinutes
        );

        expect(result.breakdown.deadline).toBe(30);
        expect(result.breakdown.userPriority).toBe(25);
        expect(result.breakdown.pointValue).toBe(20);
        expect(result.breakdown.availableTime).toBe(20);

        expect(result.score).toBe(95);
    });

    test("assigns the correct deadline score based on due date", () => {
        const baseTask = {
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const availableMinutes = 120;

        const overdue = calculateTaskPriority(
            {
                ...baseTask,
                due_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            },
            availableMinutes
        );

        const dueIn2Days = calculateTaskPriority(
            {
                ...baseTask,
                due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            },
            availableMinutes
        );

        const dueIn7Days = calculateTaskPriority(
            {
                ...baseTask,
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            availableMinutes
        );

        const dueIn14Days = calculateTaskPriority(
            {
                ...baseTask,
                due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            },
            availableMinutes
        );

        const dueLater = calculateTaskPriority(
            {
                ...baseTask,
                due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            },
            availableMinutes
        );

        expect(overdue.breakdown.deadline).toBe(35);
        expect(dueIn2Days.breakdown.deadline).toBe(30);
        expect(dueIn7Days.breakdown.deadline).toBe(20);
        expect(dueIn14Days.breakdown.deadline).toBe(10);
        expect(dueLater.breakdown.deadline).toBe(5);
    });
    test("assigns the correct scores for priority, point value, and available time", () => {
        const task = {
            due_date: null,
            priority: "high",
            point_value: 50,
            estimated_effort_minutes: 60,
        };

        const result = calculateTaskPriority(task, 120);

        expect(result.breakdown.deadline).toBe(0);
        expect(result.breakdown.userPriority).toBe(25);
        expect(result.breakdown.pointValue).toBe(20);
        expect(result.breakdown.availableTime).toBe(20);

        expect(result.score).toBe(65);
    });

    test("handles invalid or missing prioritization inputs safely", () => {
        const task = {
            due_date: null,
            priority: "invalid",
            point_value: -10,
            estimated_effort_minutes: 0,
        };

        const result = calculateTaskPriority(task, -5);

        expect(result.breakdown.deadline).toBe(0);
        expect(result.breakdown.userPriority).toBe(0);
        expect(result.breakdown.pointValue).toBe(0);
        expect(result.breakdown.availableTime).toBe(0);

        expect(result.score).toBe(0);
    });

    test("changes priority score based on available study time", () => {
        const task = {
            due_date: null,
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const enoughTime = calculateTaskPriority(
            task,
            120
        );

        const limitedTime = calculateTaskPriority(
            task,
            30
        );

        expect(
            enoughTime.breakdown.availableTime
        ).toBe(20);

        expect(
            limitedTime.breakdown.availableTime
        ).toBe(2);

        expect(
            enoughTime.score
        ).toBeGreaterThan(
            limitedTime.score
        );
    });
});