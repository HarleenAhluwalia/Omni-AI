# Cross-Component Synchronization Test Cases

**Jira task:** Create Cross-Component Synchronization Test Cases
**PR batch:** PR 1 — Functional Test Development
**Branch:** `sprint4/functional-test-development`
**Component under test:** `server/controllers/taskController.js`, `server/services/dummyCanvasSyncService.js`, and how their data is consumed by the Calendar, To-Do, and Daily/Weekly Summary views
**Date:** 2026-10-29

## Scope and approach

This document verifies that a Task change made through one part of the
system (create/edit/complete/delete, or a Canvas sync) stays consistent
everywhere else that reads the same data: the plain Task list (Calendar's
source), the prioritized view (To-Do's source), and the Daily/Weekly
Summary endpoints.

- **Automated** cases (`SYNC-AUTO-*`), implemented in
  `server/tests/crossComponentSync.test.js`, drive the real Express app
  through Jest/Supertest across multiple endpoints in a single test (e.g.
  create → list → prioritized → summary), against the existing mocked
  Supabase client — no live database, no live Canvas LMS.
- **Manual** cases (`SYNC-MAN-*`) cover what cannot be automated without a
  component-render harness (this repo has none — see the F01/F02 "mirror,
  not import" precedent). These are frontend-visual confirmations and are
  marked **NOT RUN**.

A mocked Supabase client proves that every controller operates
consistently on the *same* in-memory row; it does not prove Postgres
transaction/consistency guarantees under real concurrent load. That
remains out of scope here, as in F03.

### TODO-DEFECT-001 and DB-DEFECT-001 status (verified, not assumed)

Both were inspected directly in the repository before writing anything new:

- **TODO-DEFECT-001**: confirmed **fixed and committed** (commit `81e72ce`).
  `client/src/pages/PrioritizedTodo.jsx`'s `formatDueDate` pins
  `timeZone: "UTC"`; `formatScheduledTime` is deliberately left on local
  getters (schedules are real-world timestamps, not day-anchored).
- **DB-DEFECT-001**: confirmed **fixed in the working tree, not yet
  committed**. `server/controllers/taskController.js`'s `createTask`,
  `updateTask`, `deleteTask`, `getTasks`, and `getTaskById` each now wrap
  their Supabase call in try/catch, matching the pre-existing
  `getPrioritizedTasks`/`resolveSchedule` pattern. `SYNC-AUTO-007` below
  exercises this fix directly in a cross-component context.

### Existing coverage inventory (reviewed before writing anything new)

| File | What it already covers |
|---|---|
| `dailySummary.test.js` | Due-today/overdue/upcoming classification, completed-task exclusion from `dueToday`/`overdue`, null due_date handling, ownership, DB-failure 500 — all via directly-seeded rows, not live create/edit/delete round trips |
| `weeklySummary.test.js` | Monday-Sunday UTC week inclusion/exclusion, completed/incomplete counts, overdue-from-last-week, effort/point totals, ownership, DB-failure 500 — same directly-seeded-row pattern |
| `canvasCrossFeatureIntegration.test.js` | A Canvas-imported Task (via the *other* Canvas controller, `/api/canvas/import`) appearing in `GET /api/tasks` and in the AI chat payload; Weekly Summary counting a Canvas row (due_date set by direct store mutation, not through an API) and a manual completion edit |
| `taskWorkflow.test.js` | Create/edit/complete/delete against `/api/tasks` and `/api/tasks/prioritized`, priority/effort/points affecting ordering — no Summary-endpoint coverage at all |
| `taskApiContract.test.js` | Exact response shape and a full create→read→update→read→delete→read lifecycle against the plain CRUD endpoints only |
| `dummyCanvasApi.test.js`, `dummyCanvasSync.test.js`, `dummyCanvasImport.test.js` | Extensive HTTP-contract and service-level coverage of the Dummy Canvas import/sync controllers and services — but with `canvasService`/`dummyCanvasSyncService` mocked out at the controller layer, or tested directly against the service with no subsequent check through `/api/tasks` or the Summary endpoints |
| `databaseIntegrity.test.js` | Repeated updates, invalid identifiers, deletion/schedule orphaning, boundary values, and (after the DB-DEFECT-001 fix) controlled-500 regression tests for rejected database calls — single-endpoint, not cross-component |

**Confirmed gap**: no existing test drives a Task change through one
endpoint and then verifies the result through a *different* endpoint in
the same test — every file above either seeds data directly or checks
only the single endpoint it targets. That gap is exactly what
`crossComponentSync.test.js` fills.

---

## Automated test cases

| ID | Area | Summary |
|---|---|---|
| SYNC-AUTO-001 | A. Creation | A created Task appears in the list, prioritized view, and both summaries, with no duplication |
| SYNC-AUTO-002 | B. Editing | Editing title/due_date/priority is reflected in the list, prioritized ordering, and weekly summary membership |
| SYNC-AUTO-003 | C. Completion | Completing (and reversing) a Task stays consistent across retrieval, prioritization, and the daily summary |
| SYNC-AUTO-004 | D. Deletion | Deleting a Task removes it everywhere downstream; an unrelated Task is untouched |
| SYNC-AUTO-005 | E. Deadline boundary | Editing a due_date across the UTC week boundary moves a Task between weekly summary buckets |
| SYNC-AUTO-006 | F. Canvas sync | A Dummy Canvas assignment update (via `/api/dummy-canvas/sync-assignment`) propagates to the Task list and weekly summary |
| SYNC-AUTO-007 | G. Error states | A failed update (DB-DEFECT-001's fixed path) leaves every downstream view unchanged — no false partial synchronization |
| SYNC-AUTO-008 | H. Cross-user isolation | One user's full create/complete/delete lifecycle never changes another user's list, prioritized view, or weekly summary counts |

### SYNC-AUTO-001: Task creation synchronization
- **Prerequisites:** none (mocked Supabase)
- **Procedure:** `POST /api/tasks` with a due date of today (UTC). Then `GET /api/tasks`, `GET /api/tasks/prioritized`, `GET /api/tasks/summary/daily`, and `GET /api/tasks/summary/weekly`, all for the same user.
- **Expected Result:** The task appears exactly once in the list and in the prioritized view; `dueToday` and the weekly `total` both increase by exactly one.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### SYNC-AUTO-002: Task editing synchronization
- **Prerequisites:** none
- **Procedure:** Create a low-priority task due outside the current week, alongside a low-priority sibling due inside it. Confirm the edited task is absent from this week's summary. `PUT` title, `due_date` (into this week), and `priority` (to high). Re-check the list, the prioritized ordering relative to the untouched sibling, and the weekly summary.
- **Expected Result:** The list reflects the new title/priority; the now-high-priority task sorts ahead of the low-priority sibling in the prioritized view; the weekly summary now includes it.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### SYNC-AUTO-003: Task completion synchronization (with reversal)
- **Prerequisites:** none
- **Procedure:** Create a task due today. Confirm `dueToday` = 1, `completed` = 0. `PUT completion_status: "completed"`. Re-check the list and the daily summary. Then `PUT completion_status: "not_started"` (reversal) and re-check the daily summary again.
- **Expected Result:** After completion, the list shows `completed`, the daily summary's `completed` count becomes 1 and `dueToday` becomes 0 (a completed task due today is tracked only under `completed`, matching `dailySummary.test.js`'s own convention). After reversal, both counts revert exactly.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### SYNC-AUTO-004: Task deletion synchronization
- **Prerequisites:** none
- **Procedure:** Create two tasks due today. `DELETE` one. Check the list, the prioritized view, and the daily summary; confirm the surviving task's fields are byte-for-byte unchanged.
- **Expected Result:** The deleted task is absent everywhere; the daily `dueToday` count reflects only the survivor; the survivor's title and completion status are unaffected.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### SYNC-AUTO-005: Deadline boundary synchronization
- **Prerequisites:** none
- **Procedure:** Create a task due at the last UTC millisecond of the current week. Confirm the weekly summary includes it. `PUT due_date` to the first UTC millisecond of next week. Re-check the weekly summary.
- **Expected Result:** The task starts inside this week's summary and moves out of it the instant its due_date crosses into next week — the same Monday-Sunday UTC boundary logic applies consistently whether the due_date was set at creation or by a later edit.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** This directly exercises the UTC week-boundary math (`getUtcWeekStart` in `taskController.js`) that the CAL-DEFECT-001/TODO-DEFECT-001 investigations identified as a known edge case at the *display* layer. At the backend/summary layer it behaves consistently — no new defect found here.

### SYNC-AUTO-006: Canvas-imported Task synchronization
- **Prerequisites:** none
- **Procedure:** `POST /api/dummy-canvas/import-assignment` (assignment 101, "Sprint 3 Report"). Confirm it's visible via `GET /api/tasks`. `PUT /api/dummy-canvas/sync-assignment` with a new `dueDate` inside the current week. Re-check `GET /api/tasks` (same task id, no duplicate row, new due_date) and `GET /api/tasks/summary/weekly`.
- **Expected Result:** The sync updates the same task row in place; the new due_date is visible through the plain Task list; the weekly summary — computed independently — now counts it.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** This is the genuine gap identified in the existing coverage: `dummyCanvasSync.test.js` and `dummyCanvasApi.test.js` both confirm the sync *saves* correctly (directly against the service, or against a mocked service), but neither checks that the update is then visible through the Task list or Summary endpoints the way Calendar/To-Do/Summary actually consume it.

### SYNC-AUTO-007: Failed synchronization does not produce a false success
- **Prerequisites:** DB-DEFECT-001's fix must be present (it is, in the working tree)
- **Procedure:** Create a task. Force the Supabase `update` call to reject (same technique as `DB-AUTO-009`). `PUT` a title/priority change through the real HTTP route. Re-check the list, the prioritized view, and the daily summary.
- **Expected Result:** The request returns a clean `500` (not a hang — this is only possible because of the DB-DEFECT-001 fix). Every downstream view still shows the task exactly as it was before the failed update — no partial write, no phantom synchronization.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** This test would have been unsafe to write against the pre-fix code (a real HTTP request's unhandled rejection would have been reported by Jest as a hard failure, the same issue documented for `DB-AUTO-005` in F03). It is included here specifically to confirm the fix holds up in a cross-component integration context, not just in isolation.

### SYNC-AUTO-008: Cross-user isolation across the full synchronization chain
- **Prerequisites:** none
- **Procedure:** User B has one task. Record User B's list and weekly summary as a baseline. User A creates, completes, and deletes their own task. Re-check User B's list, prioritized view, and weekly summary.
- **Expected Result:** User B's list and weekly summary counts are byte-for-byte identical to the baseline; User B's prioritized view contains only their own task.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** `dailySummary.test.js:213` and `weeklySummary.test.js:367` already test ownership filtering on a single summary endpoint in isolation. This test instead confirms isolation holds across list, prioritized, *and* weekly summary simultaneously, through another user's full create/complete/delete lifecycle — not a duplicate of either existing test. Further security-specific scenarios (e.g. token tampering, privilege escalation attempts) are deferred to the planned CC6.3 security assessment rather than duplicated here.

---

## Manual test cases (frontend, not executable with current tooling)

**None of these were executed.** This repository has no component-render
harness (no jsdom/RTL) — see the F01/F02 precedent for why Calendar and
To-Do logic is tested via the documented "mirror, not import" pattern
instead of a real render. Live visual cross-component propagation
requires an actual browser session against a running dev server.

### SYNC-MAN-001: New Task appears on Calendar and To-Do without a manual refresh
- **Prerequisites:** Running dev server, authenticated session.
- **Procedure:** Create a Task through the UI. Without reloading, check whether it appears on the correct Calendar day and in the To-Do list.
- **Status:** **NOT RUN**

### SYNC-MAN-002: Editing a due date visually moves the Task's Calendar day
- **Prerequisites:** Same as above.
- **Procedure:** Edit an existing Task's due date through the UI. Confirm it visually moves from its old Calendar day to its new one without a stale duplicate remaining on the old day.
- **Status:** **NOT RUN**

### SYNC-MAN-003: Completing a Task visually updates To-Do styling/ordering and the Calendar day display
- **Prerequisites:** Same as above.
- **Procedure:** Mark a Task complete through the UI. Confirm the To-Do list's completed styling and ordering update immediately, and the Calendar day's task display reflects the completed state.
- **Status:** **NOT RUN**

### SYNC-MAN-004: Deleting a Task removes it from Calendar and To-Do without stale cached data
- **Prerequisites:** Same as above.
- **Procedure:** Delete a Task through the UI. Confirm it disappears from both Calendar and To-Do immediately, with no stale frontend cache showing it briefly or permanently.
- **Status:** **NOT RUN**

### SYNC-MAN-005: An imported Canvas assignment appears consistently across Calendar, To-Do, and Summary widgets
- **Prerequisites:** Same as above, Dummy Canvas import UI available.
- **Procedure:** Import a Canvas assignment through the UI. Confirm it appears on the correct Calendar day, in the To-Do list, and is counted by the Daily/Weekly Summary widgets, all without a manual refresh.
- **Status:** **NOT RUN**

---

## Defects discovered

**None.** All eight automated scenarios passed on first correct
implementation (after fixing one test-fixture date-math bug of this
author's own — `isoForWeekDayOffset(0)` meant "this week's Monday," not
"today," which only coincide when the suite happens to run on a Monday;
corrected to a dedicated `todayNoonIso()` helper before any assertion was
taken as a result). No production code change was required for this
ticket; DB-DEFECT-001's existing fix (from the prior ticket) was verified
to hold up correctly in this new cross-component context via
SYNC-AUTO-007.

---

## Traceability to required scenarios

| Required scenario | Covered by |
|---|---|
| A. Task creation synchronization | SYNC-AUTO-001 |
| B. Task editing synchronization | SYNC-AUTO-002 |
| C. Task completion synchronization (+ reversal) | SYNC-AUTO-003 |
| D. Task deletion synchronization | SYNC-AUTO-004 |
| E. Deadline/priority changes, boundary scenarios | SYNC-AUTO-002 (priority), SYNC-AUTO-005 (boundary) |
| F. Canvas-imported Task synchronization | SYNC-AUTO-006 |
| G. Empty and error states | SYNC-AUTO-007 (failed op); existing per-endpoint empty-state tests in dailySummary.test.js/weeklySummary.test.js (reused, not duplicated) |
| H. Cross-user isolation | SYNC-AUTO-008; existing per-endpoint ownership tests in dailySummary.test.js/weeklySummary.test.js/taskAuth.test.js (reused, not duplicated) |
| Calendar/To-Do visual consistency | SYNC-MAN-001 through 004 (NOT RUN — requires a live browser) |
| Canvas visual consistency | SYNC-MAN-005 (NOT RUN) |

---

## Test execution

```
cd server && npx jest --silent
  Test Suites: 28 passed, 28 total
  Tests:       404 passed, 404 total

cd client && npm run test:calendar   → 12 passed
cd client && npm run test:todo       → 13 passed
cd client && npm run test:prioritized → 4 passed
cd client && npm run test:harleen    → 17 passed

cd client && npm run build
  ✓ built in 509ms
```

All F01 (Calendar), F02 (To-Do), and F03 (Database Integrity) automated
tests remain intact and passing alongside the 8 new SYNC-AUTO tests.

## Mocked versus live testing limitations

Every `SYNC-AUTO-*` test runs against the mocked Supabase client — it
proves that Omni-AI's own controllers stay internally consistent with
each other, not that a real Postgres database under concurrent load
would behave identically (e.g., two simultaneous edits to the same Task
from different requests). That class of verification is out of scope
here, consistent with F03's `DB-LIVE-*` cases, and is not claimed as
proven. The Canvas side of this suite uses the Dummy Canvas simulation
only — no live Canvas LMS connection exists in this project.
