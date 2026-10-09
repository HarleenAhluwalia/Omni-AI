
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getNewAssignments,
  getImportSummary,
} from "../src/importUtils.js";

const assignments = [
  { id: 101, title: "Sprint 3 Report" },
  { id: 102, title: "Frontend Implementation" },
  { id: 201, title: "Marketing Homework" },
];

describe("Dummy Canvas import logic", () => {
  it("finds assignments that are not imported", () => {
    const result = getNewAssignments(assignments, [101]);

    assert.deepEqual(
      result.map((task) => task.id),
      [102, 201]
    );
  });

  it("counts new assignments correctly", () => {
    const result = getImportSummary(assignments, [101]);

    assert.equal(result.imported, 2);
    assert.equal(result.skipped, 1);
  });

  it("skips all assignments already imported", () => {
    const result = getImportSummary(
      assignments,
      [101, 102, 201]
    );

    assert.equal(result.imported, 0);
    assert.equal(result.skipped, 3);
  });

  it("handles an empty assignment list", () => {
    const result = getImportSummary([], []);

    assert.equal(result.imported, 0);
    assert.equal(result.skipped, 0);
  });

  it("preserves assignment order", () => {
    const result = getNewAssignments(assignments, []);

    assert.deepEqual(
      result.map((task) => task.id),
      [101, 102, 201]
    );
  });
});
