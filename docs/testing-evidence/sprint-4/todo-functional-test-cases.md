# To-Do List Functional Test Cases

**Jira task:** Create To-Do List Functional Test Cases
**PR batch:** PR 1 — Functional Test Development
**Branch:** `sprint4/functional-test-development`
**Component under test:** `client/src/pages/PrioritizedTodo.jsx`
**Date:** 2026-10-29 (updated same day — TODO-DEFECT-001 investigated and fixed)

## Scope and approach

`PrioritizedTodo.jsx` has no prior automated test coverage of its own
logic, and this repository has no component-render test harness (no
jsdom / React Testing Library) — every existing frontend test here is a
pure-function test run via Node's built-in `node --test`. This document
covers To-Do List functionality two ways:

- **Automated** test cases (`TODO-AUTO-*`), implemented in
  `client/tests/prioritizedTodoLogic.test.mjs`, for logic that is pure (no
  DOM, no network): field formatting, status-class mapping, completion
  toggling, deletion isolation, pagination, and edge cases.
- **Manual** test cases (`TODO-MAN-*`), for anything requiring real
  rendering, user interaction, a live/mocked network failure, or visual
  confirmation.

### Known limitation: automated tests are mirrors, not imports

Same approach as `client/tests/calendarLogic.test.mjs` (Sprint 4, F01):
`PrioritizedTodo.jsx`'s logic lives as unexported closures inside the
component, so `prioritizedTodoLogic.test.mjs` contains a **line-referenced
mirror**, not an import. **This mirror can drift from the real component**
if `PrioritizedTodo.jsx`'s logic changes without this test file being
updated to match.

### Pre-existing finding: the old `test:prioritized` suite doesn't test the real component

`client/tests/prioritizedTodo.test.mjs` (4 tests, unmodified by this
ticket) tests `client/src/utils/taskPagination.js`, called with an
explicit page size of **5**. Checking whether `PrioritizedTodo.jsx`
actually uses that module: **it doesn't.** The component has its own
inline pagination with `TASKS_PER_PAGE = 10` (confirmed via `git log
--follow` across the component's entire history — it has never been 5).
`taskPagination.js` appears to be an orphaned utility, written for
testability but never wired into the real component.

This means the existing suite has never verified the real component's
actual pagination behavior. It isn't broken or wrong for what it tests
(the utility itself works correctly) — it's just not testing
`PrioritizedTodo.jsx`. This ticket's brief referenced "the existing
five-Task page size," which reflects this same stale assumption; the
real, current page size is **10**, and the new tests below test that.

The old suite was left completely untouched, per instruction not to
remove, skip, or weaken existing tests.

### Backend coverage already exists for Task CRUD correctness

`server/tests/createTask.test.js`, `editTask.test.js`,
`deleteTask.test.js`, and `taskApiContract.test.js` (including a full
create → read → update → read → delete → read lifecycle test) already
verify that Task creation, edits, and deletion persist correctly via the
API and leave unrelated fields/rows untouched. The new frontend tests
below do not duplicate that — they cover what's genuinely frontend-only:
display formatting, status-class mapping, request-shape for completion
toggling, and pagination.

## Defect found during test development: TODO-DEFECT-001 — FIXED

`formatDueDate` called `toLocaleDateString()` without pinning
`timeZone: "UTC"`, unlike the careful UTC-anchored formatting used
elsewhere in the app. Since `due_date` is always written end-of-day UTC,
any viewer in a timezone ahead of UTC saw Task due dates displayed one day
late.

This machine's local timezone is behind UTC, so the defect could not be
demonstrated via the test runner's own clock the way CAL-DEFECT-001 was.
TODO-AUTO-012 instead demonstrated it portably using `Intl`'s explicit
`timeZone` option (`Asia/Tokyo`, UTC+9) rather than relying on the
runner's OS timezone — confirming the defect was real and reproducible
deterministically, independent of where it's run.

### Investigation before fixing

Traced `due_date` (Task deadlines) and `start_time`/`end_time` (schedule
timestamps) semantics, same as the CAL-DEFECT-001 investigation:
`due_date` is date-only and UTC-anchored (the UTC day is the intended
day); `start_time`/`end_time` are genuine real-world timestamps (a moment
the user picked, traced to `aiController.js`'s schedule-row creation).
`formatScheduledTime` also lacked a `timeZone` option, but — unlike
`formatDueDate` — that is **correct, not a defect**: a schedule block's
display should use the viewer's own local time, exactly matching
`CalendarView.jsx`'s `formatScheduleTime`/`getSchedulesForDay` precedent.

### Fix applied

`formatDueDate` now pins `timeZone: "UTC"`. `formatScheduledTime` was
**left unchanged**, with a comment explaining why it must stay on local
time rather than be "fixed" to match `formatDueDate` by false analogy.

TODO-AUTO-012 now asserts the fixed (UTC-pinned) behavior directly and
**passes**, with an independent sanity check (not using the production
function) confirming the original bug was real.

---

## Automated test cases

| ID | Scenario area | Summary |
|---|---|---|
| TODO-AUTO-001 | A. Task Creation | A task's fields format correctly for display |
| TODO-AUTO-002 | B. Task Editing | Editing one task's priority doesn't affect another task in the list |
| TODO-AUTO-003 | C. Task Completion | Completed tasks always get the completed status class |
| TODO-AUTO-004 | C. Task Completion | Completion toggling flips correctly in both directions |
| TODO-AUTO-005 | C. Task Completion | Completion state is consistent across a simulated refresh |
| TODO-AUTO-006 | D. Task Deletion | Removing one task leaves every other task unchanged |
| TODO-AUTO-007 | E. Pagination | Real page size (10) for 0/1/5/6/10/11/25 tasks |
| TODO-AUTO-008 | E. Pagination | Backend order preserved across page boundaries |
| TODO-AUTO-009 | E. Pagination | Total pages recompute after simulated create/delete |
| TODO-AUTO-010 | F. Edge cases | Empty list: zero visible tasks, never zero pages |
| TODO-AUTO-011 | F. Edge cases | Missing optional fields format safely, never throw |
| TODO-AUTO-012 | F. Edge cases | **TODO-DEFECT-001, fixed**: due-date display now UTC-pinned |
| TODO-AUTO-013 | F. Edge cases | Duplicate task IDs don't crash lookup logic |

### TODO-AUTO-001: Task fields format correctly for display
- **Prerequisites:** none
- **Steps:** Build a task with a title, UTC due date, "high" priority, not started. Format each displayed field.
- **Expected Result:** Title passes through unchanged; priority displays "High"; due date (viewed in UTC) displays "Oct 15"; status class is `todo-row-high`.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### TODO-AUTO-002: Editing isolation between tasks
- **Prerequisites:** none
- **Steps:** Build two tasks in a list. "Edit" the first one's priority via a map. Check the second.
- **Expected Result:** First task's new priority formats correctly; second task is byte-for-byte unchanged.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### TODO-AUTO-003/004/005: Task completion
- **Prerequisites:** none
- **Steps:** Build completed tasks with varying priority; check status class. Toggle completion status both directions. Map the same list twice to simulate a refresh.
- **Expected Result:** Completed always → `todo-row-completed` regardless of priority. Toggle flips `completed` ⇄ `not_started` (any non-completed status becomes `completed`). Refresh is idempotent.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### TODO-AUTO-006: Deletion isolation
- **Prerequisites:** none
- **Steps:** Build three tasks. Filter out the middle one.
- **Expected Result:** Remaining two tasks are byte-for-byte unchanged; removed task is gone.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### TODO-AUTO-007/008/009: Prioritization and pagination
- **Prerequisites:** none
- **Steps:** Paginate lists of 0/1/5/6/10/11/25 tasks at the real page size (10). Check page-1/page-2 contents and ordering for 11 tasks. Simulate adding an 11th task then removing it.
- **Expected Result:** Page 1 holds up to 10 tasks; 11 tasks → 2 pages (10 + 1), in original order; total pages recompute correctly after create/delete.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** confirms the real page size is 10, not 5 — see "Pre-existing finding" above.

### TODO-AUTO-010/011: Edge cases
- **Prerequisites:** none
- **Steps:** Paginate an empty list. Format a task with every optional field (`priority`, `due_date`, `description`, `point_value`, `estimated_effort_minutes`) null.
- **Expected Result:** Empty list → 0 visible tasks, 1 total page (never 0, matching the component's `Math.max(1, ...)` guard). Missing fields render as "Not set" / "No due date" / `undefined` schedule, never throw.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### TODO-AUTO-012: TODO-DEFECT-001 — due-date display timezone fix
- **Prerequisites:** none (uses `Intl`'s explicit `timeZone` option for its sanity check, not the runner's OS timezone)
- **Steps:** Call `formatDueDate` on a UTC due date near midnight and assert it returns the UTC-anchored day. Separately (not through `formatDueDate`), confirm a raw, un-pinned rendering of the same instant for a Tokyo viewer would land on the next day.
- **Expected Result:** `formatDueDate` always returns "Oct 12" (the intended day), regardless of viewer timezone; the sanity check confirms "Oct 13" would have resulted without the fix.
- **Actual Result (before fix):** `formatDueDate` returned "Oct 13" for a Tokyo-timezone render — disagreed with the intended UTC day.
- **Actual Result (after fix):** `formatDueDate` returns "Oct 12" unconditionally; sanity check confirms the pre-fix bug was real.
- **Status:** **PASS** (previously demonstrated the defect; now a regression guard confirming the fix)

### TODO-AUTO-013: Duplicate task IDs
- **Prerequisites:** none
- **Steps:** Build two tasks sharing the same `id`. Look up a schedule by that id for each.
- **Expected Result:** Lookup doesn't throw; resolves to the first match (`Array.prototype.find` semantics) for both.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** whether React renders two rows correctly with a duplicate `key` prop is a DOM concern this test can't exercise — see TODO-MAN-011. Duplicate IDs shouldn't occur in practice (Supabase primary keys are unique), but the pure lookup logic is still verified safe if it ever happened.

---

## Manual test cases

These require a running frontend + backend and real interaction; none can
be exercised by this repo's current automated tooling.

### TODO-MAN-001: End-to-end task creation appears in the list
- **Prerequisites:** Backend and frontend running; logged in.
- **Steps:** 1) Create a new Task via the Task creation UI. 2) Open the To-Do List.
- **Expected Result:** The new task appears in the table with correct title, due date, priority, and "Active" status.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-002: End-to-end edit reflects correctly; unrelated task/fields unchanged
- **Prerequisites:** Two or more existing tasks.
- **Steps:** 1) Edit one task's title, due date, and priority. 2) Return to the To-Do List.
- **Expected Result:** Edited task shows the new values; the other task and the edited task's non-edited fields (description, point value, etc.) are unchanged.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-003: End-to-end completion checkbox and reprioritization
- **Prerequisites:** Multiple incomplete tasks with different priorities.
- **Steps:** 1) Check the completion checkbox on a task. 2) Observe the list.
- **Expected Result:** The task shows as "Completed" with the completed row style; the list reloads (`handleComplete` calls `loadPrioritizedTasks`) and reflects any reprioritization.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-004: End-to-end deletion via confirmation modal
- **Prerequisites:** An existing task.
- **Steps:** 1) Click Delete. 2) Confirm in the modal.
- **Expected Result:** Modal opens with the correct task title, closes on confirm, task disappears from the list, and unrelated tasks are untouched.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-005: Delete modal cancel / Escape
- **Prerequisites:** An existing task.
- **Steps:** 1) Click Delete. 2) Press Escape (or click Cancel, or click the overlay).
- **Expected Result:** Modal closes without deleting the task.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-006: Pagination UI at the real page size (10)
- **Prerequisites:** 11+ tasks.
- **Steps:** 1) Open the To-Do List. 2) Click Next/Previous.
- **Expected Result:** Page 1 shows 10 tasks; Previous/Next correctly navigate; buttons disable at the first/last page; pagination controls are hidden entirely when ≤10 tasks exist (per the `tasks.length > TASKS_PER_PAGE` guard).
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-007: Empty To-Do List visual state
- **Prerequisites:** A user with zero tasks.
- **Steps:** View the To-Do List.
- **Expected Result:** "No tasks available." message shown; table header still renders; no error.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-008: Failed API request shows an error, not a blank/broken page
- **Prerequisites:** Ability to stop the backend or block the network request.
- **Steps:** 1) Stop the backend (or block `/api/tasks/prioritized`, `/api/schedules`, or `/api/tasks/workload`). 2) Load or refresh the To-Do List.
- **Expected Result:** A visible error message appears (`todo-error-message` for tasks/schedules; the workload panel shows its own error via `role="alert"`); the page does not crash.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-009: Recovery after a failed request
- **Prerequisites:** Continuation of TODO-MAN-008.
- **Steps:** 1) With the error state showing, restart the backend. 2) Trigger a reload.
- **Expected Result:** The error clears and real data loads once the backend is reachable again.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-010: Stale data / refresh consistency
- **Prerequisites:** To-Do List open.
- **Steps:** 1) Create, edit, or delete a task from another view (e.g. Calendar). 2) Return to the To-Do List without a full page reload.
- **Expected Result:** The list reflects the change once its `refreshKey`-driven re-fetch runs (which also resets `currentPage` to 1), without requiring a manual browser refresh.
- **Actual Result:** _(not executed this session)_
- **Status:** **NOT RUN**

### TODO-MAN-011: Duplicate Task display (visual confirmation of TODO-AUTO-013)
- **Prerequisites:** Would require contriving duplicate task IDs, which shouldn't be possible through normal use (Supabase primary keys are unique) — likely only reproducible by manipulating the API response directly.
- **Steps:** Render two task rows sharing the same `id`.
- **Expected Result:** No visual corruption; React may emit a duplicate-key console warning, which is worth confirming rather than assuming.
- **Actual Result:** _(not executed this session — low priority given this shouldn't occur through normal use)_
- **Status:** **NOT RUN**

### TODO-MAN-012: Due-date display timezone (visual confirmation of TODO-DEFECT-001 fix)
- **Prerequisites:** A device/browser set to a timezone ahead of UTC (e.g. Tokyo, Berlin).
- **Steps:** View a task due near midnight UTC and compare the displayed date to the task's actual intended due date.
- **Expected Result:** TODO-DEFECT-001 is now fixed in code (TODO-AUTO-012 passes) — this manual case confirms it visually in a real browser, which no automated test in this repo can do.
- **Actual Result:** _(not executed this session — manual browser verification still required)_
- **Status:** **NOT RUN**

---

## Traceability to required scenarios

| Required scenario | Covered by |
|---|---|
| A. Task Creation | TODO-AUTO-001, TODO-MAN-001 |
| B. Task Editing | TODO-AUTO-002, TODO-MAN-002 |
| C. Task Completion | TODO-AUTO-003/004/005, TODO-MAN-003 |
| D. Task Deletion | TODO-AUTO-006, TODO-MAN-004, TODO-MAN-005 |
| E. Prioritization and Pagination | TODO-AUTO-007/008/009, TODO-MAN-006 |
| F. Empty lists | TODO-AUTO-010, TODO-MAN-007 |
| F. Missing optional fields | TODO-AUTO-011 |
| F. Failed API requests / error states | TODO-MAN-008, TODO-MAN-009 |
| F. Stale data / refresh | TODO-MAN-010 |
| F. Duplicate Task display | TODO-AUTO-013, TODO-MAN-011 |
| (bonus) Due-date timezone correctness | TODO-AUTO-012 (TODO-DEFECT-001, fixed), TODO-MAN-012 |
