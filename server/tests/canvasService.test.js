// Sprint 3 PR 1: Canvas sync foundation.
// Pure unit tests - canvasService.js has no HTTP or database dependency,
// so this suite needs no Supabase mock and no auth token.
const {
  listCourses,
  findAssignmentById,
  isLocked,
} = require("../services/canvasService");

describe("canvasService — catalog structure", () => {
  it("returns the expected course and assignment shape", () => {
    const courses = listCourses();

    expect(Array.isArray(courses)).toBe(true);
    expect(courses.length).toBeGreaterThan(0);

    for (const course of courses) {
      expect(course).toHaveProperty("id");
      expect(course).toHaveProperty("name");
      expect(Array.isArray(course.assignments)).toBe(true);

      for (const assignment of course.assignments) {
        expect(assignment).toHaveProperty("id");
        expect(assignment).toHaveProperty("title");
        expect(assignment).toHaveProperty("dueDate");
        expect(assignment).toHaveProperty("points");
        expect(assignment).toHaveProperty("locked");
      }
    }
  });

  it("matches the known mock course/assignment ids from dummy-canvas", () => {
    const courses = listCourses();
    const courseIds = courses.map((course) => course.id).sort();
    const assignmentIds = courses
      .flatMap((course) => course.assignments.map((a) => a.id))
      .sort((a, b) => a - b);

    expect(courseIds).toEqual([1, 2, 3]);
    // 101/102/201/202/301 mirror dummy-canvas/src/App.jsx exactly; 401 is
    // the locked fixture that exists only in this backend-owned catalog.
    expect(assignmentIds).toEqual([101, 102, 201, 202, 301, 401]);
  });

  it("returns a fresh copy on every call, not a shared live reference", () => {
    const first = listCourses();
    first[0].name = "Mutated by a careless caller";

    const second = listCourses();

    expect(second[0].name).not.toBe("Mutated by a careless caller");
  });
});

describe("canvasService — findAssignmentById", () => {
  it("locates a known assignment and returns its course", () => {
    const result = findAssignmentById(101);

    expect(result).not.toBeNull();
    expect(result.assignment.id).toBe(101);
    expect(result.assignment.title).toBe("Sprint 3 Report");
    expect(result.course.id).toBe(1);
    expect(result.course.name).toBe("CPSC 491 - Computer Science");
  });

  it("accepts a string id (as req.body would deliver over JSON... or not)", () => {
    const result = findAssignmentById("201");

    expect(result).not.toBeNull();
    expect(result.assignment.id).toBe(201);
  });

  it("returns null for an unknown assignment id", () => {
    expect(findAssignmentById(999999)).toBeNull();
  });

  it("returns null for a non-numeric id rather than throwing", () => {
    expect(findAssignmentById("not-a-number")).toBeNull();
  });

  it("does not let a caller mutate the catalog through the returned object", () => {
    const first = findAssignmentById(101);
    first.assignment.title = "Mutated";

    const second = findAssignmentById(101);

    expect(second.assignment.title).toBe("Sprint 3 Report");
  });
});

describe("canvasService — locked assignments", () => {
  it("identifies a locked assignment via isLocked()", () => {
    const { assignment } = findAssignmentById(401);

    expect(assignment.locked).toBe(true);
    expect(isLocked(assignment)).toBe(true);
  });

  it("identifies an unlocked assignment via isLocked()", () => {
    const { assignment } = findAssignmentById(101);

    expect(assignment.locked).toBe(false);
    expect(isLocked(assignment)).toBe(false);
  });

  it("treats a missing locked field as not locked, not a crash", () => {
    expect(isLocked({ id: 1, title: "No locked field" })).toBe(false);
    expect(isLocked(undefined)).toBe(false);
  });

  it("represents a locked assignment's missing details as null, not invented values", () => {
    const { assignment } = findAssignmentById(401);

    expect(assignment.title).toBe("Final Project (Locked)");
    expect(assignment.dueDate).toBeNull();
    expect(assignment.points).toBeNull();
  });
});

describe("canvasService — stable identifiers", () => {
  it("returns identical ids and titles across repeated catalog reads", () => {
    const first = listCourses();
    const second = listCourses();

    const idsAndTitles = (courses) =>
      courses.flatMap((course) =>
        course.assignments.map((a) => `${a.id}:${a.title}`)
      );

    expect(idsAndTitles(first)).toEqual(idsAndTitles(second));
  });

  it("returns the same course for a given assignment across repeated lookups", () => {
    const lookupOne = findAssignmentById(202);
    const lookupTwo = findAssignmentById(202);

    expect(lookupOne.course).toEqual(lookupTwo.course);
    expect(lookupOne.assignment).toEqual(lookupTwo.assignment);
  });
});
