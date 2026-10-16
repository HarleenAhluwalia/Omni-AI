
const {
    getAssignmentsFromCourses,
} = require("../services/dummyCanvasService");

describe("Dummy Canvas Empty Course Tests", () => {
    test("returns an empty array for a course with no assignments", () => {
        const courses = [
            {
                id: 10,
                name: "Empty Test Course",
                assignments: [],
            },
            {
                id: 11,
                name: "Course With Assignments",
                assignments: [
                    {
                        id: 1101,
                        courseId: 11,
                        title: "Test Assignment",
                        dueDate: "2026-10-20",
                        points: 50,
                        locked: false,
                    },
                ],
            },
        ];

        const result = getAssignmentsFromCourses(
            courses,
            10
        );

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
    });
});
