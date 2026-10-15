
const {
  calculateTaskPriority,
} = require("../services/priorityService");

describe("Priority Service - Edge Cases", () => {
  test("handles a task with missing optional fields", () => {
    const result = calculateTaskPriority({}, 60);

    expect(result).toEqual({
      score: 0,
      breakdown: {
        deadline: 0,
        userPriority: 0,
        pointValue: 0,
        availableTime: 0,
      },
    });
  });

  test("handles a task with no due date", () => {
    const task = {
      due_date: null,
      priority: "high",
      point_value: 50,
      estimated_effort_minutes: 60,
    };

    const result = calculateTaskPriority(task, 60);

    expect(result.breakdown.deadline).toBe(0);
    expect(result.breakdown.userPriority).toBe(25);
    expect(result.breakdown.pointValue).toBe(20);
    expect(result.breakdown.availableTime).toBe(20);
    expect(result.score).toBe(65);
  });

  test("handles zero available study time", () => {
    const task = {
      due_date: null,
      priority: "medium",
      point_value: 10,
      estimated_effort_minutes: 60,
    };

    const result = calculateTaskPriority(task, 0);

    expect(result.breakdown.availableTime).toBe(2);
    expect(result.score).toBe(27);
  });

  test("accepts numeric strings for point values and effort", () => {
    const task = {
      due_date: null,
      priority: "high",
      point_value: "50",
      estimated_effort_minutes: "60",
    };

    const result = calculateTaskPriority(task, 60);

    expect(result.breakdown.pointValue).toBe(20);
    expect(result.breakdown.availableTime).toBe(20);
    expect(result.score).toBe(65);
  });

  test("returns a finite score for zero-point tasks", () => {
    const task = {
      due_date: null,
      priority: "low",
      point_value: 0,
      estimated_effort_minutes: 30,
    };

    const result = calculateTaskPriority(task, 60);

    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.breakdown.pointValue).toBe(0);
    expect(result.breakdown.userPriority).toBe(5);
    expect(result.breakdown.availableTime).toBe(20);
    expect(result.score).toBe(25);
  });

  test("returns a finite score for negative point values", () => {
    const task = {
      due_date: null,
      priority: "medium",
      point_value: -10,
      estimated_effort_minutes: 30,
    };

    const result = calculateTaskPriority(task, 60);

    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.breakdown.pointValue).toBe(0);
    expect(result.score).toBe(35);
  });

  test("assigns the same score to equivalent numeric inputs", () => {
    const numericTask = {
      due_date: null,
      priority: "high",
      point_value: 50,
      estimated_effort_minutes: 60,
    };

    const stringTask = {
      due_date: null,
      priority: "high",
      point_value: "50",
      estimated_effort_minutes: "60",
    };

    const numericResult = calculateTaskPriority(numericTask, 60);
    const stringResult = calculateTaskPriority(stringTask, "60");

    expect(stringResult).toEqual(numericResult);
  });
});
