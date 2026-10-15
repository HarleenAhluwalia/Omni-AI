
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canvasImportPayload,
  canvasResultCounts,
  canvasRequest,
  importableAssignmentPairs,
} from "../src/api/canvasApi.js";

const SAMPLE_COURSES = [
  {
    id: 1,
    name: "CPSC 491",
    assignments: [
      { id: 101, title: "Sprint 3 Report", locked: false },
      { id: 102, title: "Frontend Implementation", locked: false },
    ],
  },
  {
    id: 2,
    name: "Marketing 351",
    assignments: [
      { id: 101, title: "Marketing Homework", locked: false },
      { id: 202, title: "Marketing Presentation", locked: false },
    ],
  },
  {
    id: 3,
    name: "ART 101",
    assignments: [
      { id: 401, title: "Final Project (Locked)", locked: true },
    ],
  },
];

test("importableAssignmentPairs returns an empty array when every assignment is locked", () => {
  const allLockedCourses = [
    {
      id: 3,
      name: "ART 101",
      assignments: [
        { id: 401, title: "Final Project (Locked)", locked: true },
      ],
    },
  ];

  assert.deepEqual(importableAssignmentPairs(allLockedCourses), []);
});

test("importableAssignmentPairs collects course/assignment pairs across courses, excluding locked ones", () => {
  const pairs = importableAssignmentPairs(SAMPLE_COURSES);

  assert.deepEqual(pairs, [
    { course_id: 1, assignment_id: 101 },
    { course_id: 1, assignment_id: 102 },
    { course_id: 2, assignment_id: 101 },
    { course_id: 2, assignment_id: 202 },
  ]);
});

test("importableAssignmentPairs keeps the same assignment id from two different courses distinct", () => {
  const pairs = importableAssignmentPairs(SAMPLE_COURSES);
  const idsOnly = pairs.filter((pair) => pair.assignment_id === 101);

  assert.equal(idsOnly.length, 2);
  assert.deepEqual(
    idsOnly.map((pair) => pair.course_id).sort(),
    [1, 2]
  );
});

test("importableAssignmentPairs feeding into canvasImportPayload does not incorrectly deduplicate cross-course ids", () => {
  const payload = canvasImportPayload(
    importableAssignmentPairs(SAMPLE_COURSES)
  );

  assert.equal(payload.assignments.length, 4);
  assert.deepEqual(
    payload.assignments.filter((a) => a.assignment_id === 101),
    [
      { course_id: 1, assignment_id: 101 },
      { course_id: 2, assignment_id: 101 },
    ]
  );
});

test("a single-assignment import builds the correct course-aware payload", () => {
  const course = SAMPLE_COURSES[1];
  const assignment = course.assignments[0];

  const payload = canvasImportPayload([
    { course_id: course.id, assignment_id: assignment.id },
  ]);

  assert.deepEqual(payload, {
    assignments: [{ course_id: 2, assignment_id: 101 }],
  });
});

test("course-aware import deduplicates", () => {
  const result = canvasImportPayload([
    { course_id: 1, assignment_id: 101 },
    { course_id: 1, assignment_id: 101 },
    { course_id: 2, assignment_id: 101 },
  ]);

  assert.equal(result.assignments.length, 2);
});

test("rejects empty imports", () => {
  assert.throws(
    () => canvasImportPayload([]),
    /No assignments/
  );
});

test("four result buckets", () => {
  assert.deepEqual(
    canvasResultCounts({
      imported: [{}],
      skipped: [{}, {}],
      failed: [],
    }),
    {
      imported: 1,
      updated: 0,
      skipped: 2,
      failed: 0,
    }
  );
});

test("request uses auth and correct endpoint", async () => {
  let req;

  await canvasRequest(
    "http://localhost:4000/api",
    "jwt",
    "/canvas/import",
    {
      method: "POST",
      body: JSON.stringify({
        assignment_ids: [101],
      }),
    },
    async (url, opts) => {
      req = { url, opts };

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            imported: [{}],
          },
        }),
      };
    }
  );

  assert.equal(
    req.url,
    "http://localhost:4000/api/canvas/import"
  );

  assert.equal(
    req.opts.headers.Authorization,
    "Bearer jwt"
  );
});

test("failed request propagates error", async () => {
  await assert.rejects(
    canvasRequest(
      "http://localhost:4000/api",
      "jwt",
      "/canvas/import",
      {},
      async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          error: "offline",
        }),
      })
    ),
    /offline/
  );
});
