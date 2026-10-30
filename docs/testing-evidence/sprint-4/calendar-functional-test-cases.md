# Calendar Functional Test Cases

**Jira task:** Create Calendar Functional Test Cases
**PR batch:** PR 1 — Functional Test Development
**Branch:** `sprint4/functional-test-development`
**Component under test:** `client/src/pages/CalendarView.jsx`
**Date:** 2026-10-29 (updated same day — CAL-DEFECT-001 investigated and fixed)

## Scope and approach

`CalendarView.jsx` has no prior automated test coverage, and this repository
has no component-render test harness (no jsdom / React Testing Library) —
every existing frontend test here is a pure-function test run via Node's
built-in `node --test`. This document covers Calendar functionality two
ways:

- **Automated** test cases (`CAL-AUTO-*`), implemented in
  `client/tests/calendarLogic.test.mjs`, for logic that is pure (no DOM, no
  network): day-matching, deadline movement, status mapping, deletion,
  multiple-tasks-per-day, undated tasks, empty-grid structure.
- **Manual** test cases (`CAL-MAN-*`), for anything requiring real
  rendering, user interaction, a live/mocked network failure, or visual
  confirmation — none of which the current tooling can exercise.

### Known limitation: automated tests are mirrors, not imports

`CalendarView.jsx`'s logic (`isToday`, `getTasksForDay`,
`getSchedulesForDay`, `getPriorityClass`, grid-cell generation) lives as
unexported closures inside the component — there is no separate module to
import and test directly, the way `client/src/api/canvasApi.js` is tested
in `canvasApi.test.mjs`. Extracting that logic into a shared module was
considered and deliberately rejected for this ticket: it would restructure
a component outside this ticket's scope and risks conflicting with
in-progress UI work on this same file.

Instead, `calendarLogic.test.mjs` contains a **line-referenced mirror** of
`CalendarView.jsx`'s current logic, tested in isolation. **This mirror can
drift from the real component** if `CalendarView.jsx`'s logic changes
without this test file being updated to match. Anyone changing
`CalendarView.jsx`'s date-matching, grid, or status logic should update
`calendarLogic.test.mjs`'s mirrored copies in the same change, or this
suite will silently stop reflecting reality.

## Defect found during test development: CAL-DEFECT-001 — FIXED

While writing CAL-AUTO-008/009, the test suite confirmed a real,
pre-existing defect in the then-committed code: `isToday` and
`getTasksForDay` compared dates using **local-timezone** getters
(`getDate()`, `getMonth()`, `getFullYear()`), while `due_date` is written
end-of-day **UTC** throughout the backend (see
`server/controllers/taskController.js`'s Daily/Weekly Summary). For any
user whose timezone offset isn't exactly UTC+0, this could highlight the
wrong day as "today" and/or place a Task on the wrong Calendar cell.

### Investigation before fixing

A candidate fix existed in a Git stash from earlier UI work, but it also
converted **`getSchedulesForDay`** to UTC getters. Tracing where schedule
`start_time`/`end_time` actually come from (`server/src/controllers/
aiController.js`'s schedule-row creation, and `resolveSchedule` in
`server/controllers/taskController.js`) showed they are genuine
timestamps — a real moment the user picked, built via plain millisecond
arithmetic, not a day-anchored value like `due_date`. `CalendarView.jsx`'s
own `formatScheduleTime` already displays them with `toLocaleTimeString()`
(local time). Converting `getSchedulesForDay` to UTC getters would have
placed a late-night schedule block on the wrong day for non-UTC users —
the stash's fix was **over-corrected** and was not applied as-is.

### Fix applied

`isToday`, `currentDate`'s initial state, `goToToday`, and
`getTasksForDay` now use UTC getters, matching the rest of the app's
UTC-day convention for date-only values. **`getSchedulesForDay` was left
on local getters** — this is correct, not an oversight, and is now locked
in by CAL-AUTO-010 to prevent a future "fix" from reintroducing the bug
the stash would have caused.

CAL-AUTO-008 and CAL-AUTO-009 assert the *correct* (UTC-consistent)
behavior for `isToday`/`getTasksForDay` and now **pass** against the fixed
component. CAL-AUTO-010 asserts the *correct* (local-consistent) behavior
for `getSchedulesForDay` and also passes. All three are skipped
automatically on a test runner whose local timezone is exactly UTC, since
there is nothing to distinguish there.

---

## Automated test cases

| ID | Scenario area | Summary |
|---|---|---|
| CAL-AUTO-001 | Task creation and correct Calendar display | A task with a due date appears only on its matching grid day |
| CAL-AUTO-002 | Task deadline changes and movement between dates | Changing `due_date` moves a task off the old day and onto the new day |
| CAL-AUTO-003 / 003b | Task completion and correct status display | Completed tasks always get the completed class; incomplete tasks get their priority class |
| CAL-AUTO-004 | Task deletion and removal from Calendar | A task absent from the list no longer appears on its old day |
| CAL-AUTO-005 | Multiple Tasks on the same date | All tasks due the same day appear together |
| CAL-AUTO-006 | Tasks without due dates | An undated task never appears on any day, for any task list, and never throws |
| CAL-AUTO-007 / 007b | Empty Calendar states | An empty task list yields zero tasks on every real day of a month; the grid is always a whole number of weeks |
| CAL-AUTO-008 | (defect regression) | `isToday` vs. the app's UTC-day convention — **CAL-DEFECT-001, fixed** |
| CAL-AUTO-009 | (defect regression) | `getTasksForDay` vs. the app's UTC-day convention — **CAL-DEFECT-001, fixed** |
| CAL-AUTO-010 | (regression guard) | `getSchedulesForDay` correctly stays on LOCAL day semantics |

### CAL-AUTO-001: Task creation and correct Calendar display
- **Prerequisites:** none (pure function test)
- **Steps:** Build a task with `due_date` = Oct 15, 2026 noon local. Call the day-matching logic for (15, Oct, 2026), (16, Oct, 2026), and (15, Nov, 2026).
- **Expected Result:** Task appears only for (15, Oct, 2026); absent from the other two.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### CAL-AUTO-002: Task deadline changes and movement between dates
- **Prerequisites:** none
- **Steps:** Build a task due Oct 10, 2026. Clone it with `due_date` changed to Oct 20, 2026. Check both days before and after the change.
- **Expected Result:** Before the change, task is on Oct 10 only. After, it's on Oct 20 only — Oct 10 is empty.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### CAL-AUTO-003 / 003b: Task completion and correct status display
- **Prerequisites:** none
- **Steps:** Build completed tasks with `priority` = `"high"` and `null`. Build incomplete tasks with `priority` = `"high"`, `"medium"`, `"low"`, `null`, and an invalid string.
- **Expected Result:** Any completed task → `calendar-task-completed`, regardless of priority. Incomplete tasks map to `calendar-task-high` / `-medium` / `-low`; `null` or an unrecognized priority value falls back to `-low` (the component's existing default, not a bug — unset priority is treated as low, same as a genuine "low" selection).
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### CAL-AUTO-004: Task deletion and removal from Calendar
- **Prerequisites:** none
- **Steps:** Build a task due Oct 12, 2026. Check that day. Remove the task from the list (simulating deletion). Check the same day again.
- **Expected Result:** Task present before removal, absent after.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### CAL-AUTO-005: Multiple Tasks on the same date
- **Prerequisites:** none
- **Steps:** Build two tasks due Oct 18, 2026 and one due Oct 19, 2026. Query Oct 18.
- **Expected Result:** Both Oct 18 tasks returned, in their original order; the Oct 19 task excluded.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### CAL-AUTO-006: Tasks without due dates
- **Prerequisites:** none
- **Steps:** Build tasks with `due_date: null` and `due_date: undefined`. Query every day 1–28 of a month.
- **Expected Result:** Neither task appears on any day; no exception is thrown for any day queried.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** Calendar has no "undated tasks" section or indicator — an undated task is simply never shown anywhere on the Calendar. This is existing, intentional-looking behavior (a date-grid UI has nowhere to place an undated item), not something this ticket changes.

### CAL-AUTO-007 / 007b: Empty Calendar states
- **Prerequisites:** none
- **Steps:** Build October 2026's grid with an empty task list and empty schedule list; check every real day. Separately, build grids for all 12 months of 2026 and check cell-count divisibility by 7.
- **Expected Result:** Every day reports zero tasks and zero schedules with no error; every month's grid is a whole number of 7-cell weeks.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### CAL-AUTO-008: `isToday` vs. UTC-day convention (CAL-DEFECT-001)
- **Prerequisites:** test runner's local timezone offset ≠ UTC+0 (auto-skipped otherwise)
- **Steps:** Construct a moment that straddles a UTC-day boundary for the runner's actual offset. Compare `isToday`'s result for the UTC-conventional "today" cell.
- **Expected Result:** `isToday` should agree with the UTC-day convention used elsewhere in the app (`true`).
- **Actual Result (before fix):** `isToday` returned `false` — disagreed with the UTC-day convention.
- **Actual Result (after fix):** `isToday` returns `true` — agrees.
- **Status:** **PASS** (previously FAIL — defect confirmed and fixed, see CAL-DEFECT-001)

### CAL-AUTO-009: `getTasksForDay` vs. UTC-day convention (CAL-DEFECT-001)
- **Prerequisites:** test runner's local timezone offset ≠ UTC+0 (auto-skipped otherwise)
- **Steps:** Build a task due at the same boundary-straddling moment as CAL-AUTO-008. Query its UTC-conventional day.
- **Expected Result:** Task should be found on its UTC-conventional day (length 1).
- **Actual Result (before fix):** Task was not found there (length 0) — disagreed with the UTC-day convention.
- **Actual Result (after fix):** Task is found there (length 1) — agrees.
- **Status:** **PASS** (previously FAIL — defect confirmed and fixed, see CAL-DEFECT-001)

### CAL-AUTO-010: `getSchedulesForDay` keeps LOCAL day semantics (regression guard)
- **Prerequisites:** test runner's local timezone offset ≠ UTC+0 (auto-skipped otherwise)
- **Steps:** Build a schedule block at the same boundary-straddling moment used above. Query both its local day and its UTC day.
- **Expected Result:** Found on its local day (length 1); NOT found on its UTC day when that differs (length 0) — schedules are real timestamps, not day-anchored like `due_date`, so they must stay local.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

---

## Manual test cases

These require a running frontend + backend and real interaction; none can
be exercised by this repo's current automated tooling.

### CAL-MAN-001: End-to-end task creation appears on Calendar
- **Prerequisites:** Backend and frontend running; logged in.
- **Steps:** 1) Create a new Task with a due date this month via the Task creation UI. 2) Open Calendar.
- **Expected Result:** The new task's chip appears on the correct day cell with its title visible.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-002: End-to-end deadline change moves the Calendar chip
- **Prerequisites:** An existing task with a due date this month.
- **Steps:** 1) Edit the task's due date to a different day in the same month. 2) Return to Calendar (or wait for `refreshKey` to trigger a reload).
- **Expected Result:** The chip disappears from the old day and appears on the new day.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-003: End-to-end completion changes Calendar chip styling
- **Prerequisites:** An existing incomplete task visible on Calendar.
- **Steps:** 1) Mark the task complete (via Task list or wherever completion is toggled). 2) Return to Calendar.
- **Expected Result:** The chip switches to the completed visual style (`calendar-task-completed`), regardless of its prior priority color.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-004: End-to-end deletion removes the Calendar chip
- **Prerequisites:** An existing task visible on Calendar.
- **Steps:** 1) Delete the task. 2) Return to Calendar.
- **Expected Result:** The chip is gone from its day; no leftover empty space or broken layout.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-005: Multiple tasks on one day render without overlap
- **Prerequisites:** 3+ tasks due the same day.
- **Steps:** 1) Create several tasks due the same date. 2) View that day's cell.
- **Expected Result:** All chips are visible and legible; no visual overlap or clipped text at normal window width.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-006: Empty Calendar visual state
- **Prerequisites:** A user/month with zero tasks and zero schedules.
- **Steps:** View a month with no data.
- **Expected Result:** Day cells render cleanly empty, with no error, placeholder text, or broken layout.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**
- **Note:** Code inspection shows Calendar has no explicit "no tasks this month" message — it simply renders empty cells. Confirm during manual execution whether this reads as intentional/clean or whether an empty-state message would be worth adding (a product decision, not something this ticket changes).

### CAL-MAN-007: Failed API request shows an error, not a blank/broken page
- **Prerequisites:** Ability to stop the backend or block the network request.
- **Steps:** 1) Stop the backend (or block `/api/tasks` or `/api/schedules`). 2) Load or refresh Calendar.
- **Expected Result:** A visible error message appears (`calendar-error-message`, e.g. "Could not load Calendar tasks." or "Could not connect to the backend."); the page does not crash or show a blank screen.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-008: Recovery after a failed request
- **Prerequisites:** Continuation of CAL-MAN-007.
- **Steps:** 1) With the error state showing, restart the backend. 2) Trigger a reload (navigate away and back, or whatever triggers `refreshKey`).
- **Expected Result:** The error clears and real data loads once the backend is reachable again.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-009: Refresh/reload consistency
- **Prerequisites:** Calendar open with existing tasks.
- **Steps:** 1) Edit or create a task from another view (e.g. To-Do List). 2) Return to Calendar without a full page reload.
- **Expected Result:** Calendar reflects the change once its `refreshKey`-driven re-fetch runs, without requiring a manual browser refresh.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### CAL-MAN-010: "Today" highlight matches the rest of the app (CAL-DEFECT-001 visual confirmation)
- **Prerequisites:** A device/browser timezone that is not UTC+0 (most users).
- **Steps:** Compare the day Calendar highlights as "today" against the date shown in Daily Summary / Weekly Summary at the same moment.
- **Expected Result:** Both should agree on what day it is. CAL-DEFECT-001 is now fixed in code (CAL-AUTO-008 passes) — this manual case confirms it visually in a real browser, which no automated test in this repo can do.
- **Actual Result:** _(not executed this session — manual browser verification still required)_
- **Status:** **NOT RUN**

### CAL-MAN-011: Month navigation
- **Prerequisites:** Calendar open.
- **Steps:** Click Previous, Next, and Today in sequence.
- **Expected Result:** The displayed month changes correctly each time; Today returns to the current month and correctly highlights today's cell (CAL-DEFECT-001 fixed in code; this confirms it visually).
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

---

## Traceability to required scenarios

| Required scenario | Covered by |
|---|---|
| Task creation and correct Calendar display | CAL-AUTO-001, CAL-MAN-001 |
| Task deadline changes and movement between dates | CAL-AUTO-002, CAL-MAN-002 |
| Task completion and correct status display | CAL-AUTO-003/003b, CAL-MAN-003 |
| Task deletion and removal from Calendar | CAL-AUTO-004, CAL-MAN-004 |
| Multiple Tasks on the same date | CAL-AUTO-005, CAL-MAN-005 |
| Tasks without due dates, where supported | CAL-AUTO-006 |
| Empty Calendar states | CAL-AUTO-007/007b, CAL-MAN-006 |
| Failed API requests and Calendar error handling | CAL-MAN-007, CAL-MAN-008 |
| Refresh or reload consistency | CAL-MAN-009 |
| (bonus) "Today" / UTC correctness | CAL-AUTO-008/009 (fixed), CAL-MAN-010 |
| (bonus) Schedule block day placement stays local | CAL-AUTO-010 |
| (bonus) Month navigation | CAL-MAN-011 |
