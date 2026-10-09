
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

});