
const {
    getCourses,
    getAssignments,
    getAssignmentById,
} = require("../services/dummyCanvasService");

describe("Dummy Canvas Service", () => {

    test("returns all simulated courses", () => {
        const courses = getCourses();

        expect(courses).toHaveLength(3);
    });

    test("returns all simulated assignments", () => {
        const assignments = getAssignments();

        expect(assignments).toHaveLength(5);
    });

    test("retrieves assignments by course ID", () => {
        const assignments = getAssignments(1);

        expect(assignments).toHaveLength(2);
    });

    test("retrieves an assignment by ID", () => {
        const assignment = getAssignmentById(101);

        expect(assignment).toBeDefined();
        expect(assignment.title).toBe("Sprint 3 Report");
        expect(assignment.points).toBe(100);
    });

    test("returns null for nonexistent assignments", () => {
        const assignment = getAssignmentById(999);

        expect(assignment).toBeNull();
    });


    test("each course has valid data and associated assignments", () => {
        const courses = getCourses();

        courses.forEach((course) => {
            expect(course.id).toBeDefined();
            expect(typeof course.name).toBe("string");
            expect(course.name.length).toBeGreaterThan(0);
            expect(Array.isArray(course.assignments)).toBe(true);

            const assignments = getAssignments(course.id);

            expect(assignments).toEqual(course.assignments);
        });
    });


    test("assignments contain valid data and course references", () => {
        const courses = getCourses();
        const assignments = getAssignments();

        assignments.forEach((assignment) => {
            // Verify required assignment fields
            expect(assignment.id).toBeDefined();
            expect(typeof assignment.title).toBe("string");
            expect(assignment.title.trim().length).toBeGreaterThan(0);
            expect(assignment.dueDate).toBeDefined();
            expect(Number.isNaN(new Date(assignment.dueDate).getTime())).toBe(false);
            expect(typeof assignment.points).toBe("number");

            // Verify assignment belongs to an existing course
            const course = courses.find(
                (course) => course.id === assignment.courseId
            );

            expect(course).toBeDefined();
            expect(course.assignments).toContainEqual(assignment);
        });
    });

});