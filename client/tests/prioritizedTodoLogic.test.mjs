// Sprint 4: To-Do List functional test cases (Jira: Create To-Do List
// Functional Test Cases).
//
// client/src/pages/PrioritizedTodo.jsx has no automated test coverage of
// its own display/pagination logic, and this repo has no component-render
// test harness (no jsdom / React Testing Library) - every existing
// frontend test here is a pure-function test run via Node's built-in
// `node --test`. PrioritizedTodo.jsx's formatting, status-mapping, and
// pagination logic is pure (no DOM, no network) but lives as unexported
// closures inside the component, so it can't be imported directly.
//
// Same approach as client/tests/calendarLogic.test.mjs: a line-referenced
// mirror of PrioritizedTodo.jsx's current logic, tested in isolation.
// KNOWN LIMITATION: because this is a mirror and not an import, it can
// drift from the real component if PrioritizedTodo.jsx's logic changes
// without this file being updated to match - see
// docs/testing-evidence/sprint-4/todo-functional-test-cases.md for the
// full writeup, including this limitation and the formal test IDs these
// cases correspond to.
//
// PRE-EXISTING FINDING: client/tests/prioritizedTodo.test.mjs tests
// client/src/utils/taskPagination.js (default page size 5), but
// PrioritizedTodo.jsx never imports that module - it has its own inline
// pagination with TASKS_PER_PAGE = 10 (confirmed unchanged via `git log`
// across the file's whole history). That existing suite has never
// actually exercised the real component's pagination. This file tests
// the real page size (10), not 5, and does not touch the old suite.

import { test } from "node:test";
import assert from "node:assert/strict";

// --- Mirrors PrioritizedTodo.jsx:11 ---
const TASKS_PER_PAGE = 10;

// --- Mirrors PrioritizedTodo.jsx:217-228 (formatPriority) ---
function formatPriority(priority) {
  if (!priority) {
    return "Not set";
  }
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

// --- Mirrors PrioritizedTodo.jsx's formatDueDate (fixed: TODO-DEFECT-001) ---
// due_date is date-only and always written end-of-day UTC by the
// backend, so timeZone: "UTC" is pinned here, matching the fixed
// component - the UTC day is the intended day regardless of the
// viewer's own timezone. See TODO-AUTO-012 below for the regression
// test and the pre-fix behavior it guards against.
function formatDueDate(dueDate) {
  if (!dueDate) {
    return "No due date";
  }
  return new Date(dueDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// --- Mirrors PrioritizedTodo.jsx:246-253 (getScheduleForTask) ---
function getScheduleForTask(schedules, taskId) {
  return schedules.find((schedule) => schedule.task_id === taskId);
}

// --- Mirrors PrioritizedTodo.jsx:297-318 (getStatusClass) ---
function getStatusClass(task) {
  if (task.completion_status === "completed") {
    return "todo-row-completed";
  }
  if (task.priority === "high") {
    return "todo-row-high";
  }
  if (task.priority === "medium") {
    return "todo-row-medium";
  }
  return "todo-row-low";
}

// --- Mirrors PrioritizedTodo.jsx:321-328 (handleComplete's toggle logic) ---
function nextCompletionStatus(currentStatus) {
  return currentStatus === "completed" ? "not_started" : "completed";
}

// --- Mirrors PrioritizedTodo.jsx:197-214 (visibleTasks / totalPages) ---
function paginate(tasks, currentPage) {
  const start = (currentPage - 1) * TASKS_PER_PAGE;
  return tasks.slice(start, start + TASKS_PER_PAGE);
}

function totalPages(taskCount) {
  return Math.max(1, Math.ceil(taskCount / TASKS_PER_PAGE));
}

const task = (overrides = {}) => ({
  id: "task-1",
  title: "Sample task",
  description: null,
  due_date: null,
  priority: null,
  point_value: null,
  estimated_effort_minutes: null,
  completion_status: "not_started",
  ...overrides,
});

const makeTasks = (count) =>
  Array.from({ length: count }, (_, i) => task({ id: `t${i + 1}`, title: `Task ${i + 1}` }));

// =========================================================
// TODO-AUTO-001: Task Creation - new task row maps all fields correctly
// =========================================================
test("TODO-AUTO-001: a newly created task's fields format correctly for display", () => {
  const t = task({
    title: "Write report",
    due_date: "2026-10-15T23:59:59.000Z",
    priority: "high",
    completion_status: "not_started",
  });

  assert.equal(t.title, "Write report");
  assert.equal(formatPriority(t.priority), "High");
  assert.equal(formatDueDate(t.due_date), "Oct 15");
  assert.equal(getStatusClass(t), "todo-row-high");
});

// =========================================================
// TODO-AUTO-002: Task Editing - changed fields reflect; unrelated task
// in the list is untouched
// =========================================================
test("TODO-AUTO-002: editing one task's priority does not affect another task in the same list", () => {
  const t1 = task({ id: "t1", title: "Task One", priority: "low" });
  const t2 = task({ id: "t2", title: "Task Two", priority: "medium" });
  const list = [t1, t2];

  const edited = list.map((t) => (t.id === "t1" ? { ...t, priority: "high" } : t));

  assert.equal(formatPriority(edited[0].priority), "High");
  assert.equal(formatPriority(edited[1].priority), "Medium");
  assert.deepEqual(edited[1], t2, "unrelated task must be byte-for-byte unchanged");
});

// =========================================================
// TODO-AUTO-003: Task Completion - status class and prioritization
// =========================================================
test("TODO-AUTO-003: a completed task always gets the completed status class, regardless of priority", () => {
  assert.equal(
    getStatusClass(task({ priority: "high", completion_status: "completed" })),
    "todo-row-completed"
  );
  assert.equal(
    getStatusClass(task({ priority: null, completion_status: "completed" })),
    "todo-row-completed"
  );
});

test("TODO-AUTO-004: completion toggling flips between completed and not_started in both directions", () => {
  assert.equal(nextCompletionStatus("not_started"), "completed");
  assert.equal(nextCompletionStatus("in_progress"), "completed");
  assert.equal(nextCompletionStatus("completed"), "not_started");
});

test("TODO-AUTO-005: completion state stays consistent when the same task list is mapped twice (simulated refresh)", () => {
  const list = [task({ id: "t1", completion_status: "completed" }), task({ id: "t2" })];

  const firstPass = list.map((t) => getStatusClass(t));
  const secondPass = list.map((t) => getStatusClass(t));

  assert.deepEqual(firstPass, secondPass);
  assert.equal(firstPass[0], "todo-row-completed");
  assert.equal(firstPass[1], "todo-row-low");
});

// =========================================================
// TODO-AUTO-006: Task Deletion - unrelated tasks unchanged
// =========================================================
test("TODO-AUTO-006: removing one task leaves every other task byte-for-byte unchanged", () => {
  const t1 = task({ id: "t1", title: "Keep me" });
  const t2 = task({ id: "t2", title: "Delete me" });
  const t3 = task({ id: "t3", title: "Keep me too" });
  const before = [t1, t2, t3];

  const after = before.filter((t) => t.id !== "t2");

  assert.equal(after.length, 2);
  assert.deepEqual(after[0], t1);
  assert.deepEqual(after[1], t3);
  assert.equal(after.some((t) => t.id === "t2"), false);
});

// =========================================================
// TODO-AUTO-007/008/009: Prioritization and Pagination (real page size: 10)
// =========================================================
test("TODO-AUTO-007: pagination at the real page size (10) for 0/1/5/6/10/11/25 tasks", () => {
  const cases = [
    { count: 0, page1Length: 0, pages: 1 },
    { count: 1, page1Length: 1, pages: 1 },
    { count: 5, page1Length: 5, pages: 1 },
    { count: 6, page1Length: 6, pages: 1 },
    { count: 10, page1Length: 10, pages: 1 },
    { count: 11, page1Length: 10, pages: 2 },
    { count: 25, page1Length: 10, pages: 3 },
  ];

  for (const { count, page1Length, pages } of cases) {
    const tasks = makeTasks(count);
    assert.equal(paginate(tasks, 1).length, page1Length, `count=${count} page 1 length`);
    assert.equal(totalPages(count), pages, `count=${count} total pages`);
  }
});

test("TODO-AUTO-008: pagination preserves backend-returned order, including across page boundaries", () => {
  const tasks = makeTasks(11); // backend order: Task 1 .. Task 11
  const page1 = paginate(tasks, 1);
  const page2 = paginate(tasks, 2);

  assert.deepEqual(page1.map((t) => t.title), Array.from({ length: 10 }, (_, i) => `Task ${i + 1}`));
  assert.deepEqual(page2.map((t) => t.title), ["Task 11"]);
});

test("TODO-AUTO-009: total pages recompute correctly after simulated creation and deletion", () => {
  let tasks = makeTasks(10);
  assert.equal(totalPages(tasks.length), 1);

  tasks = [...tasks, task({ id: "t11", title: "Task 11" })]; // creation
  assert.equal(totalPages(tasks.length), 2);

  tasks = tasks.filter((t) => t.id !== "t11"); // deletion
  assert.equal(totalPages(tasks.length), 1);
});

// =========================================================
// TODO-AUTO-010/011: Edge cases
// =========================================================
test("TODO-AUTO-010: an empty task list produces zero visible tasks but never zero pages", () => {
  assert.equal(paginate([], 1).length, 0);
  assert.equal(totalPages(0), 1);
});

test("TODO-AUTO-011: a task with every optional field missing formats safely and never throws", () => {
  const bare = task({
    priority: null,
    due_date: null,
    description: null,
    point_value: null,
    estimated_effort_minutes: null,
  });

  assert.doesNotThrow(() => {
    formatPriority(bare.priority);
    formatDueDate(bare.due_date);
    getScheduleForTask([], bare.id);
  });

  assert.equal(formatPriority(bare.priority), "Not set");
  assert.equal(formatDueDate(bare.due_date), "No due date");
  assert.equal(getScheduleForTask([], bare.id), undefined);
  assert.equal(getStatusClass(bare), "todo-row-low");
});

// =========================================================
// TODO-AUTO-012 (TODO-DEFECT-001): formatDueDate UTC-day fix - FIXED
// =========================================================
//
// due_date is always written end-of-day UTC by the backend. formatDueDate
// now pins timeZone: "UTC", so its result is the same regardless of the
// viewer's own timezone. This test asserts that fixed behavior directly,
// then independently confirms (via a raw, un-pinned Intl call, NOT
// through formatDueDate) that the bug this fix addresses was real: an
// ahead-of-UTC viewer's *unpinned* local rendering of the same instant
// lands on the next day. This sanity check is portable and doesn't
// depend on this test runner's own OS timezone (which is behind UTC and
// could not demonstrate the original defect via its own clock).
test("TODO-AUTO-012 (TODO-DEFECT-001): formatDueDate is UTC-pinned and immune to viewer timezone", () => {
  const dueDate = "2026-10-12T23:59:59.000Z"; // intended day: Oct 12

  assert.equal(
    formatDueDate(dueDate),
    "Oct 12",
    "REGRESSION: formatDueDate should always show the UTC-anchored due " +
      "date (TODO-DEFECT-001 was fixed by pinning timeZone: 'UTC') - if " +
      "this fails, the fix was reverted or weakened."
  );

  // Sanity check only - does not call formatDueDate - confirms this due
  // date genuinely does straddle a day boundary for an ahead-of-UTC
  // viewer, i.e. that this scenario would have failed before the fix.
  const unpinnedAsSeenInTokyo = new Date(dueDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo", // UTC+9
  });
  assert.equal(
    unpinnedAsSeenInTokyo,
    "Oct 13",
    "sanity check: confirms TODO-DEFECT-001 was a real, reproducible bug"
  );
});

// =========================================================
// TODO-AUTO-013: Duplicate task IDs in the source list
// =========================================================
test("TODO-AUTO-013: duplicate task IDs don't crash lookup logic (list rendering risk is a manual/UI concern - see TODO-MAN-011)", () => {
  const dup1 = task({ id: "dup", title: "First copy" });
  const dup2 = task({ id: "dup", title: "Second copy" });
  const schedules = [{ task_id: "dup", id: "sched-1" }];

  assert.doesNotThrow(() => {
    getScheduleForTask(schedules, dup1.id);
  });
  // find() returns the first match - both copies would resolve to the
  // same schedule, which is correct for this pure lookup; whether React
  // renders both rows correctly with a duplicate `key` is a DOM concern
  // this test can't exercise, see TODO-MAN-011.
  assert.deepEqual(getScheduleForTask(schedules, dup2.id), schedules[0]);
});
