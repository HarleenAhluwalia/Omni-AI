import assert from "node:assert/strict";
import test from "node:test";

import {
  paginateTasks,
  getTotalPages,
} from "../src/utils/taskPagination.js";

test(
  "Dashboard shows five prioritized tasks per page",
  () => {
    const prioritizedTasks = [
      { id: 1, title: "Priority 1", score: 100 },
      { id: 2, title: "Priority 2", score: 95 },
      { id: 3, title: "Priority 3", score: 90 },
      { id: 4, title: "Priority 4", score: 85 },
      { id: 5, title: "Priority 5", score: 80 },
      { id: 6, title: "Priority 6", score: 75 },
      { id: 7, title: "Priority 7", score: 70 },
      { id: 8, title: "Priority 8", score: 65 },
      { id: 9, title: "Priority 9", score: 60 },
      { id: 10, title: "Priority 10", score: 55 },
      { id: 11, title: "Priority 11", score: 50 },
    ];

    const firstPage = paginateTasks(
      prioritizedTasks,
      1,
      5
    );

    const secondPage = paginateTasks(
      prioritizedTasks,
      2,
      5
    );

    const thirdPage = paginateTasks(
      prioritizedTasks,
      3,
      5
    );

    assert.equal(firstPage.length, 5);
    assert.equal(secondPage.length, 5);
    assert.equal(thirdPage.length, 1);

    assert.equal(
      firstPage[0].title,
      "Priority 1"
    );

    assert.equal(
      secondPage[0].title,
      "Priority 6"
    );

    assert.equal(
      thirdPage[0].title,
      "Priority 11"
    );
  }
);

test(
  "Pagination preserves backend prioritized order",
  () => {
    const backendOrder = [
      { id: 1, title: "Highest" },
      { id: 2, title: "Second" },
      { id: 3, title: "Third" },
      { id: 4, title: "Fourth" },
      { id: 5, title: "Fifth" },
      { id: 6, title: "Sixth" },
    ];

    const pageOne = paginateTasks(
      backendOrder,
      1,
      5
    );

    assert.deepEqual(
      pageOne.map((task) => task.title),
      [
        "Highest",
        "Second",
        "Third",
        "Fourth",
        "Fifth",
      ]
    );
  }
);

test(
  "Eleven tasks create three pages",
  () => {
    assert.equal(
      getTotalPages(11, 5),
      3
    );
  }
);

test(
  "Five or fewer tasks stay on one page",
  () => {
    assert.equal(
      getTotalPages(5, 5),
      1
    );

    assert.equal(
      getTotalPages(3, 5),
      1
    );
  }
);