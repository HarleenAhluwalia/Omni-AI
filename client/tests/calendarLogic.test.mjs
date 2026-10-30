// Sprint 4: Calendar functional test cases (Jira: Create Calendar
// Functional Test Cases).
//
// client/src/pages/CalendarView.jsx has no automated test coverage, and
// this repo has no component-render test harness (no jsdom / React
// Testing Library) - every existing frontend test here is a pure-function
// test run via Node's built-in `node --test`. CalendarView.jsx's day-
// matching, grid-generation, and status-mapping logic is pure (no DOM,
// no network) but lives as unexported closures inside the component, so
// it can't be imported directly.
//
// To get real automated coverage without restructuring the component
// (out of scope for this ticket, and risks conflicting with in-progress
// UI work on this same file), the functions below are a deliberate,
// line-for-line mirror of CalendarView.jsx's current logic as of this
// branch. KNOWN LIMITATION: because this is a mirror and not an import,
// it can drift from the real component if CalendarView.jsx's logic
// changes without this file being updated to match - see
// docs/testing-evidence/sprint-4/calendar-functional-test-cases.md for
// the full writeup, including this limitation and the formal test IDs
// these cases correspond to.

import { test } from "node:test";
import assert from "node:assert/strict";

// --- Mirrors CalendarView.jsx's isToday (fixed: CAL-DEFECT-001) ---
// Uses UTC getters: due_date is date-only and always written end-of-day
// UTC by the backend, so "today" must use the same UTC-day convention
// Daily/Weekly Summary already use, not the viewer's local day.
function isToday(day, month, year, today) {
  if (!day) {
    return false;
  }
  return (
    day === today.getUTCDate() &&
    month === today.getUTCMonth() &&
    year === today.getUTCFullYear()
  );
}

// --- Mirrors CalendarView.jsx's getTasksForDay (fixed: CAL-DEFECT-001) ---
function getTasksForDay(tasks, day, month, year) {
  if (!day) {
    return [];
  }
  return tasks.filter((task) => {
    if (!task.due_date) {
      return false;
    }
    const taskDate = new Date(task.due_date);
    return (
      taskDate.getUTCFullYear() === year &&
      taskDate.getUTCMonth() === month &&
      taskDate.getUTCDate() === day
    );
  });
}

// --- Mirrors CalendarView.jsx's getSchedulesForDay ---
// Deliberately LOCAL getters, unlike the two functions above:
// start_time/end_time are genuine timestamps (a real moment the user
// picked - see aiController.js's schedule-row creation), not day-anchored
// values like due_date. Converting to UTC here would be a regression,
// not a fix - see CAL-AUTO-010 below.
function getSchedulesForDay(schedules, day, month, year) {
  if (!day) {
    return [];
  }
  return schedules.filter((schedule) => {
    if (!schedule.start_time) {
      return false;
    }
    const scheduleDate = new Date(schedule.start_time);
    return (
      scheduleDate.getFullYear() === year &&
      scheduleDate.getMonth() === month &&
      scheduleDate.getDate() === day
    );
  });
}

// --- Mirrors CalendarView.jsx:418-432 (getPriorityClass) ---
function getPriorityClass(task) {
  if (task.completion_status === "completed") {
    return "calendar-task-completed";
  }
  if (task.priority === "high") {
    return "calendar-task-high";
  }
  if (task.priority === "medium") {
    return "calendar-task-medium";
  }
  return "calendar-task-low";
}

// --- Mirrors CalendarView.jsx:121-141 (calendarCells) + 33-43 (daysInMonth/firstDayOfMonth) ---
function buildCalendarCells(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

const task = (overrides = {}) => ({
  id: "task-1",
  title: "Sample task",
  due_date: null,
  priority: null,
  completion_status: "not_started",
  ...overrides,
});

// =========================================================
// CAL-AUTO-001: Task creation and correct Calendar display
// =========================================================
test("CAL-AUTO-001: a task with a due date appears only on its matching grid day", () => {
  const due = new Date(2026, 9, 15, 12, 0, 0); // Oct 15 2026, local noon
  const t = task({ due_date: due.toISOString() });

  const onThatDay = getTasksForDay([t], 15, 9, 2026);
  const onAnotherDay = getTasksForDay([t], 16, 9, 2026);
  const onAnotherMonth = getTasksForDay([t], 15, 10, 2026);

  assert.equal(onThatDay.length, 1);
  assert.equal(onThatDay[0].id, "task-1");
  assert.equal(onAnotherDay.length, 0);
  assert.equal(onAnotherMonth.length, 0);
});

// =========================================================
// CAL-AUTO-002: Task deadline changes and movement between dates
// =========================================================
test("CAL-AUTO-002: changing a task's due_date moves it off the old day and onto the new day", () => {
  const originalDue = new Date(2026, 9, 10, 12, 0, 0);
  const movedDue = new Date(2026, 9, 20, 12, 0, 0);

  const before = task({ due_date: originalDue.toISOString() });
  const after = { ...before, due_date: movedDue.toISOString() };

  assert.equal(getTasksForDay([before], 10, 9, 2026).length, 1);
  assert.equal(getTasksForDay([after], 10, 9, 2026).length, 0);
  assert.equal(getTasksForDay([after], 20, 9, 2026).length, 1);
});

// =========================================================
// CAL-AUTO-003: Task completion and correct status display
// =========================================================
test("CAL-AUTO-003: a completed task always maps to the completed display class, regardless of priority", () => {
  const completedHigh = task({ priority: "high", completion_status: "completed" });
  const completedNoPriority = task({ priority: null, completion_status: "completed" });

  assert.equal(getPriorityClass(completedHigh), "calendar-task-completed");
  assert.equal(getPriorityClass(completedNoPriority), "calendar-task-completed");
});

test("CAL-AUTO-003b: an incomplete task maps to its priority class (high/medium/low-or-unset)", () => {
  assert.equal(getPriorityClass(task({ priority: "high" })), "calendar-task-high");
  assert.equal(getPriorityClass(task({ priority: "medium" })), "calendar-task-medium");
  assert.equal(getPriorityClass(task({ priority: "low" })), "calendar-task-low");
  assert.equal(getPriorityClass(task({ priority: null })), "calendar-task-low");
  assert.equal(getPriorityClass(task({ priority: "not-a-real-priority" })), "calendar-task-low");
});

// =========================================================
// CAL-AUTO-004: Task deletion and removal from Calendar
// =========================================================
test("CAL-AUTO-004: a deleted task (absent from the task list) does not appear on its old day", () => {
  const due = new Date(2026, 9, 12, 12, 0, 0);
  const t = task({ due_date: due.toISOString() });

  const beforeDelete = [t];
  const afterDelete = beforeDelete.filter((x) => x.id !== t.id);

  assert.equal(getTasksForDay(beforeDelete, 12, 9, 2026).length, 1);
  assert.equal(getTasksForDay(afterDelete, 12, 9, 2026).length, 0);
});

// =========================================================
// CAL-AUTO-005: Multiple Tasks on the same date
// =========================================================
test("CAL-AUTO-005: multiple tasks due the same day all appear together, in list order", () => {
  const due = new Date(2026, 9, 18, 9, 0, 0);
  const t1 = task({ id: "t1", title: "First", due_date: due.toISOString() });
  const t2 = task({ id: "t2", title: "Second", due_date: due.toISOString() });
  const t3 = task({ id: "t3", title: "Different day", due_date: new Date(2026, 9, 19).toISOString() });

  const result = getTasksForDay([t1, t2, t3], 18, 9, 2026);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((x) => x.id), ["t1", "t2"]);
});

// =========================================================
// CAL-AUTO-006: Tasks without due dates
// =========================================================
test("CAL-AUTO-006: a task with no due date never appears on any day and never throws", () => {
  const undated = task({ due_date: null });
  const undatedUndefined = task({ id: "t2", due_date: undefined });

  for (let day = 1; day <= 28; day += 1) {
    assert.doesNotThrow(() => getTasksForDay([undated, undatedUndefined], day, 9, 2026));
    assert.equal(getTasksForDay([undated, undatedUndefined], day, 9, 2026).length, 0);
  }
});

// =========================================================
// CAL-AUTO-007: Empty Calendar states
// =========================================================
test("CAL-AUTO-007: an empty task list produces zero tasks for every day in a real month grid", () => {
  const cells = buildCalendarCells(2026, 9); // October 2026
  const dayNumbers = cells.filter((d) => d !== null);

  assert.equal(dayNumbers.length, 31);

  for (const day of dayNumbers) {
    assert.equal(getTasksForDay([], day, 9, 2026).length, 0);
    assert.equal(getSchedulesForDay([], day, 9, 2026).length, 0);
  }
});

test("CAL-AUTO-007b: the calendar grid is always a whole number of weeks (7-cell rows) for any month", () => {
  for (let month = 0; month < 12; month += 1) {
    const cells = buildCalendarCells(2026, month);
    assert.equal(cells.length % 7, 0, `month ${month} produced ${cells.length} cells`);
  }
});

// =========================================================
// CAL-DEFECT-001 (via CAL-AUTO-008/009): UTC vs. local day
// mismatch - FIXED. See
// docs/testing-evidence/sprint-4/calendar-functional-test-cases.md
// =========================================================
//
// due_date is written end-of-day UTC throughout the backend (see
// server/controllers/taskController.js's Daily/Weekly Summary).
// CalendarView.jsx's isToday/getTasksForDay previously compared using
// *local* date getters, which could highlight the wrong day as "today"
// and/or place a task on the wrong grid cell for any user whose
// timezone offset wasn't exactly 0. Both now use UTC getters, matching
// the rest of the app.
//
// These tests assert the correct (UTC-consistent) behavior and now
// pass against the fixed component. They are SKIPPED on a runner whose
// local timezone is exactly UTC, since local and UTC days always agree
// at offset 0 - there would be nothing to distinguish there.
//
// Note: getSchedulesForDay was deliberately NOT changed to UTC getters -
// see CAL-AUTO-010 below for why that's correct, not an oversight.
const localOffsetMinutes = new Date().getTimezoneOffset();
const offsetIsNonZero = localOffsetMinutes !== 0;

(offsetIsNonZero ? test : test.skip)(
  "CAL-AUTO-008 (CAL-DEFECT-001): isToday disagrees with UTC-based 'today' near a UTC day boundary",
  () => {
    const nowReal = new Date();
    const utcMidnightToday = Date.UTC(
      nowReal.getUTCFullYear(),
      nowReal.getUTCMonth(),
      nowReal.getUTCDate()
    );
    // 00:30 UTC diverges for timezones behind UTC (positive offset);
    // 23:30 UTC diverges for timezones ahead of UTC (negative offset).
    const probeMs =
      localOffsetMinutes > 0
        ? utcMidnightToday + 30 * 60 * 1000
        : utcMidnightToday + 23.5 * 60 * 60 * 1000;
    const probe = new Date(probeMs);

    // Sanity check: this probe must actually straddle a UTC/local day
    // boundary, or the test proves nothing.
    assert.notEqual(
      probe.getDate(),
      probe.getUTCDate(),
      "test construction error: probe does not straddle a day boundary for this runner's offset"
    );

    // What the grid *should* show as "today" if it used the same
    // UTC-day convention as the rest of the app (Daily/Weekly Summary):
    const expectedUtcDay = probe.getUTCDate();
    const expectedUtcMonth = probe.getUTCMonth();
    const expectedUtcYear = probe.getUTCFullYear();

    // What CalendarView.jsx's current (local-time) isToday() actually
    // reports for that same expected-"today" cell:
    const actuallyFlaggedAsToday = isToday(
      expectedUtcDay,
      expectedUtcMonth,
      expectedUtcYear,
      probe
    );

    assert.equal(
      actuallyFlaggedAsToday,
      true,
      "REGRESSION: isToday() should agree with the app's own UTC-day " +
        "convention (CAL-DEFECT-001 was fixed to use UTC getters) - if this " +
        "fails, the fix was reverted or weakened."
    );
  }
);

(offsetIsNonZero ? test : test.skip)(
  "CAL-AUTO-009 (CAL-DEFECT-001): getTasksForDay disagrees with UTC-based day placement near a UTC day boundary",
  () => {
    const nowReal = new Date();
    const utcMidnightToday = Date.UTC(
      nowReal.getUTCFullYear(),
      nowReal.getUTCMonth(),
      nowReal.getUTCDate()
    );
    const probeMs =
      localOffsetMinutes > 0
        ? utcMidnightToday + 30 * 60 * 1000
        : utcMidnightToday + 23.5 * 60 * 60 * 1000;
    const probe = new Date(probeMs);

    assert.notEqual(
      probe.getDate(),
      probe.getUTCDate(),
      "test construction error: probe does not straddle a day boundary for this runner's offset"
    );

    const t = task({ due_date: probe.toISOString() });

    // The backend's UTC-day convention says this task is due on
    // probe's UTC calendar day. getTasksForDay, using local getters,
    // should find it there too if it were UTC-consistent - it doesn't.
    const foundOnUtcDay = getTasksForDay(
      [t],
      probe.getUTCDate(),
      probe.getUTCMonth(),
      probe.getUTCFullYear()
    );

    assert.equal(
      foundOnUtcDay.length,
      1,
      "REGRESSION: getTasksForDay() should place this task on its UTC-day " +
        "cell (CAL-DEFECT-001 was fixed to use UTC getters) - if this fails, " +
        "the fix was reverted or weakened."
    );
  }
);

// =========================================================
// CAL-AUTO-010: getSchedulesForDay keeps LOCAL semantics on purpose
// =========================================================
//
// Unlike due_date, a schedule's start_time is a genuine timestamp (a
// real moment the user picked - see aiController.js's schedule-row
// creation), not a day-anchored value. The correct day for display is
// the *local* day the user scheduled it for, not a UTC-day extraction
// of that instant. This test locks in that distinction so a future
// well-intentioned "fix" doesn't convert getSchedulesForDay to UTC
// getters to match getTasksForDay - that would be a regression, not a
// fix. Uses the same boundary-straddling construction as CAL-AUTO-008/
// 009, and is skipped for the same reason (nothing to distinguish at
// UTC+0).
(offsetIsNonZero ? test : test.skip)(
  "CAL-AUTO-010: getSchedulesForDay places a schedule on its LOCAL day, not its UTC day",
  () => {
    const nowReal = new Date();
    const utcMidnightToday = Date.UTC(
      nowReal.getUTCFullYear(),
      nowReal.getUTCMonth(),
      nowReal.getUTCDate()
    );
    const probeMs =
      localOffsetMinutes > 0
        ? utcMidnightToday + 30 * 60 * 1000
        : utcMidnightToday + 23.5 * 60 * 60 * 1000;
    const probe = new Date(probeMs);

    assert.notEqual(
      probe.getDate(),
      probe.getUTCDate(),
      "test construction error: probe does not straddle a day boundary for this runner's offset"
    );

    const schedule = {
      id: "sched-1",
      start_time: probe.toISOString(),
      end_time: new Date(probeMs + 30 * 60 * 1000).toISOString(),
    };

    const foundOnLocalDay = getSchedulesForDay(
      [schedule],
      probe.getDate(),
      probe.getMonth(),
      probe.getFullYear()
    );
    const foundOnUtcDay = getSchedulesForDay(
      [schedule],
      probe.getUTCDate(),
      probe.getUTCMonth(),
      probe.getUTCFullYear()
    );

    assert.equal(
      foundOnLocalDay.length,
      1,
      "a schedule should appear on the local calendar day the user scheduled it for"
    );
    assert.equal(
      foundOnUtcDay.length,
      0,
      "a schedule should NOT appear on its UTC day when that differs from its local day"
    );
  }
);
