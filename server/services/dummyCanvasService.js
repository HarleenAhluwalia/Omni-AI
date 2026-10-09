
// Simulated Canvas course and assignment data.
// No real Canvas API connection is required.

const mockCourses = [
    {
        id: 1,
        name: "CPSC 491 - Computer Science",
        assignments: [
            {
                id: 101,
                courseId: 1,
                title: "Sprint 3 Report",
                dueDate: "2026-10-12",
                points: 100,
                locked: false,
            },
            {
                id: 102,
                courseId: 1,
                title: "Frontend Implementation",
                dueDate: "2026-10-15",
                points: 50,
                locked: false,
            },
        ],
    },
    {
        id: 2,
        name: "Marketing 351",
        assignments: [
            {
                id: 201,
                courseId: 2,
                title: "Marketing Homework",
                dueDate: "2026-10-18",
                points: 25,
                locked: false,
            },
            {
                id: 202,
                courseId: 2,
                title: "Marketing Presentation",
                dueDate: "2026-10-22",
                points: 100,
                locked: false,
            },
        ],
    },
    {
        id: 3,
        name: "ART 101",
        assignments: [
            {
                id: 301,
                courseId: 3,
                title: "Art Homework",
                dueDate: "2026-10-20",
                points: 20,
                locked: true,
            },
        ],
    },
];

// Return available courses.
const getCourses = () => {
    return mockCourses;
};

// Return assignments, optionally filtered by course.
const getAssignments = (courseId = null) => {
    const courses = courseId === null
        ? mockCourses
        : mockCourses.filter(
            (course) => course.id === Number(courseId)
        );

    return courses.flatMap(
        (course) => course.assignments
    );
};

// Find an assignment by ID.
const getAssignmentById = (assignmentId) => {
    return getAssignments().find(
        (assignment) =>
            assignment.id === Number(assignmentId)
    ) || null;
};

module.exports = {
    getCourses,
    getAssignments,
    getAssignmentById,
};