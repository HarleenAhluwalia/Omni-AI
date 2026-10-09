// Mock Canvas course/assignment catalog for Sprint 3 synchronization.
//
// This is a backend-owned copy of the same courses/assignments Harleen's
// standalone dummy-canvas/src/App.jsx displays. It is deliberately a
// separate data source rather than importing from dummy-canvas/ at
// runtime - that app is its own Vite project with no API surface, and
// per the PR 1 scope, dummy-canvas/ is owned by Harleen and not edited
// here.
//
// Staying consistent: course ids (1, 2, 3) and the five assignment ids
// that exist in dummy-canvas/src/App.jsx (101, 102, 201, 202, 301), plus
// their titles/due dates/points, are copied verbatim from that file. If
// dummy-canvas/src/App.jsx's mock data changes, this file should be
// updated to match in the same PR - there is no automated sync between
// the two Vite apps, so this is a manual-parity contract, not a shared
// module. One additional assignment (id 401) exists only here, to
// exercise locked-assignment handling, since dummy-canvas has no locked
// concept yet.
//
// Pure data + pure lookup functions only - no HTTP, no database access,
// no Task-field mapping. A later PR's synchronization engine is
// responsible for turning what this module returns into Task rows.

const MOCK_COURSES = [
  {
    id: 1,
    name: "CPSC 491 - Computer Science",
    assignments: [
      {
        id: 101,
        title: "Sprint 3 Report",
        dueDate: "2026-10-12",
        points: 100,
        locked: false,
      },
      {
        id: 102,
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
        title: "Marketing Homework",
        dueDate: "2026-10-18",
        points: 25,
        locked: false,
      },
      {
        id: 202,
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
        title: "Art Homework",
        dueDate: "2026-10-20",
        points: 20,
        locked: false,
      },
      // Locked fixture: Canvas shows the assignment exists (it has a
      // title) but has not released its due date or point value yet.
      // dueDate/points are explicitly null here rather than guessed -
      // this is the primary fixture locked-assignment tests exercise.
      {
        id: 401,
        title: "Final Project (Locked)",
        dueDate: null,
        points: null,
        locked: true,
      },
    ],
  },
];

// Returns the full course/assignment catalog. Deep-cloned on every call so
// callers can never mutate the shared in-memory catalog - this module's
// state is process-wide (shared across every request/user), so a caller
// accidentally mutating a returned object would corrupt it for everyone.
const listCourses = () => JSON.parse(JSON.stringify(MOCK_COURSES));

// Locates an assignment by id across all courses. Returns a cloned
// { course, assignment } pair (course has its own `assignments` list
// trimmed off, to avoid handing back a duplicate of the whole catalog),
// or null if no assignment with that id exists anywhere in the catalog.
const findAssignmentById = (assignmentId) => {
  const numericId = Number(assignmentId);

  for (const course of MOCK_COURSES) {
    const assignment = course.assignments.find(
      (candidate) => candidate.id === numericId
    );

    if (assignment) {
      const { assignments, ...courseWithoutAssignments } = course;

      return {
        course: { ...courseWithoutAssignments },
        assignment: { ...assignment },
      };
    }
  }

  return null;
};

// Small, named predicate so callers don't repeat `assignment.locked === true`
// inline - also guards against a missing/undefined `locked` field being
// treated as locked by accident.
const isLocked = (assignment) => assignment?.locked === true;

module.exports = {
  listCourses,
  findAssignmentById,
  isLocked,
};
