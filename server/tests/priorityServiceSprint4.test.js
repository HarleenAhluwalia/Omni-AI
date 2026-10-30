
const {
    calculateTaskPriority,
} = require("../services/priorityService");

describe("Sprint 4 - AI Prioritization Testing", () => {
    test("invalid deadline should receive zero deadline points", () => {
        const task = {
            due_date: "not-a-date",
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const result = calculateTaskPriority(task, 120);

        expect(result.breakdown.deadline).toBe(0);
        expect(result.score).toBe(45);
    });

    test("recalculates score when task priority changes", () => {
        const task = {
            due_date: null,
            priority: "low",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const lowResult = calculateTaskPriority(task, 120);

        const mediumResult = calculateTaskPriority(
            { ...task, priority: "medium" },
            120
        );

        const highResult = calculateTaskPriority(
            { ...task, priority: "high" },
            120
        );

        expect(lowResult.breakdown.userPriority).toBe(5);
        expect(mediumResult.breakdown.userPriority).toBe(15);
        expect(highResult.breakdown.userPriority).toBe(25);

        expect(lowResult.score).toBe(35);
        expect(mediumResult.score).toBe(45);
        expect(highResult.score).toBe(55);

        expect(highResult.score).toBeGreaterThan(mediumResult.score);
        expect(mediumResult.score).toBeGreaterThan(lowResult.score);
    });

    test("assigns correct scores at point value boundaries", () => {
        const testCases = [
            { points: 9, expected: 5 },
            { points: 10, expected: 10 },
            { points: 24, expected: 10 },
            { points: 25, expected: 15 },
            { points: 49, expected: 15 },
            { points: 50, expected: 20 },
        ];

        testCases.forEach(({ points, expected }) => {
            const task = {
                due_date: null,
                priority: "medium",
                point_value: points,
                estimated_effort_minutes: 60,
            };

            const result = calculateTaskPriority(task, 120);

            expect(result.breakdown.pointValue).toBe(expected);
        });
    });

    test("assigns correct scores at available study time boundaries", () => {
        const task = {
            due_date: null,
            priority: "medium",
            point_value: 10,
            estimated_effort_minutes: 60,
        };

        const testCases = [
            { available: 60, expected: 20 },
            { available: 40, expected: 10 },
            { available: 39, expected: 2 },
            { available: -1, expected: 0 },
        ];

        testCases.forEach(({ available, expected }) => {
            const result = calculateTaskPriority(task, available);

            expect(result.breakdown.availableTime).toBe(expected);
        });
    });

});
